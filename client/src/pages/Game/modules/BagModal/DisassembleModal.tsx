import { App, Button, Modal, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { disassembleInventoryEquipment } from '../../../../services/api';
import { isDisassemblableBagItem, qualityLabelText } from './bagShared';
import type { BagCategory, BagQuality } from './bagShared';

type DisassembleCategory = Exclude<BagCategory, 'all'>;

export type DisassembleTarget = {
  id: number;
  name: string;
  quality: BagQuality;
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
  黄: 3,
  玄: 6,
  地: 12,
  天: 24,
};

const DisassembleModal: React.FC<DisassembleModalProps> = ({ open, item, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [submitting, setSubmitting] = useState(false);

  const rewardPreview = useMemo(() => {
    if (!item) return '';
    if (item.category === 'equipment') {
      if (item.quality === '黄' || item.quality === '玄') return '淬灵石×1';
      return '蕴灵石×1';
    }
    if (item.subCategory === 'technique_book') {
      const qty = techniqueBookRewardQtyByQuality[item.quality] || 3;
      return `功法残页×${qty}`;
    }
    return '';
  }, [item]);

  const disabledReason = useMemo(() => {
    if (!item) return '请选择可分解物品';
    if (!isDisassemblableBagItem(item)) return '该物品不可分解';
    if (item.locked) return '物品已锁定';
    if (item.location === 'equipped') return item.category === 'equipment' ? '穿戴中的装备不可分解' : '该物品当前位置不可分解';
    if (item.location !== 'bag' && item.location !== 'warehouse') return '该物品当前位置不可分解';
    return '';
  }, [item]);

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (submitting) return;
        onClose();
      }}
      footer={null}
      title={item ? (item.category === 'equipment' ? '分解装备' : '分解功法') : '分解物品'}
      centered
      destroyOnHidden
      maskClosable={!submitting}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item?.name ?? '未选择'}</div>
          {item?.quality ? <Tag>{qualityLabelText[item.quality]}</Tag> : null}
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
                const res = await disassembleInventoryEquipment(item.id);
                if (!res.success) throw new Error(res.message || '分解失败');
                message.success(res.message || '分解成功');
                await onSuccess();
                onClose();
              } catch (error: unknown) {
                const err = error as { message?: string };
                message.error(err.message || '分解失败');
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
