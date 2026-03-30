import { Avatar, Button, Modal, Table, Tabs } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useEffect, useRef, useState } from 'react';
import {
  resolveAvatarUrl,
  getInfoTargetDetail,
  SILENT_API_REQUEST_CONFIG,
  type MapObjectDto,
} from '../../../../services/api';
import PlayerName from '../../shared/PlayerName';
import './index.scss';

type InfoTargetType = MapObjectDto['type'];
type InfoActionItem = { key: string; text: string; disabled?: boolean };

export type InfoTarget = MapObjectDto;

interface InfoModalProps {
  open: boolean;
  target: InfoTarget | null;
  onClose: () => void;
  onAction?: (action: string, target: InfoTarget) => void;
}

const InfoModal: React.FC<InfoModalProps> = ({ open, target, onClose, onAction }) => {
  const typeTextMap: Record<InfoTargetType, string> = {
    npc: 'NPC',
    monster: '怪物',
    item: '物品',
    player: '玩家',
  };

  const [resolvedTarget, setResolvedTarget] = useState<InfoTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const requestSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const seq = (requestSeqRef.current += 1);

    if (!open || !target) {
      setResolvedTarget(null);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setResolvedTarget(target);
    if (target.type === 'item' && target.object_kind === 'resource') {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (target.type === 'item' && target.object_kind === 'board') {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (target.type === 'player') {
      const idOk = /^\d+$/.test(String(target.id || '').trim());
      if (!idOk) {
        setLoading(false);
        return () => {
          cancelled = true;
        };
      }
    }

    setLoading(true);
    getInfoTargetDetail(target.type, target.id, SILENT_API_REQUEST_CONFIG)
      .then((res) => {
        if (cancelled) return;
        if (requestSeqRef.current !== seq) return;
        if (!res?.success || !res.data?.target) return;
        setResolvedTarget(res.data.target);
      })
      .catch(() => {
        if (cancelled) return;
      })
      .finally(() => {
        if (cancelled) return;
        if (requestSeqRef.current !== seq) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  const showTarget = resolvedTarget ?? null;
  const avatarUrl = resolveAvatarUrl(showTarget?.avatar ?? undefined);
  const titleText = showTarget?.title?.trim() || '';
  const nameText = showTarget?.name?.trim() || '';
  const genderText = showTarget?.gender ?? '-';
  const realmText = showTarget?.realm ?? '-';
  const typeText = showTarget ? typeTextMap[showTarget.type] : '';

  const computeResourceRuntime = (t: Extract<InfoTarget, { type: 'item' }>) => {
    const r = t.resource;
    const collectLimit = r?.collectLimit ?? 0;
    const cdUntilText = r?.cooldownUntil ?? null;
    const cdUntilMs = cdUntilText ? Date.parse(cdUntilText) : NaN;
    const hasCdUntil = Number.isFinite(cdUntilMs) && cdUntilMs > 0;
    const cooldownSec = hasCdUntil
      ? Math.max(0, Math.ceil((cdUntilMs - nowMs) / 1000))
      : (r?.cooldownSec ?? 0);
    const usedCount = hasCdUntil && cooldownSec === 0 ? 0 : (r?.usedCount ?? 0);
    const remaining = hasCdUntil && cooldownSec === 0 ? collectLimit : (r?.remaining ?? 0);
    return { collectLimit, cooldownSec, usedCount, remaining, respawnSec: r?.respawnSec ?? 0 };
  };

  const dropsColumns = [
    { title: '掉落物', dataIndex: 'name', key: 'name', width: 220 },
    { title: '品质', dataIndex: 'quality', key: 'quality', width: 120 },
    { title: '概率', dataIndex: 'chance', key: 'chance', width: 100 },
  ];

  const renderBaseInfo = () => (
    <div className="info-modal-base">
      <div className="info-kv">
        <span className="info-k">称号</span>
        <span className="info-v">{titleText || '-'}</span>
      </div>
      <div className="info-kv">
        <span className="info-k">姓名</span>
        <span className="info-v">{nameText || '-'}</span>
      </div>
      <div className="info-kv">
        <span className="info-k">性别</span>
        <span className="info-v">{genderText}</span>
      </div>
      <div className="info-kv">
        <span className="info-k">境界</span>
        <span className="info-v">{realmText}</span>
      </div>
    </div>
  );

  const renderStatsGrid = (stats: Array<{ label: string; value: string | number }> | undefined) => (
    <div className="info-modal-grid">
      {(stats ?? []).map((entry) => (
        <div key={entry.label} className="info-kv">
          <span className="info-k">{entry.label}</span>
          <span className="info-v">{entry.value}</span>
        </div>
      ))}
      {(stats ?? []).length === 0 ? <div className="info-modal-empty">暂无属性</div> : null}
    </div>
  );

  const renderNpcTabs = (t: Extract<InfoTarget, { type: 'npc' }>) => (
    <Tabs
      size="small"
      items={[
        { key: 'info', label: '信息', children: renderBaseInfo() },
        { key: 'desc', label: '描述', children: <div className="info-modal-text">{t.desc || '暂无描述'}</div> },
        t.drops && t.drops.length > 0
          ? {
              key: 'drops',
              label: '掉落',
              children: (
                <Table
                  size="small"
                  rowKey={(row) => row.name}
                  columns={dropsColumns}
                  dataSource={t.drops}
                  pagination={false}
                />
              ),
            }
          : null,
      ].filter(Boolean) as NonNullable<Parameters<typeof Tabs>[0]['items']>}
    />
  );

  const renderMonsterTabs = (t: Extract<InfoTarget, { type: 'monster' }>) => (
    <Tabs
      size="small"
      items={[
        { key: 'info', label: '信息', children: renderBaseInfo() },
        {
          key: 'stats',
          label: '属性',
          children: renderStatsGrid(t.stats),
        },
        {
          key: 'drops',
          label: '掉落',
          children: (
            <Table
              size="small"
              rowKey={(row) => row.name}
              columns={dropsColumns}
              dataSource={t.drops ?? []}
              pagination={false}
            />
          ),
        },
      ]}
    />
  );

  const renderPlayerTabs = (t: Extract<InfoTarget, { type: 'player' }>) => (
    <Tabs
      size="small"
      items={[
        { key: 'info', label: '信息', children: renderBaseInfo() },
        { key: 'stats', label: '属性', children: renderStatsGrid(t.stats) },
        {
          key: 'equip',
          label: '装备',
          children: (
            <div className="info-modal-grid">
              {(t.equipment ?? []).map((e) => (
                <div key={e.slot} className="info-kv">
                  <span className="info-k">{e.slot}</span>
                  <span className="info-v">{e.name}（{e.quality}）</span>
                </div>
              ))}
              {(t.equipment ?? []).length === 0 ? <div className="info-modal-empty">暂无装备</div> : null}
            </div>
          ),
        },
        {
          key: 'tech',
          label: '功法',
          children: (
            <Table
              size="small"
              rowKey={(row) => `${row.name}-${row.level}-${row.type}`}
              columns={[
                { title: '功法', dataIndex: 'name', key: 'name' },
                { title: '等级', dataIndex: 'level', key: 'level', width: 90 },
                { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
              ]}
              dataSource={t.techniques ?? []}
              pagination={false}
            />
          ),
        },
      ]}
    />
  );

  const renderItemTabs = (t: Extract<InfoTarget, { type: 'item' }>) => (
    <Tabs
      size="small"
      items={
        [
          { key: 'info', label: '信息', children: renderBaseInfo() },
          t.object_kind === 'resource'
            ? {
                key: 'gather',
                label: '采集',
                children: (() => {
                  const s = computeResourceRuntime(t);
                  return (
                    <div className="info-modal-grid">
                      <div className="info-kv">
                        <span className="info-k">刷新状态</span>
                        <span className="info-v">{s.cooldownSec > 0 ? `刷新倒计时（剩余${s.cooldownSec}秒）` : '可采集'}</span>
                      </div>
                      <div className="info-kv">
                        <span className="info-k">采集次数</span>
                        <span className="info-v">
                          {s.usedCount}/{s.collectLimit}
                        </span>
                      </div>
                      <div className="info-kv">
                        <span className="info-k">剩余可采</span>
                        <span className="info-v">{s.remaining}</span>
                      </div>
                      <div className="info-kv">
                        <span className="info-k">耗尽刷新</span>
                        <span className="info-v">{s.respawnSec ? `${s.respawnSec}秒` : '-'}</span>
                      </div>
                    </div>
                  );
                })(),
              }
            : null,
          t.stats && t.stats.length > 0
            ? {
                key: 'stats',
                label: '属性',
                children: (
                  <div className="info-modal-grid">
                    {(t.stats ?? []).map((s) => (
                      <div key={s.label} className="info-kv">
                        <span className="info-k">{s.label}</span>
                        <span className="info-v">{s.value}</span>
                      </div>
                    ))}
                    {(t.stats ?? []).length === 0 ? <div className="info-modal-empty">暂无属性</div> : null}
                  </div>
                ),
              }
            : null,
          { key: 'desc', label: '描述', children: <div className="info-modal-text">{t.desc || '暂无描述'}</div> },
        ].filter(Boolean) as NonNullable<Parameters<typeof Tabs>[0]['items']>
      }
    />
  );

  const renderTabs = () => {
    if (!showTarget) return null;
    if (showTarget.type === 'npc') return renderNpcTabs(showTarget);
    if (showTarget.type === 'monster') return renderMonsterTabs(showTarget);
    if (showTarget.type === 'player') return renderPlayerTabs(showTarget);
    return renderItemTabs(showTarget);
  };

  const actionsByType: Record<InfoTargetType, InfoActionItem[]> = {
    npc: [
      { key: 'talk', text: '交流' },
      { key: 'buy', text: '购买' },
    ],
    monster: [{ key: 'attack', text: '攻击' }],
    item: [{ key: 'pickup', text: '拾取' }],
    player: [
      { key: 'talk', text: '交流' },
      { key: 'pm', text: '私聊' },
    ],
  };

  const actions =
    showTarget?.type === 'item' && showTarget.object_kind === 'resource'
      ? (() => {
          const s = computeResourceRuntime(showTarget);
          return [
            {
              key: 'gather',
              text: s.cooldownSec > 0 ? `刷新中（${s.cooldownSec}s）` : '采集',
              disabled: s.cooldownSec > 0 || s.remaining <= 0,
            },
          ];
        })()
      : showTarget?.type === 'item' && showTarget.object_kind === 'board'
        ? []
      : showTarget
        ? actionsByType[showTarget.type].map((a) => ({ ...a, disabled: a.disabled ?? false }))
        : [];

  const footer = showTarget ? (
    <div className="info-modal-footer">
      <div className="info-modal-actions">
        {actions.map((a) => (
          <Button key={a.key} disabled={!!a.disabled} onClick={() => onAction?.(a.key, showTarget)}>
            {a.text}
          </Button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width={560}
      className="info-modal"
      destroyOnHidden
      maskClosable
    >
      {showTarget ? (
        <div className="info-modal-shell">
          <div className="info-modal-header">
            <Avatar size={56} src={avatarUrl} icon={<UserOutlined />} />
            <div className="info-modal-header-right">
              <div className="info-modal-name">
                <span className="info-modal-type">{typeText}</span>
                <span className="info-modal-title">{titleText}</span>
                <PlayerName
                  name={nameText}
                  monthCardActive={showTarget.type === 'player' ? showTarget.monthCardActive : false}
                  ellipsis
                  className="info-modal-realname"
                />
              </div>
              <div className="info-modal-meta">
                <span>性别：{genderText}</span>
                <span className="dot">·</span>
                <span>境界：{realmText}</span>
              </div>
            </div>
          </div>
          <div className="info-modal-body">{loading ? <div className="info-modal-empty">加载中...</div> : renderTabs()}</div>
          {footer}
        </div>
      ) : null}
    </Modal>
  );
};

export default InfoModal;
