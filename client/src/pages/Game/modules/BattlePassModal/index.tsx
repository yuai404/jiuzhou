import { App, Button, Modal, Progress, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import coin01 from '../../../../assets/images/ui/sh_icon_0006_jinbi_02.png';
import { getBattlePassTasks } from '../../../../services/api';
import './index.scss';

interface BattlePassModalProps {
  open: boolean;
  onClose: () => void;
}

type BattlePassTab = 'rewards' | 'daily' | 'weekly';

type BattlePassReward = {
  level: number;
  name: string;
  icon: string;
  amount: number;
};

type BattlePassTask = {
  id: string;
  title: string;
  desc: string;
  exp: number;
};

const storageKeys = {
  seasonStartAt: 'battlepass_season_start_at',
  exp: 'battlepass_exp',
  claimedLevels: 'battlepass_claimed_levels',
  dailyDone: 'battlepass_daily_done',
  weeklyDone: 'battlepass_weekly_done',
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const dateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const weekKey = (d: Date) => {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  firstThursday.setHours(0, 0, 0, 0);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
};

const readNumber = (key: string, fallback: number) => {
  const raw = localStorage.getItem(key);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const readJson = <T,>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const buildRewards = (maxLevel: number): BattlePassReward[] =>
  Array.from({ length: maxLevel }).map((_, idx) => {
    const level = idx + 1;
    const isStone = level % 3 === 0;
    return {
      level,
      name: isStone ? '灵石' : '修行丹',
      icon: coin01,
      amount: isStone ? 500 + level * 20 : 1,
    };
  });

const BattlePassModal: React.FC<BattlePassModalProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const maxLevel = 30;
  const expPerLevel = 1000;
  const seasonDays = 60;

  const rewards = useMemo(() => buildRewards(maxLevel), [maxLevel]);
  const [taskLoading, setTaskLoading] = useState(false);
  const [dailyTasks, setDailyTasks] = useState<BattlePassTask[]>([]);
  const [weeklyTasks, setWeeklyTasks] = useState<BattlePassTask[]>([]);

  const [tab, setTab] = useState<BattlePassTab>('rewards');
  const [seasonStartAt, setSeasonStartAt] = useState(0);
  const [exp, setExp] = useState(0);
  const [claimedLevels, setClaimedLevels] = useState<number[]>([]);
  const [dailyDone, setDailyDone] = useState<Record<string, string>>({});
  const [weeklyDone, setWeeklyDone] = useState<Record<string, string>>({});
  const [todayKey, setTodayKey] = useState('');
  const [curWeekKey, setCurWeekKey] = useState('');
  const [nowTs, setNowTs] = useState(0);

  const refreshTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const res = await getBattlePassTasks();
      if (!res.success || !res.data) throw new Error(res.message || '加载战令任务失败');
      const toTask = (t: { id: string; name: string; description: string; rewardExp: number }): BattlePassTask => ({
        id: String(t.id || ''),
        title: String(t.name || ''),
        desc: String(t.description || ''),
        exp: Number.isFinite(Number(t.rewardExp)) ? Number(t.rewardExp) : 0,
      });
      setDailyTasks((res.data.daily ?? []).map(toTask));
      setWeeklyTasks((res.data.weekly ?? []).map(toTask));
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err.message || '加载战令任务失败');
      setDailyTasks([]);
      setWeeklyTasks([]);
    } finally {
      setTaskLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (!open) return;
    void refreshTasks();
  }, [open, refreshTasks]);

  const ready = nowTs > 0 && !!todayKey && !!curWeekKey;
  const seasonEndAt = useMemo(() => (seasonStartAt > 0 ? seasonStartAt + seasonDays * 24 * 60 * 60 * 1000 : 0), [seasonDays, seasonStartAt]);
  const seasonExpired = ready && seasonStartAt > 0 && seasonEndAt > 0 && nowTs >= seasonEndAt;

  const level = useMemo(() => {
    if (!ready) return 1;
    const cappedExp = clamp(exp, 0, expPerLevel * maxLevel);
    const rawLevel = Math.floor(cappedExp / expPerLevel) + 1;
    return clamp(rawLevel, 1, maxLevel);
  }, [exp, expPerLevel, maxLevel, ready]);

  const levelProgress = useMemo(() => {
    if (!ready) return { percent: 0, current: 0, need: expPerLevel };
    if (level >= maxLevel) return { percent: 100, current: expPerLevel, need: expPerLevel };
    const cappedExp = clamp(exp, 0, expPerLevel * maxLevel);
    const current = cappedExp % expPerLevel;
    const need = expPerLevel;
    return { percent: clamp((current / need) * 100, 0, 100), current, need };
  }, [exp, expPerLevel, level, maxLevel, ready]);

  const daysLeft = useMemo(() => {
    if (!ready) return 0;
    if (!seasonStartAt || !seasonEndAt) return seasonDays;
    const left = Math.ceil((seasonEndAt - nowTs) / (24 * 60 * 60 * 1000));
    return clamp(left, 0, seasonDays);
  }, [nowTs, ready, seasonDays, seasonEndAt, seasonStartAt]);

  const resetSeason = (nextStartAt: number) => {
    localStorage.setItem(storageKeys.seasonStartAt, String(nextStartAt));
    localStorage.setItem(storageKeys.exp, '0');
    localStorage.setItem(storageKeys.claimedLevels, '[]');
    localStorage.setItem(storageKeys.dailyDone, '{}');
    localStorage.setItem(storageKeys.weeklyDone, '{}');
    setSeasonStartAt(nextStartAt);
    setExp(0);
    setClaimedLevels([]);
    setDailyDone({});
    setWeeklyDone({});
  };

  const addExp = (delta: number) => {
    const next = clamp(exp + delta, 0, expPerLevel * maxLevel);
    localStorage.setItem(storageKeys.exp, String(next));
    setExp(next);
  };

  const claimLevel = (lv: number) => {
    if (!ready) return;
    if (lv > level) return;
    if (claimedLevels.includes(lv)) return;
    const next = [...claimedLevels, lv].sort((a, b) => a - b);
    localStorage.setItem(storageKeys.claimedLevels, JSON.stringify(next));
    setClaimedLevels(next);
  };

  const completeDailyTask = (task: BattlePassTask) => {
    if (!ready) return;
    if (dailyDone[task.id] === todayKey) return;
    const next = { ...dailyDone, [task.id]: todayKey };
    localStorage.setItem(storageKeys.dailyDone, JSON.stringify(next));
    setDailyDone(next);
    addExp(task.exp);
  };

  const completeWeeklyTask = (task: BattlePassTask) => {
    if (!ready) return;
    if (weeklyDone[task.id] === curWeekKey) return;
    const next = { ...weeklyDone, [task.id]: curWeekKey };
    localStorage.setItem(storageKeys.weeklyDone, JSON.stringify(next));
    setWeeklyDone(next);
    addExp(task.exp);
  };

  const leftItems = useMemo(
    () => [
      { key: 'rewards' as const, label: '战令奖励' },
      { key: 'daily' as const, label: '每日任务' },
      { key: 'weekly' as const, label: '每周任务' },
    ],
    [],
  );

  const renderHeader = () => (
    <div className="bp-pane-top">
      <div className="bp-top-row">
        <div className="bp-title">战令</div>
        <div className="bp-tags">
          <Tag color="blue">满级 {maxLevel} 级</Tag>
          <Tag color="blue">{taskLoading ? '任务加载中...' : '实时任务'}</Tag>
          <Tag color={seasonExpired ? 'red' : 'green'}>赛季剩余 {daysLeft} 天</Tag>
        </div>
      </div>
      <div className="bp-progress">
        <div className="bp-progress-left">
          <div className="bp-progress-level">当前等级：{level}</div>
          <div className="bp-progress-exp">
            经验：{level >= maxLevel ? `${expPerLevel * maxLevel}` : `${levelProgress.current}`}/{levelProgress.need}
          </div>
        </div>
        <div className="bp-progress-right">
          <Progress percent={levelProgress.percent} showInfo={false} strokeColor="var(--primary-color)" />
        </div>
      </div>
    </div>
  );

  const renderRewardTrack = () => (
    <div className="bp-pane">
      {renderHeader()}
      <div className="bp-pane-body">
        <div className="bp-section">
          <div className="bp-section-title">1 - {maxLevel} 级奖励</div>
          <div className="bp-reward-track" role="region" aria-label="战令奖励">
            {rewards.map((r) => {
              const unlocked = level >= r.level;
              const claimed = claimedLevels.includes(r.level);
              return (
                <div key={r.level} className={`bp-reward-card ${unlocked ? 'is-unlocked' : 'is-locked'}`}>
                  <div className="bp-reward-level">Lv.{r.level}</div>
                  <img className="bp-reward-icon" src={r.icon} alt={r.name} />
                  <div className="bp-reward-name">{r.name}</div>
                  <div className="bp-reward-amount">x{r.amount}</div>
                  <div className="bp-reward-meta">
                    {claimed ? <Tag color="green">已领取</Tag> : unlocked ? <Tag color="blue">可领取</Tag> : <Tag>未解锁</Tag>}
                  </div>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!unlocked || claimed}
                    onClick={() => claimLevel(r.level)}
                    className="bp-reward-btn"
                  >
                    {claimed ? '已领取' : '领取'}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bp-tip">完成任务获得经验升级，解锁并领取对应等级奖励。赛季每 2 个月刷新。</div>
      </div>
    </div>
  );

  const renderTaskList = (title: string, tasks: BattlePassTask[], doneMap: Record<string, string>, doneKey: string, onFinish: (t: BattlePassTask) => void) => (
    <div className="bp-pane">
      {renderHeader()}
      <div className="bp-pane-body">
        <div className="bp-section">
          <div className="bp-section-title">{title}</div>
          <div className="bp-task-list">
            {tasks.map((t) => {
              const done = doneMap[t.id] === doneKey;
              return (
                <div key={t.id} className="bp-task">
                  <div className="bp-task-main">
                    <div className="bp-task-title">{t.title}</div>
                    <div className="bp-task-desc">{t.desc}</div>
                  </div>
                  <div className="bp-task-right">
                    <Tag color="blue">+{t.exp} 经验</Tag>
                    <Button size="small" type="primary" disabled={done} onClick={() => onFinish(t)}>
                      {done ? '已完成' : '完成'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const panelContent = () => {
    if (tab === 'rewards') return renderRewardTrack();
    if (tab === 'daily') return renderTaskList('每日任务', dailyTasks, dailyDone, todayKey, completeDailyTask);
    return renderTaskList('每周任务', weeklyTasks, weeklyDone, curWeekKey, completeWeeklyTask);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={1080}
      className="bp-modal"
      destroyOnHidden
      maskClosable
      afterOpenChange={(visible) => {
        if (!visible) return;
        const now = Date.now();
        const today = dateKey(new Date(now));
        const wk = weekKey(new Date(now));
        const storedStart = readNumber(storageKeys.seasonStartAt, 0);
        const nextStartAt = storedStart > 0 ? storedStart : startOfToday();
        const storedExp = readNumber(storageKeys.exp, 0);
        const storedClaimed = readJson<number[]>(storageKeys.claimedLevels, []);
        const storedDailyDone = readJson<Record<string, string>>(storageKeys.dailyDone, {});
        const storedWeeklyDone = readJson<Record<string, string>>(storageKeys.weeklyDone, {});
        setNowTs(now);
        setTodayKey(today);
        setCurWeekKey(wk);
        setTab('rewards');
        setSeasonStartAt(nextStartAt);
        setExp(clamp(storedExp, 0, expPerLevel * maxLevel));
        setClaimedLevels(storedClaimed.filter((lv) => Number.isFinite(lv)).map((lv) => clamp(lv, 1, maxLevel)));
        setDailyDone(storedDailyDone);
        setWeeklyDone(storedWeeklyDone);

        const endAt = nextStartAt + seasonDays * 24 * 60 * 60 * 1000;
        if (now >= endAt) resetSeason(startOfToday());
      }}
    >
      <div className="bp-shell">
        <div className="bp-left">
          <div className="bp-left-title">
            <img className="bp-left-icon" src={coin01} alt="战令" />
            <div className="bp-left-name">战令</div>
          </div>
          <div className="bp-left-list">
            {leftItems.map((it) => (
              <Button
                key={it.key}
                type={tab === it.key ? 'primary' : 'default'}
                className="bp-left-item"
                onClick={() => setTab(it.key)}
              >
                {it.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="bp-right">{panelContent()}</div>
      </div>
    </Modal>
  );
};

export default BattlePassModal;
