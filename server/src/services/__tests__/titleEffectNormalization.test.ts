/**
 * 正式称号效果归一化测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定正式称号效果的统一归一化口径，确保平面值仍按整数处理，比率值按小数比率保留。
 * 2. 做什么：覆盖云游动态称号接入正式称号体系后的关键共享逻辑，避免百分比效果被错误截断为 0 或放大为整数百分数。
 * 3. 不做什么：不覆盖称号发放流程，不访问数据库，也不校验前端展示文本。
 *
 * 输入 / 输出：
 * - 输入：原始称号效果对象。
 * - 输出：归一化后的正式称号效果对象。
 *
 * 数据流 / 状态流：
 * - 原始 title effects -> `normalizeTitleEffects` -> 断言归一化结果
 *
 * 复用设计说明：
 * - 该测试直接复用正式称号共享归一化入口，静态称号、云游动态称号与称号列表展示都会共同受这个入口影响。
 * - 一旦以后再新增带比率属性的正式称号，这个测试可以继续作为统一口径的回归护栏。
 *
 * 关键边界条件与坑点：
 * 1. 平面值仍需向下取整，不能因为支持比率而放宽为任意浮点数。
 * 2. 比率值必须保留小数比率口径，不能再被 `Math.floor` 截成 0。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTitleEffects } from '../achievement/shared.js';

test('normalizeTitleEffects: 平面值取整、比率值保留小数比率口径', () => {
  const effects = normalizeTitleEffects({
    wugong: 18.9,
    baoji: 0.03456,
    kangbao: 0.02,
    qixue: 30,
    lingqi: 20,
    invalid_key: 999,
  });

  assert.deepEqual(effects, {
    wugong: 18,
    baoji: 0.0346,
    kangbao: 0.02,
  });
});
