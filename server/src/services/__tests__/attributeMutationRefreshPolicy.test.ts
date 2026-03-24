import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * 属性加点刷新链路性能约束测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定属性加点成功后不再在 HTTP 主链路里同步等待角色静态属性重算，避免按钮 loading 被整条重算链路拖长。
 * 2. 做什么：锁定角色计算刷新改为共享后台调度入口，避免多次快速加点时重复堆叠同一角色的重算任务。
 * 3. 不做什么：不连接真实数据库，不验证 Socket 推送时序，也不覆盖角色快照的具体计算结果。
 *
 * 输入/输出：
 * - 输入：`attributeService.ts` 与 `characterComputedService.ts` 源码文本。
 * - 输出：加点链路是否使用后台刷新调度、以及是否移除了同步 `await invalidate...`。
 *
 * 数据流/状态流：
 * 读取源码 -> 断言属性服务改为调用后台调度入口 -> 断言角色计算服务存在串行去重调度状态。
 *
 * 关键边界条件与坑点：
 * 1. 这里锁的是“主链路不要同步等待重算”，不是禁止后续刷新；角色面板与排行榜快照仍需要后台补齐。
 * 2. 如果后续重命名调度函数，必须同步调整测试断言，否则会把真实优化误判成回归。
 */

test('属性加点应改为后台调度角色计算刷新，而不是同步等待重算完成', () => {
  const attributeServiceSource = readFileSync(
    new URL('../attributeService.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    attributeServiceSource,
    /scheduleCharacterComputedRefreshByCharacterId\(normalizeInteger\(row\.character_id\)\);/u,
    'attributeService 应在成功后按角色 ID 调用后台角色计算刷新调度',
  );
  assert.doesNotMatch(
    attributeServiceSource,
    /await invalidateCharacterComputedCacheByUserId\(userId\);/u,
    'attributeService 不应继续同步等待角色计算缓存失效与重算完成',
  );
});

test('角色计算刷新应有共享的串行去重调度状态，避免快速连点重复重算', () => {
  const characterComputedServiceSource = readFileSync(
    new URL('../characterComputedService.ts', import.meta.url),
    'utf8',
  );

  assert.match(characterComputedServiceSource, /characterComputedRefreshInFlight/u);
  assert.match(characterComputedServiceSource, /characterComputedRefreshQueued/u);
  assert.match(characterComputedServiceSource, /scheduleCharacterComputedRefreshByCharacterId/u);
});
