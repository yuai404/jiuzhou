/**
 * 角色秘境免体力设置同步测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“角色设置页保存秘境免体力开关后，在线战斗快照必须立即同步”的回归风险。
 * 2. 做什么：验证秘境入口读取的运行时权威快照与角色设置写库结果保持一致，避免开关刚保存就被旧快照误判。
 * 3. 不做什么：不覆盖路由层推送逻辑，也不覆盖客户端设置页展示。
 *
 * 输入/输出：
 * - 输入：userId、开关目标值，以及模拟的 DB 更新结果。
 * - 输出：`updateCharacterDungeonNoStaminaCostSetting` 成功，并调用在线战斗快照同步入口一次。
 *
 * 数据流/状态流：
 * - 设置保存 -> characterService.updateCharacterDungeonNoStaminaCostSetting 写 DB
 * -> setOnlineBattleCharacterDungeonNoStaminaCost 同步在线战斗快照
 * -> 秘境开战读取最新策略。
 *
 * 关键边界条件与坑点：
 * 1. 这里要求 SQL 返回 `id`，否则服务层无法知道要同步哪一个在线战斗角色快照。
 * 2. 测试只验证单一职责：设置落库后立即同步快照，不把客户端推送等旁路职责掺进来。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import * as projectionService from '../onlineBattleProjectionService.js';
import { updateCharacterDungeonNoStaminaCostSetting } from '../characterService.js';

test('updateCharacterDungeonNoStaminaCostSetting: 保存后应立即同步在线战斗快照', async (t) => {
  const executedSql: string[] = [];

  t.mock.method(database, 'query', async (sql: string, params?: unknown[]) => {
    executedSql.push(sql);
    assert.deepEqual(params, [true, 2001]);
    return {
      rowCount: 1,
      rows: [{ id: 3001 }],
    };
  });

  const synced: Array<{ characterId: number; enabled: boolean }> = [];
  t.mock.method(
    projectionService,
    'setOnlineBattleCharacterDungeonNoStaminaCost',
    async (characterId: number, enabled: boolean) => {
      synced.push({ characterId, enabled });
      return null;
    },
  );

  const result = await updateCharacterDungeonNoStaminaCostSetting(2001, true);

  assert.equal(result.success, true);
  assert.equal(executedSql.length, 1);
  assert.match(executedSql[0] ?? '', /RETURNING id/);
  assert.deepEqual(synced, [{ characterId: 3001, enabled: true }]);
});
