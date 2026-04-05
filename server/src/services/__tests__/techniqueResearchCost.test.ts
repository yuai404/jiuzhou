/**
 * 洞府研修残页消耗规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证洞府研修基础残页消耗与顿悟符折后消耗共用单一成本规则，避免 service 和前端各自硬编码 50%。
 * 2. 不做什么：不覆盖数据库查询、不覆盖任务创建流程，也不测试冷却豁免本身。
 *
 * 输入/输出：
 * - 输入：是否启用顿悟符。
 * - 输出：当前应使用的研修残页消耗值。
 *
 * 数据流/状态流：
 * 前端顿悟符开关 / 服务端创建任务 -> techniqueResearchCost -> 当前残页消耗。
 *
 * 关键边界条件与坑点：
 * 1. 顿悟符折扣只影响残页消耗，不能改写基础消耗常量，否则其他展示口径会失真。
 * 2. 关闭顿悟符时必须严格回到基础消耗，不能因为折扣逻辑存在就默认半价。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TECHNIQUE_RESEARCH_BASE_FRAGMENT_COST,
  TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_FRAGMENT_COST,
  resolveTechniqueResearchFragmentCost,
} from '../shared/techniqueResearchCost.js';

test('resolveTechniqueResearchFragmentCost: 未启用顿悟符时应返回基础残页消耗', () => {
  assert.equal(TECHNIQUE_RESEARCH_BASE_FRAGMENT_COST, 3_500);
  assert.equal(resolveTechniqueResearchFragmentCost(false), 3_500);
});

test('resolveTechniqueResearchFragmentCost: 启用顿悟符时应返回半价残页消耗', () => {
  assert.equal(TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_FRAGMENT_COST, 1_750);
  assert.equal(resolveTechniqueResearchFragmentCost(true), 1_750);
});
