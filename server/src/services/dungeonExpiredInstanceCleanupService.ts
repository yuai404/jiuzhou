import type { PoolClient } from 'pg';
import { redis } from '../config/redis.js';
import {
  buildOnlineBattleDeferredSettlementTaskKey,
  deleteDungeonProjectionsBatch,
  ONLINE_BATTLE_DEFERRED_SETTLEMENT_INDEX_KEY,
  type DeferredSettlementTask,
} from './onlineBattleProjectionService.js';
import { withSessionAdvisoryLock } from './shared/sessionAdvisoryLock.js';

/**
 * 过期秘境实例清理服务（仅负责收口过期运行态，不负责任务/通关记录）
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把长期停留在 `preparing` / `running` 的过期秘境实例统一标记为 `abandoned`，避免启动预热继续搬运陈旧运行态。
 * 2. 做什么：同步清理对应的在线战斗秘境投影缓存，保证 DB / Redis / 内存三处口径一致。
 * 3. 不做什么：不删除 `dungeon_record`，不回滚任务/主线/成就/突破进度，也不处理真实通关发奖。
 *
 * 输入/输出：
 * - 输入：数据库中的 `dungeon_instance` 运行态记录、Redis 中的延迟结算任务索引。
 * - 输出：`runCleanupOnce()` 返回本轮收口统计；`getScheduleConfig()` 返回 cleanup worker 需要的调度配置。
 *
 * 数据流/状态流：
 * startupPipeline / cleanupWorker -> runCleanupOnce
 * -> advisory lock -> 读取 Redis 中仍受结算任务保护的实例 ID
 * -> 分批将过期实例标记为 abandoned -> 批量删除秘境投影缓存 -> 返回统计。
 *
 * 关键边界条件与坑点：
 * 1. 只允许收口“明显过期且没有延迟结算任务保护”的实例；有待执行结算任务的实例绝不能误判为脏数据。
 * 2. 这里只改 `dungeon_instance` 运行态，绝不能触碰 `dungeon_record` 和任务进度表，否则会污染秘境目标口径。
 */

type DungeonExpiredInstanceCleanupSummary = {
  protectedInstanceCount: number;
  abandonedPreparingCount: number;
  abandonedRunningCount: number;
  totalAbandonedCount: number;
};

type DungeonExpiredInstanceCleanupScheduleConfig = {
  enabled: boolean;
  intervalMs: number;
};

type ExpiredDungeonCleanupConfig = {
  enabled: boolean;
  intervalMs: number;
  preparingExpireHours: number;
  runningExpireHours: number;
  updateBatchSize: number;
  maxUpdateBatchesPerRun: number;
};

type ExpiredDungeonInstanceRow = {
  id: string;
  current_battle_id: string | null;
};

const DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOG_SCOPE = 'DungeonExpiredInstanceCleanup';
const DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOCK_KEY_1 = 2026;
const DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOCK_KEY_2 = 313;

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;
const DEFAULT_PREPARING_EXPIRE_HOURS = 6;
const DEFAULT_RUNNING_EXPIRE_HOURS = 24;
const DEFAULT_UPDATE_BATCH_SIZE = 2_000;
const DEFAULT_MAX_UPDATE_BATCHES_PER_RUN = 20;

const EXPIRED_DUNGEON_INSTANCE_CLEANUP_SQL = `
  WITH stale_instance AS (
    SELECT
      di.id,
      NULLIF(COALESCE(di.instance_data->>'currentBattleId', ''), '') AS current_battle_id
    FROM dungeon_instance di
    WHERE di.status = $1
      AND COALESCE(di.start_time, di.created_at) < NOW() - ($2::int * INTERVAL '1 hour')
      AND NOT (di.id = ANY($3::varchar[]))
    ORDER BY COALESCE(di.start_time, di.created_at) ASC, di.id ASC
    LIMIT $4
  ),
  updated AS (
    UPDATE dungeon_instance di
    SET
      status = 'abandoned',
      end_time = COALESCE(di.end_time, NOW()),
      instance_data = (COALESCE(di.instance_data, '{}'::jsonb) - 'currentBattleId') - 'startResourceTaskId'
    FROM stale_instance si
    WHERE di.id = si.id
    RETURNING di.id
  )
  SELECT si.id, si.current_battle_id
  FROM stale_instance si
  JOIN updated u ON u.id = si.id
`;

const loadExpiredDungeonCleanupConfig = (): ExpiredDungeonCleanupConfig => {
  return {
    enabled: true,
    intervalMs: DEFAULT_INTERVAL_MS,
    preparingExpireHours: DEFAULT_PREPARING_EXPIRE_HOURS,
    runningExpireHours: DEFAULT_RUNNING_EXPIRE_HOURS,
    updateBatchSize: DEFAULT_UPDATE_BATCH_SIZE,
    maxUpdateBatchesPerRun: DEFAULT_MAX_UPDATE_BATCHES_PER_RUN,
  };
};

const collectProtectedDungeonInstanceIds = (
  tasks: DeferredSettlementTask[],
): Set<string> => {
  const protectedInstanceIds = new Set<string>();
  for (const task of tasks) {
    if (task.status === 'completed') continue;

    const candidates = [
      task.payload.dungeonContext?.instanceId ?? null,
      task.payload.dungeonStartConsumption?.instanceId ?? null,
      task.payload.dungeonSettlement?.instanceId ?? null,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const instanceId = candidate.trim();
      if (!instanceId) continue;
      protectedInstanceIds.add(instanceId);
    }
  }
  return protectedInstanceIds;
};

