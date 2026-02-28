/**
 * Worker 池启动集成示例
 *
 * 将此代码集成到 server/src/bootstrap/startupPipeline.ts
 */

import { cpus } from 'os';
import { initializeWorkerPool, shutdownWorkerPool } from '../workers/workerPool.js';
import {
  getMonsterDefinitions,
  getSkillDefinitions,
} from '../services/staticConfigLoader.js';

/**
 * 初始化 Worker 池（在服务启动流程中调用）
 *
 * 位置：startServerWithPipeline 函数中，在 initTables() 之后
 */
export async function initWorkerPool(): Promise<void> {
  // 检查是否启用 Worker 模式
  const useWorker = process.env.IDLE_USE_WORKER === 'true';
  if (!useWorker) {
    console.log('⊘ Worker 模式未启用（IDLE_USE_WORKER=false）');
    return;
  }

  console.log('正在初始化 Worker 池...');

  // 1. 准备静态配置数据（传递给 Worker）
  const monsterDefs = getMonsterDefinitions();
  const skillDefs = getSkillDefinitions();

  const monsterDefsMap = new Map(monsterDefs.map((m) => [m.id, m]));
  const skillDefsMap = new Map(skillDefs.map((s) => [s.id, s]));

  console.log(
    `  - 加载 ${monsterDefsMap.size} 个怪物定义，${skillDefsMap.size} 个技能定义`,
  );

  // 2. 确定 Worker 数量
  const cpuCount = cpus().length;
  const workerCount = process.env.IDLE_WORKER_COUNT
    ? parseInt(process.env.IDLE_WORKER_COUNT, 10)
    : Math.max(1, cpuCount - 1);

  console.log(`  - CPU 核心数: ${cpuCount}，启动 ${workerCount} 个 Worker`);

  // 3. 初始化 Worker 池
  await initializeWorkerPool({
    workerCount,
    workerData: {
      monsterDefs: monsterDefsMap,
      skillDefs: skillDefsMap,
    },
    taskTimeout: 30_000, // 单个战斗任务超时 30 秒
    autoRestart: true, // Worker 崩溃自动重启
  });

  console.log('✓ Worker 池已就绪');
}

/**
 * 关闭 Worker 池（在优雅关闭流程中调用）
 *
 * 位置：gracefulShutdown 函数中，在 stopAllExecutionLoops() 之后
 */
export async function closeWorkerPool(): Promise<void> {
  const useWorker = process.env.IDLE_USE_WORKER === 'true';
  if (!useWorker) return;

  console.log('正在关闭 Worker 池...');
  await shutdownWorkerPool();
  console.log('✓ Worker 池已关闭');
}

/**
 * 完整的启动流程示例（修改 startupPipeline.ts）
 */
export const startServerWithPipeline = async (options: StartServerOptions): Promise<void> => {
  console.log('\n🎮 九州修仙录 服务启动中...\n');

  // 1. 连接检查
  const dbConnected = await testConnection();
  if (!dbConnected) {
    throw new Error('数据库连接失败，服务启动终止');
  }

  const redisConnected = await testRedisConnection();
  if (!redisConnected) {
    console.warn('⚠ Redis 连接失败，战斗状态将不会持久化');
  }

  // 2. 初始化数据库表和静态配置
  await initTables();
  await cleanupUndefinedItemDataOnStartup();

  // 3. 初始化 Worker 池（新增）
  await initWorkerPool();

  // 4. 初始化游戏服务
  await initGameTimeService();
  await initArenaWeeklySettlementService();

  // 5. 恢复战斗状态
  if (redisConnected) {
    console.log('正在恢复战斗状态...');
    await recoverBattlesFromRedis();
  }

  // 6. 恢复挂机会话
  await recoverActiveIdleSessions();

  // 7. 启动 HTTP 服务器
  options.httpServer.listen(options.port, options.host, () => {
    console.log(`\n✓ 服务已启动: http://${options.host}:${options.port}\n`);
  });
};

/**
 * 完整的优雅关闭流程示例
 */
const gracefulShutdown = async (signal: string): Promise<void> => {
  console.log(`\n收到 ${signal} 信号，开始优雅关闭...\n`);

  // 1. 停止接受新连接
  httpServer.close();
  console.log('✓ HTTP 服务器已停止接受新连接');

  // 2. 停止所有后台任务和定时器
  console.log('正在停止后台服务...');

  await stopGameTimeService();
  console.log('✓ 游戏时间服务已停止');

  stopArenaWeeklySettlementService();
  console.log('✓ 竞技场结算服务已停止');

  stopBattleService();
  console.log('✓ 战斗服务已停止');

  stopAllExecutionLoops();
  console.log('✓ 挂机执行循环已停止');

  // 3. 关闭 Worker 池（新增）
  await closeWorkerPool();

  // 4. 等待现有操作完成
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // 5. 刷新所有缓冲区
  await flushAllBuffers();
  console.log('✓ 挂机缓冲区已刷写');

  // 6. 关闭外部连接
  await closeRedis();
  console.log('✓ Redis 连接已关闭');

  await pool.end();
  console.log('✓ 数据库连接池已关闭');

  console.log('✓ 服务已完全关闭');
  process.exit(0);
};
