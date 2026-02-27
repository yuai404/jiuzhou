import { query, withTransaction } from '../config/database.js';

/**
 * 迁移历史表工具
 * 作用：
 * - 记录“数据迁移类脚本”是否已经执行成功；
 * - 提供 run-once 封装，避免服务每次启动都重复跑同一迁移。
 *
 * 输入：
 * - migrationKey：迁移唯一键（建议带版本号，如 xxx_v1）
 * - description：迁移说明
 * - execute：实际迁移函数
 *
 * 输出：
 * - 返回本次是否真正执行了迁移（executed=true）；
 * - 若已执行过则直接跳过（executed=false）。
 */

const migrationHistoryTableSQL = `
CREATE TABLE IF NOT EXISTS db_migration_history (
  migration_key VARCHAR(128) PRIMARY KEY,            -- 迁移唯一键（业务自定义）
  description TEXT NOT NULL DEFAULT '',              -- 迁移说明
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- 首次执行成功时间
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()      -- 最近更新时间
);

COMMENT ON TABLE db_migration_history IS '数据库迁移历史表（记录一次性迁移执行状态）';
COMMENT ON COLUMN db_migration_history.migration_key IS '迁移唯一键（建议带版本号）';
COMMENT ON COLUMN db_migration_history.description IS '迁移说明';
COMMENT ON COLUMN db_migration_history.executed_at IS '迁移首次执行成功时间';
COMMENT ON COLUMN db_migration_history.updated_at IS '最近更新时间';
`;

let migrationHistoryTableReady = false;

export const ensureMigrationHistoryTable = async (): Promise<void> => {
  if (migrationHistoryTableReady) return;
  await query(migrationHistoryTableSQL);
  migrationHistoryTableReady = true;
};

const hasMigrationExecuted = async (migrationKey: string): Promise<boolean> => {
  const result = await query(
    `
      SELECT 1
      FROM db_migration_history
      WHERE migration_key = $1
      LIMIT 1
    `,
    [migrationKey]
  );
  return result.rows.length > 0;
};

const markMigrationExecuted = async (
  migrationKey: string,
  description: string
): Promise<void> => {
  await query(
    `
      INSERT INTO db_migration_history (migration_key, description, executed_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      ON CONFLICT (migration_key) DO NOTHING
    `,
    [migrationKey, description]
  );
};

export interface RunDbMigrationOnceOptions {
  migrationKey: string;
  description: string;
  execute: () => Promise<void>;
}

export const runDbMigrationOnce = async (
  options: RunDbMigrationOnceOptions
): Promise<{ executed: boolean }> => {
  const migrationKey = String(options.migrationKey || '').trim();
  if (!migrationKey) {
    throw new Error('migrationKey 不能为空');
  }

  const description = String(options.description || '').trim();

  await ensureMigrationHistoryTable();
  return withTransaction(async () => {
    if (await hasMigrationExecuted(migrationKey)) {
      return { executed: false };
    }

    await options.execute();
    await markMigrationExecuted(migrationKey, description);
    return { executed: true };
  });
};
