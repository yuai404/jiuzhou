/**
 * 秘境下一波开战流程回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“推进下一波时，只有真正开启下一场战斗成功后，才允许写入新的 stage/wave 与 currentBattleId”。
 * 2. 做什么：覆盖战斗刚结算完成但旧 battle 索引尚未摘除时，下一波开战被误判为“角色仍在战斗中”也不得提前推进副本游标的回归风险。
 * 3. 不做什么：不覆盖秘境通关发奖，也不验证前端自动推进。
 *
 * 输入/输出：
 * - 输入：running 中的秘境实例、当前波次已胜利的战斗结果、以及模拟的“旧战斗尚未清理导致下一场开启失败”返回。
 * - 输出：`nextDungeonInstance` 返回失败，且数据库层不会写入新的 stage/wave。
 *
 * 数据流/状态流：
 * - nextDungeonInstance -> 读取当前实例/当前战斗结果 -> 计算下一波 -> 尝试开战
 * -> 若开战失败则直接返回，不提交副本进度。
 *
 * 关键边界条件与坑点：
 * 1. 当前波次胜利后若旧 battle 运行时索引尚未清理，属于“可重试的开战失败”，不能把实例推进到下一波半成品状态。
 * 2. 断言不能只看返回值；必须同时验证没有执行 `current_stage/current_wave` 更新，避免隐藏的数据漂移。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import * as battleService from '../battle/index.js';
import { nextDungeonInstance } from '../dungeon/combat.js';
import * as participantHelpers from '../dungeon/shared/participants.js';
import * as stageData from '../dungeon/shared/stageData.js';

test('nextDungeonInstance: 下一波被旧战斗索引误拦截时不应提前推进副本波次', async (t) => {
  const instanceId = 'dungeon-instance-next-wave-stale-battle';
  const creatorCharacterId = 1001;
  const executedSql: string[] = [];

  t.mock.method(participantHelpers, 'getUserAndCharacter', async (userId: number) => {
    assert.equal(userId, 1);
    return {
      ok: true as const,
      userId: 1,
      characterId: creatorCharacterId,
      teamId: null,
      isLeader: true,
    };
  });

  t.mock.method(database, 'query', async (sql: string) => {
    executedSql.push(sql);
    if (sql.includes('SELECT * FROM dungeon_instance')) {
      return {
        rows: [{
          id: instanceId,
          dungeon_id: 'dungeon-test',
          difficulty_id: 'difficulty-test',
          creator_id: creatorCharacterId,
          status: 'running',
          current_stage: 1,
          current_wave: 1,
          participants: JSON.stringify([
            { userId: 1, characterId: creatorCharacterId, role: 'leader' },
          ]),
          instance_data: {
            currentBattleId: 'dungeon-battle-finished-1',
          },
        }],
      };
    }
    throw new Error(`unexpected sql: ${sql}`);
  });

  t.mock.method(battleService, 'getBattleState', async (battleId: string) => {
    assert.equal(battleId, 'dungeon-battle-finished-1');
    return {
      success: true as const,
      data: {
        result: 'attacker_win',
      },
    };
  });

  t.mock.method(stageData, 'getStageAndWave', async (_difficultyId: string, stage: number, wave: number) => {
    if (stage === 1 && wave === 1) {
      return {
        ok: true as const,
        stageCount: 2,
        maxWaveIndexInStage: 2,
        wave: {
          monsters: [{ monster_def_id: 'monster-a', count: 1 }],
        },
      };
    }
    if (stage === 1 && wave === 2) {
      return {
        ok: true as const,
        stageCount: 2,
        maxWaveIndexInStage: 2,
        wave: {
          monsters: [{ monster_def_id: 'monster-b', count: 1 }],
        },
      };
    }
    throw new Error(`unexpected stage/wave: ${stage}-${wave}`);
  });

  t.mock.method(stageData, 'buildMonsterDefIdsFromWave', (monsters: Array<{ monster_def_id: string }>) => {
    return monsters.map((monster) => monster.monster_def_id);
  });

  t.mock.method(battleService, 'startDungeonPVEBattleForDungeonFlow', async () => {
    return {
      success: false as const,
      message: '角色正在战斗中',
    };
  });

  const result = await nextDungeonInstance(1, instanceId);

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.message, '角色正在战斗中');
  }

  assert.equal(
    executedSql.some((sql) => sql.includes('UPDATE dungeon_instance SET current_stage = $2, current_wave = $3')),
    false,
  );
  assert.equal(
    executedSql.some((sql) => sql.includes("UPDATE dungeon_instance SET instance_data = jsonb_set")),
    false,
  );
});
