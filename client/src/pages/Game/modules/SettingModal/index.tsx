import { App, Button, Input, Menu, Modal, Select, Space, Switch, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { getCharacterInfo, updateCharacterAutoDisassemble, type AutoDisassembleRulesDto } from '../../../../services/api';
import { emitThemeModeChange, getStoredThemeMode, persistThemeMode, type ThemeMode } from '../../../../constants/theme';
import { useIsMobile } from '../../shared/responsive';
import './index.scss';

type SettingKey = 'base' | 'battle' | 'cdk';

interface SettingModalProps {
  open: boolean;
  onClose: () => void;
}

const CDK_STORAGE_KEY = 'cdk_redeemed_v1';

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

const clampQualityRank = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isInteger(n)) return 1;
  return Math.max(1, Math.min(4, n));
};

const parseCommaList = (raw: string, toLower: boolean = false): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of raw.split(',')) {
    const value = toLower ? token.trim().toLowerCase() : token.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};

const stringifyList = (raw: unknown): string => {
  if (!Array.isArray(raw)) return '';
  return raw
    .map((v) => String(v ?? '').trim())
    .filter((v) => v.length > 0)
    .join(', ');
};

const SettingModal: React.FC<SettingModalProps> = ({ open, onClose }) => {
  const { message } = App.useApp();
  const [activeKey, setActiveKey] = useState<SettingKey>('base');
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredThemeMode());
  const [autoBattle, setAutoBattle] = useState(false);
  const [fastBattle, setFastBattle] = useState(false);
  const [autoDisassembleEnabled, setAutoDisassembleEnabled] = useState(false);
  const [autoDisassembleMaxQualityRank, setAutoDisassembleMaxQualityRank] = useState(1);
  const [autoDisassembleCategories, setAutoDisassembleCategories] = useState<string[]>(['equipment']);
  const [autoDisassembleSubCategoriesText, setAutoDisassembleSubCategoriesText] = useState('');
  const [autoDisassembleExcludedSubCategoriesText, setAutoDisassembleExcludedSubCategoriesText] = useState('');
  const [autoDisassembleIncludeNameKeywordsText, setAutoDisassembleIncludeNameKeywordsText] = useState('');
  const [autoDisassembleExcludeNameKeywordsText, setAutoDisassembleExcludeNameKeywordsText] = useState('');
  const [autoDisassembleSaving, setAutoDisassembleSaving] = useState(false);
  const [autoDisassembleLoading, setAutoDisassembleLoading] = useState(false);
  const [cdk, setCdk] = useState('');
  const isMobile = useIsMobile();
  const autoDisassembleCategoryOptions = useMemo(
    () => [
      { label: '装备', value: 'equipment' },
      { label: '消耗品', value: 'consumable' },
      { label: '材料', value: 'material' },
      { label: '功法书', value: 'skillbook' },
      { label: '功法', value: 'skill' },
      { label: '任务道具', value: 'quest' },
      { label: '其他', value: 'other' },
    ],
    []
  );

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
    const nextMode: ThemeMode = enabled ? 'dark' : 'light';
    setThemeMode(nextMode);
    persistThemeMode(nextMode);
    emitThemeModeChange(nextMode);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAutoDisassembleLoading(true);
    void (async () => {
      try {
        const res = await getCharacterInfo();
        if (!res.success || !res.data?.character || cancelled) return;
        const character = res.data.character;
        setAutoDisassembleEnabled(Boolean(character.auto_disassemble_enabled));
        setAutoDisassembleMaxQualityRank(clampQualityRank(character.auto_disassemble_max_quality_rank));
        const rules = character.auto_disassemble_rules;
        const categoriesRaw = Array.isArray(rules?.categories) ? rules.categories : ['equipment'];
        const normalizedCategories = categoriesRaw
          .map((v) => String(v ?? '').trim().toLowerCase())
          .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx);
        setAutoDisassembleCategories(normalizedCategories.length > 0 ? normalizedCategories : ['equipment']);
        setAutoDisassembleSubCategoriesText(stringifyList(rules?.subCategories));
        setAutoDisassembleExcludedSubCategoriesText(stringifyList(rules?.excludedSubCategories));
        setAutoDisassembleIncludeNameKeywordsText(stringifyList(rules?.includeNameKeywords));
        setAutoDisassembleExcludeNameKeywordsText(stringifyList(rules?.excludeNameKeywords));
      } catch {
      } finally {
        if (!cancelled) {
          setAutoDisassembleLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const buildAutoDisassembleRulesPayload = (overrides?: {
    categories?: string[];
    subCategoriesText?: string;
    excludedSubCategoriesText?: string;
    includeNameKeywordsText?: string;
    excludeNameKeywordsText?: string;
  }): AutoDisassembleRulesDto => {
    const categories = (overrides?.categories ?? autoDisassembleCategories)
      .map((v) => String(v ?? '').trim().toLowerCase())
      .filter((v, idx, arr) => v.length > 0 && arr.indexOf(v) === idx);
    const subCategories = parseCommaList(overrides?.subCategoriesText ?? autoDisassembleSubCategoriesText, true);
    const excludedSubCategories = parseCommaList(
      overrides?.excludedSubCategoriesText ?? autoDisassembleExcludedSubCategoriesText,
      true
    );
    const includeNameKeywords = parseCommaList(
      overrides?.includeNameKeywordsText ?? autoDisassembleIncludeNameKeywordsText,
      true
    );
    const excludeNameKeywords = parseCommaList(
      overrides?.excludeNameKeywordsText ?? autoDisassembleExcludeNameKeywordsText,
      true
    );
    return {
      ...(categories.length > 0 ? { categories } : {}),
      ...(subCategories.length > 0 ? { subCategories } : {}),
      ...(excludedSubCategories.length > 0 ? { excludedSubCategories } : {}),
      ...(includeNameKeywords.length > 0 ? { includeNameKeywords } : {}),
      ...(excludeNameKeywords.length > 0 ? { excludeNameKeywords } : {}),
    };
  };

  const saveAutoDisassemble = async (
    nextEnabled: boolean,
    nextMaxQualityRank: number,
    nextRules: AutoDisassembleRulesDto,
    rollback: () => void,
  ) => {
    setAutoDisassembleSaving(true);
    try {
      const res = await updateCharacterAutoDisassemble(nextEnabled, nextMaxQualityRank, nextRules);
      if (!res.success) throw new Error(res.message || '设置保存失败');
      message.success('自动分解设置已保存');
    } catch (error) {
      rollback();
      const e = error as { message?: string };
      message.error(e.message || '设置保存失败');
    } finally {
      setAutoDisassembleSaving(false);
    }
  };

  const handleAutoDisassembleEnabledChange = (next: boolean) => {
    if (autoDisassembleLoading || autoDisassembleSaving) return;
    const prevEnabled = autoDisassembleEnabled;
    setAutoDisassembleEnabled(next);
    void saveAutoDisassemble(next, autoDisassembleMaxQualityRank, buildAutoDisassembleRulesPayload(), () =>
      setAutoDisassembleEnabled(prevEnabled)
    );
  };

  const handleAutoDisassembleQualityChange = (next: number) => {
    if (autoDisassembleLoading || autoDisassembleSaving) return;
    const clamped = clampQualityRank(next);
    const prevRank = autoDisassembleMaxQualityRank;
    setAutoDisassembleMaxQualityRank(clamped);
    void saveAutoDisassemble(autoDisassembleEnabled, clamped, buildAutoDisassembleRulesPayload(), () =>
      setAutoDisassembleMaxQualityRank(prevRank)
    );
  };

  const handleSaveAdvancedRules = () => {
    if (autoDisassembleLoading || autoDisassembleSaving) return;
    const rules = buildAutoDisassembleRulesPayload();
    void saveAutoDisassemble(autoDisassembleEnabled, autoDisassembleMaxQualityRank, rules, () => undefined);
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width="min(860px, calc(100vw - 16px))"
      className="setting-modal"
      destroyOnHidden
    >
      <div className={`setting-modal-body ${isMobile ? 'is-mobile' : ''}`}>
        <aside className="setting-left">
          <Typography.Title level={5} className="setting-left-title">
            设置
          </Typography.Title>
          <Menu
            mode={isMobile ? 'horizontal' : 'inline'}
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
              <div className="setting-row">
                <Typography.Text>自动分解物品</Typography.Text>
                <Switch
                  checked={autoDisassembleEnabled}
                  loading={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={handleAutoDisassembleEnabledChange}
                />
              </div>
              <div className="setting-row">
                <Typography.Text>自动分解最高品质</Typography.Text>
                <Select
                  style={{ minWidth: 180 }}
                  value={autoDisassembleMaxQualityRank}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  options={[
                    { label: '黄品', value: 1 },
                    { label: '玄品', value: 2 },
                    { label: '地品', value: 3 },
                    { label: '天品', value: 4 },
                  ]}
                  onChange={handleAutoDisassembleQualityChange}
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>自动分解品类</Typography.Text>
                <Select
                  mode="multiple"
                  value={autoDisassembleCategories}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  options={autoDisassembleCategoryOptions}
                  onChange={(next) => setAutoDisassembleCategories((next as string[]).map((v) => String(v || '').toLowerCase()))}
                  style={{ width: '100%' }}
                  placeholder="未选择时默认仅装备"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>包含子类（逗号分隔）</Typography.Text>
                <Input
                  value={autoDisassembleSubCategoriesText}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={(e) => setAutoDisassembleSubCategoriesText(e.target.value)}
                  placeholder="如：technique_book, gem_attack"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>排除子类（逗号分隔）</Typography.Text>
                <Input
                  value={autoDisassembleExcludedSubCategoriesText}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={(e) => setAutoDisassembleExcludedSubCategoriesText(e.target.value)}
                  placeholder="如：quest_key, event_token"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>包含名称关键词（逗号分隔）</Typography.Text>
                <Input
                  value={autoDisassembleIncludeNameKeywordsText}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={(e) => setAutoDisassembleIncludeNameKeywordsText(e.target.value)}
                  placeholder="如：丹, 剑, 残页"
                />
              </div>
              <div className="setting-row setting-row-column">
                <Typography.Text>排除名称关键词（逗号分隔）</Typography.Text>
                <Input
                  value={autoDisassembleExcludeNameKeywordsText}
                  disabled={autoDisassembleLoading || autoDisassembleSaving}
                  onChange={(e) => setAutoDisassembleExcludeNameKeywordsText(e.target.value)}
                  placeholder="如：任务, 钥匙"
                />
              </div>
              <Button
                type="primary"
                loading={autoDisassembleSaving}
                disabled={autoDisassembleLoading || autoDisassembleSaving}
                onClick={handleSaveAdvancedRules}
                style={{ alignSelf: 'flex-end' }}
              >
                保存自动分解规则
              </Button>
            </Space>
          ) : null}

          {activeKey === 'cdk' ? (
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Typography.Title level={5} style={{ margin: 0 }}>
                CDK兑换
              </Typography.Title>
              {isMobile ? (
                <Space direction="vertical" size={8} className="setting-cdk-mobile">
                  <Input value={cdk} onChange={(e) => setCdk(e.target.value)} placeholder="请输入CDK" />
                  <Button type="primary" onClick={redeemCdk} block>
                    兑换
                  </Button>
                </Space>
              ) : (
                <Space.Compact style={{ width: '100%' }}>
                  <Input value={cdk} onChange={(e) => setCdk(e.target.value)} placeholder="请输入CDK" />
                  <Button type="primary" onClick={redeemCdk}>
                    兑换
                  </Button>
                </Space.Compact>
              )}
            </Space>
          ) : null}
        </section>
      </div>
    </Modal>
  );
};

export default SettingModal;
