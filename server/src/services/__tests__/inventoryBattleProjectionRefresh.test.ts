/**
 * 装备战斗投影刷新策略测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定装备相关写链路会统一刷新角色计算缓存与在线战斗角色快照，避免角色面板已更新但开战仍读取旧套装效果。
 * 2. 做什么：覆盖穿戴、卸下、强化、精炼、洗炼、镶嵌这些会影响战斗装配的入口，保证它们复用同一个刷新函数。
 * 3. 不做什么：不连接真实数据库、不执行真实事务提交，也不验证具体数值结算。
 *
 * 输入/输出：
 * - 输入：库存服务相关源码文本。
 * - 输出：源码级调用约束断言结果。
 *
 * 数据流/状态流：
 * 读取共享刷新模块与装备源码 -> 断言共享模块先失效计算缓存、再调度在线战斗快照刷新
 * -> 断言各装备写入口都复用该共享模块。
 *
 * 关键边界条件与坑点：
 * 1. 只刷新 `characterComputed` 或 `battle profile` 仍不足以修复开战读旧装备，因为在线战斗入口优先消费 `OnlineBattleCharacterSnapshot`。
 * 2. 必须锁定“统一刷新入口被复用”，否则未来新增装备写链路时仍可能再次漏刷在线战斗快照。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('inventory: 装备相关写链路应统一刷新角色计算缓存与在线战斗快照', () => {
  const refreshSource = readSource('../inventory/shared/battleStateRefresh.ts');
  const equipmentSource = readSource('../inventory/equipment.ts');
  const socketSource = readSource('../inventory/socket.ts');

  assert.match(
    refreshSource,
    /export const refreshCharacterBattleStateAfterEquipmentChange = async[\s\S]*?invalidateCharacterComputedCache\(characterId\)[\s\S]*?scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId\(characterId\)/u,
  );

  for (const functionName of [
    'equipItem',
    'unequipItem',
    'enhanceEquipment',
    'refineEquipment',
    'rerollEquipmentAffixes',
  ]) {
    assert.match(
      equipmentSource,
      new RegExp(
        `export const ${functionName} = async[\\s\\S]*?await refreshCharacterBattleStateAfterEquipmentChange\\(characterId\\)`,
        'u',
      ),
    );
  }

  assert.match(
    socketSource,
    /export const socketEquipment = async[\s\S]*?await refreshCharacterBattleStateAfterEquipmentChange\(characterId\)/u,
  );
});