class DungeonExpiredInstanceCleanupService {
  private readonly config: ExpiredDungeonCleanupConfig = loadExpiredDungeonCleanupConfig();
  private inFlight = false;

  getScheduleConfig(): DungeonExpiredInstanceCleanupScheduleConfig {
    return {
      enabled: this.config.enabled,
      intervalMs: this.config.intervalMs,
    };
  }

  getConfigSummaryText(): string {
    return `preparing 超过 ${this.config.preparingExpireHours} 小时、running 超过 ${this.config.runningExpireHours} 小时收口，间隔 ${Math.floor(
      this.config.intervalMs / 1000,
    )} 秒，单批 ${this.config.updateBatchSize} 条，单轮最多 ${this.config.maxUpdateBatchesPerRun} 批`;
  }

  private async loadProtectedDungeonInstanceIdsFromRedis(): Promise<Set<string>> {
    const taskIds = await redis.smembers(ONLINE_BATTLE_DEFERRED_SETTLEMENT_INDEX_KEY);
    if (taskIds.length <= 0) {
      return new Set<string>();
    }

    const taskKeys = taskIds.map((taskId) => buildOnlineBattleDeferredSettlementTaskKey(taskId));
    const taskTexts = await redis.mget(taskKeys);
    const tasks: DeferredSettlementTask[] = [];
    for (const taskText of taskTexts) {
      if (typeof taskText !== 'string' || taskText.length <= 0) continue;
      tasks.push(JSON.parse(taskText) as DeferredSettlementTask);
    }
    return collectProtectedDungeonInstanceIds(tasks);
  }

  private async abandonExpiredInstancesOnce(
    client: PoolClient,
    status: 'preparing' | 'running',
    expireHours: number,
    protectedInstanceIds: string[],
  ): Promise<number> {
    const result = await client.query<ExpiredDungeonInstanceRow>(
      EXPIRED_DUNGEON_INSTANCE_CLEANUP_SQL,
      [status, expireHours, protectedInstanceIds, this.config.updateBatchSize],
    );
    const cleanedEntries = result.rows.map((row) => ({
      instanceId: row.id,
      currentBattleId: row.current_battle_id,
    }));
    await deleteDungeonProjectionsBatch(cleanedEntries);
    return cleanedEntries.length;
  }

  async runCleanupOnce(): Promise<DungeonExpiredInstanceCleanupSummary> {
    const emptySummary: DungeonExpiredInstanceCleanupSummary = {
      protectedInstanceCount: 0,
      abandonedPreparingCount: 0,
      abandonedRunningCount: 0,
      totalAbandonedCount: 0,
    };
    if (!this.config.enabled) return emptySummary;
    if (this.inFlight) return emptySummary;
    this.inFlight = true;

    try {
      const execution = await withSessionAdvisoryLock(
        DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOCK_KEY_1,
        DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOCK_KEY_2,
        async (client) => {
          const protectedInstanceIds = await this.loadProtectedDungeonInstanceIdsFromRedis();
          const protectedIds = [...protectedInstanceIds];
          const summary: DungeonExpiredInstanceCleanupSummary = {
            protectedInstanceCount: protectedIds.length,
            abandonedPreparingCount: 0,
            abandonedRunningCount: 0,
            totalAbandonedCount: 0,
          };

          for (let batchNo = 0; batchNo < this.config.maxUpdateBatchesPerRun; batchNo += 1) {
            const abandonedPreparingCount = await this.abandonExpiredInstancesOnce(
              client,
              'preparing',
              this.config.preparingExpireHours,
              protectedIds,
            );
            const abandonedRunningCount = await this.abandonExpiredInstancesOnce(
              client,
              'running',
              this.config.runningExpireHours,
              protectedIds,
            );

            summary.abandonedPreparingCount += abandonedPreparingCount;
            summary.abandonedRunningCount += abandonedRunningCount;
            summary.totalAbandonedCount += abandonedPreparingCount + abandonedRunningCount;

            if (
              abandonedPreparingCount < this.config.updateBatchSize
              && abandonedRunningCount < this.config.updateBatchSize
            ) {
              break;
            }
          }

          if (summary.totalAbandonedCount > 0) {
            console.log(
              `[${DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOG_SCOPE}] 本轮收口 ${summary.totalAbandonedCount} 条过期秘境实例（preparing ${summary.abandonedPreparingCount} / running ${summary.abandonedRunningCount} / 结算保护 ${summary.protectedInstanceCount}）`,
            );
          }

          return summary;
        },
      );

      if (!execution.acquired) {
        return emptySummary;
      }

      return execution.result ?? emptySummary;
    } catch (error) {
      console.error(`[${DUNGEON_EXPIRED_INSTANCE_CLEANUP_LOG_SCOPE}] 清理失败:`, error);
      return emptySummary;
    } finally {
      this.inFlight = false;
    }
  }
}

export const dungeonExpiredInstanceCleanupService = new DungeonExpiredInstanceCleanupService();
