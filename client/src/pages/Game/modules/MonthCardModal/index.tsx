import { App, Button, Modal, Tag } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { activateMonthCardItem, claimMonthCardReward, getInventoryItems, getMonthCardStatus } from '../../../../services/api';
import { buildMonthCardDailyRewards, buildMonthCardPanelState, type MonthCardDailyReward } from './monthCardDisplay';
import './index.scss';

interface MonthCardModalProps {
  open: boolean;
  onClose: () => void;
}

const monthCardId = 'monthcard-001';
const monthCardItemDefId = 'cons-monthcard-001';
const defaultDailySpiritStones = 10000;
const defaultMonthCardDescription = `有效期30天，每日可领取${defaultDailySpiritStones}灵石。`;

const MonthCardModal: React.FC<MonthCardModalProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getMonthCardStatus>>['data'] | null>(null);
  const [monthCardItem, setMonthCardItem] = useState<{ instanceId: number; qty: number } | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMonthCardStatus(monthCardId);
      if (!res.success || !res.data) {
        setStatus(null);
        void 0;
        return;
      }
      setStatus(res.data);
    } catch {
      setStatus(null);
      void 0;
    } finally {
      setLoading(false);
    }
  }, [message]);

  const refreshMonthCardItem = useCallback(async () => {
    try {
      const res = await getInventoryItems('bag', 1, 200);
      const items = res.data?.items || [];

      let pickedId = 0;
      let totalQty = 0;
      for (const it of items) {
        if (it.item_def_id !== monthCardItemDefId) continue;
        totalQty += Number(it.qty) || 0;
        if (!pickedId) pickedId = Number(it.id) || 0;
      }

      if (pickedId && totalQty > 0) {
        setMonthCardItem({ instanceId: pickedId, qty: totalQty });
      } else {
        setMonthCardItem(null);
      }
    } catch {
      setMonthCardItem(null);
    }
  }, []);

  const dailyRewards = useMemo<MonthCardDailyReward[]>(() => {
    const amount = status?.dailySpiritStones ?? defaultDailySpiritStones;
    return buildMonthCardDailyRewards(amount);
  }, [status?.dailySpiritStones]);

  const active = Boolean(status?.active);
  const daysLeft = status?.daysLeft ?? 0;
  const canClaim = Boolean(status?.canClaim);
  const today = status?.today ?? '';
  const lastClaimDate = status?.lastClaimDate ?? '';
  const isExpired = useMemo(() => {
    if (!status?.expireAt) return false;
    const ts = Date.parse(status.expireAt);
    if (!Number.isFinite(ts)) return false;
    return ts <= Date.now();
  }, [status?.expireAt]);

  const panelState = useMemo(
    () =>
      buildMonthCardPanelState({
        active,
        isExpired,
        daysLeft,
        expireAt: status?.expireAt ?? null,
      }),
    [active, daysLeft, isExpired, status?.expireAt],
  );

  const doUseItem = useCallback(async () => {
    if (acting) return;
    if (!monthCardItem?.instanceId) {
      message.error('背包中没有月卡道具');
      return;
    }
    setActing(true);
    try {
      const res = await activateMonthCardItem({ monthCardId, itemInstanceId: monthCardItem.instanceId });
      if (!res.success) {
        void 0;
        return;
      }
      message.success('使用成功');
      await refreshStatus();
      await refreshMonthCardItem();
    } catch {
      void 0;
    } finally {
      setActing(false);
    }
  }, [acting, message, monthCardItem?.instanceId, refreshMonthCardItem, refreshStatus]);

  const claim = useCallback(async () => {
    if (acting) return;
    if (!canClaim) return;
    setActing(true);
    try {
      const res = await claimMonthCardReward(monthCardId);
      if (!res.success) {
        void 0;
        return;
      }
      message.success(`领取成功 +${res.data?.rewardSpiritStones ?? 0} 灵石`);
      await refreshStatus();
    } catch {
      void 0;
    } finally {
      setActing(false);
    }
  }, [acting, canClaim, message, refreshStatus]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={760}
      className="monthcard-modal"
      destroyOnHidden
      maskClosable
      afterOpenChange={(visible) => {
        if (!visible) {
          setStatus(null);
          setMonthCardItem(null);
          return;
        }
        void refreshStatus();
        void refreshMonthCardItem();
      }}
    >
      <div className="monthcard-shell">
        <div className="monthcard-header">
          <div className="monthcard-title">月卡</div>
        </div>

        <div className="monthcard-body">
          <div className="monthcard-hero">
            <div className="monthcard-hero-left">
              <div className="monthcard-hero-name">{status?.name || '修行月卡'}</div>
              <div className="monthcard-hero-desc">{status?.description || defaultMonthCardDescription}</div>
              <div className="monthcard-hero-tags">
                {active ? <Tag color="green">已解锁</Tag> : <Tag color="default">未解锁</Tag>}
                {active ? <Tag color="blue">剩余 {daysLeft} 天</Tag> : null}
                {!active && isExpired ? <Tag color="red">已到期</Tag> : null}
              </div>
            </div>
            <div className="monthcard-hero-right">
              <div className="monthcard-status-title">{panelState.title}</div>
              <div className="monthcard-status-value">{panelState.statusValue}</div>
              <div className="monthcard-status-hint">{panelState.statusHint}</div>
              {monthCardItem?.instanceId ? (
                <Button type="primary" onClick={doUseItem} disabled={acting || loading}>
                  {panelState.actionLabel}
                </Button>
              ) : (
                <Button type="primary" disabled>
                  无月卡道具
                </Button>
              )}
              <div className="monthcard-progress-meta">
                背包月卡道具：{monthCardItem?.qty ? `${monthCardItem.qty} 个` : '0 个'}
              </div>
            </div>
          </div>

          <div className="monthcard-section">
            <div className="monthcard-section-title">每日奖励</div>
            <div className="monthcard-reward-grid">
              {dailyRewards.map((r) => (
                <div key={r.id} className="monthcard-reward">
                  <img className="monthcard-reward-icon" src={r.icon} alt={r.name} />
                  <div className="monthcard-reward-name">{r.name}</div>
                  <div className="monthcard-reward-amount">x{r.amount}</div>
                </div>
              ))}
            </div>
            <div className="monthcard-claim-row">
              <div className="monthcard-claim-meta">
                <div className="monthcard-claim-k">今日领取</div>
                <div className="monthcard-claim-v">
                  {active ? (today === lastClaimDate ? '已领取' : '未领取') : '未解锁'}
                </div>
              </div>
              <Button type="primary" disabled={!canClaim || acting || loading} loading={acting && canClaim} onClick={claim}>
                {today === lastClaimDate ? '已领取' : '领取奖励'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MonthCardModal;
