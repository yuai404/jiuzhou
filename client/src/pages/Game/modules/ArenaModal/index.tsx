import { App, Button, Modal, Progress, Segmented, Table, Tabs, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameSocket, type CharacterData } from '../../../../services/gameSocket';
import {
  arenaChallenge,
  arenaMatch,
  getArenaOpponents,
  getArenaRecords,
  getArenaStatus,
  type ArenaOpponentDto,
  type ArenaRecordDto,
  type ArenaStatusDto,
} from '../../../../services/api';
import { getUnifiedApiErrorMessage } from '../../../../services/api';
import { useIsMobile } from '../../shared/responsive';
import './index.scss';

interface ArenaModalProps {
  open: boolean;
  onClose: () => void;
  character: CharacterData | null;
  onStartBattle?: (battleId: string) => void;
}

type ArenaTab = 'match' | 'record' | 'rule';
const arenaTabKeys: ArenaTab[] = ['match', 'record', 'rule'];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const calcPower = (c: CharacterData | null): number => {
  if (!c) return 0;
  const atk = (Number(c.wugong) || 0) + (Number(c.fagong) || 0);
  const def = (Number(c.wufang) || 0) + (Number(c.fafang) || 0);
  const hp = Number(c.maxQixue) || 0;
  const mp = Number(c.maxLingqi) || 0;
  const spd = Number(c.sudu) || 0;
  const extra = Number(c.shuxingShuzhi) || 0;
  const base = atk * 2 + def * 1.4 + (hp + mp) / 16 + spd * 8 + extra * 5;
  return Math.max(1, Math.round(base));
};

const formatRate = (v: number) => `${Math.round(clamp(v, 0, 1) * 100)}%`;

