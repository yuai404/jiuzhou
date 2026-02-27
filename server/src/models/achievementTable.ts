import { query } from '../config/database.js';
import { runDbMigrationOnce } from './migrationHistoryTable.js';

const characterAchievementTableSQL = `
CREATE TABLE IF NOT EXISTS character_achievement (
  id BIGSERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  achievement_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'in_progress',
  progress INTEGER NOT NULL DEFAULT 0,
  progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, achievement_id)
);

COMMENT ON TABLE character_achievement IS '角色成就进度表';
COMMENT ON COLUMN character_achievement.status IS '状态：in_progress/completed/claimed';
COMMENT ON COLUMN character_achievement.progress IS '数值进度';
COMMENT ON COLUMN character_achievement.progress_data IS '扩展进度（multi）';

CREATE INDEX IF NOT EXISTS idx_character_achievement_character
  ON character_achievement(character_id, achievement_id);
CREATE INDEX IF NOT EXISTS idx_character_achievement_status
  ON character_achievement(character_id, status, updated_at DESC);
`;

const characterAchievementPointsTableSQL = `
CREATE TABLE IF NOT EXISTS character_achievement_points (
  character_id INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  combat_points INTEGER NOT NULL DEFAULT 0,
  cultivation_points INTEGER NOT NULL DEFAULT 0,
  exploration_points INTEGER NOT NULL DEFAULT 0,
  social_points INTEGER NOT NULL DEFAULT 0,
  collection_points INTEGER NOT NULL DEFAULT 0,
  claimed_thresholds JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE character_achievement_points IS '角色成就点数统计表';
COMMENT ON COLUMN character_achievement_points.claimed_thresholds IS '已领取点数阈值';
`;

const characterTitleTableSQL = `
CREATE TABLE IF NOT EXISTS character_title (
  id BIGSERIAL PRIMARY KEY,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  title_id VARCHAR(64) NOT NULL,
  is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
  obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(character_id, title_id)
);

COMMENT ON TABLE character_title IS '角色称号拥有与装备状态';

CREATE INDEX IF NOT EXISTS idx_character_title_character
  ON character_title(character_id, obtained_at DESC);
CREATE INDEX IF NOT EXISTS idx_character_title_equipped
  ON character_title(character_id, is_equipped);
`;

/**
 * 一次性迁移：为已有库补齐限时称号过期字段与索引。
 *
 * 作用：
 * 1. 为旧版本 character_title 表追加 expires_at 字段；
 * 2. 增加“有效称号读取”与“过期清理”所需索引，降低周结算与称号列表查询开销。
 *
 * 输入：
 * - 无（直接对当前数据库结构执行 DDL）
 *
 * 输出：
 * - 结构迁移完成后，character_title 具备限时称号所需字段与索引。
 *
 * 数据流：
 * - initAchievementTables -> runDbMigrationOnce -> 执行本函数。
 *
 * 关键边界条件与坑点：
 * 1. 旧库可能已手动创建列或索引，因此所有 DDL 都必须使用 IF NOT EXISTS。
 * 2. COMMENT 语句需要在列存在后执行，否则会直接失败中断初始化。
 */
const migrateCharacterTitleExpiresAt = async (): Promise<void> => {
  await query('ALTER TABLE character_title ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ');
  await query(`COMMENT ON COLUMN character_title.expires_at IS '称号过期时间；NULL表示永久有效'`);
  await query(
    'CREATE INDEX IF NOT EXISTS idx_character_title_active_validity ON character_title(character_id, is_equipped, expires_at)',
  );
  await query(
    'CREATE INDEX IF NOT EXISTS idx_character_title_expires_at ON character_title(expires_at) WHERE expires_at IS NOT NULL',
  );
};

export const initAchievementTables = async (): Promise<void> => {
  await query(characterAchievementTableSQL);
  await query(characterAchievementPointsTableSQL);
  await query(characterTitleTableSQL);
  await runDbMigrationOnce({
    migrationKey: 'character_title_expires_at_v1',
    description: '角色称号表增加 expires_at 字段与有效期查询索引',
    execute: migrateCharacterTitleExpiresAt,
  });
  console.log('✓ 成就与称号系统表检测完成');
};
