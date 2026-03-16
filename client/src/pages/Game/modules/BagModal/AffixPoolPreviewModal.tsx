/**
 * 词条池预览弹窗
 *
 * 作用：展示当前装备可洗出的所有词条及其数值范围。
 *       按 group 分组，标记已拥有的词条和传奇词条，支持关键词搜索过滤。
 */

import { useMemo, useState } from 'react';
import { Modal, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { AffixPoolPreviewAffixEntry, AffixPoolPreviewTierEntry } from '../../../../services/api/inventory';
import './AffixPoolPreviewModal.scss';

export interface AffixPoolPreviewModalProps {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  poolName: string;
  affixes: AffixPoolPreviewAffixEntry[];
}

const GROUP_LABELS: Record<string, string> = {
  output: '输出',
  survival: '生存',
  utility: '功能',
  trigger: '触发',
  resource: '资源',
  recovery: '恢复',
  resistance: '抗性',
  defense: '防御',
  special: '特殊',
};

const GROUP_ORDER: string[] = ['output', 'survival', 'utility', 'trigger', 'resource', 'recovery', 'resistance'];

const DEFAULT_GROUP_LABEL = '其他';

const formatTierRange = (tier: AffixPoolPreviewTierEntry, applyType: string): string => {
  const suffix = applyType === 'percent' ? '%' : '';
  return `${tier.min}${suffix} ~ ${tier.max}${suffix}`;
};

export const AffixPoolPreviewModal: React.FC<AffixPoolPreviewModalProps> = ({
  open,
  onClose,
  loading,
  poolName,
  affixes,
}) => {
  const [search, setSearch] = useState('');

  const grouped = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const filtered = kw
      ? affixes.filter((a) => a.name.toLowerCase().includes(kw))
      : affixes;

    if (filtered.length === 0) return [];

    const map = new Map<string, AffixPoolPreviewAffixEntry[]>();
    for (const affix of filtered) {
      const group = affix.group || DEFAULT_GROUP_LABEL;
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(affix);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      const aOrder = ai >= 0 ? ai : GROUP_ORDER.length;
      const bOrder = bi >= 0 ? bi : GROUP_ORDER.length;
      return aOrder - bOrder || a.localeCompare(b);
    });
  }, [affixes, search]);

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  const totalCount = affixes.length;
  const ownedCount = affixes.filter((a) => a.owned).length;

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      destroyOnHidden
      width={600}
      title={poolName || '词条池预览'}
      maskClosable
    >
      <div className="affix-pool-preview">
        {/* 顶部：搜索与统计 */}
        <div className="affix-pool-preview-header">
          <Input
            className="search-input"
            placeholder="搜索词条..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<SearchOutlined style={{ color: 'var(--text-secondary, #999)' }} />}
            allowClear
          />
          <div className="stats">
            共 <span className="stats-num">{totalCount}</span> 条
            {ownedCount > 0 && (
              <>
                <span className="stats-divider">|</span>
                已拥有 <span className="stats-num highlight">{ownedCount}</span> 条
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="affix-pool-preview-loading">加载中...</div>
        ) : affixes.length === 0 ? (
          <div className="affix-pool-preview-empty">暂无可用词条数据</div>
        ) : (
          <div className="affix-pool-preview-body">
            {grouped.length === 0 ? (
              <div className="affix-pool-preview-empty">未找到匹配的词条</div>
            ) : (
              grouped.map(([groupKey, items]) => (
                <div key={groupKey} className="affix-group">
                  <div className="group-title">
                    <span className="label">{GROUP_LABELS[groupKey] || groupKey}</span>
                    <span className="count">{items.length}</span>
                  </div>

                  <div className="affix-list">
                    {items.map((affix) => (
                      <div
                        key={affix.key}
                        className={`affix-card ${affix.owned ? 'is-owned' : ''} ${
                          affix.is_legendary ? 'is-legendary' : ''
                        }`}
                      >
                        <div className="affix-card-header">
                          <div className="name-wrap">
                            {affix.is_legendary && <span className="legendary-dot" />}
                            <span className="name" title={affix.name}>{affix.name}</span>
                          </div>
                          {affix.owned && <span className="owned-tag">已拥有</span>}
                        </div>

                        <div className="affix-card-body">
                          {affix.tiers.length > 0 ? (
                            <div className="tier-list">
                              {affix.tiers.map((tier: AffixPoolPreviewTierEntry) => (
                                <div key={tier.tier} className="tier-item">
                                  <span className="tier-label">T{tier.tier}</span>
                                  <span className="tier-value">
                                    {formatTierRange(tier, affix.apply_type)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="tier-empty">当前境界无可用阶级</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
