import assert from 'node:assert/strict';
import test from 'node:test';
import { isTransientPgError } from '../../config/databaseRuntimeError.js';

/**
 * PostgreSQL 运行时错误分类回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住“可恢复数据库异常”的统一识别规则，避免 `app.ts` 与连接池监听再次分叉。
 * 2. 做什么：覆盖本次线上出现的连接被终止场景，确保 `Connection terminated unexpectedly` 会被归类到可恢复异常。
 * 3. 不做什么：不连接真实数据库，不模拟 `pg` 连接池，只验证纯函数分类结果。
 *
 * 输入/输出：
 * - 输入：携带 `code/message/cause` 的错误对象。
 * - 输出：`isTransientPgError` 的布尔判断结果。
 *
 * 数据流/状态流：
 * 测试构造错误对象 -> 调用统一分类函数 -> 断言进程级异常处理与连接池监听会走同一分支。
 *
 * 关键边界条件与坑点：
 * 1. `pg` 连接终止错误有时只有 message 没有 SQLSTATE，所以必须覆盖“仅 message 命中”的路径。
 * 2. 业务 SQL 错误不能被误判成可恢复异常，否则会掩盖真实数据问题并让调用链继续误运行。
 */

test('isTransientPgError: 应识别 PostgreSQL 锁冲突错误码', () => {
  const error = Object.assign(new Error('canceling statement due to lock timeout'), {
    code: '55P03',
  });

  assert.equal(isTransientPgError(error), true);
});

test('isTransientPgError: 应识别连接意外终止消息', () => {
  const error = new Error('Connection terminated unexpectedly');

  assert.equal(isTransientPgError(error), true);
});

test('isTransientPgError: 应沿 cause 链识别底层连接终止错误', () => {
  const rootCause = new Error('Connection terminated unexpectedly');
  const wrappedError = Object.assign(new Error('查询角色数据失败'), {
    cause: rootCause,
  });

  assert.equal(isTransientPgError(wrappedError), true);
});

test('isTransientPgError: 不应把普通业务 SQL 错误误判为可恢复异常', () => {
  const error = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
  });

  assert.equal(isTransientPgError(error), false);
});
