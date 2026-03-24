/**
 * 邮件计数表 Prisma schema 回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 `mail_counter` 聚合表的核心字段、复合主键与计数字段类型。
 * 2. 做什么：防止后续重构把邮件计数真相源又塞回 Redis 或散回业务代码里。
 * 3. 不做什么：不执行真实 `db:sync`，不验证数据库里是否已落表。
 *
 * 输入/输出：
 * - 输入：`server/prisma/schema.prisma` 源码文本。
 * - 输出：`mail_counter` 模型关键字段与主键约束断言。
 *
 * 数据流/状态流：
 * 读取 Prisma schema -> 提取 `mail_counter` 模型块 -> 校验字段与约束存在。
 *
 * 关键边界条件与坑点：
 * 1. 这里锁的是“数据库真相源必须存在”，否则服务层再怎么抽象都只是在缓存层兜圈子。
 * 2. `scope_type + scope_id` 必须组成单一主键，避免账号级与角色级计数行出现重复写入。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('Prisma schema 应声明 mail_counter 聚合表', () => {
  const schemaPath = path.resolve(process.cwd(), 'server/prisma/schema.prisma');
  const schema = readFileSync(schemaPath, 'utf8');
  const blockMatch = schema.match(/model mail_counter \{[\s\S]*?\n\}/u);

  assert.ok(blockMatch, '缺少 model mail_counter 定义');

  const block = blockMatch?.[0] ?? '';
  assert.match(block, /\bscope_type\s+String\s+@db\.VarChar\(16\)/u, '缺少 scope_type 字段');
  assert.match(block, /\bscope_id\s+BigInt\b/u, '缺少 scope_id 字段');
  assert.match(block, /\btotal_count\s+BigInt\s+@default\(0\)/u, '缺少 total_count 字段');
  assert.match(block, /\bunread_count\s+BigInt\s+@default\(0\)/u, '缺少 unread_count 字段');
  assert.match(block, /\bunclaimed_count\s+BigInt\s+@default\(0\)/u, '缺少 unclaimed_count 字段');
  assert.match(block, /@@id\(\[scope_type, scope_id\]\)/u, '缺少 scope_type + scope_id 复合主键');
});
