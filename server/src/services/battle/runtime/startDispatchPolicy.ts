/**
 * 战斗启动实时推送派发策略
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一判定“异步注册回调触发时，这场战斗还应不应该发送 `battle_started`”，避免 `state.ts` 内联重复分支。
 * 2. 做什么：把“正常开战 / 开战即结束待结算 / 战斗已被清理”三种状态收口成单一枚举，供启动注册与测试复用。
 * 3. 不做什么：不直接发送 socket，不启动 ticker，也不读取全局 Map。
 *
 * 输入/输出：
 * - 输入：注册时持有的 engine，以及回调执行瞬间 activeBattles 中仍挂着的 engine。
 * - 输出：`emit_and_start` / `start_only` / `skip`，由调用方决定是否发 `battle_started` 与是否启动 ticker。
 *
 * 数据流/状态流：
 * registerStartedBattle -> 动态 import ticker 回调 -> 本模块判定派发策略
 * -> state.ts 按策略发 `battle_started` / 仅启动 ticker / 直接跳过。
 *
 * 关键边界条件与坑点：
 * 1. 如果 battle 已被结算链路移出 activeBattles，旧回调必须直接跳过，否则“秒怪后晚到的 battle_started”会覆盖正确终态。
 * 2. 如果 battle 在 start 阶段就已经 finished（例如首帧被动/回合开始效果直接分胜负），仍需启动 ticker 去走统一结算，但不能再补发 `battle_started`。
 */

import type { BattleEngine } from '../../../battle/battleEngine.js';

export type BattleStartedDispatchPolicy =
  | 'emit_and_start'
  | 'start_only'
  | 'skip';

export const resolveBattleStartedDispatchPolicy = (params: {
  registeredEngine: BattleEngine;
  activeEngine: BattleEngine | undefined;
}): BattleStartedDispatchPolicy => {
  if (params.activeEngine !== params.registeredEngine) {
    return 'skip';
  }

  if (params.registeredEngine.getState().phase === 'finished') {
    return 'start_only';
  }

  return 'emit_and_start';
};
