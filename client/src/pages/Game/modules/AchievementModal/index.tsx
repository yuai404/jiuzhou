import { Button, Modal, Progress, Tag } from 'antd';
import { useMemo, useState } from 'react';
import type { CharacterData } from '../../../../services/gameSocket';
import { getMonthCardStatus } from '../../../../services/api';
import coin01 from '../../../../assets/images/ui/sh_icon_0006_jinbi_02.png';
import './index.scss';

interface AchievementModalProps {
  open: boolean;
  onClose: () => void;
  character: CharacterData | null;
  inTeam: boolean;
}

type AchievementTab = 'growth' | 'combat' | 'explore' | 'social';

type AchievementReward = {
  id: string;
  name: string;
  icon: string;
  amount: number;
};

type AchievementDef = {
  id: string;
  tab: AchievementTab;
  title: string;
  desc: string;
  reward: AchievementReward[];
  progress: (ctx: AchievementContext) => { current: number; target: number };
};

type AchievementContext = {
  character: CharacterData | null;
  inTeam: boolean;
  counters: Record<string, number>;
  monthCardActive: boolean;
};

const storageKeys = {
  claimed: 'achievement_claimed',
  counters: 'achievement_counters',
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const readJson = <T,>(key: string, fallback: T): T => {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, v: unknown) => {
  localStorage.setItem(key, JSON.stringify(v));
};

const normalizeRealm = (realm: string) => {
  const s = String(realm || '').trim();
  if (!s) return '';
  if (realmRank[s] != null) return s;
  if (realmMajorToFirst[s]) return realmMajorToFirst[s];
  if (realmSubToFull[s]) return realmSubToFull[s];
  return s;
};

const realmOrder = [
  '凡人',
  '炼精化炁·养气期',
  '炼精化炁·通脉期',
  '炼精化炁·凝炁期',
  '炼炁化神·炼己期',
  '炼炁化神·采药期',
  '炼炁化神·结胎期',
  '炼神返虚·养神期',
  '炼神返虚·还虚期',
  '炼神返虚·合道期',
  '炼虚合道·证道期',
  '炼虚合道·历劫期',
  '炼虚合道·成圣期',
] as const;
const realmRank: Record<string, number> = realmOrder.reduce((acc, r, idx) => ({ ...acc, [r]: idx }), {});
const realmMajorToFirst: Record<string, (typeof realmOrder)[number]> = {
  凡人: '凡人',
  炼精化炁: '炼精化炁·养气期',
  炼炁化神: '炼炁化神·炼己期',
  炼神返虚: '炼神返虚·养神期',
  炼虚合道: '炼虚合道·证道期',
};
const realmSubToFull: Record<string, (typeof realmOrder)[number]> = {
  养气期: '炼精化炁·养气期',
  通脉期: '炼精化炁·通脉期',
  凝炁期: '炼精化炁·凝炁期',
  炼己期: '炼炁化神·炼己期',
  采药期: '炼炁化神·采药期',
  结胎期: '炼炁化神·结胎期',
  养神期: '炼神返虚·养神期',
  还虚期: '炼神返虚·还虚期',
  合道期: '炼神返虚·合道期',
  证道期: '炼虚合道·证道期',
  历劫期: '炼虚合道·历劫期',
  成圣期: '炼虚合道·成圣期',
};

const realmAtLeast = (realm: string, target: (typeof realmOrder)[number]) => {
  const cur = realmRank[normalizeRealm(realm)] ?? -1;
  const need = realmRank[target] ?? 999;
  return cur >= need;
};

const buildAchievementDefs = (): AchievementDef[] => [
  {
    id: 'growth-realm-001',
    tab: 'growth',
    title: '踏入养气',
    desc: '境界达到 炼精化炁·养气期',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 1000 }],
    progress: (ctx) => ({ current: realmAtLeast(ctx.character?.realm ?? '', '炼精化炁·养气期') ? 1 : 0, target: 1 }),
  },
  {
    id: 'growth-realm-002',
    tab: 'growth',
    title: '通脉有成',
    desc: '境界达到 炼精化炁·通脉期',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 2000 }],
    progress: (ctx) => ({ current: realmAtLeast(ctx.character?.realm ?? '', '炼精化炁·通脉期') ? 1 : 0, target: 1 }),
  },
  {
    id: 'growth-coin-001',
    tab: 'growth',
    title: '小富即安',
    desc: '拥有 10,000 灵石',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 500 }],
    progress: (ctx) => ({ current: ctx.character?.spiritStones ?? 0, target: 10000 }),
  },
  {
    id: 'growth-exp-001',
    tab: 'growth',
    title: '修为精进',
    desc: '累计修为经验达到 100,000',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 1200 }],
    progress: (ctx) => ({ current: ctx.character?.exp ?? 0, target: 100000 }),
  },
  {
    id: 'combat-battle-001',
    tab: 'combat',
    title: '初试锋芒',
    desc: '发起战斗 10 次',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 800 }],
    progress: (ctx) => ({ current: ctx.counters.battle ?? 0, target: 10 }),
  },
  {
    id: 'combat-battle-002',
    tab: 'combat',
    title: '百战成钢',
    desc: '发起战斗 50 次',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 1800 }],
    progress: (ctx) => ({ current: ctx.counters.battle ?? 0, target: 50 }),
  },
  {
    id: 'explore-dungeon-001',
    tab: 'explore',
    title: '秘境常客',
    desc: '打开秘境 5 次',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 700 }],
    progress: (ctx) => ({ current: ctx.counters.dungeonOpen ?? 0, target: 5 }),
  },
  {
    id: 'explore-map-001',
    tab: 'explore',
    title: '踏遍九州',
    desc: '打开地图 10 次',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 900 }],
    progress: (ctx) => ({ current: ctx.counters.mapOpen ?? 0, target: 10 }),
  },
  {
    id: 'social-team-001',
    tab: 'social',
    title: '并肩作战',
    desc: '加入一个队伍',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 600 }],
    progress: (ctx) => ({ current: ctx.inTeam ? 1 : 0, target: 1 }),
  },
  {
    id: 'social-monthcard-001',
    tab: 'social',
    title: '月卡福利',
    desc: '解锁一次月卡',
    reward: [{ id: 'sr', name: '灵石', icon: coin01, amount: 1000 }],
    progress: (ctx) => ({ current: ctx.monthCardActive ? 1 : 0, target: 1 }),
  },
];

