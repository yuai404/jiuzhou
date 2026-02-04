import { query } from '../config/database.js';

const gameTimeTableSQL = `
CREATE TABLE IF NOT EXISTS game_time (
  id SMALLINT PRIMARY KEY,
  era_name VARCHAR(32) NOT NULL,
  base_year INTEGER NOT NULL,
  game_elapsed_ms BIGINT NOT NULL,
  weather VARCHAR(16) NOT NULL,
  scale INTEGER NOT NULL DEFAULT 60,
  last_real_ms BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE game_time IS '游戏时间状态表';
COMMENT ON COLUMN game_time.id IS '主键（固定为1）';
COMMENT ON COLUMN game_time.era_name IS '纪元名称';
COMMENT ON COLUMN game_time.base_year IS '起始年份';
COMMENT ON COLUMN game_time.game_elapsed_ms IS '游戏时间累计毫秒（从起始日期00:00起算）';
COMMENT ON COLUMN game_time.weather IS '天气';
COMMENT ON COLUMN game_time.scale IS '时间倍率（1真实秒对应的游戏秒数）';
COMMENT ON COLUMN game_time.last_real_ms IS '上次记录时的服务器真实时间戳毫秒';
COMMENT ON COLUMN game_time.updated_at IS '更新时间';
`;

export const initGameTimeTable = async (): Promise<void> => {
  await query(gameTimeTableSQL);
};

