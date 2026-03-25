/**
 * 秘境开战体力同步回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：覆盖“在线战斗快照里的体力是旧值，但数据库/体力恢复链路里已经恢复完成”时，秘境开战前必须先刷新体力再校验。
 * 2. 做什么：验证秘境入口与体力服务共享同一份最新体力来源，避免前端显示有体力、开战仍按 0 拒绝。
 * 3. 不做什么：不覆盖真实开战提交、扣体力落库与发奖链路，这些由其他测试负责。
 *
 * 输入/输出：
 * - 输入：preparing 状态秘境实例、陈旧的在线战斗快照体力值、以及模拟的体力恢复同步结果。
 * - 输出：`startDungeonInstance` 成功开启，并且体力恢复入口被调用一次。
 *
 * 数据流/状态流：
 * - startDungeonInstance -> applyStaminaRecoveryByCharacterIds 刷新参与者体力
 * -> 重新读取在线战斗快照 -> 通过体力校验 -> 进入 runDungeonStartFlow。
 *
 * 关键边界条件与坑点：
 * 1. 这里刻意让首次快照体力为 0、恢复后为 15，锁定“必须先刷新再校验”的顺序。
 * 2. 测试不依赖数据库或 Redis，全部通过模块 mock 固定输入，避免把问题掩盖成集成环境波动。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { startDungeonInstance } from '../dungeon/combat.js';
import * as participantHelpers from '../dungeon/shared/participants.js';
import * as projectionService from '../onlineBattleProjectionService.js';
import * as benefitPolicy from '../dungeon/shared/benefitPolicy.js';
import * as realmAccess from '../dungeon/shared/realmAccess.js';
import * as staticConfigLoader from '../staticConfigLoader.js';
import * as configLoader from '../dungeon/shared/configLoader.js';
import * as stageData from '../dungeon/shared/stageData.js';
import * as entryCount from '../dungeon/shared/entryCount.js';
import * as startFlow from '../dungeon/shared/startFlow.js';
import * as staminaService from '../staminaService.js';
import type { CharacterComputedRow } from '../characterComputedService.js';
import type { OnlineBattleCharacterSnapshot } from '../onlineBattleProjectionService.js';
import type { CharacterBattleLoadout } from '../battle/shared/profileCache.js';
import type { StaminaRecoveryState } from '../staminaService.js';

const createSnapshotWithStamina = (
  characterId: number,
  stamina: number,
): OnlineBattleCharacterSnapshot => ({
  characterId,
  userId: 1,
  computed: {
    nickname: '青玄',
    realm: '炼精化炁',
    sub_realm: '养气期',
    stamina,
    stamina_max: 100,
    dungeon_no_stamina_cost: false,
  } as CharacterComputedRow,
  loadout: {
    setBonusEffects: [],
    skills: [],
  } as CharacterBattleLoadout,
  activePartner: null,
  teamId: null,
  isTeamLeader: true,
});

test('startDungeonInstance: 开战前应先刷新参与者体力，再按最新体力校验', async (t) => {
  const instanceId = 'dungeon-instance-stamina-sync';
  const creatorCharacterId = 1001;
  const participantCharacterIds = [creatorCharacterId];
  let staminaRecovered = false;

  t.mock.method(participantHelpers, 'getUserAndCharacter', async (userId: number) => {
    assert.equal(userId, 1);
    return {
      ok: true as const,
      userId,
      characterId: creatorCharacterId,
      realm: '炼精化炁·养气期',
      teamId: null,
      isLeader: true,
    };
  });

  t.mock.method(projectionService, 'getDungeonProjection', async (requestInstanceId: string) => {
    assert.equal(requestInstanceId, instanceId);
    return {
      instanceId,
      dungeonId: 'dungeon-qiqi-stone-mine',
      difficultyId: 'difficulty-stone-mine-normal',
      difficultyRank: 1,
      creatorCharacterId,
      teamId: null,
      status: 'preparing' as const,
      currentStage: 1,
      currentWave: 1,
      participants: [{ userId: 1, characterId: creatorCharacterId, role: 'leader' as const }],
      currentBattleId: null,
      rewardEligibleCharacterIds: [],
      startTime: null,
      endTime: null,
    };
  });

  t.mock.method(staticConfigLoader, 'getDungeonDifficultyById', (difficultyId: string) => {
    assert.equal(difficultyId, 'difficulty-stone-mine-normal');
    return {
      id: difficultyId,
      dungeon_id: 'dungeon-qiqi-stone-mine',
      name: '普通',
      min_realm: '炼精化炁·养气期',
      difficulty_rank: 1,
      monster_level_add: 0,
      monster_attr_mult: 1,
      reward_mult: 1,
      unlock_prev_difficulty: false,
      first_clear_rewards: null,
      drop_pool_id: null,
      enabled: true,
    } as ReturnType<typeof staticConfigLoader.getDungeonDifficultyById>;
  });

  t.mock.method(configLoader, 'getDungeonDefById', (dungeonId: string) => {
    assert.equal(dungeonId, 'dungeon-qiqi-stone-mine');
    return {
      id: dungeonId,
      name: '石窟矿洞',
      type: 'material',
      category: null,
      description: null,
      icon: null,
      background: null,
      min_players: 1,
      max_players: 1,
      min_realm: '炼精化炁·养气期',
      recommended_realm: '炼精化炁·养气期',
      unlock_condition: null,
      stamina_cost: 15,
      daily_limit: 0,
      weekly_limit: 0,
      time_limit_sec: 300,
      revive_limit: 0,
      tags: null,
      sort_weight: 1,
      enabled: true,
      version: 1,
    } as ReturnType<typeof configLoader.getDungeonDefById>;
  });

  t.mock.method(participantHelpers, 'getParticipantNicknameMap', async () => new Map([[creatorCharacterId, '青玄']]));
  t.mock.method(realmAccess, 'validateDungeonParticipantRealmAccess', async () => ({ success: true as const }));
  t.mock.method(benefitPolicy, 'loadDungeonBenefitPolicyMap', async () => {
    return new Map([[creatorCharacterId, { skipStaminaCost: false, rewardEligible: true }]]);
  });
  t.mock.method(staminaService, 'applyStaminaRecoveryByCharacterIds', async (characterIds: number[]) => {
    assert.deepEqual(characterIds, participantCharacterIds);
    staminaRecovered = true;
    return new Map<number, StaminaRecoveryState>();
  });
  t.mock.method(projectionService, 'getOnlineBattleCharacterSnapshotsByCharacterIds', async (characterIds: number[]) => {
    assert.deepEqual(characterIds, participantCharacterIds);
    return new Map([
      [
        creatorCharacterId,
        createSnapshotWithStamina(creatorCharacterId, staminaRecovered ? 15 : 0),
      ],
    ]);
  });
  t.mock.method(entryCount, 'touchEntryCount', async () => ({ ok: true as const }));
  t.mock.method(stageData, 'getStageAndWave', async () => ({
    ok: true as const,
    stageCount: 1,
    maxWaveIndexInStage: 1,
    wave: {
      monsters: [{ monster_def_id: 'monster-stone-golem', count: 1 }],
    },
  }));
  t.mock.method(stageData, 'buildMonsterDefIdsFromWave', () => ['monster-stone-golem']);
  t.mock.method(startFlow, 'runDungeonStartFlow', async () => ({
    success: true as const,
    data: {
      instanceId,
      status: 'running' as const,
      battleId: 'battle-dungeon-stamina-sync',
      state: { battleId: 'battle-dungeon-stamina-sync' },
    },
  }));

  const result = await startDungeonInstance(1, instanceId);

  assert.equal(staminaRecovered, true);
  assert.equal(result.success, true);
  if (!result.success) {
    assert.fail('预期秘境开战成功，但实际返回失败');
  }
  assert.equal(result.data.battleId, 'battle-dungeon-stamina-sync');
});
