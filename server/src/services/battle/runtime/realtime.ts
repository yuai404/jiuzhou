/**
 * 战斗实时推送公共拼装。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把服务端 BattleState 转成客户端可消费的实时载荷，统一去除 `state.logs`，并把日志独立输出。
 * 2. 做什么：收敛 battle_started / battle_state / battle_finished 三类消息的全量快照结构，减少多处重复拼字段导致的口径漂移。
 * 3. 不做什么：不负责 battle engine 产生日志，也不做 socket 发送。
 *
 * 输入/输出：
 * - 输入：BattleState，以及可选的日志增量/游标、rewards/session/result/cooldown 元数据。
 * - 输出：适合直接推送给前端的实时战斗 payload。
 *
 * 数据流/状态流：
 * - battle engine state -> 本模块剥离 logs -> ticker / 结算 / 重连同步调用 -> socket `battle:update`。
 *
 * 关键边界条件与坑点：
 * 1. 服务端已不再保留全量历史日志，这里只接受显式传入的增量日志或日志游标，禁止偷偷回读 `state.logs`。
 * 2. 重连快照与结算终态都可能只携带日志游标、不带历史正文；调用方必须自己决定当前场景该发哪一种。
 */

import type { BattleLogEntry, BattleState } from "../../../battle/types.js";
import type { BattleResult } from "../battleTypes.js";
import { stripStaticFieldsFromState } from "./state.js";

type BattleRealtimeKind = "battle_started" | "battle_state" | "battle_finished";

type BattleRealtimeExtras = {
  session?: object | null;
  rewards?: object | null;
  result?: string;
  success?: boolean;
  message?: string;
  authoritative?: boolean;
  battleStartCooldownMs?: number;
  retryAfterMs?: number;
  nextBattleAvailableAt?: number;
  logStart?: number;
  logDelta?: boolean;
  unitsDelta?: boolean;
};

type BattleLogRealtimeSnapshot = {
  logs: BattleLogEntry[];
  logStart: number;
  logDelta: boolean;
};

const stripLogsFromStateRecord = (
  stateRecord: Record<string, unknown>,
): Record<string, unknown> => {
  const { logs: _logs, ...rest } = stateRecord;
  return rest;
};

export const buildBattleSnapshotState = (
  state: BattleState,
): Record<string, unknown> => {
  return stripLogsFromStateRecord(state as unknown as Record<string, unknown>);
};

export const buildBattleDeltaState = (
  state: BattleState,
): Record<string, unknown> => {
  return stripLogsFromStateRecord(stripStaticFieldsFromState(state));
};

export const buildBattleRealtimePayload = (params: {
  kind: BattleRealtimeKind;
  battleId: string;
  state: object;
  logs: BattleLogEntry[];
  extras?: BattleRealtimeExtras;
}): Record<string, unknown> => {
  return {
    kind: params.kind,
    battleId: params.battleId,
    state: params.state,
    logs: params.logs,
    ...(params.extras ?? {}),
  };
};

export const buildBattleAbandonedRealtimePayload = (params: {
  battleId: string;
  session?: object | null;
  success?: boolean;
  message?: string;
  authoritative?: boolean;
  battleStartCooldownMs?: number;
  retryAfterMs?: number;
  nextBattleAvailableAt?: number;
}): Record<string, unknown> => {
  return {
    kind: "battle_abandoned",
    battleId: params.battleId,
    ...(params.session ? { session: params.session } : {}),
    ...(typeof params.success === "boolean" ? { success: params.success } : {}),
    ...(typeof params.message === "string" ? { message: params.message } : {}),
    ...(typeof params.authoritative === "boolean"
      ? { authoritative: params.authoritative }
      : {}),
    ...(typeof params.battleStartCooldownMs === "number"
      ? { battleStartCooldownMs: params.battleStartCooldownMs }
      : {}),
    ...(typeof params.retryAfterMs === "number"
      ? { retryAfterMs: params.retryAfterMs }
      : {}),
    ...(typeof params.nextBattleAvailableAt === "number"
      ? { nextBattleAvailableAt: params.nextBattleAvailableAt }
      : {}),
  };
};

export const buildBattleLogDeltaSnapshot = (params: {
  logs: BattleLogEntry[];
  logStart: number;
  logDelta?: boolean;
}): BattleLogRealtimeSnapshot => ({
  logs: params.logs,
  logStart: params.logStart,
  logDelta: params.logDelta ?? true,
});

