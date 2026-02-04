import { App, Button, Modal, Progress, Tag } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CharacterData } from '../../../../services/gameSocket';
import { gameSocket } from '../../../../services/gameSocket';
import { SERVER_BASE, breakthroughToNextRealm, getRealmOverview, type RealmOverviewDto } from '../../../../services/api';
import coin01 from '../../../../assets/images/ui/sh_icon_0006_jinbi_02.png';
import lingshiIcon from '../../../../assets/images/ui/lingshi.png';
import tongqianIcon from '../../../../assets/images/ui/tongqian.png';
import './index.scss';

interface RealmModalProps {
  open: boolean;
  onClose: () => void;
  character: CharacterData | null;
}

type RealmRank = {
  currentIdx: number;
  total: number;
  current: string;
  next: string | null;
};

type RequirementRow = {
  id: string;
  title: string;
  detail: string;
  status: 'done' | 'todo' | 'unknown';
};

type CostRow = {
  id: string;
  name: string;
  amountText: string;
  icon?: string;
};

type RewardRow = {
  id: string;
  title: string;
  detail: string;
};

type UnlockRow = {
  id: string;
  title: string;
  detail: string;
};

const ITEM_ICON_GLOB = import.meta.glob('../../../../assets/images/**/*.{png,jpg,jpeg,webp,gif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const ITEM_ICON_BY_FILENAME: Record<string, string> = Object.fromEntries(
  Object.entries(ITEM_ICON_GLOB).map(([p, url]) => {
    const parts = p.split(/[/\\]/);
    return [parts[parts.length - 1] ?? p, url];
  }),
);

