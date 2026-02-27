import { App, Button, Empty, InputNumber, Modal, Segmented, Select, Spin, Tag } from 'antd';
import { formatPercent } from '../../shared/formatAttr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getInventoryGemSynthesisRecipes,
  synthesizeInventoryGem,
  synthesizeInventoryGemBatch,
  type GemSynthesisRecipeDto,
  type GemType,
} from '../../../../services/api';
import { getUnifiedApiErrorMessage } from '../../../../services/api';

interface GemSynthesisModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

const gemTypeLabel: Record<GemType, string> = {
  attack: '攻击',
  defense: '防御',
  survival: '生存',
  all: '通用',
};

type SynthesisMode = 'quick' | 'single';

const clampSynthesizeTimes = (value: number, maxValue: number): number => {
  const safeMax = Math.max(1, Math.floor(maxValue || 1));
  if (!Number.isFinite(value)) return 1;
  return Math.min(safeMax, Math.max(1, Math.floor(value)));
};

interface BatchEstimate {
  /** 各等级预估产出/余量，level 升序；最后一项为目标等级产出，其余为中间余量 */
  byLevel: Array<{ level: number; count: number }>;
  /** 预估消耗银两 */
  silver: number;
  /** 预估消耗灵石 */
  spiritStones: number;
}

const EMPTY_ESTIMATE: BatchEstimate = { byLevel: [], silver: 0, spiritStones: 0 };

/**
 * 预估快捷合成的产出数量与消耗
 *
 * 逐级模拟合成链：从1级到目标等级，每一步根据持有材料、货币、成功率计算期望产出，
 * 上一步的产出会累加到下一步的可用材料中。
 *
 * 输入：该系列的配方列表、目标等级、当前钱包
 * 输出：{ output: 预估产出数, silver: 预估银两消耗, spiritStones: 预估灵石消耗 }
 *
 * 边界：
 * - 某一级配方缺失时链条中断，返回全0
 * - 货币不足时会限制合成次数
 */
const estimateBatchOutput = (
  seriesRecipes: GemSynthesisRecipeDto[],
  targetLevel: number,
  wallet: { silver: number; spiritStones: number } | null,
): BatchEstimate => {
  const zero: BatchEstimate = EMPTY_ESTIMATE;
  if (!wallet || seriesRecipes.length === 0 || targetLevel < 2) return zero;

  /* 构建 fromLevel → recipe 映射 */
  const recipeByFromLevel = new Map<number, GemSynthesisRecipeDto>();
  for (const r of seriesRecipes) {
    if (!recipeByFromLevel.has(r.fromLevel)) {
      recipeByFromLevel.set(r.fromLevel, r);
    }
  }

  let carry = 0; /* 上一步产出的宝石数 */
  let remainingSilver = wallet.silver;
  let remainingSpiritStones = wallet.spiritStones;
  let totalSilver = 0;
  let totalSpiritStones = 0;
  const byLevel: Array<{ level: number; count: number }> = [];

  for (let fromLv = 1; fromLv < targetLevel; fromLv++) {
    const recipe = recipeByFromLevel.get(fromLv);
    if (!recipe) return EMPTY_ESTIMATE; /* 链条中断 */

    const available = recipe.input.owned + carry;
    const maxByGems = recipe.input.qty > 0 ? Math.floor(available / recipe.input.qty) : 0;
    const maxBySilver = recipe.costs.silver > 0 ? Math.floor(remainingSilver / recipe.costs.silver) : maxByGems;
    const maxBySpirit = recipe.costs.spiritStones > 0 ? Math.floor(remainingSpiritStones / recipe.costs.spiritStones) : maxByGems;
    const times = Math.max(0, Math.min(maxByGems, maxBySilver, maxBySpirit));

    /* 记录该等级消耗后的余量 */
    const consumed = times * recipe.input.qty;
    const remainder = available - consumed;
    if (remainder > 0) {
      byLevel.push({ level: fromLv, count: remainder });
    }

    const silverCost = times * recipe.costs.silver;
    const spiritCost = times * recipe.costs.spiritStones;
    remainingSilver -= silverCost;
    remainingSpiritStones -= spiritCost;
    totalSilver += silverCost;
    totalSpiritStones += spiritCost;

    /* 期望产出 = 次数 × 成功率 × 每次产出数量（保守取 floor） */
    carry = Math.floor(times * recipe.successRate) * recipe.output.qty;
    if (carry <= 0) {
      return { byLevel, silver: totalSilver, spiritStones: totalSpiritStones };
    }
  }

  /* 目标等级的产出 */
  if (carry > 0) {
    byLevel.push({ level: targetLevel, count: carry });
  }

  return { byLevel, silver: totalSilver, spiritStones: totalSpiritStones };
};