export const buildBattleLogCursorSnapshot = (
  logCursorRaw: number,
): BattleLogRealtimeSnapshot => {
  if (!Number.isFinite(logCursorRaw) || logCursorRaw < 0) {
    throw new Error("battle realtime 缺少有效日志游标");
  }
  const logCursor = Math.floor(logCursorRaw);
  return {
    logs: [],
    logStart: logCursor,
    logDelta: true,
  };
};

const pickBattleResultState = (
  battleResult: BattleResult,
): BattleState | null => {
  const state = battleResult.data?.state as BattleState | undefined;
  return state ?? null;
};

const pickBattleResultNumber = (
  battleResult: BattleResult,
  key: "battleStartCooldownMs" | "retryAfterMs" | "nextBattleAvailableAt",
): number | undefined => {
  const value = battleResult.data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const pickBattleResultString = (
  battleResult: BattleResult,
  key: "result",
): string | undefined => {
  const value = battleResult.data?.[key];
  return typeof value === "string" ? value : undefined;
};

const pickBattleResultLogCursor = (
  battleResult: BattleResult,
): number => {
  const value = battleResult.data?.logCursor;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("battle result 缺少日志游标");
  }
  return Math.floor(value);
};

/**
 * 把 BattleResult 统一转成 `battle_finished` realtime payload。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：给结算即时推送与“结算后重连补发”复用同一份 finished 消息拼装逻辑，避免两处各自挑字段导致终态口径漂移。
 * 2. 做什么：继续保持客户端只吃顶层 `state + logs/logStart/logDelta`，不让 battle state 再耦合历史日志。
 * 3. 不做什么：不判定 battle 是否应该推送，也不负责读取 battle/session 存储。
 *
 * 输入/输出：
 * - 输入：battleId、统一 BattleResult、以及可选的 session 快照与终态日志增量。
 * - 输出：可直接用于 socket `battle:update` 的 `battle_finished` payload；若 BattleResult 缺少 state，则返回 null。
 *
 * 数据流/状态流：
 * - settle/query 返回 BattleResult -> 本函数提取终态 state/日志游标/rewards -> 结算推送 / 重连补发统一复用。
 *
 * 关键边界条件与坑点：
 * 1. 刚结束战斗的缓存只保证 BattleResult 完整，不保证还保留活跃 engine，因此终态补发必须允许“只有日志游标，没有日志正文”。
 * 2. 实时结算推送与重连补发都走本函数，但前者会显式传入最后一段增量日志，后者只应发送游标快照。
 */
export const buildBattleFinishedRealtimePayload = (params: {
  battleId: string;
  battleResult: BattleResult;
  session?: object | null;
  logs?: BattleLogEntry[];
  logStart?: number;
  logDelta?: boolean;
}): Record<string, unknown> | null => {
  const state = pickBattleResultState(params.battleResult);
  if (!state) return null;
  const logSnapshot =
    Array.isArray(params.logs) && typeof params.logStart === "number"
      ? buildBattleLogDeltaSnapshot({
          logs: params.logs,
          logStart: params.logStart,
          logDelta: params.logDelta,
        })
      : buildBattleLogCursorSnapshot(pickBattleResultLogCursor(params.battleResult));

  return buildBattleRealtimePayload({
    kind: "battle_finished",
    battleId: params.battleId,
    state: buildBattleSnapshotState(state),
    logs: logSnapshot.logs,
    extras: {
      ...(params.session ? { session: params.session } : {}),
      rewards: (params.battleResult.data?.rewards as object | null | undefined) ?? null,
      result: pickBattleResultString(params.battleResult, "result"),
      success: params.battleResult.success,
      message: params.battleResult.message,
      logStart: logSnapshot.logStart,
      logDelta: logSnapshot.logDelta,
      battleStartCooldownMs: pickBattleResultNumber(
        params.battleResult,
        "battleStartCooldownMs",
      ),
      retryAfterMs: pickBattleResultNumber(params.battleResult, "retryAfterMs"),
      nextBattleAvailableAt: pickBattleResultNumber(
        params.battleResult,
        "nextBattleAvailableAt",
      ),
    },
  });
};
