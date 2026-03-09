/**
 * 功法结构化 Buff 目录测试
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：验证 AI 生成功法共享目录已经收录 reflect_damage，并允许该类 Buff 通过结果校验。
 * 2) 不做什么：不测试外部模型调用、不覆盖完整 prompt 文本，仅锁定目录提炼与白名单校验。
 *
 * 输入/输出：
 * - 输入：静态技能种子提炼出的结构化 Buff 目录，以及一个 reflect_damage Buff 效果样例。
 * - 输出：目录包含关系断言，以及 validateTechniqueStructuredBuffEffect 的校验结果。
 *
 * 数据流/状态流：
 * - skill_def.json 中的静态技能效果 -> techniqueStructuredBuffCatalog 提炼 -> AI prompt/结果校验复用
 * - 本测试直接验证提炼产物，确保新 Buff 不会只在战斗层可用、却被 AI 白名单挡掉
 *
 * 关键边界条件与坑点：
 * 1) 目录来源必须是真实静态种子，避免只改约束文案却没有可提炼样例。
 * 2) reflect_damage 不依赖 attrKey/applyType，校验时不应误走属性 Buff 的必填分支。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { getTechniqueStructuredBuffCatalog, validateTechniqueStructuredBuffEffect } from '../shared/techniqueStructuredBuffCatalog.js';

test('结构化 Buff 目录应包含反弹伤害 Buff 样例', () => {
  const catalog = getTechniqueStructuredBuffCatalog();

  assert.equal(catalog.kindEnum.includes('reflect_damage'), true);
  assert.equal(catalog.buffKeyEnumByType.buff.includes('buff-reflect-damage'), true);
  assert.equal(catalog.exampleByTypeAndKind.buff.reflect_damage?.buffKey, 'buff-reflect-damage');
});

test('reflect_damage Buff 应通过 AI 生成功法结果校验', () => {
  const validation = validateTechniqueStructuredBuffEffect({
    type: 'buff',
    buffKind: 'reflect_damage',
    buffKey: 'buff-reflect-damage',
    value: 0.35,
  });

  assert.deepEqual(validation, { success: true });
});
