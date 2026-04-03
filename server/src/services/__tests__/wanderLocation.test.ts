/**
 * 云游奇遇幕次地点规划测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定云游地点规划会为整条故事返回完整的地区、地图、区域与组合展示名。
 * 2. 做什么：确保同一 `storySeed` 多次计算仍命中同一地点，避免跨幕推进时发生地点漂移。
 * 3. 不做什么：不访问数据库，不验证 AI 输出，也不覆盖剧情正文生成。
 *
 * 输入 / 输出：
 * - 输入：固定 `storySeed`。
 * - 输出：稳定地点对象与展示名断言。
 *
 * 数据流 / 状态流：
 * - service 传入 `storySeed`
 * - `resolveWanderStoryLocation` 返回固定地点
 * - 生成、结算与历史回填共用同一地点结果
 *
 * 复用设计说明：
 * 1. 测试直接命中地点规划纯函数，不经由 service 间接覆盖，能把随机地点规则锁在单一入口。
 * 2. 后续若地点池筛选规则调整，只需同步修改此测试与地点模块，不会在多处散落断言。
 *
 * 关键边界条件与坑点：
 * 1. `fullName` 必须严格由地区、地图、区域三段组成，否则 prompt 展示口径会分叉。
 * 2. 同一故事的地点结果必须稳定；如果重复调用会漂移，跨幕剧情就会出现硬切。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWanderStoryLocation } from '../wander/location.js';

test('resolveWanderStoryLocation: 同一 storySeed 应稳定映射到固定地点', () => {
  const first = resolveWanderStoryLocation({
    storySeed: 123456789,
  });
  const second = resolveWanderStoryLocation({
    storySeed: 123456789,
  });

  assert.deepEqual(second, first);
});

test('resolveWanderStoryLocation: 应返回完整的地区、地图、区域与组合地点名', () => {
  const location = resolveWanderStoryLocation({
    storySeed: 20260402,
  });

  assert.ok(location.region.length > 0);
  assert.ok(location.mapId.length > 0);
  assert.ok(location.mapName.length > 0);
  assert.ok(location.areaId.length > 0);
  assert.ok(location.areaName.length > 0);
  assert.equal(location.fullName, `${location.region}·${location.mapName}·${location.areaName}`);
});