const ArenaModal: React.FC<ArenaModalProps> = ({ open, onClose, character, onStartBattle }) => {
  const { message } = App.useApp();
  const [tab, setTab] = useState<ArenaTab>('match');
  const isMobile = useIsMobile();
  const [matching, setMatching] = useState(false);
  const [matchProgress, setMatchProgress] = useState(0);
  const matchTimerRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);

  const selfPower = useMemo(() => calcPower(character), [character]);
  const selfName = character?.nickname || '我';
  const selfRealm = character?.realm || '凡人';

  const [status, setStatus] = useState<ArenaStatusDto | null>(null);
  const [opponents, setOpponents] = useState<ArenaOpponentDto[]>([]);
  const [records, setRecords] = useState<ArenaRecordDto[]>([]);
  const score = status?.score ?? 1000;

  const refreshOpponents = useCallback(async () => {
    try {
      const res = await getArenaOpponents(10);
      if (!res.success) {
        message.error(getUnifiedApiErrorMessage(res, '获取对手失败'));
        setOpponents([]);
        return;
      }
      setOpponents(res.data ?? []);
    } catch (e) {
      message.error(getUnifiedApiErrorMessage(e, '获取对手失败'));
      setOpponents([]);
    }
  }, [message]);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await getArenaStatus();
      if (!res.success) {
        message.error(getUnifiedApiErrorMessage(res, '获取竞技场状态失败'));
        setStatus(null);
        return;
      }
      setStatus(res.data ?? null);
    } catch (e) {
      message.error(getUnifiedApiErrorMessage(e, '获取竞技场状态失败'));
      setStatus(null);
    }
  }, [message]);

  const refreshRecords = useCallback(async () => {
    try {
      const res = await getArenaRecords(50);
      if (!res.success) {
        message.error(getUnifiedApiErrorMessage(res, '获取战报失败'));
        setRecords([]);
        return;
      }
      setRecords(res.data ?? []);
    } catch (e) {
      message.error(getUnifiedApiErrorMessage(e, '获取战报失败'));
      setRecords([]);
    }
  }, [message]);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshStatus(), refreshOpponents(), refreshRecords()]);
  }, [refreshOpponents, refreshRecords, refreshStatus]);

  const clearTimers = useCallback(() => {
    if (matchTimerRef.current) {
      window.clearTimeout(matchTimerRef.current);
      matchTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  const stopMatching = useCallback(() => {
    clearTimers();
    setMatching(false);
    setMatchProgress(0);
  }, [clearTimers]);

  useEffect(() => {
    const off = gameSocket.onArenaUpdate((payload) => {
      if (!open) return;
      const kind = (payload as { kind?: unknown })?.kind;
      if (kind === 'arena_status') {
        const next = (payload as { status?: unknown })?.status;
        if (next && typeof next === 'object') {
          setStatus(next as ArenaStatusDto);
        }
        return;
      }
      void refreshAll();
    });
    return off;
  }, [open, refreshAll]);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const startQuickMatch = useCallback(() => {
    if (matching) return;
    setMatching(true);
    setMatchProgress(0);
    if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = window.setInterval(() => {
      setMatchProgress((p) => {
        if (p >= 99) return 99;
        return Math.min(99, p + 6);
      });
    }, 180);
    if (matchTimerRef.current) window.clearTimeout(matchTimerRef.current);
    matchTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await arenaMatch();
          if (!res?.success || !res.data?.battleId) {
            message.error(getUnifiedApiErrorMessage(res, '匹配失败'));
            stopMatching();
            return;
          }
          stopMatching();
          onClose();
          onStartBattle?.(res.data.battleId);
        } catch (e) {
          message.error(getUnifiedApiErrorMessage(e, '匹配失败'));
          stopMatching();
        }
      })();
    }, 900);
  }, [matching, message, onClose, onStartBattle, stopMatching]);

  const handleChallenge = useCallback(
    async (opp: ArenaOpponentDto) => {
      try {
        const res = await arenaChallenge(opp.id);
        if (!res?.success || !res.data?.battleId) {
          message.error(getUnifiedApiErrorMessage(res, '挑战失败'));
          return;
        }
        onClose();
        onStartBattle?.(res.data.battleId);
      } catch (e) {
        message.error(getUnifiedApiErrorMessage(e, '挑战失败'));
      }
    },
    [message, onClose, onStartBattle],
  );

  const winRateHint = useCallback(
    (oppPower: number) => {
      const sp = Math.max(1, selfPower || 1);
      const op = Math.max(1, oppPower || 1);
      const raw = sp / (sp + op);
      const rate = clamp(0.2 + raw * 0.6, 0.2, 0.8);
      return formatRate(rate);
    },
    [selfPower],
  );

  const tabItems = useMemo(
    () => [
      {
        key: 'match',
        label: '匹配',
        children: (
          <div className={`arena-match-layout ${isMobile ? 'is-mobile' : ''}`}>
            <div className="arena-self-card">
              <div className="arena-self-head">
                <div className="arena-self-title">我的信息</div>
                <Tag color="blue">积分 {score}</Tag>
              </div>
              <div className="arena-self-meta">
                <div>玩家：{selfName}</div>
                <div>境界：{selfRealm}</div>
                <div>战力：{selfPower.toLocaleString()}</div>
                <div className="arena-self-meta-line">
                  今日挑战：{status ? `${status.todayUsed}/${status.todayLimit}` : '--'}（剩余 {status ? status.todayRemaining : '--'}）
                </div>
              </div>

              <div className="arena-self-actions">
                <Button type="primary" disabled={matching} onClick={startQuickMatch}>
                  一键匹配
                </Button>
                <Button disabled={matching} onClick={() => void refreshOpponents()}>
                  刷新对手
                </Button>
                {matching ? (
                  <Button danger onClick={stopMatching}>
                    取消匹配
                  </Button>
                ) : null}
              </div>

              {matching ? (
                <div className="arena-self-matching">
                  <div className="arena-self-matching-label">匹配中...</div>
                  <Progress percent={matchProgress} showInfo={false} strokeColor="var(--primary-color)" />
                </div>
              ) : (
                <div className="arena-self-tip">
                  匹配与挑战将进入真实 PVP 战斗，战斗结束后自动结算积分与战报。
                </div>
              )}
            </div>

            <div className="arena-opponents-pane">
              {isMobile ? (
                <div className="arena-mobile-list">
                  {opponents.map((row) => (
                    <div key={row.id} className="arena-mobile-card">
                      <div className="arena-mobile-card-head">
                        <div className="arena-mobile-title">{row.name}</div>
                        <Tag color="green">{row.realm}</Tag>
                      </div>
                      <div className="arena-mobile-meta">
                        <span className="arena-mobile-meta-item">
                          <span className="arena-mobile-meta-k">战力</span>
                          <span className="arena-mobile-meta-v">{row.power.toLocaleString()}</span>
                        </span>
                        <span className="arena-mobile-meta-item">
                          <span className="arena-mobile-meta-k">预计胜率</span>
                          <span className="arena-mobile-meta-v">{winRateHint(row.power)}</span>
                        </span>
                      </div>
                      <div className="arena-mobile-actions">
                        <Button size="small" type="primary" disabled={matching} onClick={() => void handleChallenge(row)}>
                          挑战
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!opponents.length ? (
                    <div className="arena-empty">
                      <div className="arena-empty-text">暂无可匹配对手，可点击刷新重试</div>
                      <Button size="small" disabled={matching} onClick={() => void refreshOpponents()}>
                        刷新对手
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Table
                  size="small"
                  rowKey={(row) => String(row.id)}
                  pagination={false}
                  columns={[
                    { title: '对手', dataIndex: 'name', key: 'name', width: 180 },
                    { title: '境界', dataIndex: 'realm', key: 'realm', width: 140, render: (v: string) => <Tag color="green">{v}</Tag> },
                    { title: '战力', dataIndex: 'power', key: 'power', width: 140, render: (v: number) => v.toLocaleString() },
                    { title: '预计胜率', key: 'rate', width: 120, render: (_: unknown, row: ArenaOpponentDto) => winRateHint(row.power) },
                    {
                      title: '操作',
                      key: 'action',
                      render: (_: unknown, row: ArenaOpponentDto) => (
                        <Button size="small" type="primary" disabled={matching} onClick={() => void handleChallenge(row)}>
                          挑战
                        </Button>
                      ),
                    },
                  ]}
                  dataSource={opponents}
                  locale={{
                    emptyText: (
                      <div className="arena-empty">
                        <div className="arena-empty-text">暂无可匹配对手（已自动扩大战力范围），可点击刷新重试</div>
                        <Button size="small" disabled={matching} onClick={() => void refreshOpponents()}>
                          刷新对手
                        </Button>
                      </div>
                    ),
                  }}
                />
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'record',
        label: `战报${records.length ? `(${records.length})` : ''}`,
        children: (
          <div className="arena-record-pane">
            <div className="arena-record-head">
              <div className="arena-record-title">最近战报</div>
              <Button
                size="small"
                disabled={!records.length}
                onClick={() => {
                  setRecords([]);
                  message.success('已清空战报');
                }}
              >
                清空
              </Button>
            </div>
            {isMobile ? (
              <div className="arena-mobile-list">
                {records.map((row) => (
                  <div key={row.id} className="arena-mobile-card">
                    <div className="arena-mobile-card-head">
                      <div className="arena-mobile-title">{row.opponentName}</div>
                      <Tag color={row.result === 'win' ? 'green' : row.result === 'lose' ? 'red' : 'default'}>
                        {row.result === 'win' ? '胜利' : row.result === 'lose' ? '失败' : '平局'}
                      </Tag>
                    </div>
                    <div className="arena-mobile-meta">
                      <span className="arena-mobile-meta-item">
                        <span className="arena-mobile-meta-k">时间</span>
                        <span className="arena-mobile-meta-v">{new Date(row.ts).toLocaleString()}</span>
                      </span>
                      <span className="arena-mobile-meta-item">
                        <span className="arena-mobile-meta-k">境界</span>
                        <span className="arena-mobile-meta-v">{row.opponentRealm}</span>
                      </span>
                      <span className="arena-mobile-meta-item">
                        <span className="arena-mobile-meta-k">战力</span>
                        <span className="arena-mobile-meta-v">{row.opponentPower.toLocaleString()}</span>
                      </span>
                      <span className="arena-mobile-meta-item">
                        <span className="arena-mobile-meta-k">积分变化</span>
                        <span className="arena-mobile-meta-v">{row.deltaScore >= 0 ? `+${row.deltaScore}` : row.deltaScore}</span>
                      </span>
                      <span className="arena-mobile-meta-item">
                        <span className="arena-mobile-meta-k">当前积分</span>
                        <span className="arena-mobile-meta-v">{row.scoreAfter}</span>
                      </span>
                    </div>
                  </div>
                ))}
                {!records.length ? <div className="arena-empty">暂无战报，去匹配挑战吧。</div> : null}
              </div>
            ) : (
              <Table
                size="small"
                rowKey={(row) => row.id}
                pagination={false}
                columns={[
                  {
                    title: '时间',
                    dataIndex: 'ts',
                    key: 'ts',
                    width: 180,
                    render: (v: number) => new Date(v).toLocaleString(),
                  },
                  { title: '对手', dataIndex: 'opponentName', key: 'opponentName', width: 180 },
                  {
                    title: '境界',
                    dataIndex: 'opponentRealm',
                    key: 'opponentRealm',
                    width: 140,
                    render: (v: string) => <Tag color="green">{v}</Tag>,
                  },
                  {
                    title: '战力',
                    dataIndex: 'opponentPower',
                    key: 'opponentPower',
                    width: 140,
                    render: (v: number) => v.toLocaleString(),
                  },
                  {
                    title: '结果',
                    dataIndex: 'result',
                    key: 'result',
                    width: 120,
                    render: (v: ArenaRecordDto['result']) =>
                      v === 'win' ? <Tag color="green">胜利</Tag> : v === 'lose' ? <Tag color="red">失败</Tag> : <Tag>平局</Tag>,
                  },
                  {
                    title: '积分变化',
                    dataIndex: 'deltaScore',
                    key: 'deltaScore',
                    width: 120,
                    render: (v: number) => (v >= 0 ? `+${v}` : String(v)),
                  },
                  { title: '当前积分', dataIndex: 'scoreAfter', key: 'scoreAfter', render: (v: number) => v },
                ]}
                dataSource={records}
                locale={{ emptyText: '暂无战报，去匹配挑战吧。' }}
              />
            )}
          </div>
        ),
      },
      {
        key: 'rule',
        label: '规则',
        children: (
          <div className="arena-rule">
            <div className="arena-rule-title">竞技场</div>
            <div>1）今日挑战次数上限：20 次。</div>
            <div>2）匹配对手：按战力区间筛选（约 ±20%）。</div>
            <div>3）积分变化：胜利 +10，失败 -5（最低 0）。</div>
            <div className="arena-rule-tip">
              战斗中治疗效果会有一定压制。
            </div>
          </div>
        ),
      },
    ],
    [
      matchProgress,
      matching,
      handleChallenge,
      message,
      opponents,
      records,
      refreshOpponents,
      score,
      selfName,
      selfPower,
      selfRealm,
      startQuickMatch,
      status,
      stopMatching,
      winRateHint,
      isMobile,
    ],
  );

  const mobileTabOptions = useMemo(
    () => [
      { value: 'match', label: '匹配' },
      { value: 'record', label: `战报${records.length ? `(${records.length})` : ''}` },
      { value: 'rule', label: '规则' },
    ],
    [records.length],
  );

  const activePanel = useMemo(() => tabItems.find((it) => it.key === tab)?.children ?? null, [tab, tabItems]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={980}
      className="arena-modal"
      destroyOnHidden
      maskClosable
      afterOpenChange={(visible) => {
        if (!visible) {
          stopMatching();
          return;
        }
        setTab('match');
        setMatching(false);
        setMatchProgress(0);
        void refreshAll();
      }}
    >
      <div className="arena-shell">
        <div className="arena-head">
          <div className="arena-head-title">竞技场</div>
          <Tag color="blue">当前积分：{score}</Tag>
        </div>
        {isMobile ? (
          <>
            <div className="arena-segmented-wrap">
              <Segmented
                className="arena-segmented"
                value={tab}
                options={mobileTabOptions}
                onChange={(value) => {
                  if (typeof value !== 'string') return;
                  if (!arenaTabKeys.includes(value as ArenaTab)) return;
                  setTab(value as ArenaTab);
                }}
              />
            </div>
            <div className="arena-panel">{activePanel}</div>
          </>
        ) : (
          <Tabs
            activeKey={tab}
            onChange={(k) => setTab(k as ArenaTab)}
            items={tabItems as unknown as Array<{ key: string; label: string; children: React.ReactNode }>}
          />
        )}
      </div>
    </Modal>
  );
};

export default ArenaModal;
