import type { BattleSessionSnapshotDto } from '../../../services/api';
import type { BattleRealtimeKind } from '../../../services/battleRealtime';

/**
 * 战斗 realtime 驱动的会话归一化规则。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一收口 websocket realtime 到达后，前端应该保留哪一份 battle session 快照，避免 Game 与 BattleArea 各自决定终态 session 的保留方式。
 * 2. 做什么：明确 `battle_abandoned` 到达后必须清空当前会话，防止旧 session 被重新写回状态，影响后续新战斗流程。
 * 3. 不做什么：不负责切换视图、不发请求，也不决定是否自动推进下一场。
 *
 * 输入/输出：
 * - 输入：realtime kind 与服务端附带的 session 快照。
 * - 输出：应该写入前端状态的 session；若返回 `null` 表示必须清空会话。
 *
 * 数据流/状态流：
 * - socket battle:update -> 本模块归一化 session -> Game/BattleArea 写入 React state。
 *
 * 关键边界条件与坑点：
 * 1. `battle_abandoned` 虽然服务端会附带一份 `abandoned` session 快照，但前端不能把它继续当作“当前活跃会话”保存，否则旧异步请求会重新对上已失效 session。
 * 2. 其他 realtime 类型仍应原样透传服务端 session，避免 running / waiting_transition / completed 口径被前端擅自改写。
 */
export const normalizeBattleSessionFromRealtime = (params: {
  kind: BattleRealtimeKind;
  session?: BattleSessionSnapshotDto | null;
}): BattleSessionSnapshotDto | null => {
  if (params.kind === 'battle_abandoned') {
    return null;
  }
  return params.session ?? null;
};

/**
 * 判断 Game 父层是否应直接同步当前持有战斗的终态 session。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把“当前 battle 进入终态时，父层是否也要吃到 session 变更”收口成单一判定，避免 `Game` 在 `battle_finished` / `battle_abandoned` 分支各写一套。
 * 2. 做什么：确保普通地图战斗即使正在由 BattleArea 展示，父层仍会同步 `waiting_transition` session，从而继续按最新 `canAdvance/nextAction` 计算自动推进模式。
 * 3. 不做什么：不直接改 React state、不决定视图切换，也不处理非终态 realtime。
 *
 * 输入/输出：
 * - 输入：终态 realtime 的 kind、battleId、父层当前持有的 session battleId、当前视图模式，以及是否附带 session。
 * - 输出：是否应由父层立刻消费这条终态 session 更新。
 *
 * 数据流/状态流：
 * - socket `battle:update` 终态消息 -> 本函数 -> Game 父层同步 activeBattleSession。
 *
 * 关键边界条件与坑点：
 * 1. 只允许更新“当前持有中的同一场 battle”，避免旁路终态消息误覆盖当前 session。
 * 2. `battle_abandoned` 即使没有 session 载荷，也必须允许父层清空当前会话；`battle_finished` 则必须显式带 session 才能覆盖。
 */
export const shouldApplyTerminalRealtimeSessionToOwnedBattle = (params: {
  kind: BattleRealtimeKind;
  battleId: string;
  currentSessionBattleId: string | null | undefined;
  viewMode: 'map' | 'battle';
  hasSessionPayload: boolean;
}): boolean => {
  const currentSessionBattleId = params.currentSessionBattleId ?? null;
  if (!currentSessionBattleId) return false;
  if (params.viewMode !== 'battle') return false;
  if (params.battleId !== currentSessionBattleId) return false;
  if (params.kind === 'battle_abandoned') return true;
  if (params.kind !== 'battle_finished') return false;
  return params.hasSessionPayload;
};
