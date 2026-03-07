import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnhanceCostPlan,
  buildEquipmentDisplayBaseAttrs,
  ENHANCE_FIXED_RATE_START_LEVEL,
  getEnhanceFailMode,
  getEnhanceSuccessRatePercent,
} from '../equipmentGrowthRules.js';

test('强化超过 +15 后成功率应固定为 +15 档位', () => {
  const baseRate = getEnhanceSuccessRatePercent(ENHANCE_FIXED_RATE_START_LEVEL);
  const nextRate = getEnhanceSuccessRatePercent(ENHANCE_FIXED_RATE_START_LEVEL + 1);
  const highRate = getEnhanceSuccessRatePercent(99);

  assert.equal(baseRate, 0.15);
  assert.equal(nextRate, baseRate);
  assert.equal(highRate, baseRate);
});

test('强化成本应随目标等级继续增长而不是卡在 +15', () => {
  const plan = buildEnhanceCostPlan(20, 2);

  assert.equal(plan.materialItemDefId, 'enhance-002');
  assert.equal(plan.materialQty, 40);
  assert.equal(plan.silverCost, 5000);
  assert.equal(plan.spiritStoneCost, 1000);
});

test('装备基础属性预览在 +15 后仍应继续按强化等级增长', () => {
  const attrs = buildEquipmentDisplayBaseAttrs({
    baseAttrsRaw: { qixue: 100 },
    defQualityRankRaw: 1,
    resolvedQualityRankRaw: 1,
    strengthenLevelRaw: 20,
    refineLevelRaw: 0,
    socketedGemsRaw: [],
  });

  assert.equal(attrs.qixue, 160);
});

test('强化失败模式应为碎装', () => {
  assert.equal(getEnhanceFailMode(), 'destroy');
});
