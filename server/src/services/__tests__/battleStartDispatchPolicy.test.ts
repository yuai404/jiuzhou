/**
 * 战斗启动推送派发策略回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“秒怪/瞬结算后，晚到的注册回调不能再补发 `battle_started`”这条规则。
 * 2. 做什么：验证 start 阶段已经 finished 的战斗仍会继续走结算 ticker，而不是整场静默卡住。
 * 3. 不做什么：不覆盖 socket 发送与 ticker 定时器本身，只验证策略分支选择。
 *
 * 输入/输出：
 * - 输入：注册时的 BattleEngine，以及回调触发瞬间 activeBattles 中仍存在的 engine。
 * - 输出：派发策略枚举。
 *
 * 数据流/状态流：
 * 测试用例 -> resolveBattleStartedDispatchPolicy
 * -> registerStartedBattle 决定发 `battle_started` / 仅启动 ticker / 跳过。
 *
 * 关键边界条件与坑点：
 * 1. activeBattles 中的 engine 不是同一个实例时，说明旧战斗已经被清理或被新实例替换，必须跳过旧回调。
 * 2. finished 态不能再发 started，但也不能直接 skip，否则“开战即结束”的战斗无法进入统一结算链路。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BattleEngine } from '../../battle/battleEngine.js';
import { resolveBattleStartedDispatchPolicy } from '../battle/runtime/startDispatchPolicy.js';
import { createState, createUnit } from './battleTestUtils.js';

const createEngine = (): BattleEngine => {
  return new BattleEngine(createState({
    attacker: [createUnit({ id: 'player-1', name: '主角' })],
    defender: [createUnit({ id: 'monster-1', name: '妖兽', type: 'monster' })],
  }));
};

test('战斗仍活跃且未结束时，应发 battle_started 并启动 ticker', () => {
  const engine = createEngine();

  assert.equal(resolveBattleStartedDispatchPolicy({
    registeredEngine: engine,
    activeEngine: engine,
  }), 'emit_and_start');
});

test('注册回调到达时 battle 已被清理，应跳过旧的 battle_started', () => {
  const registeredEngine = createEngine();
  const activeEngine = createEngine();

  assert.equal(resolveBattleStartedDispatchPolicy({
    registeredEngine,
    activeEngine,
  }), 'skip');
});

test('开战阶段已直接 finished 时，只启动 ticker 走结算，不再补发 started', () => {
  const state = createState({
    attacker: [createUnit({ id: 'player-1', name: '主角' })],
    defender: [createUnit({ id: 'monster-1', name: '妖兽', type: 'monster' })],
  });
  state.phase = 'finished';
  state.result = 'attacker_win';
  const engine = new BattleEngine(state);

  assert.equal(resolveBattleStartedDispatchPolicy({
    registeredEngine: engine,
    activeEngine: engine,
  }), 'start_only');
});
