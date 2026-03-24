/**
 * 邮件热表生命周期清理策略回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定邮件热表必须对“已软删超保留期”和“已过期超保留期但未软删”的历史数据做物理删除。
 * 2. 做什么：锁定清理任务必须接入统一 cleanup worker，避免把生命周期治理逻辑重新塞回读链路或启动阻塞逻辑。
 * 3. 不做什么：不连接真实数据库，不评估执行计划，也不验证环境变量数值边界。
 *
 * 输入/输出：
 * - 输入：邮件清理服务与 cleanup worker 的源码文本。
 * - 输出：生命周期删除条件、批量删除协议与 worker 注册断言。
 *
 * 数据流/状态流：
 * 读取源码 -> 检查 mail 清理 SQL 是否覆盖两类历史邮件 -> 检查 cleanupWorker 是否统一调度该任务。
 *
 * 关键边界条件与坑点：
 * 1. 只清理已离开活跃生命周期的邮件，不能误删未过期且未软删的热数据。
 * 2. 物理清理必须走后台任务，不允许回退到启动同步阻塞或用户读接口触发。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('邮件热表应按生命周期做后台物理清理', () => {
  const cleanupServiceSource = readFileSync(
    new URL('../mailHistoryCleanupService.ts', import.meta.url),
    'utf8',
  );
  const cleanupWorkerSource = readFileSync(
    new URL('../../workers/cleanupWorker.ts', import.meta.url),
    'utf8',
  );

  assert.match(cleanupServiceSource, /DELETE FROM mail/u);
  assert.match(cleanupServiceSource, /deleted_at IS NOT NULL/u);
  assert.match(cleanupServiceSource, /deleted_at < NOW\(\) - \(\$1::int \* INTERVAL '1 day'\)/u);
  assert.match(cleanupServiceSource, /deleted_at IS NULL/u);
  assert.match(cleanupServiceSource, /expire_at IS NOT NULL/u);
  assert.match(cleanupServiceSource, /expire_at < NOW\(\) - \(\$1::int \* INTERVAL '1 day'\)/u);
  assert.match(cleanupServiceSource, /LIMIT \$2/u);
  assert.match(cleanupServiceSource, /pg_try_advisory_lock/u);

  assert.match(cleanupWorkerSource, /mailHistoryCleanupService/u);
  assert.match(cleanupWorkerSource, /mail-history-cleanup/u);
  assert.match(cleanupWorkerSource, /runCleanupOnce\(\)/u);
});
