/**
 * 秘境境界准入回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定秘境参与者准入的统一规则，确保会取“基础秘境 / 当前难度”两者中更高的境界门槛。
 * - 做什么：验证参与者最多只能挑战高于自身 1 个境界的秘境，避免创建、加入、开战三个入口再次出现校验漂移。
 * - 不做什么：不触达真实数据库，不验证人数、体力、进入次数等其他门禁。
 *
 * 输入/输出：
 * - 输入：参与者列表、秘境基础最低境界、难度最低境界，以及模拟的参与者昵称/境界映射。
 * - 输出：准入校验的 success/message 结果。
 *
 * 数据流/状态流：
 * - 测试直接调用 `validateDungeonParticipantRealmAccess`；
 * - 通过 mock 固定参与者昵称与完整境界；
 * - 最后断言统一校验入口对“高 1 境界可进 / 高 2 境界拦截”的处理结果。
 *
 * 关键边界条件与坑点：
 * 1. 难度门槛高于秘境基础门槛时，必须以更高门槛为准，否则高难度秘境会被低境界角色绕过。
 * 2. 参与者标签要复用现有展示口径，避免报错文案里只剩角色 ID，影响定位具体是谁被拦截。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as participantHelpers from '../dungeon/shared/participants.js';
import { validateDungeonParticipantRealmAccess } from '../dungeon/shared/realmAccess.js';

test('validateDungeonParticipantRealmAccess: 高于自身 1 个境界的秘境应允许进入', async (t) => {
  t.mock.method(participantHelpers, 'getParticipantNicknameMap', async () => {
    return new Map([[101, '韩立']]);
  });
  t.mock.method(participantHelpers, 'getParticipantRealmMap', async () => {
    return new Map([[101, '炼精化炁·通脉期']]);
  });

  const result = await validateDungeonParticipantRealmAccess({
    participants: [{ userId: 1, characterId: 101, role: 'leader' }],
    dungeonMinRealm: '炼精化炁·养气期',
    difficultyMinRealm: '炼精化炁·凝炁期',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.requiredRealm, '炼精化炁·凝炁期');
  }
});

test('validateDungeonParticipantRealmAccess: 高于自身 2 个境界的秘境应被拦截', async (t) => {
  t.mock.method(participantHelpers, 'getParticipantNicknameMap', async () => {
    return new Map([[101, '韩立']]);
  });
  t.mock.method(participantHelpers, 'getParticipantRealmMap', async () => {
    return new Map([[101, '炼精化炁·养气期']]);
  });

  const result = await validateDungeonParticipantRealmAccess({
    participants: [{ userId: 1, characterId: 101, role: 'leader' }],
    dungeonMinRealm: '炼精化炁·养气期',
    difficultyMinRealm: '炼精化炁·凝炁期',
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(
      result.message,
      '队长【韩立】(角色ID:101)境界不足，最多只能挑战高于自身一个境界的秘境，当前目标需达到炼精化炁·凝炁期',
    );
  }
});

test('validateDungeonParticipantRealmAccess: 所有参与者在允许跨度内时允许进入秘境', async (t) => {
  t.mock.method(participantHelpers, 'getParticipantNicknameMap', async () => {
    return new Map([
      [101, '韩立'],
      [102, '南宫婉'],
    ]);
  });
  t.mock.method(participantHelpers, 'getParticipantRealmMap', async () => {
    return new Map([
      [101, '炼精化炁·通脉期'],
      [102, '炼炁化神·炼己期'],
    ]);
  });

  const result = await validateDungeonParticipantRealmAccess({
    participants: [
      { userId: 1, characterId: 101, role: 'leader' },
      { userId: 2, characterId: 102, role: 'member' },
    ],
    dungeonMinRealm: '炼精化炁·养气期',
    difficultyMinRealm: '炼精化炁·凝炁期',
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.requiredRealm, '炼精化炁·凝炁期');
  }
});
