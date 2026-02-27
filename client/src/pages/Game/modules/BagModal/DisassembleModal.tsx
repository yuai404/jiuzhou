import { App, Button, InputNumber, Modal, Tag } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { disassembleInventoryEquipment } from '../../../../services/api';
import { getUnifiedApiErrorMessage } from '../../../../services/api';
import { isDisassemblableBagItem, qualityLabelText } from './bagShared';
import type { BagCategory, BagQuality } from './bagShared';

type DisassembleCategory = Exclude<BagCategory, 'all'>;

export type DisassembleTarget = {
  id: number;
  name: string;
  quality: BagQuality;
  qty: number;
  location: 'bag' | 'warehouse' | 'equipped';
  locked?: boolean;
  category: DisassembleCategory;
  subCategory: string | null;
};

interface DisassembleModalProps {
  open: boolean;
  item: DisassembleTarget | null;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const techniqueBookRewardQtyByQuality: Record<BagQuality, number> = {
  黄: 2,
  玄: 4,
  地: 7,
  天: 14,
};

const DisassembleModal: React.FC<DisassembleModalProps> = ({ open, item, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);
  const [disassembleQty, setDisassembleQty] = useState(1);

  useEffect(() => {
    if (!open) return;
    setDisassembleQty(1);
  }, [open, item?.id]);

  const maxQty = useMemo(() => {
    if (!item) return 1;
    return Math.max(1, Math.floor(Number(item.qty) || 1));
  }, [item]);

  const rewardPreview = useMemo(() => {
    if (!item) return '';
    if (item.category === 'equipment') {
      const rewardName = item.quality === '黄' || item.quality === '玄' ? '淬灵石' : '蕴灵石';
      return `${rewardName}×${disassembleQty}`;
    }
    if (item.subCategory === 'technique_book') {
      const qty = techniqueBookRewardQtyByQuality[item.quality] || 2;
      return `功法残页×${qty * disassembleQty}`;
    }
    return '银两（按公式结算）';
  }, [disassembleQty, item]);

  const disabledReason = useMemo(() => {
    if (!item) return '请选择可分解物品';
    if (!isDisassemblableBagItem(item)) return '该物品不可分解';
    if (item.locked) return '物品已锁定';
    if (item.location === 'equipped') return item.category === 'equipment' ? '穿戴中的装备不可分解' : '该物品当前位置不可分解';
    if (item.location !== 'bag' && item.location !== 'warehouse') return '该物品当前位置不可分解';
    if (!Number.isInteger(disassembleQty) || disassembleQty <= 0) return '分解数量不合法';
    if (disassembleQty > maxQty) return '分解数量超过当前持有数量';
    return '';
  }, [disassembleQty, item, maxQty]);

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (submitting) return;
        onClose();
      }}
      footer={null}
      title="分解物品"
      centered
      destroyOnHidden
      maskClosable={!submitting}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name ?? '未选择'}</div>
          {item?.quality ? <Tag>{qualityLabelText[item.quality]}</Tag> : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>分解数量</div>
          <InputNumber
            min={1}
            max={maxQty}
            value={disassembleQty}
            disabled={!item || submitting}
            onChange={(value) => {
              const next = Number(value);
              if (!Number.isFinite(next)) return;
              const safe = Math.max(1, Math.min(maxQty, Math.floor(next)));
              setDisassembleQty(safe);
            }}
            style={{ width: 120 }}
          />
        </div>
        <div>分解后获得：{rewardPreview || '-'}</div>
        {disabledReason ? <div style={{ color: 'rgba(255,255,255,0.6)' }}>{disabledReason}</div> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button
            disabled={submitting}
            onClick={() => {
              if (submitting) return;
              onClose();
            }}
          >
            取消
          </Button>
          <Button
            type="primary"
            danger
            loading={submitting}
            disabled={!!disabledReason}
            onClick={async () => {
              if (!item) return;
              if (disabledReason) return;

              setSubmitting(true);
              try {
                const res = await disassembleInventoryEquipment({ itemId: item.id, qty: disassembleQty });
                if (!res.success) throw new Error(res.message || '分解失败');
                message.success(res.message || '分解成功');
                await onSuccess();
                onClose();
              } catch (error: unknown) {
                message.error(getUnifiedApiErrorMessage(error, '分解失败'));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            确认分解
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DisassembleModal;
