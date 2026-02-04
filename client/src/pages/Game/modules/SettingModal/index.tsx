import { App, Button, Input, Menu, Modal, Space, Switch, Typography } from 'antd';
import { useMemo, useState } from 'react';
import './index.scss';

type SettingKey = 'base' | 'battle' | 'cdk';

interface SettingModalProps {
  open: boolean;
  onClose: () => void;
}

const CDK_STORAGE_KEY = 'cdk_redeemed_v1';
const THEME_STORAGE_KEY = 'ui_theme_v1';
const THEME_EVENT_NAME = 'app:theme';

const loadThemeMode = () => {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  return raw === 'dark' ? 'dark' : 'light';
};

const loadRedeemedCdks = () => {
  const raw = localStorage.getItem(CDK_STORAGE_KEY);
  if (!raw) return new Set<string>();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((x) => typeof x === 'string'));
  } catch {
    return new Set<string>();
  }
};

const saveRedeemedCdks = (set: Set<string>) => {
  localStorage.setItem(CDK_STORAGE_KEY, JSON.stringify(Array.from(set)));
};

const SettingModal: React.FC<SettingModalProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [activeKey, setActiveKey] = useState<SettingKey>('base');
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => loadThemeMode());
  const [autoBattle, setAutoBattle] = useState(false);
  const [fastBattle, setFastBattle] = useState(false);
  const [cdk, setCdk] = useState('');

  const menuItems = useMemo(
    () => [
      { key: 'base', label: '基础设置' },
      { key: 'battle', label: '战斗设置' },
      { key: 'cdk', label: 'CDK兑换' },
    ],
    []
  );

  const redeemCdk = () => {
    const code = cdk.trim();
    if (!code) {
      message.warning('请输入CDK');
      return;
    }
    const redeemed = loadRedeemedCdks();
    if (redeemed.has(code)) {
      message.info('该CDK已兑换过');
      return;
    }
    redeemed.add(code);
    saveRedeemedCdks(redeemed);
    setCdk('');
    message.success('兑换成功');
  };

  const toggleDarkTheme = (enabled: boolean) => {
    const nextMode: 'light' | 'dark' = enabled ? 'dark' : 'light';
    setThemeMode(nextMode);
    localStorage.setItem(THEME_STORAGE_KEY, nextMode);
    window.dispatchEvent(new CustomEvent(THEME_EVENT_NAME, { detail: { mode: nextMode } }));
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} title={null} centered width={860} className="setting-modal" destroyOnHidden>
      <div className="setting-modal-body">
        <aside className="setting-left">
          <Typography.Title level={5} style={{ margin: 0, padding: '12px 12px 6px' }}>
            设置
          </Typography.Title>
          <Menu
            mode="inline"
            items={menuItems}
            selectedKeys={[activeKey]}
            onClick={(e) => setActiveKey(e.key as SettingKey)}
          />
        </aside>

        <section className="setting-right">
          {activeKey === 'base' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                基础设置
              </Typography.Title>
              <div className="setting-row">
                <Typography.Text>暗黑主题</Typography.Text>
                <Switch checked={themeMode === 'dark'} onChange={toggleDarkTheme} />
              </div>
            </Space>
          ) : null}

          {activeKey === 'battle' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                战斗设置
              </Typography.Title>
              <div className="setting-row">
                <Typography.Text>自动战斗</Typography.Text>
                <Switch checked={autoBattle} onChange={setAutoBattle} />
              </div>
              <div className="setting-row">
                <Typography.Text>快速战斗</Typography.Text>
                <Switch checked={fastBattle} onChange={setFastBattle} />
              </div>
            </Space>
          ) : null}

          {activeKey === 'cdk' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                CDK兑换
              </Typography.Title>
              <Space.Compact style={{ width: '100%' }}>
                <Input value={cdk} onChange={(e) => setCdk(e.target.value)} placeholder="请输入CDK" />
                <Button type="primary" onClick={redeemCdk}>
                  兑换
                </Button>
              </Space.Compact>
            </Space>
          ) : null}
        </section>
      </div>
    </Modal>
  );
};

export default SettingModal;
