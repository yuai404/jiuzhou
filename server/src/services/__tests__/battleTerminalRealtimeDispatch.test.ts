/**
 * 战斗终态实时消息分发回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“战斗结束时不再先发一帧 `battle_state(phase=finished)`，而是直接走结算路径”的公共规则。
 * 2. 做什么：覆盖普通进行中状态仍会继续发 `battle_state`，避免本次修复把正常增量推送也一起关掉。
 * 3. 不做什么：不验证具体奖励内容，也不覆盖前端自动推进逻辑；这里只看服务端实时分发口径。
 *
 * 输入/输出：
 * - 输入：进行中 / 已结束两种 BattleEngine 状态，以及 mocked 的 settlement / socket 侧效应。
 * - 输出：进行中分支应广播 `battle_state`；终态分支应直接触发结算而不是广播 `battle_state`。
 *
 * 数据流/状态流：
 * BattleEngine 最新 state -> emitBattleProgressUpdate
 * -> 进行中时 emit battle:update(battle_state)
 * -> 终态时 finishBattle -> 后续由结算路径统一发 battle_finished。
 *
 * 关键边界条件与坑点：
 * 1. 终态如果先广播 `battle_state`，前端会先进入缺少冷却/session 的半成品结束态，正是本次要锁死的回归点。
 * 2. 进行中分支仍必须保留 `battle_state`，否则普通战斗过程中的回合、日志和血量同步会被误伤。
 */

import assert from "node:assert/strict";
import test from "node:test";

import { BattleEngine } from "../../battle/battleEngine.js";
import * as gameServerModule from "../../game/gameServer.js";
import * as settlementModule from "../battle/settlement.js";
import { battleParticipants } from "../battle/runtime/state.js";
import { emitBattleProgressUpdate } from "../battle/runtime/ticker.js";
import { createState, createUnit } from "./battleTestUtils.js";

test("emitBattleProgressUpdate: 进行中状态应继续广播 battle_state", async (t) => {
  const battleId = "battle-progress-update-running";
  const emitted: Array<{ userId: number; event: string; kind?: string }> = [];
  const engine = new BattleEngine(createState({
    attacker: [createUnit({ id: "player-1", name: "主角" })],
    defender: [createUnit({ id: "monster-1", name: "妖兽", type: "monster" })],
  }));

  battleParticipants.set(battleId, [1]);
  t.after(() => {
    battleParticipants.delete(battleId);
  });

  t.mock.method(gameServerModule, "getGameServer", () => ({
    emitToUser: (userId: number, event: string, payload: { kind?: string }) => {
      emitted.push({ userId, event, kind: payload.kind });
    },
  }) as never);

  await emitBattleProgressUpdate(battleId, engine);

  assert.deepEqual(emitted, [
    { userId: 1, event: "battle:update", kind: "battle_state" },
  ]);
});

test("emitBattleProgressUpdate: 终态应直接走结算，不再额外广播 battle_state", async (t) => {
  const battleId = "battle-progress-update-finished";
  const emitted: Array<{ userId: number; event: string; kind?: string }> = [];
  const finishCalls: string[] = [];
  const monsterLookups: string[] = [];
  const finishedState = {
    ...createState({
      attacker: [createUnit({ id: "player-1", name: "主角" })],
      defender: [createUnit({ id: "monster-1", name: "妖兽", type: "monster" })],
    }),
    battleId,
    phase: "finished" as const,
    result: "attacker_win" as const,
  };
  const engine = new BattleEngine(finishedState);

  battleParticipants.set(battleId, [1]);
  t.after(() => {
    battleParticipants.delete(battleId);
  });

  t.mock.method(gameServerModule, "getGameServer", () => ({
    emitToUser: (userId: number, event: string, payload: { kind?: string }) => {
      emitted.push({ userId, event, kind: payload.kind });
    },
  }) as never);
  t.mock.method(settlementModule, "getBattleMonsters", async () => {
    monsterLookups.push(battleId);
    return [];
  });
  t.mock.method(settlementModule, "finishBattle", async (nextBattleId: string) => {
    finishCalls.push(nextBattleId);
    return {
      success: true,
      message: "战斗胜利",
    };
  });

  await emitBattleProgressUpdate(battleId, engine);

  assert.deepEqual(monsterLookups, [battleId]);
  assert.deepEqual(finishCalls, [battleId]);
  assert.deepEqual(emitted, []);
});
