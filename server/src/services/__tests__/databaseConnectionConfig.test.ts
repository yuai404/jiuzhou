import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveDatabaseConnectionString } from '../../config/databaseConnection.js';

/**
 * 数据库连接配置回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住数据库连接串只维护单一入口，避免 Prisma 与运行时连接池各自拼接。
 * 2. 做什么：覆盖生产部署最关键的两条路径，保证仅有 `DB_*` 时也能推导出 Prisma 可用的连接串。
 * 3. 不做什么：不连接真实数据库，不验证 Docker 注入，仅验证纯函数级配置推导。
 *
 * 输入/输出：
 * - 输入：最小化的环境变量对象。
 * - 输出：统一的 PostgreSQL 连接串字符串。
 *
 * 数据流/状态流：
 * 测试构造 env -> 调用 `resolveDatabaseConnectionString` -> 断言 Prisma 与运行时应共用的连接串结果。
 *
 * 关键边界条件与坑点：
 * 1. 这里故意不依赖真实 `process.env`，避免本地环境污染导致测试误绿。
 * 2. 生产若密码包含特殊字符，连接串必须做 URL 编码，否则 Prisma 和 `pg` 会对同一份密码产生不同解析结果。
 */

test('resolveDatabaseConnectionString: 存在 DATABASE_URL 时应直接复用显式连接串', () => {
  const connectionString = resolveDatabaseConnectionString({
    DATABASE_URL: 'postgresql://postgres:secret@postgres:5432/jiuzhou?schema=public',
    DB_HOST: 'ignored-host',
    DB_PORT: '9999',
    DB_NAME: 'ignored-db',
    DB_USER: 'ignored-user',
    DB_PASSWORD: 'ignored-password',
  });

  assert.equal(connectionString, 'postgresql://postgres:secret@postgres:5432/jiuzhou?schema=public');
});

test('resolveDatabaseConnectionString: 缺少 DATABASE_URL 时应由 DB_* 统一推导连接串', () => {
  const connectionString = resolveDatabaseConnectionString({
    DB_HOST: 'postgres',
    DB_PORT: '5432',
    DB_NAME: 'jiuzhou',
    DB_USER: 'postgres',
    DB_PASSWORD: 'p@ss word',
  });

  assert.equal(connectionString, 'postgresql://postgres:p%40ss%20word@postgres:5432/jiuzhou');
});

test('resolveDatabaseConnectionString: 缺少 DATABASE_URL 且 DB_* 不完整时应直接失败', () => {
  assert.throws(
    () =>
      resolveDatabaseConnectionString({
        DB_HOST: 'postgres',
        DB_PORT: '5432',
        DB_NAME: 'jiuzhou',
        DB_USER: 'postgres',
      }),
    /缺少数据库环境变量：DB_PASSWORD/,
  );
});
