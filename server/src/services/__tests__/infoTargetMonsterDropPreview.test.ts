/**
 * 怪物信息面板掉落预览回归测试
 *
 * 作用：
 * 1. 验证怪物详情面板里的掉落概率使用正确的百分比展示口径。
 * 2. 锁定全局公共池的境界追加概率，避免 `20%` 被错误裁剪成 `2%`。
 *
 * 不做什么：
 * 1. 不验证真实战斗掉落实例。
 * 2. 不覆盖 NPC / 玩家 / 物品信息面板。
 *
 * 输入/输出：
 * - 输入：毒瘴蛊虫的怪物 ID。
 * - 输出：怪物详情中的掉落预览列表。
 *
 * 数据流/状态流：
 * - 测试直接调用 infoTargetService；
 * - infoTargetService 会复用 dropPoolResolver 与 dropRateMultiplier；
 * - 因此该测试同时约束掉落合并、境界加成与百分比展示三段链路。
 *
 * 关键边界条件与坑点：
 * 1. `20%`、`60%` 这类整数百分比不能在裁剪尾零时误删整数位上的 `0`。
 * 2. 世界地图怪物预览必须吃到通用池的境界追加概率，不能退回基础概率。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { getInfoTargetDetail } from '../infoTargetService.js';

test('毒瘴蛊虫掉落预览应展示灵石袋 20%', async () => {
  const target = await getInfoTargetDetail('monster', 'monster-duzhang-guchong');

  assert.ok(target);
  assert.equal(target.type, 'monster');

  const drops = target.drops ?? [];
  const spiritStoneBag = drops.find((entry) => entry.name === '灵石袋');
  const ghostBoneShard = drops.find((entry) => entry.name === '幽冥骨片×1-2');

  assert.ok(spiritStoneBag);
  assert.equal(spiritStoneBag.chance, '20%');

  assert.ok(ghostBoneShard);
  assert.equal(ghostBoneShard.chance, '60%');
});
