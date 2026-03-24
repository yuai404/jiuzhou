/**
 * 邮件未读红点缓存策略回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定邮件未读计数必须把“最近过期时间”纳入缓存寿命计算。
 * 2. 做什么：防止实现回退成固定 30 秒 TTL，导致定时轮询按缓存失效节拍重复重算大盘计数。
 * 3. 不做什么：不执行真实数据库查询，不验证执行计划。
 *
 * 输入/输出：
 * - 输入：邮件服务源码文本。
 * - 输出：动态 TTL 策略与计数 SQL 关键片段的断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 检查计数 SQL 是否回传最近过期时间 -> 检查缓存层是否复用动态 TTL 解析入口。
 *
 * 关键边界条件与坑点：
 * 1. 这里只锁缓存协议，不锁具体毫秒值；关键是“TTL 取决于最近过期邮件”，而不是写死常量。
 * 2. 必须同时约束 SQL 与缓存配置两头，否则只改其中一边，动态 TTL 都不会真正生效。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('邮件未读计数缓存应按最近过期邮件动态缩短 TTL', () => {
  const mailServiceSource = readFileSync(
    new URL('../mailService.ts', import.meta.url),
    'utf8',
  );

  assert.match(
    mailServiceSource,
    /MIN\(expire_at\) FILTER \(WHERE expire_at IS NOT NULL\) AS next_active_expire_at/u,
  );
  assert.match(
    mailServiceSource,
    /MIN\(next_active_expire_at\) AS next_active_expire_at/u,
  );
  assert.match(
    mailServiceSource,
    /ttlResolver:\s*\(\{\s*value\s*\}\)\s*=>\s*resolveMailUnreadCounterCacheTtl\(value\)/u,
  );
  assert.match(
    mailServiceSource,
    /const resolveMailUnreadCounterCacheTtl = \(\s*counter: MailUnreadCounterCacheEntry/u,
  );
});
