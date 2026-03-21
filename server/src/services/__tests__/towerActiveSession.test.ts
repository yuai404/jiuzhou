/**
 * 千层塔活跃会话判定回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 tower service 只会接管“最新且 battle 仍可恢复”的活跃 tower session，避免残留 battleId 把前端带进失效战斗。
 * 2. 做什么：验证会话筛选条件集中在单一工具中，后续 overview/start 复用同一口径时不会再各写一套。
 * 3. 不做什么：不触发真实战斗、不访问数据库，也不覆盖塔进度更新逻辑。
 *
 * 输入/输出：
 * - 输入：模拟的 BattleSessionRecord 列表，以及 battle state 是否存在。
 * - 输出：最新 tower session 的筛选结果，以及 session 是否可复用的布尔值。
 *
 * 数据流/状态流：
 * - 测试用例 -> tower activeSession helper -> tower service 复用这些判定结果。
 *
 * 关键边界条件与坑点：
 * 1. 非 tower 类型或非活跃状态的 session 不能混进结果，否则会误伤普通战斗/已结束塔战。
 * 2. `currentBattleId` 为空或 battle state 已失效的 tower session 必须判为不可复用，否则前端会出现“点开始后一闪而过”。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { BattleState } from '../../battle/types.js';
import type { BattleSessionRecord } from '../battleSession/types.js';
import { canReuseTowerSession, pickLatestActiveTowerSession } from '../tower/activeSession.js';

const createTowerSessionRecord = (
  overrides: Partial<BattleSessionRecord>,
): BattleSessionRecord => {
  return {
    sessionId: 'tower-session-default',
    type: 'tower',
    ownerUserId: 1,
    participantUserIds: [1],
    currentBattleId: 'tower-battle-default',
    status: 'running',
    nextAction: 'none',
    canAdvance: false,
    lastResult: null,
    context: {
      runId: 'tower-run-default',
      floor: 1,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
};

const createBattleState = (): BattleState => {
  return {
    battleId: 'tower-battle-default',
    battleType: 'pve',
    teams: {
      attacker: {
        units: [],
        totalSpeed: 0,
      },
      defender: {
        units: [],
        totalSpeed: 0,
      },
    },
    roundCount: 1,
    currentTeam: 'attacker',
    currentUnitId: null,
    phase: 'finished',
    firstMover: 'attacker',
    randomSeed: 1,
    randomIndex: 0,
  };
};

test('pickLatestActiveTowerSession: 只返回当前用户最新的活跃 tower session', () => {
  const latest = createTowerSessionRecord({
    sessionId: 'tower-session-latest',
    updatedAt: 30,
  });
  const sessions: BattleSessionRecord[] = [
    createTowerSessionRecord({
      sessionId: 'tower-session-old',
      updatedAt: 10,
    }),
    createTowerSessionRecord({
      sessionId: 'tower-session-completed',
      status: 'completed',
      updatedAt: 50,
    }),
    createTowerSessionRecord({
      sessionId: 'pve-session-newer',
      type: 'pve',
      updatedAt: 60,
      context: {
        monsterIds: ['monster-1'],
      },
    }),
    createTowerSessionRecord({
      sessionId: 'other-user-session',
      ownerUserId: 2,
      updatedAt: 70,
    }),
    latest,
  ];

  const result = pickLatestActiveTowerSession(sessions, 1);

  assert.equal(result?.sessionId, latest.sessionId);
});

test('canReuseTowerSession: battle 仍可读取时才允许继续接管', () => {
  const session = createTowerSessionRecord({});

  assert.equal(canReuseTowerSession(session, createBattleState()), true);
  assert.equal(canReuseTowerSession(session, null), false);
});

test('canReuseTowerSession: currentBattleId 为空时必须视为失效会话', () => {
  const session = createTowerSessionRecord({
    currentBattleId: null,
  });

  assert.equal(canReuseTowerSession(session, createBattleState()), false);
});
