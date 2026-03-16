import { useState } from 'react';
import { Modal, Form, Input, Radio, Button, App } from 'antd';
import { UserOutlined, ManOutlined, WomanOutlined } from '@ant-design/icons';
import { createCharacter as apiCreateCharacter } from '../../services/api';
import { buildCharacterNameFormRules } from '../../pages/Game/shared/characterNameShared';
import './index.scss';

interface CreateCharacterProps {
  open: boolean;
  onSuccess: (character: { name: string; gender: 'male' | 'female' }) => void;
}

const CreateCharacter: React.FC<CreateCharacterProps> = ({ open, onSuccess }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values: { name: string; gender: 'male' | 'female' }) => {
    setLoading(true);
    try {
      const result = await apiCreateCharacter(values.name, values.gender);
      if (!result.success) return;
      message.success('角色创建成功');
      onSuccess(values);
    } catch {
      void 0;
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={null}
      footer={null}
      closable={false}
      centered
      width={400}
      className="create-character-modal"
      maskClosable={false}
    >
      <div className="modal-header">
        <h2>开辟道途</h2>
        <p>为你的修仙之旅起一个名字</p>
      </div>

      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        initialValues={{ gender: 'male' }}
      >
        <Form.Item
          name="name"
          label="道号"
          rules={buildCharacterNameFormRules()}
        >
          <Input
            prefix={<UserOutlined />}
            placeholder="请输入你的道号"
            size="large"
          />
        </Form.Item>

        <Form.Item name="gender" label="性别">
          <Radio.Group className="gender-select">
            <Radio.Button value="male">
              <ManOutlined /> 男
            </Radio.Button>
            <Radio.Button value="female">
              <WomanOutlined /> 女
            </Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={loading}
          >
            踏入仙途
          </Button>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CreateCharacter;
