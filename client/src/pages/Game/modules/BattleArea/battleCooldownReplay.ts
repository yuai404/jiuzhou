import type { BattleCooldownState } from '../../../../services/gameSocket';

/**
 * BattleArea 冷却缓存补消费工具。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一生成战斗冷却事件的稳定去重 key，并判断 BattleArea 是否应补消费 gameSocket 中缓存的最近一次冷却状态。
 * 2. 做什么：把“冷却先到、角色 ID 后到”的时序兼容收口到单一纯函数，避免订阅回调和补消费 effect 各写一套角色过滤和去重逻辑。
 * 3. 不做什么：不直接更新 React state、不拼等待文案，也不触发开战或 onNext。
 *
 * 输入/输出：
 * - 输入：最近一次缓存冷却状态、当前角色 ID、以及上一次已处理的冷却事件 key。
 * - 输出：稳定去重 key，以及当前是否应补消费该缓存状态。
 *
 * 数据流/状态流：
 * - socket 冷却事件 -> gameSocket 缓存 -> BattleArea 角色就绪后读缓存 -> 本模块判定是否需要补消费。
 *
 * 关键边界条件与坑点：
 * 1. 角色 ID 未就绪时必须返回不可消费；但角色一旦补齐，同一条缓存冷却状态应立即变为可消费。
 * 2. 同一条缓存事件可能被订阅首帧回放和补消费 effect 同时看到，必须通过稳定 key 去重，避免重复自动推进。
 */
export const buildBattleCooldownReplayKey = (
  cooldownState: BattleCooldownState | null | undefined,
): string => {
  if (!cooldownState) return '';
  return [
    cooldownState.kind,
    cooldownState.characterId,
    cooldownState.timestamp,
    cooldownState.remainingMs,
  ].join('|');
};

export const shouldReplayLatestBattleCooldown = (params: {
  cooldownState: BattleCooldownState | null;
  characterId: number | null;
  lastHandledKey: string;
}): boolean => {
  const cooldownState = params.cooldownState;
  if (!cooldownState) return false;
  if (!params.characterId) return false;
  if (cooldownState.characterId !== params.characterId) return false;
  const replayKey = buildBattleCooldownReplayKey(cooldownState);
  if (!replayKey) return false;
  return replayKey !== params.lastHandledKey;
};
