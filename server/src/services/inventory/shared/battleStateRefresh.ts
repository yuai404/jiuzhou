/**
 * 装备战斗状态刷新入口
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中处理装备相关写入成功后的角色计算缓存失效与在线战斗角色快照刷新。
 * 2. 做什么：复用 `invalidateCharacterComputedCache` 已包含的排行榜快照与战斗 loadout 刷新，避免各装备入口重复拼装刷新链路。
 * 3. 不做什么：不负责装备校验、不做数据库写入、不直接读取或返回角色面板数据。
 *
 * 输入/输出：
 * - 输入：`characterId`。
 * - 输出：`Promise<void>`；副作用是更新角色计算缓存、战斗 loadout 与在线战斗角色快照。
 *
 * 数据流/状态流：
 * 装备写库成功 -> 本入口 -> `invalidateCharacterComputedCache` 失效静态属性缓存并刷新战斗 loadout
 * -> `scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId` 在事务提交后重建整份在线战斗快照。
 *
 * 关键边界条件与坑点：
 * 1. 必须先执行 `invalidateCharacterComputedCache`，再调度在线战斗角色快照刷新；否则快照重建可能读到旧的 computed/loadout。
 * 2. 这里只能用于真实影响战斗表现的装备写链路；纯查询或不影响战斗投影的背包操作不应调用，避免无意义重建。
 */
import { invalidateCharacterComputedCache } from "../../characterComputedService.js";
import { scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId } from "../../onlineBattleProjectionService.js";

export const refreshCharacterBattleStateAfterEquipmentChange = async (
  characterId: number,
): Promise<void> => {
  await invalidateCharacterComputedCache(characterId);
  await scheduleOnlineBattleCharacterSnapshotRefreshByCharacterId(characterId);
};
