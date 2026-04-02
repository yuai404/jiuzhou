/**
 * 启动流水线接入角色排行榜快照凌晨调度器回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定启动流水线会初始化新的凌晨刷新调度器，避免服务启动后无人注册定时任务。
 * 2. 做什么：锁定优雅关闭阶段会停止该调度器，避免进程退出时遗留定时器引用。
 * 3. 不做什么：不真正启动 HTTP 服务，不执行真实启动流水线，只检查源码接线关系。
 *
 * 输入/输出：
 * - 输入：`startupPipeline.ts` 源码文本。
 * - 输出：源码级接线断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 断言导入初始化/停止入口 -> 断言启动期注册 -> 断言关闭期注销。
 *
 * 复用设计说明：
 * 1. 调度器生命周期统一挂在 `startupPipeline`，和其他后台服务保持同一入口，避免各模块私自启动。
 * 2. 源码级测试只关注接线关系，能稳定覆盖“有无接入”这类结构性回归。
 *
 * 关键边界条件与坑点：
 * 1. 如果启动文件后续拆分，需要同步更新这里的相对路径与正则定位。
 * 2. 这里只锁定初始化与停止动作，不约束具体日志文案，避免无关文案修改触发误报。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('startupPipeline 必须初始化并停止角色排行榜快照凌晨调度器', () => {
  const source = readSource('../startupPipeline.ts');

  assert.match(
    source,
    /initializeRankSnapshotNightlyRefreshScheduler/u,
    '启动流水线必须导入凌晨调度器初始化入口',
  );
  assert.match(
    source,
    /stopRankSnapshotNightlyRefreshScheduler/u,
    '启动流水线必须导入凌晨调度器停止入口',
  );
  assert.match(
    source,
    /await runStartupStep\("角色排行榜快照夜间刷新调度器初始化",\s*initializeRankSnapshotNightlyRefreshScheduler\);/u,
    '服务启动时必须注册凌晨调度器',
  );
  assert.match(
    source,
    /stopRankSnapshotNightlyRefreshScheduler\(\);/u,
    '优雅关闭时必须停止凌晨调度器',
  );
});
