/**
 * 邮件计数共享存储回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证邮件计数增量会按“账号级/角色级”聚合后再写入 `mail_counter`。
 * 2. 做什么：验证读取邮件计数快照时只读 `mail_counter` 聚合表，不再回退扫描 `mail` 明细表。
 * 3. 不做什么：不连接真实数据库，不覆盖 `mailService` 全链路行为。
 *
 * 输入/输出：
 * - 输入：模拟数据库 `query` 响应，以及邮件计数增量请求。
 * - 输出：执行过的 SQL 列表、聚合后的参数，以及读取到的计数快照。
 *
 * 数据流/状态流：
 * 邮件状态变更 -> `applyMailCounterDeltas` 聚合同 scope 增量 -> 单 scope upsert
 * -> `loadMailCounterSnapshot` 只读 `mail_counter` 聚合表。
 *
 * 关键边界条件与坑点：
 * 1. 同 scope 的多次增量必须先聚合，否则逐封领邮件时还是会把计数写请求打散。
 * 2. 读侧必须只查 `mail_counter`，否则这张表建了也不能真正把热点查询从 `mail` 明细表上摘下来。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import { applyMailCounterDeltas, loadMailCounterSnapshot } from '../shared/mailCounterStore.js';

test('applyMailCounterDeltas: 应按 scope 聚合后写入 mail_counter', async (t) => {
  const calls: Array<{ sql: string; params?: readonly unknown[] }> = [];

  t.mock.method(database, 'query', async (sql: string, params?: readonly unknown[]) => {
    calls.push({ sql, params });
    if (sql.includes('INSERT INTO mail_counter')) {
      return { rows: [] };
    }
    if (sql.includes('DELETE FROM mail_counter')) {
      return { rows: [] };
    }
    throw new Error(`未处理的 SQL: ${sql}`);
  });

  await applyMailCounterDeltas([
    {
      recipientUserId: 690,
      recipientCharacterId: 679,
      totalCountDelta: -1,
      unreadCountDelta: -1,
    },
    {
      recipientUserId: 690,
      recipientCharacterId: 679,
      unclaimedCountDelta: -1,
    },
    {
      recipientUserId: 690,
      recipientCharacterId: null,
      totalCountDelta: 1,
      unreadCountDelta: 1,
      unclaimedCountDelta: 1,
    },
  ]);

  assert.equal(calls.length, 4);
  assert.match(calls[0]?.sql ?? '', /INSERT INTO mail_counter/u);
  assert.deepEqual(calls[0]?.params, ['character', 679, -1, -1, -1]);
  assert.match(calls[1]?.sql ?? '', /DELETE FROM mail_counter/u);
  assert.deepEqual(calls[1]?.params, ['character', 679]);

  assert.match(calls[2]?.sql ?? '', /INSERT INTO mail_counter/u);
  assert.deepEqual(calls[2]?.params, ['user', 690, 1, 1, 1]);
  assert.match(calls[3]?.sql ?? '', /DELETE FROM mail_counter/u);
  assert.deepEqual(calls[3]?.params, ['user', 690]);
});

test('loadMailCounterSnapshot: 应只读取 mail_counter 聚合表', async (t) => {
  const calls: string[] = [];

  t.mock.method(database, 'query', async (sql: string) => {
    calls.push(sql);
    if (sql.includes('FROM mail_counter')) {
      return {
        rows: [
          {
            total_count: '12',
            unread_count: '5',
            unclaimed_count: '3',
          },
        ],
      };
    }
    throw new Error(`未处理的 SQL: ${sql}`);
  });

  const result = await loadMailCounterSnapshot(690, 679);

  assert.deepEqual(result, {
    totalCount: 12,
    unreadCount: 5,
    unclaimedCount: 3,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0] ?? '', /FROM mail_counter/u);
  assert.doesNotMatch(calls[0] ?? '', /FROM mail\b/u);
});
