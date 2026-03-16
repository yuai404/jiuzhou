/**
 * 易名符改名服务测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证“校验新道号 + 消耗易名符 + 更新角色名称”必须在同一事务链路内完成。
 * 2. 做什么：验证只有真正的易名符实例可用于改名，普通消耗品不能误入该入口。
 * 3. 不做什么：不连接真实数据库，不覆盖路由层参数解析与前端弹窗行为。
 *
 * 输入/输出：
 * - 输入：用户 ID、物品实例 ID、新道号，以及模拟数据库查询结果。
 * - 输出：服务返回值、更新 SQL 是否执行、道具是否被扣除。
 *
 * 数据流/状态流：
 * 改名请求 -> 事务内锁角色与物品实例 -> 名称校验 -> 更新昵称与扣卡 -> 失效角色缓存。
 *
 * 关键边界条件与坑点：
 * 1. 物品校验不能只看“是消耗品”，必须确认它就是配置为改名用途的易名符。
 * 2. 成功改名后必须刷新角色缓存，否则排行榜与角色推送会继续读到旧道号。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

import * as database from '../../config/database.js';
import {
  characterServiceSideEffects,
  renameCharacterWithCard,
} from '../characterService.js';

type SqlValue = boolean | Date | number | string | null;
type MockTransactionState = {
  clientId: number;
  depth: number;
  released: boolean;
  rollbackCause: null;
  rollbackOnly: boolean;
};

const createQueryResult = <TRow extends QueryResultRow>(rows: TRow[]): QueryResult<TRow> => {
  return {
    command: 'SELECT',
    rowCount: rows.length,
    oid: 0,
    rows,
    fields: [],
  };
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

test('renameCharacterWithCard: 应在成功改名时扣除 1 张易名符并刷新角色缓存', async (t) => {
  let updatedNickname = '';
  let deletedItemId = 0;

  const invalidateMock = t.mock.method(
    characterServiceSideEffects,
    'invalidateCharacterComputedCacheByCharacterId',
    async () => undefined,
  );

  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT id FROM characters WHERE nickname = $1')) {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT id FROM characters WHERE user_id = $1 LIMIT 1 FOR UPDATE')) {
        return createQueryResult([{ id: 88 }]);
      }

      if (sql.includes('SELECT id, qty, item_def_id') && sql.includes('FROM item_instance')) {
        return createQueryResult([{ id: 501, qty: 1, item_def_id: 'cons-rename-001' }]);
      }

      if (sql.includes('UPDATE characters') && sql.includes('SET nickname = $1')) {
        updatedNickname = String(params?.[0] ?? '');
        return createQueryResult([{ id: 88 }]);
      }

      if (sql.includes('DELETE FROM item_instance WHERE id = $1')) {
        deletedItemId = Number(params?.[0] ?? 0);
        return createQueryResult([]);
      }

      throw new Error(`未处理的 SQL: ${sql}`);
    }),
  );

  const result = await renameCharacterWithCard(1001, 501, '  凌霄子  ');

  assert.deepEqual(result, {
    success: true,
    message: '改名成功',
  });
  assert.equal(updatedNickname, '凌霄子');
  assert.equal(deletedItemId, 501);
  assert.equal(invalidateMock.mock.callCount(), 1);
  assert.deepEqual(invalidateMock.mock.calls[0]?.arguments, [88]);
});

test('renameCharacterWithCard: 非易名符实例不应被用于改名', async (t) => {
  let updateExecuted = false;

  t.mock.method(
    characterServiceSideEffects,
    'invalidateCharacterComputedCacheByCharacterId',
    async () => undefined,
  );

  t.mock.method(database.pool, 'connect', async () =>
    createMockPoolClient(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT id FROM characters WHERE nickname = $1')) {
        return createQueryResult([]);
      }

      if (sql.includes('SELECT id FROM characters WHERE user_id = $1 LIMIT 1 FOR UPDATE')) {
        return createQueryResult([{ id: 66 }]);
      }

      if (sql.includes('SELECT id, qty, item_def_id') && sql.includes('FROM item_instance')) {
        return createQueryResult([{ id: 701, qty: 1, item_def_id: 'cons-001' }]);
      }

      if (sql.includes('UPDATE characters') && sql.includes('SET nickname = $1')) {
        updateExecuted = true;
        return createQueryResult([{ id: 66 }]);
      }

      throw new Error(`未处理的 SQL: ${sql}`);
    }),
  );

  const result = await renameCharacterWithCard(1002, 701, '青霄');

  assert.deepEqual(result, {
    success: false,
    message: '该物品不能用于改名',
  });
  assert.equal(updateExecuted, false);
});