const resolveIcon = (icon: string | null | undefined): string => {
  const raw = (icon ?? '').trim();
  if (!raw) return coin01;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/uploads/')) return `${SERVER_BASE}${raw}`;
  if (raw.startsWith('/assets/')) {
    const filename = raw.split('/').filter(Boolean).pop() ?? raw;
    return ITEM_ICON_BY_FILENAME[filename] ?? raw;
  }
  if (raw.startsWith('/')) return `${SERVER_BASE}${raw}`;
  const filename = raw.split('/').filter(Boolean).pop() ?? raw;
  return ITEM_ICON_BY_FILENAME[filename] ?? coin01;
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

const normalizeRealm = (realm: string) => {
  const s = String(realm || '').trim();
  if (!s) return '凡人';
  if (realmRank[s] != null) return s;
  if (realmMajorToFirst[s]) return realmMajorToFirst[s];
  if (realmSubToFull[s]) return realmSubToFull[s];
  return s;
};

const buildRealmRank = (character: CharacterData | null): RealmRank => {
  const current = normalizeRealm(character?.realm ?? '凡人');
  const currentIdx = realmRank[current] ?? 0;
  const next = currentIdx + 1 < realmOrder.length ? realmOrder[currentIdx + 1] : null;
  return { currentIdx, total: realmOrder.length, current, next };
};

const buildPlan = (target: string | null, character: CharacterData | null): { requirements: RequirementRow[]; costs: CostRow[] } => {
  if (!target) return { requirements: [], costs: [] };
  const exp = Number(character?.exp ?? 0) || 0;
  const spiritStones = Number(character?.spiritStones ?? 0) || 0;

  if (target === '炼精化炁·养气期') {
    return {
      requirements: [
        {
          id: 'exp-1000',
          title: '修为经验',
          detail: `经验 ≥ 1,000（当前 ${exp.toLocaleString()}）`,
          status: exp >= 1000 ? 'done' : 'todo',
        },
        { id: 'tech-yangqi', title: '功法修炼', detail: '养气诀 ≥ 2 层（未接入功法数据）', status: 'unknown' },
      ],
      costs: [{ id: 'cost-exp', name: '经验', amountText: '500（示例）', icon: tongqianIcon }],
    };
  }

  if (target === '炼精化炁·通脉期') {
    return {
      requirements: [
        {
          id: 'exp-5000',
          title: '修为经验',
          detail: `经验 ≥ 5,000（当前 ${exp.toLocaleString()}）`,
          status: exp >= 5000 ? 'done' : 'todo',
        },
        { id: 'dungeon-1', title: '试炼秘境', detail: '通关一次气血修炼秘境·低难度（未接入秘境记录）', status: 'unknown' },
        { id: 'tech-1', title: '功法修炼', detail: '至少 1 门基础战斗功法 ≥ 3 层（未接入功法数据）', status: 'unknown' },
        {
          id: 'money-100',
          title: '灵石储备',
          detail: `灵石 ≥ 100（当前 ${spiritStones.toLocaleString()}）`,
          status: spiritStones >= 100 ? 'done' : 'todo',
        },
        { id: 'item-tongmai', title: '突破丹药', detail: '通脉丹 × 1（未接入背包材料校验）', status: 'unknown' },
      ],
      costs: [
        { id: 'cost-money', name: '灵石', amountText: '100（示例）', icon: lingshiIcon },
        { id: 'cost-item', name: '通脉丹', amountText: '×1（示例）', icon: coin01 },
      ],
    };
  }

  if (target === '炼精化炁·凝炁期') {
    return {
      requirements: [
        {
          id: 'exp-15000',
          title: '修为经验',
          detail: `经验 ≥ 15,000（当前 ${exp.toLocaleString()}）`,
          status: exp >= 15000 ? 'done' : 'todo',
        },
        { id: 'tech-2', title: '功法修炼', detail: '至少 2 门功法 ≥ 4 层（未接入功法数据）', status: 'unknown' },
        { id: 'dungeon-2', title: '试炼秘境', detail: '通关更高难度关卡一次（未接入秘境记录）', status: 'unknown' },
        {
          id: 'money-300',
          title: '灵石储备',
          detail: `灵石 ≥ 300（当前 ${spiritStones.toLocaleString()}）`,
          status: spiritStones >= 300 ? 'done' : 'todo',
        },
        { id: 'item-ningqi', title: '突破丹药', detail: '凝炁丹 × 1（未接入背包材料校验）', status: 'unknown' },
        { id: 'item-canye', title: '辅助材料', detail: '功法残页 × 若干（未接入背包材料校验）', status: 'unknown' },
      ],
      costs: [
        { id: 'cost-money', name: '灵石', amountText: '300（示例）', icon: lingshiIcon },
        { id: 'cost-item', name: '凝炁丹', amountText: '×1（示例）', icon: coin01 },
      ],
    };
  }

  return {
    requirements: [
      { id: 'exp', title: '修为经验', detail: '达到指定经验阈值（示例）', status: 'unknown' },
      { id: 'tech', title: '功法修炼', detail: '主修功法达到指定层数（示例）', status: 'unknown' },
      { id: 'dungeon', title: '试炼秘境', detail: '通关对应试炼秘境（示例）', status: 'unknown' },
      { id: 'item', title: '突破材料', detail: '消耗指定丹药与材料（示例）', status: 'unknown' },
    ],
    costs: [{ id: 'cost', name: '消耗', amountText: '待接入服务端配置', icon: coin01 }],
  };
};

const buildRewards = (target: string | null): { rewards: RewardRow[]; unlocks: UnlockRow[] } => {
  if (!target) return { rewards: [], unlocks: [] };

  if (target === '炼精化炁·养气期') {
    return {
      rewards: [
        { id: 'hp', title: '最大气血', detail: '+10%（示意）' },
        { id: 'qi', title: '最大灵气', detail: '+10%（示意）' },
        { id: 'ap', title: '属性点', detail: '+5（示意）' },
      ],
      unlocks: [
        { id: 'tech', title: '功法层数', detail: '满足更多功法 required_realm 前置（示意）' },
        { id: 'dungeon', title: '秘境内容', detail: '解锁更高难度与更多掉落（示意）' },
      ],
    };
  }

  if (target === '炼精化炁·通脉期') {
    return {
      rewards: [
        { id: 'hp', title: '最大气血', detail: '+15%（示意）' },
        { id: 'qi', title: '最大灵气', detail: '+15%（示意）' },
        { id: 'atk', title: '攻防成长', detail: '物攻/法攻 +5%（示意）' },
        { id: 'ap', title: '属性点', detail: '+5（示意）' },
      ],
      unlocks: [
        { id: 'dungeon', title: '秘境内容', detail: '通脉段位试炼与材料掉落（示意）' },
        { id: 'task', title: '任务/成就', detail: '突破节点可触发主线/成就进度（示意）' },
      ],
    };
  }

  if (target === '炼精化炁·凝炁期') {
    return {
      rewards: [
        { id: 'hp', title: '最大气血', detail: '+15%（示意）' },
        { id: 'qi', title: '最大灵气', detail: '+15%（示意）' },
        { id: 'atkdef', title: '攻防成长', detail: '攻击/防御 +5%～8%（示意）' },
        { id: 'ap', title: '属性点', detail: '+10（示意）' },
      ],
      unlocks: [
        { id: 'dungeon', title: '秘境内容', detail: '更高难度关卡与稀有材料（示意）' },
        { id: 'next', title: '后续突破入口', detail: '预留进入 炼炁化神·炼己期 的门槛（示意）' },
      ],
    };
  }

  return {
    rewards: [
      { id: 'attrs', title: '属性提升', detail: '提升气血/灵气/攻防等（示意）' },
      { id: 'ap', title: '属性点', detail: '获得可分配属性点（示意）' },
    ],
    unlocks: [
      { id: 'tech', title: '功法层数', detail: '解锁更高层 required_realm（示意）' },
      { id: 'content', title: '内容解锁', detail: '秘境/宗门/玩法门槛提升（示意）' },
    ],
  };
};

const getRequirementTag = (status: RequirementRow['status']) => {
  if (status === 'done') return <Tag color="green">已满足</Tag>;
  if (status === 'todo') return <Tag color="red">未满足</Tag>;
  return <Tag>待接入</Tag>;
};

const RealmModal: React.FC<RealmModalProps> = ({ open, onClose, character }) => {
  const { message } = App.useApp();

  const [overview, setOverview] = useState<RealmOverviewDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [breakthroughLoading, setBreakthroughLoading] = useState(false);

  const refreshOverview = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const res = await getRealmOverview();
      if (res.success && res.data) {
        setOverview(res.data);
      } else {
        setOverview(null);
        message.error(res.message || '获取境界信息失败');
      }
    } catch (err) {
      const e = err as { message?: string };
      setOverview(null);
      message.error(e?.message || '获取境界信息失败');
    } finally {
      setLoading(false);
    }
  }, [message, open]);

  useEffect(() => {
    if (open) {
      void refreshOverview();
    } else {
      setOverview(null);
    }
  }, [open, refreshOverview]);

  const rank = useMemo<RealmRank>(() => {
    if (overview) {
      const total = Math.max(1, overview.realmOrder.length);
      const currentIdx = Math.max(0, Number(overview.currentIndex ?? 0) || 0);
      const current = String(overview.currentRealm || '凡人');
      const next = overview.nextRealm ? String(overview.nextRealm) : null;
      return { currentIdx, total, current, next };
    }
    return buildRealmRank(character);
  }, [character, overview]);

  const plan = useMemo(() => {
    if (overview) {
      const requirements: RequirementRow[] = (overview.requirements ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        detail: r.detail,
        status: r.status,
      }));
      const costs: CostRow[] = (overview.costs ?? []).map((c) => ({
        id: c.id,
        name: c.title,
        amountText: c.detail,
        icon:
          c.type === 'item'
            ? resolveIcon(c.itemIcon)
            : c.type === 'spirit_stones'
              ? lingshiIcon
              : c.type === 'exp'
                ? tongqianIcon
                : coin01,
      }));
      return { requirements, costs };
    }
    return buildPlan(rank.next, character);
  }, [character, overview, rank.next]);

  const outcome = useMemo(() => {
    if (overview) {
      const rewards: RewardRow[] = (overview.rewards ?? []).map((r) => ({ id: r.id, title: r.title, detail: r.detail }));
      return { rewards, unlocks: [] as UnlockRow[] };
    }
    return buildRewards(rank.next);
  }, [overview, rank.next]);

  const progressPercent = useMemo(() => {
    const totalSteps = Math.max(1, rank.total - 1);
    return Math.max(0, Math.min(100, (rank.currentIdx / totalSteps) * 100));
  }, [rank.currentIdx, rank.total]);

  const canBreakthrough = useMemo(() => {
    if (!rank.next) return false;
    if (overview) return !!overview.canBreakthrough;
    if (plan.requirements.length === 0) return false;
    return plan.requirements.every((r) => r.status === 'done');
  }, [overview, plan.requirements, rank.next]);

  const handleBreakthrough = useCallback(async () => {
    if (!rank.next) return;
    setBreakthroughLoading(true);
    try {
      const res = await breakthroughToNextRealm();
      if (!res.success) {
        message.error(res.message || '突破失败');
        return;
      }
      message.success(res.message || '突破成功');
      gameSocket.refreshCharacter();
      void refreshOverview();
    } catch (err) {
      const e = err as { message?: string };
      message.error(e?.message || '突破失败');
    } finally {
      setBreakthroughLoading(false);
    }
  }, [message, rank.next, refreshOverview]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={1080}
      className="realm-modal"
      destroyOnHidden
      maskClosable
    >
      <div className="realm-shell">
        <div className="realm-left">
          <div className="realm-left-title">
            <img className="realm-left-icon" src={coin01} alt="境界" />
            <div className="realm-left-name">境界</div>
          </div>

          <div className="realm-left-card">
            <div className="realm-left-card-k">当前境界</div>
            <div className="realm-left-card-v">{rank.current}</div>
            <div className="realm-left-card-sub">
              {rank.currentIdx + 1}/{rank.total}
            </div>
            <div className="realm-left-progress">
              <Progress percent={progressPercent} showInfo={false} strokeColor="var(--primary-color)" />
            </div>
          </div>

          <div className="realm-stats">
            <div className="realm-stat">
              <div className="realm-stat-k">经验</div>
              <div className="realm-stat-v">{(character?.exp ?? 0).toLocaleString()}</div>
            </div>
            <div className="realm-stat">
              <div className="realm-stat-k">灵石</div>
              <div className="realm-stat-v">{(character?.spiritStones ?? 0).toLocaleString()}</div>
            </div>
            <div className="realm-stat">
              <div className="realm-stat-k">可用属性点</div>
              <div className="realm-stat-v">{(character?.attributePoints ?? 0).toLocaleString()}</div>
            </div>
          </div>

          <div className="realm-left-tip">
            <div className="realm-left-tip-title">提示</div>
            <div className="realm-left-tip-text">
              {loading ? '正在加载服务端境界配置与条件判定…' : overview ? '已接入服务端真实突破条件与消耗。' : '未获取到服务端境界数据。'}
            </div>
          </div>
        </div>

        <div className="realm-right">
          <div className="realm-pane">
            <div className="realm-pane-top">
              <div className="realm-title">境界突破</div>
              <div className="realm-subtitle">{rank.next ? `下一境界：${rank.next}` : '已达当前版本最高境界'}</div>
            </div>

            <div className="realm-pane-body">
              <div className="realm-section">
                <div className="realm-section-title">突破条件</div>
                <div className="realm-req-list">
                  {plan.requirements.map((r) => (
                    <div key={r.id} className="realm-req-item">
                      <div className="realm-req-main">
                        <div className="realm-req-title">{r.title}</div>
                        <div className="realm-req-detail">{r.detail}</div>
                      </div>
                      <div className="realm-req-tag">{getRequirementTag(r.status)}</div>
                    </div>
                  ))}
                  {plan.requirements.length === 0 ? <div className="realm-empty">暂无条件</div> : null}
                </div>
              </div>

              <div className="realm-section">
                <div className="realm-section-title">消耗预览</div>
                <div className="realm-costs">
                  {plan.costs.map((c) => (
                    <div key={c.id} className="realm-cost">
                      <img className="realm-cost-icon" src={c.icon ?? coin01} alt={c.name} />
                      <div className="realm-cost-name">{c.name}</div>
                      <div className="realm-cost-amount">{c.amountText}</div>
                    </div>
                  ))}
                  {plan.costs.length === 0 ? <div className="realm-empty">暂无消耗</div> : null}
                </div>
              </div>

              <div className="realm-section">
                <div className="realm-section-title">突破收益</div>
                <div className="realm-reward-list">
                  {outcome.rewards.map((r) => (
                    <div key={r.id} className="realm-reward-item">
                      <div className="realm-reward-title">{r.title}</div>
                      <div className="realm-reward-detail">{r.detail}</div>
                    </div>
                  ))}
                  {outcome.rewards.length === 0 ? <div className="realm-empty">暂无收益</div> : null}
                </div>
              </div>

              {outcome.unlocks.length > 0 ? (
                <div className="realm-section">
                  <div className="realm-section-title">联动解锁</div>
                  <div className="realm-unlock-list">
                    {outcome.unlocks.map((u) => (
                      <div key={u.id} className="realm-unlock-item">
                        <div className="realm-unlock-title">{u.title}</div>
                        <div className="realm-unlock-detail">{u.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="realm-pane-footer">
              <Button onClick={onClose}>关闭</Button>
              <Button
                type="primary"
                disabled={!canBreakthrough}
                loading={breakthroughLoading}
                onClick={handleBreakthrough}
              >
                {rank.next ? '突破' : '已达巅峰'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default RealmModal;
