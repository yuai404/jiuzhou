/**
 * 玩家写回缓存测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定统一玩家写回缓存对角色字段和物品字段的 pending 覆盖行为，避免属性点、货币、装备状态在不同读取链路各写一套补丁逻辑。
 * 2. 做什么：锁定 flush 会把角色快照与物品快照批量写回 DB，并在成功后清空脏状态。
 * 3. 不做什么：不连接真实 Redis/数据库，不覆盖具体路由层与 Socket 事件参数解析。
 *
 * 输入/输出：
 * - 输入：角色基础行、物品基础行、pending 快照，以及模拟数据库 query 行为。
 * - 输出：覆盖后的读取结果、flush 期间发出的 SQL 调用。
 *
 * 数据流/状态流：
 * - 测试先写入 pending 角色/物品快照；
 * - 再调用共享覆盖入口验证立即可见；
 * - 最后调用 flush 验证脏数据落库并清空。
 *
 * 关键边界条件与坑点：
 * 1. 物品 pending 必须支持“删除后从读取结果中过滤掉”，否则材料扣成 0 或装备碎掉后仍会出现在背包里。
 * 2. flush 成功后必须清空 dirty 状态，否则同一批快照会在后续定时任务中重复落库。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import * as database from '../../config/database.js';
import { closeRedis } from '../../config/redis.js';
import {
  applyPendingCharacterWriteback,
  applyPendingInventoryItemWritebackRows,
  flushPlayerWritebackByCharacterId,
  queueCharacterWritebackSnapshot,
  queueInventoryItemWritebackSnapshot,
  resetPlayerWritebackStateForTests,
} from '../playerWritebackCacheService.js';

const createQueryResult = <TRow extends QueryResultRow>(rows: TRow[]): QueryResult<TRow> => {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    rows,
    fields: [],
  };
};

type SqlValue = boolean | Date | number | string | null;

type MockTransactionState = {
  clientId: number;
  depth: number;
  released: boolean;
  rollbackCause: null;
  rollbackOnly: boolean;
};

const isSqlConfigArg = (
  value: string | readonly SqlValue[] | { text: string } | undefined,
): value is { text: string } => {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && 'text' in value;
};

const createMockPoolClient = (
  handler: (sql: string, params?: readonly SqlValue[]) => Promise<QueryResult<QueryResultRow>>,
): PoolClient => {
  const txState: MockTransactionState = {
    clientId: 1,
    depth: 0,
    released: false,
    rollbackCause: null,
    rollbackOnly: false,
  };

  const client: Partial<PoolClient> & { __txState: MockTransactionState } = {
    __txState: txState,
    query: (async (...queryArgs: Array<string | readonly SqlValue[] | { text: string }>) => {
      const firstArg = queryArgs[0];
      const sql =
        typeof firstArg === 'string'
          ? firstArg
          : isSqlConfigArg(firstArg)
            ? firstArg.text
            : '';
      const secondArg = queryArgs[1];
      const params = Array.isArray(secondArg) ? (secondArg as readonly SqlValue[]) : undefined;

      if (sql === 'BEGIN') {
        txState.depth = 1;
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        txState.depth = 0;
      }
      return await handler(sql, params);
    }) as PoolClient['query'],
    release: () => undefined,
  };

  return client as PoolClient;
};

test.afterEach(() => {
  resetPlayerWritebackStateForTests();
});

test.after(async () => {
  await closeRedis();
  await database.pool.end();
});

test('applyPendingCharacterWriteback: 应优先返回 pending 角色快照字段', () => {
  queueCharacterWritebackSnapshot(88, {
    attribute_points: 7,
    jing: 11,
    qi: 22,
    shen: 33,
    silver: 456,
    spirit_stones: 789,
  });

  const row = applyPendingCharacterWriteback({
    id: 88,
    user_id: 1001,
    attribute_points: 1,
    jing: 2,
    qi: 3,
    shen: 4,
    silver: 5,
    spirit_stones: 6,
  });

  assert.deepEqual(row, {
    id: 88,
    user_id: 1001,
    attribute_points: 7,
    jing: 11,
    qi: 22,
    shen: 33,
    silver: 456,
    spirit_stones: 789,
  });
});

test('applyPendingInventoryItemWritebackRows: 应覆盖物品字段并过滤已删除物品', () => {
  queueInventoryItemWritebackSnapshot(
    88,
    {
      id: 501,
      owner_character_id: 88,
      item_def_id: 'mat-001',
      qty: 10,
      location: 'bag',
      location_slot: 2,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      affix_gen_version: 4,
    },
    {
      qty: 4,
      affixes: [{ key: 'crit', value: 18 }],
      affix_gen_version: 5,
    },
  );

  queueInventoryItemWritebackSnapshot(
    88,
    {
      id: 777,
      owner_character_id: 88,
      item_def_id: 'equip-001',
      qty: 1,
      location: 'equipped',
      location_slot: null,
      equipped_slot: 'weapon',
      strengthen_level: 12,
      refine_level: 4,
      affixes: [{ key: 'atk', value: 10 }],
      affix_gen_version: 4,
    },
    null,
  );

  const rows = applyPendingInventoryItemWritebackRows(88, [
    {
      id: 501,
      owner_character_id: 88,
      item_def_id: 'mat-001',
      qty: 10,
      location: 'bag',
      location_slot: 2,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      affix_gen_version: 4,
    },
    {
      id: 777,
      owner_character_id: 88,
      item_def_id: 'equip-001',
      qty: 1,
      location: 'equipped',
      location_slot: null,
      equipped_slot: 'weapon',
      strengthen_level: 12,
      refine_level: 4,
      affixes: [{ key: 'atk', value: 10 }],
      affix_gen_version: 4,
    },
  ]);

  assert.deepEqual(rows, [
    {
      id: 501,
      owner_character_id: 88,
      item_def_id: 'mat-001',
      qty: 4,
      location: 'bag',
      location_slot: 2,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [{ key: 'crit', value: 18 }],
      affix_gen_version: 5,
    },
  ]);
});

test('flushPlayerWritebackByCharacterId: 应写回角色与物品快照并清空脏状态', async (t) => {
  const sqlLog: string[] = [];

  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql) => {
      sqlLog.push(sql.replace(/\s+/g, ' ').trim());
      return createQueryResult([]);
    }),
  );

  queueCharacterWritebackSnapshot(99, {
    attribute_points: 3,
    jing: 9,
    qi: 8,
    shen: 7,
    silver: 666,
    spirit_stones: 888,
  });

  queueInventoryItemWritebackSnapshot(
    99,
    {
      id: 901,
      owner_character_id: 99,
      item_def_id: 'equip-901',
      qty: 1,
      location: 'equipped',
      location_slot: null,
      equipped_slot: 'weapon',
      strengthen_level: 10,
      refine_level: 2,
      affixes: [{ key: 'atk', value: 20 }],
      affix_gen_version: 4,
    },
    {
      strengthen_level: 11,
      refine_level: 3,
      affixes: [{ key: 'atk', value: 30 }],
      affix_gen_version: 5,
    },
  );

  queueInventoryItemWritebackSnapshot(
    99,
    {
      id: 902,
      owner_character_id: 99,
      item_def_id: 'mat-902',
      qty: 5,
      location: 'bag',
      location_slot: 7,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      affix_gen_version: 4,
    },
    null,
  );

  await flushPlayerWritebackByCharacterId(99);

  assert.equal(sqlLog.length, 5);
  assert.equal(sqlLog[0], 'BEGIN');
  assert.match(sqlLog[1] ?? '', /UPDATE characters SET/);
  assert.match(sqlLog[2] ?? '', /UPDATE item_instance SET/);
  assert.match(sqlLog[3] ?? '', /DELETE FROM item_instance/);
  assert.equal(sqlLog[4], 'COMMIT');

  const rowAfterFlush = applyPendingCharacterWriteback({
    id: 99,
    attribute_points: 1,
    jing: 1,
    qi: 1,
    shen: 1,
    silver: 1,
    spirit_stones: 1,
  });
  assert.deepEqual(rowAfterFlush, {
    id: 99,
    attribute_points: 1,
    jing: 1,
    qi: 1,
    shen: 1,
    silver: 1,
    spirit_stones: 1,
  });

  const itemsAfterFlush = applyPendingInventoryItemWritebackRows(99, [
    {
      id: 901,
      owner_character_id: 99,
      item_def_id: 'equip-901',
      qty: 1,
      location: 'equipped',
      location_slot: null,
      equipped_slot: 'weapon',
      strengthen_level: 10,
      refine_level: 2,
      affixes: [{ key: 'atk', value: 20 }],
      affix_gen_version: 4,
    },
  ]);
  assert.deepEqual(itemsAfterFlush, [
    {
      id: 901,
      owner_character_id: 99,
      item_def_id: 'equip-901',
      qty: 1,
      location: 'equipped',
      location_slot: null,
      equipped_slot: 'weapon',
      strengthen_level: 10,
      refine_level: 2,
      affixes: [{ key: 'atk', value: 20 }],
      affix_gen_version: 4,
    },
  ]);
});
