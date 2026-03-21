/**
 * 千层塔活跃会话判定工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中挑选某个用户最新的一条活跃 tower session，避免 overview/start 各自维护一份筛选条件。
 * 2. 做什么：集中判断一条 tower session 是否还能被前端继续接管，收口“battleId 存在且 battle state 仍可读取”这条业务规则。
 * 3. 不做什么：不读取数据库、不查询 battle runtime，也不负责删除失效 session。
 *
 * 输入/输出：
 * - 输入：BattleSessionRecord 列表、userId，以及已解析出的 battle state 是否存在。
 * - 输出：最新活跃 tower session，或“该 session 是否仍可复用”的布尔结果。
 *
 * 数据流/状态流：
 * - tower service -> 选出最新活跃 tower session -> 查询 battle state -> 判断是否可复用/是否应对外暴露。
 *
 * 关键边界条件与坑点：
 * 1. `waiting_transition` 仍属于可接管的活跃会话，但只有 battle state 仍存在时才能继续使用；否则会把前端带进一条失效 battleId。
 * 2. `currentBattleId` 为空的 tower session 必须直接视为不可复用，否则开始挑战时会误以为仍有进行中的塔战。
 */

import type { BattleState } from '../../battle/types.js';
import type { BattleSessionRecord } from '../battleSession/types.js';

export const pickLatestActiveTowerSession = (
  sessions: BattleSessionRecord[],
  userId: number,
): BattleSessionRecord | null => {
  return sessions
    .filter((session) => session.ownerUserId === userId && session.type === 'tower')
    .filter((session) => session.status === 'running' || session.status === 'waiting_transition')
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
};

export const canReuseTowerSession = (
  session: BattleSessionRecord,
  battleState: BattleState | null,
): battleState is BattleState => {
  return session.currentBattleId !== null && battleState !== null;
};
