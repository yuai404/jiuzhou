/**
 * 角色改名弹窗
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：承载“使用易名符后输入新道号”的唯一表单 UI，供桌面端和移动端背包共用。
 * 2. 做什么：复用统一道号规则，并在打开时自动带入当前角色名，减少两端重复拼表单。
 * 3. 不做什么：不直接发请求、不刷新背包，也不处理改名成功后的聊天广播。
 *
 * 输入/输出：
 * - 输入：弹窗开关、道具名、初始道号、提交中状态，以及取消/提交回调。
 * - 输出：标准 Ant Design Modal + Form。
 *
 * 数据流/状态流：
 * 外层 flow 提供当前易名符上下文与当前角色名 -> 本组件维护表单输入 -> 提交时把裁剪后的道号回传给上层。
 *
 * 关键边界条件与坑点：
 * 1. 弹窗每次打开都要重置成最新角色名，否则连续改名时会残留上一次输入。
 * 2. 表单只负责前端格式校验，不能在这里补做敏感词或重名规则。
 */
import { Button, Form, Input, Modal, Typography } from 'antd';
import { useEffect } from 'react';

import {
  buildCharacterNameFormRules,
  CHARACTER_NAME_MAX_LENGTH,
  normalizeCharacterNameInput,
} from './characterNameShared';

interface CharacterRenameModalProps {
  open: boolean;
  itemName: string;
  initialNickname: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (nickname: string) => Promise<void>;
}

interface CharacterRenameFormValues {
  nickname: string;
}

const CharacterRenameModal: React.FC<CharacterRenameModalProps> = ({
  open,
  itemName,
  initialNickname,
  submitting,
  onCancel,
  onSubmit,
}) => {
  const [form] = Form.useForm<CharacterRenameFormValues>();

  useEffect(() => {
    if (!open) {
      return;
    }
    form.setFieldsValue({
      nickname: initialNickname,
    });
  }, [form, initialNickname, open]);

  const handleFinish = async (values: CharacterRenameFormValues): Promise<void> => {
    await onSubmit(normalizeCharacterNameInput(values.nickname));
  };

  return (
    <Modal
      open={open}
      title="使用易名符"
      onCancel={submitting ? undefined : onCancel}
      footer={null}
      destroyOnHidden
      centered
      width="min(420px, calc(100vw - 24px))"
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => {
          void handleFinish(values);
        }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          消耗 1 张【{itemName}】后，立即将当前角色道号改为新的名称。
        </Typography.Paragraph>
        <Form.Item
          name="nickname"
          label="新道号"
          rules={buildCharacterNameFormRules()}
        >
          <Input
            placeholder="请输入新的道号"
            autoComplete="off"
            maxLength={CHARACTER_NAME_MAX_LENGTH}
          />
        </Form.Item>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <Button type="primary" htmlType="submit" loading={submitting}>
            确认改名
          </Button>
        </div>
      </Form>
    </Modal>
  );
};

export default CharacterRenameModal;