const AchievementModal: React.FC<AchievementModalProps> = ({ open, onClose, character, inTeam }) => {
  const defs = useMemo(() => buildAchievementDefs(), []);

  const [tab, setTab] = useState<AchievementTab>('growth');
  const [claimed, setClaimed] = useState<string[]>([]);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [monthCardActive, setMonthCardActive] = useState(false);

  const ctx: AchievementContext = useMemo(
    () => ({
      character,
      inTeam,
      counters,
      monthCardActive,
    }),
    [character, counters, inTeam, monthCardActive],
  );

  const byTab = useMemo(() => defs.filter((d) => d.tab === tab), [defs, tab]);

  const computed = useMemo(() => {
    return byTab.map((d) => {
      const p = d.progress(ctx);
      const current = clamp(p.current, 0, Number.isFinite(p.target) ? p.target : 0);
      const target = Math.max(0, Number(p.target) || 0);
      const percent = target > 0 ? clamp((current / target) * 100, 0, 100) : 0;
      const done = target > 0 ? current >= target : false;
      const isClaimed = claimed.includes(d.id);
      return { def: d, current, target, percent, done, isClaimed };
    });
  }, [byTab, claimed, ctx]);

  const overall = useMemo(() => {
    const rows = defs.map((d) => {
      const p = d.progress(ctx);
      const current = clamp(p.current, 0, Number.isFinite(p.target) ? p.target : 0);
      const target = Math.max(0, Number(p.target) || 0);
      const done = target > 0 ? current >= target : false;
      const isClaimed = claimed.includes(d.id);
      return { done, isClaimed };
    });
    const total = rows.length;
    const doneCount = rows.filter((r) => r.done).length;
    const claimedCount = rows.filter((r) => r.isClaimed).length;
    return { total, doneCount, claimedCount };
  }, [claimed, ctx, defs]);

  const leftItems = useMemo(
    () => [
      { key: 'growth' as const, label: '成长成就' },
      { key: 'combat' as const, label: '战斗成就' },
      { key: 'explore' as const, label: '探索成就' },
      { key: 'social' as const, label: '社交成就' },
    ],
    [],
  );

  const claim = (id: string, done: boolean) => {
    if (!id) return;
    if (!done) return;
    if (claimed.includes(id)) return;
    const next = [...claimed, id];
    writeJson(storageKeys.claimed, next);
    setClaimed(next);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={1080}
      className="achievement-modal"
      destroyOnHidden
      maskClosable
      afterOpenChange={(visible) => {
        if (!visible) return;
        const claimedIds = readJson<string[]>(storageKeys.claimed, []);
        const c = readJson<Record<string, number>>(storageKeys.counters, {});
        setClaimed(Array.isArray(claimedIds) ? claimedIds.filter((x) => typeof x === 'string') : []);
        setCounters(c);
        setMonthCardActive(false);
        void (async () => {
          try {
            const res = await getMonthCardStatus('monthcard-001');
            if (res.success && res.data) setMonthCardActive(Boolean(res.data.active));
          } catch {
            setMonthCardActive(false);
          }
        })();
        setTab('growth');
      }}
    >
      <div className="achievement-shell">
        <div className="achievement-left">
          <div className="achievement-left-title">
            <img className="achievement-left-icon" src={coin01} alt="成就" />
            <div className="achievement-left-name">成就</div>
          </div>
          <div className="achievement-left-list">
            {leftItems.map((it) => (
              <Button
                key={it.key}
                type={tab === it.key ? 'primary' : 'default'}
                className="achievement-left-item"
                onClick={() => setTab(it.key)}
              >
                {it.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="achievement-right">
          <div className="achievement-pane">
            <div className="achievement-pane-top">
              <div className="achievement-top-row">
                <div className="achievement-title">{leftItems.find((x) => x.key === tab)?.label ?? '成就'}</div>
                <div className="achievement-tags">
                  <Tag color="blue">
                    已达成 {overall.doneCount}/{overall.total}
                  </Tag>
                  <Tag color="green">
                    已领取 {overall.claimedCount}/{overall.total}
                  </Tag>
                </div>
              </div>
              <div className="achievement-top-progress">
                <div className="achievement-progress-left">进度</div>
                <div className="achievement-progress-right">
                  <Progress
                    percent={overall.total > 0 ? (overall.doneCount / overall.total) * 100 : 0}
                    showInfo={false}
                    strokeColor="var(--primary-color)"
                  />
                </div>
              </div>
            </div>

            <div className="achievement-pane-body">
              <div className="achievement-list">
                {computed.map((row) => {
                  const claimable = row.done && !row.isClaimed;
                  return (
                    <div key={row.def.id} className="achievement-item">
                      <div className="achievement-item-main">
                        <div className="achievement-item-top">
                          <div className="achievement-item-title">{row.def.title}</div>
                          <div className="achievement-item-tags">
                            {row.isClaimed ? (
                              <Tag color="green">已领取</Tag>
                            ) : claimable ? (
                              <Tag color="blue">可领取</Tag>
                            ) : (
                              <Tag>进行中</Tag>
                            )}
                          </div>
                        </div>
                        <div className="achievement-item-desc">{row.def.desc}</div>
                        <div className="achievement-item-progress">
                          <Progress percent={row.percent} showInfo={false} strokeColor="var(--primary-color)" />
                          <div className="achievement-item-progress-meta">
                            {row.current.toLocaleString()}/{row.target.toLocaleString()}
                          </div>
                        </div>
                        <div className="achievement-rewards">
                          {row.def.reward.map((r) => (
                            <div key={r.id} className="achievement-reward">
                              <img className="achievement-reward-icon" src={r.icon} alt={r.name} />
                              <div className="achievement-reward-name">{r.name}</div>
                              <div className="achievement-reward-amount">×{r.amount.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="achievement-item-right">
                        <Button
                          type="primary"
                          size="small"
                          className="achievement-claim-btn"
                          disabled={!claimable}
                          onClick={() => claim(row.def.id, row.done)}
                        >
                          {row.isClaimed ? '已领取' : '领取'}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {computed.length === 0 ? <div className="achievement-empty">暂无成就</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AchievementModal;