/**
 * 从配方列表中提取系列选项
 * 按 seriesKey 分组，取每组最低等级配方的输出名称去掉等级后缀作为系列显示名
 *
 * 输入：当前宝石类型下的配方列表
 * 输出：[{ value: seriesKey, label: 系列显示名 }]
 */
const buildSeriesOptions = (recipes: GemSynthesisRecipeDto[]) => {
  const map = new Map<string, string>();
  for (const recipe of recipes) {
    if (!map.has(recipe.seriesKey)) {
      /* 从输出名称中去掉末尾的"·N级"得到系列名，如 "灵焰石·法攻·2级" → "灵焰石·法攻" */
      const displayName = recipe.output.name.replace(/·\d+级$/, '') || recipe.seriesKey;
      map.set(recipe.seriesKey, displayName);
    }
  }
  return [...map.entries()].map(([value, label]) => ({ value, label }));
};

const GemSynthesisModal: React.FC<GemSynthesisModalProps> = ({ open, onClose, onSuccess }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [gemType, setGemType] = useState<GemType>('attack');
  const [recipes, setRecipes] = useState<GemSynthesisRecipeDto[]>([]);
  const [wallet, setWallet] = useState<{ silver: number; spiritStones: number } | null>(null);
  const [mode, setMode] = useState<SynthesisMode>('quick');

  /* 单次合成状态 */
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [times, setTimes] = useState(1);
  const selectedRecipeIdRef = useRef('');

  /* 快捷合成状态 */
  const [batchSeriesKey, setBatchSeriesKey] = useState('');
  const [targetLevel, setTargetLevel] = useState(2);
  const targetLevelRef = useRef(2);

  useEffect(() => {
    selectedRecipeIdRef.current = selectedRecipeId;
  }, [selectedRecipeId]);

  useEffect(() => {
    targetLevelRef.current = targetLevel;
  }, [targetLevel]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getInventoryGemSynthesisRecipes();
      if (!res.success || !res.data) throw new Error(res.message || '加载宝石配方失败');
      const nextRecipes = res.data.recipes || [];
      setRecipes(nextRecipes);
      setWallet(res.data.character);

      const sameTypeRecipes = nextRecipes
        .filter((recipe) => recipe.gemType === gemType)
        .sort((a, b) => a.seriesKey.localeCompare(b.seriesKey) || a.fromLevel - b.fromLevel);

      /* 单次合成：保持选中配方 */
      const currentSelectedRecipeId = selectedRecipeIdRef.current;
      const nextSelected = sameTypeRecipes.find((recipe) => recipe.recipeId === currentSelectedRecipeId)
        ? currentSelectedRecipeId
        : sameTypeRecipes[0]?.recipeId || '';
      setSelectedRecipeId(nextSelected);
      const selected = sameTypeRecipes.find((recipe) => recipe.recipeId === nextSelected) ?? sameTypeRecipes[0] ?? null;
      setTimes(clampSynthesizeTimes(1, selected?.maxSynthesizeTimes ?? 1));

      /* 快捷合成：保持目标等级 */
      const currentTargetLevel = targetLevelRef.current;
      const allToLevels = [...new Set(sameTypeRecipes.map((r) => r.toLevel))];
      const maxLevel = allToLevels.length > 0 ? Math.max(...allToLevels) : 2;
      setTargetLevel(Math.max(2, Math.min(maxLevel, currentTargetLevel)));
    } catch (error: unknown) {
      message.error(getUnifiedApiErrorMessage(error, '加载宝石配方失败'));
      setRecipes([]);
      setWallet(null);
      setSelectedRecipeId('');
      setTimes(1);
      setTargetLevel(2);
    } finally {
      setLoading(false);
    }
  }, [gemType, message]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  /* ========== 通用派生数据 ========== */

  const filteredRecipes = useMemo(() => {
    return recipes
      .filter((recipe) => recipe.gemType === gemType)
      .sort((a, b) => a.seriesKey.localeCompare(b.seriesKey) || a.fromLevel - b.fromLevel);
  }, [gemType, recipes]);

  /* ========== 快捷合成派生数据 ========== */

  const seriesOptions = useMemo(() => buildSeriesOptions(filteredRecipes), [filteredRecipes]);

  useEffect(() => {
    if (seriesOptions.length === 0) {
      setBatchSeriesKey('');
      return;
    }
    if (!seriesOptions.some((opt) => opt.value === batchSeriesKey)) {
      setBatchSeriesKey(seriesOptions[0].value);
    }
  }, [batchSeriesKey, seriesOptions]);

  const batchTargetLevelOptions = useMemo(() => {
    if (!batchSeriesKey) return [];
    const seriesRecipes = filteredRecipes.filter((r) => r.seriesKey === batchSeriesKey);
    const levels = [...new Set(seriesRecipes.map((r) => r.toLevel))]
      .filter((lv) => lv > 1)
      .sort((a, b) => a - b);
    return levels.map((lv) => ({ value: lv, label: `${lv}级` }));
  }, [batchSeriesKey, filteredRecipes]);

  useEffect(() => {
    if (batchTargetLevelOptions.length === 0) {
      setTargetLevel(2);
      return;
    }
    if (!batchTargetLevelOptions.some((opt) => opt.value === targetLevel)) {
      setTargetLevel(batchTargetLevelOptions[0].value);
    }
  }, [targetLevel, batchTargetLevelOptions]);

  /* 预估能合成多少个目标等级宝石及消耗 */
  const batchEstimate = useMemo((): BatchEstimate => {
    if (!batchSeriesKey) return EMPTY_ESTIMATE;
    const seriesRecipes = filteredRecipes.filter((r) => r.seriesKey === batchSeriesKey);
    return estimateBatchOutput(seriesRecipes, targetLevel, wallet);
  }, [batchSeriesKey, filteredRecipes, targetLevel, wallet]);

  /* ========== 单次合成派生数据 ========== */

  const selectedRecipe = useMemo(() => {
    if (filteredRecipes.length === 0) return null;
    const found = filteredRecipes.find((recipe) => recipe.recipeId === selectedRecipeId);
    return found ?? filteredRecipes[0];
  }, [filteredRecipes, selectedRecipeId]);

  useEffect(() => {
    if (!selectedRecipe) {
      setTimes(1);
      return;
    }
    setTimes((prev) => clampSynthesizeTimes(prev, selectedRecipe.maxSynthesizeTimes));
  }, [selectedRecipe]);

  /* ========== 操作回调 ========== */

  const handleExecute = useCallback(async () => {
    if (!selectedRecipe) return;
    const executeTimes = clampSynthesizeTimes(times, selectedRecipe.maxSynthesizeTimes);
    setSubmitting(true);
    try {
      const res = await synthesizeInventoryGem({ recipeId: selectedRecipe.recipeId, times: executeTimes });
      if (!res.success || !res.data) throw new Error(res.message || '宝石合成失败');
      if (res.data.successCount > 0) {
        message.success(res.message || '宝石合成完成');
      } else {
        message.warning(res.message || '宝石合成失败');
      }
      await onSuccess();
      await refresh();
    } catch (error: unknown) {
      message.error(getUnifiedApiErrorMessage(error, '宝石合成失败'));
    } finally {
      setSubmitting(false);
    }
  }, [message, onSuccess, refresh, selectedRecipe, times]);

  /**
   * 快捷合成：使用独立的 batchSeriesKey + targetLevel
   * 不传 sourceLevel，服务端默认从1级开始逐级合成
   */
  const handleBatch = useCallback(async () => {
    if (!batchSeriesKey) return;
    setBatchSubmitting(true);
    try {
      const res = await synthesizeInventoryGemBatch({
        gemType,
        targetLevel,
        seriesKey: batchSeriesKey,
      });
      if (!res.success || !res.data) throw new Error(res.message || '快捷合成失败');
      const steps = res.data.steps ?? [];
      const successCount = steps.reduce((sum, step) => sum + (step.successCount || 0), 0);
      const failCount = steps.reduce((sum, step) => sum + (step.failCount || 0), 0);
      if (successCount > 0) {
        message.success(`${res.message || '快捷合成成功'}（成功${successCount}次，失败${failCount}次）`);
      } else {
        message.warning(`${res.message || '快捷合成失败'}（失败${failCount}次）`);
      }
      await onSuccess();
      await refresh();
    } catch (error: unknown) {
      message.error(getUnifiedApiErrorMessage(error, '快捷合成失败'));
    } finally {
      setBatchSubmitting(false);
    }
  }, [batchSeriesKey, gemType, message, onSuccess, refresh, targetLevel]);

  const canSynthesize = !!selectedRecipe && selectedRecipe.maxSynthesizeTimes > 0;
  const canBatch = !!batchSeriesKey && batchTargetLevelOptions.length > 0 && !batchSubmitting;

  return (
    <Modal
      open={open}
      onCancel={() => {
        if (submitting || batchSubmitting) return;
        onClose();
      }}
      footer={null}
      centered
      width={980}
      title="宝石合成"
      className="bag-gem-modal"
      destroyOnHidden
      maskClosable={!(submitting || batchSubmitting)}
    >
      <div className="bag-gem-shell">
        {/* 顶部：模式切换 + 宝石类型 + 钱包 */}
        <div className="bag-gem-top">
          <div className="bag-gem-top-left">
            <Segmented
              value={mode}
              options={[
                { label: '快捷合成', value: 'quick' },
                { label: '单次合成', value: 'single' },
              ]}
              onChange={(value) => setMode(value as SynthesisMode)}
            />
            <Segmented
              value={gemType}
              options={(Object.keys(gemTypeLabel) as GemType[]).map((type) => ({
                label: gemTypeLabel[type],
                value: type,
              }))}
              onChange={(value) => {
                setGemType(value as GemType);
                setSelectedRecipeId('');
                setBatchSeriesKey('');
              }}
            />
          </div>
          {wallet ? (
            <div className="bag-gem-wallet">
              <Tag color="gold">银两：{wallet.silver.toLocaleString()}</Tag>
              <Tag color="blue">灵石：{wallet.spiritStones.toLocaleString()}</Tag>
            </div>
          ) : null}
        </div>

        {/* 快捷合成模式 */}
        {mode === 'quick' ? (
          <div className="bag-gem-quick">
            {loading && recipes.length === 0 ? (
              <div className="bag-gem-loading"><Spin /></div>
            ) : seriesOptions.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用宝石配方" />
            ) : (
              <div className="bag-gem-quick-form">
                <div className="bag-gem-quick-row">
                  <Select
                    value={batchSeriesKey || undefined}
                    options={seriesOptions}
                    onChange={(value) => setBatchSeriesKey(String(value))}
                    placeholder="选择系列"
                    className="bag-gem-quick-series"
                  />
                  <Select
                    value={targetLevel}
                    options={batchTargetLevelOptions}
                    onChange={(value) => setTargetLevel(Number(value) || 2)}
                    placeholder="目标等级"
                    className="bag-gem-quick-target"
                  />
                  <Button
                    type="primary"
                    disabled={!canBatch}
                    loading={batchSubmitting}
                    onClick={() => void handleBatch()}
                  >
                    快捷合成
                  </Button>
                </div>
                {batchSeriesKey && batchTargetLevelOptions.length > 0 ? (
                  <div className="bag-gem-quick-estimate">
                    <span className="bag-gem-quick-estimate-label">预估产出</span>
                    <span className="bag-gem-quick-estimate-levels">
                      {batchEstimate.byLevel.length > 0
                        ? batchEstimate.byLevel.map((item) => (
                            <span key={item.level} className={item.level === targetLevel ? 'is-target' : 'is-remainder'}>
                              {item.level}级×{item.count}
                            </span>
                          ))
                        : <span className="is-empty">无法合成</span>}
                    </span>
                    {batchEstimate.silver > 0 ? (
                      <span>消耗银两 <strong>{batchEstimate.silver.toLocaleString()}</strong></span>
                    ) : null}
                    {batchEstimate.spiritStones > 0 ? (
                      <span>消耗灵石 <strong>{batchEstimate.spiritStones.toLocaleString()}</strong></span>
                    ) : null}
                  </div>
                ) : null}
                <div className="bag-gem-quick-hint">
                  自动使用低级宝石逐级合成到目标等级，6级以上存在失败率。
                </div>
              </div>
            )}
          </div>
        ) : (
          /* 单次合成模式：左侧配方列表 + 右侧详情 */
          <div className="bag-gem-body">
            {loading && recipes.length === 0 ? (
              <div className="bag-gem-loading"><Spin /></div>
            ) : (
              <>
                <div className="bag-gem-list">
                  {filteredRecipes.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无可用宝石配方" />
                  ) : (
                    filteredRecipes.map((recipe) => (
                      <button
                        key={recipe.recipeId}
                        type="button"
                        className={`bag-gem-item ${selectedRecipe?.recipeId === recipe.recipeId ? 'is-active' : ''}`}
                        onClick={() => setSelectedRecipeId(recipe.recipeId)}
                      >
                        <div className="bag-gem-item-title">{recipe.name}</div>
                        <div className="bag-gem-item-meta">
                          <span>{recipe.fromLevel}级 → {recipe.toLevel}级</span>
                          <span>成功率 {formatPercent(recipe.successRate)}</span>
                        </div>
                        <div className="bag-gem-item-meta">
                          <span>可合成 {recipe.maxSynthesizeTimes} 次</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="bag-gem-detail">
                  {selectedRecipe ? (
                    <div className="bag-gem-detail-content">
                      <div className="bag-gem-detail-title">{selectedRecipe.name}</div>
                      <div className="bag-gem-detail-meta">
                        <Tag color="default">类型：{gemTypeLabel[selectedRecipe.gemType]}</Tag>
                        <Tag color="blue">产出：{selectedRecipe.output.name} ×{selectedRecipe.output.qty}</Tag>
                        <Tag color={selectedRecipe.successRate >= 1 ? 'green' : 'orange'}>
                          成功率：{formatPercent(selectedRecipe.successRate)}
                        </Tag>
                      </div>

                      <div className="bag-gem-costs">
                        {selectedRecipe.input.qty > 0 ? (
                          <div className={`bag-gem-cost-line ${selectedRecipe.input.owned < selectedRecipe.input.qty ? 'is-missing' : ''}`}>
                            <span>{selectedRecipe.input.name}</span>
                            <span>{selectedRecipe.input.qty} / {selectedRecipe.input.owned}</span>
                          </div>
                        ) : null}
                        {selectedRecipe.costs.silver > 0 ? (
                          <div className={`bag-gem-cost-line ${(wallet?.silver ?? 0) < selectedRecipe.costs.silver ? 'is-missing' : ''}`}>
                            <span>银两</span>
                            <span>{selectedRecipe.costs.silver.toLocaleString()} / {(wallet?.silver ?? 0).toLocaleString()}</span>
                          </div>
                        ) : null}
                        {selectedRecipe.costs.spiritStones > 0 ? (
                          <div className={`bag-gem-cost-line ${(wallet?.spiritStones ?? 0) < selectedRecipe.costs.spiritStones ? 'is-missing' : ''}`}>
                            <span>灵石</span>
                            <span>{selectedRecipe.costs.spiritStones.toLocaleString()} / {(wallet?.spiritStones ?? 0).toLocaleString()}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="bag-gem-submit">
                        <div className="bag-gem-submit-input">
                          <span>合成次数</span>
                          <InputNumber
                            min={1}
                            max={Math.max(1, selectedRecipe.maxSynthesizeTimes)}
                            value={times}
                            onChange={(value) => setTimes(clampSynthesizeTimes(Number(value || 1), selectedRecipe.maxSynthesizeTimes))}
                          />
                          <span>最多 {selectedRecipe.maxSynthesizeTimes}</span>
                        </div>
                        <Button
                          type="primary"
                          disabled={!canSynthesize || submitting}
                          loading={submitting}
                          onClick={() => void handleExecute()}
                        >
                          {canSynthesize ? '执行合成' : '材料或货币不足'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择配方" />
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default GemSynthesisModal;
