/**
 * 任务总览 Socket 推送模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把任务总览的“脏通知”收敛为单一入口，避免路由、任务事件分别拼接同名 socket 事件。
 * 2. 做什么：只通知当前在线角色“任务 overview 需要重拉”，让首页角标与任务弹窗继续复用现有 HTTP 快照接口，减少无关 `game:character` 刷新。
 * 3. 不做什么：不直接读取任务列表、不改任务状态，也不替代 `/task/overview` 的首屏快照职责。
 *
 * 输入/输出：
 * - 输入：`characterId` 与受影响的总览范围 `scopes`。
 * - 输出：无返回值；副作用是向对应在线角色发送 `task:update`。
 *
 * 数据流/状态流：
 * 任务写操作成功 -> 本模块去重并组装 scope payload -> `gameServer.emitToCharacter` -> 前端按 scope 决定刷新哪些 overview。
 *
 * 关键边界条件与坑点：
 * 1. 这里只发“需要刷新”的通知，不承诺 payload 自带最终快照；前端必须继续回源 overview 接口，避免多处各自维护任务聚合逻辑。
 * 2. 推送面向当前在线角色；离线或账号切角后允许直接跳过，不能让 socket 成功与否反向影响已经提交成功的任务写操作。
 */
import { getGameServer } from '../game/gameServer.js';

export type TaskOverviewScope = 'task';

export interface TaskOverviewUpdatePayload {
  characterId: number;
  scopes: TaskOverviewScope[];
}

const normalizeTaskOverviewScopes = (
  scopes: readonly TaskOverviewScope[],
): TaskOverviewScope[] => {
  const deduped = new Set<TaskOverviewScope>();
  for (const scope of scopes) {
    if (scope === 'task') {
      deduped.add(scope);
    }
  }
  return Array.from(deduped);
};

export const notifyTaskOverviewUpdate = async (
  characterId: number,
  scopes: readonly TaskOverviewScope[],
): Promise<void> => {
  try {
    const resolvedCharacterId = Math.trunc(Number(characterId));
    if (!Number.isFinite(resolvedCharacterId) || resolvedCharacterId <= 0) return;

    const normalizedScopes = normalizeTaskOverviewScopes(scopes);
    if (normalizedScopes.length <= 0) return;

    const payload: TaskOverviewUpdatePayload = {
      characterId: resolvedCharacterId,
      scopes: normalizedScopes,
    };
    getGameServer().emitToCharacter(resolvedCharacterId, 'task:update', payload);
  } catch (error) {
    console.error(`[task:update] 推送失败: characterId=${characterId}`, error);
  }
};
