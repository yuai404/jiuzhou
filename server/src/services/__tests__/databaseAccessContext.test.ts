/**
 * 数据库访问上下文传播回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 `runWithDatabaseAccessForbidden` 会沿 AsyncLocalStorage 传播到微任务/定时器，覆盖本次竞技场结算线上报错的根因。
 * 2. 做什么：验证 `runWithDatabaseAccessAllowed` 能把真正需要落库的后台分支切到独立上下文，避免 battle action / 秘境自动推进继续误命中禁 DB。
 * 3. 不做什么：不连接真实数据库，也不验证具体 SQL；这里只校验数据库访问规则上下文的传播与清除语义。
 *
 * 输入/输出：
 * - 输入：禁 DB 上下文、Promise 微任务、`setTimeout` 定时器，以及显式清除上下文的包装器。
 * - 输出：`isDatabaseAccessForbidden()` 在不同异步边界上的布尔结果。
 *
 * 数据流/状态流：
 * 外层 `runWithDatabaseAccessForbidden`
 * -> 异步边界继承禁 DB 标记
 * -> 需要落库的后台任务显式调用 `runWithDatabaseAccessAllowed`
 * -> 其内部异步子树继续保持“允许访问数据库”。
 *
 * 关键边界条件与坑点：
 * 1. 必须同时覆盖 Promise 微任务与 `setTimeout`，否则只能证明一半的异步传播语义。
 * 2. `runWithDatabaseAccessAllowed` 只能清空当前子树，不能反向污染外层调用链；测试里需要在退出后再次确认外层仍然是禁 DB。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isDatabaseAccessForbidden,
  runWithDatabaseAccessAllowed,
  runWithDatabaseAccessForbidden,
} from '../../config/database.js';

test('runWithDatabaseAccessForbidden: Promise 微任务应继承禁 DB 上下文', async () => {
  await runWithDatabaseAccessForbidden('test/promise-microtask', async () => {
    assert.equal(isDatabaseAccessForbidden(), true);

    await Promise.resolve();

    assert.equal(isDatabaseAccessForbidden(), true);
  });
});

test('runWithDatabaseAccessAllowed: 应在后台子任务中清空禁 DB 上下文且不污染外层', async () => {
  await runWithDatabaseAccessForbidden('test/background-task', async () => {
    assert.equal(isDatabaseAccessForbidden(), true);

    await runWithDatabaseAccessAllowed(async () => {
      assert.equal(isDatabaseAccessForbidden(), false);

      await Promise.resolve();
      assert.equal(isDatabaseAccessForbidden(), false);

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          assert.equal(isDatabaseAccessForbidden(), false);
          resolve();
        }, 0);
      });
    });

    assert.equal(isDatabaseAccessForbidden(), true);
  });
});
