import { query } from '../config/database.js';

/**
 * AI 伙伴招募动态表初始化
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：创建 AI 伙伴定义表与伙伴招募任务表，作为动态伙伴配置与异步招募状态机的唯一数据源。
 * 2) 做什么：约束单角色同时仅保留一个未终结招募任务，避免并发招募把预览与扣费状态打乱。
 * 3) 不做什么：不生成伙伴内容、不执行扣费或退款、不处理前端结果展示。
 *
 * 输入/输出：
 * - 输入：无，启动时调用。
 * - 输出：`generated_partner_def`、`partner_recruit_job` 表与索引/注释。
 *
 * 数据流/状态流：
 * initTables -> initPartnerRecruitTables -> partnerRecruitService / staticConfigLoader 读写动态伙伴与任务状态。
 *
 * 关键边界条件与坑点：
 * 1) 动态伙伴定义必须独立存表，不能把 AI 结果回写到 `partner_def.json`，否则部署与发布链路会失控。
 * 2) 未终结任务唯一约束只覆盖 `pending/generated_draft`，已接受或已失败历史仍需保留供冷却与结果查询使用。
 */
const generatedPartnerDefTableSQL = `
CREATE TABLE IF NOT EXISTS generated_partner_def (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  description TEXT,
  avatar VARCHAR(255),
  quality VARCHAR(8) NOT NULL,
  attribute_element VARCHAR(16) NOT NULL,
  role VARCHAR(32) NOT NULL,
  max_technique_slots INTEGER NOT NULL,
  base_attrs JSONB NOT NULL,
  level_attr_gains JSONB NOT NULL DEFAULT '{}'::jsonb,
  innate_technique_ids TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  source_job_id VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE generated_partner_def IS 'AI 生成伙伴定义表';
COMMENT ON COLUMN generated_partner_def.id IS '动态伙伴定义ID';
COMMENT ON COLUMN generated_partner_def.base_attrs IS '伙伴基础属性 JSON';
COMMENT ON COLUMN generated_partner_def.level_attr_gains IS '伙伴每级成长属性 JSON';
COMMENT ON COLUMN generated_partner_def.innate_technique_ids IS '伙伴天生功法ID列表';
COMMENT ON COLUMN generated_partner_def.created_by_character_id IS '创建该伙伴的角色ID';
COMMENT ON COLUMN generated_partner_def.source_job_id IS '来源招募任务ID';

CREATE INDEX IF NOT EXISTS idx_generated_partner_def_creator
  ON generated_partner_def(created_by_character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generated_partner_def_enabled
  ON generated_partner_def(enabled, created_at DESC);
`;

const partnerRecruitJobTableSQL = `
CREATE TABLE IF NOT EXISTS partner_recruit_job (
  id VARCHAR(64) PRIMARY KEY,
  character_id BIGINT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL,
  quality_rolled VARCHAR(8) NOT NULL,
  spirit_stones_cost BIGINT NOT NULL,
  cooldown_started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  error_message TEXT,
  preview_partner_def_id VARCHAR(64) REFERENCES generated_partner_def(id) ON DELETE SET NULL,
  preview_avatar_url VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

const partnerRecruitJobCommentAndIndexSQL = `
COMMENT ON TABLE partner_recruit_job IS 'AI 伙伴招募任务表';
COMMENT ON COLUMN partner_recruit_job.id IS '招募任务ID';
COMMENT ON COLUMN partner_recruit_job.status IS '任务状态：pending/generated_draft/accepted/failed/refunded/discarded';
COMMENT ON COLUMN partner_recruit_job.quality_rolled IS '本次招募抽取到的伙伴品质';
COMMENT ON COLUMN partner_recruit_job.spirit_stones_cost IS '本次招募消耗灵石';
COMMENT ON COLUMN partner_recruit_job.cooldown_started_at IS '冷却开始时间';
COMMENT ON COLUMN partner_recruit_job.finished_at IS '任务结束时间';
COMMENT ON COLUMN partner_recruit_job.viewed_at IS '结果首次被玩家查看时间';
COMMENT ON COLUMN partner_recruit_job.preview_partner_def_id IS '生成成功后的预览伙伴定义ID';

CREATE INDEX IF NOT EXISTS idx_partner_recruit_job_character_time
  ON partner_recruit_job(character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_recruit_job_status
  ON partner_recruit_job(status, created_at ASC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_recruit_job_active_character
  ON partner_recruit_job(character_id)
  WHERE status IN ('pending', 'generated_draft');
`;

export const initPartnerRecruitTables = async (): Promise<void> => {
  await query(generatedPartnerDefTableSQL);
  await query(partnerRecruitJobTableSQL);
  await query(`
    ALTER TABLE partner_recruit_job
    ADD COLUMN IF NOT EXISTS quality_rolled VARCHAR(8)
  `);
  await query(`
    UPDATE partner_recruit_job
    SET quality_rolled = '黄'
    WHERE quality_rolled IS NULL OR quality_rolled = ''
  `);
  await query(`
    ALTER TABLE partner_recruit_job
    ALTER COLUMN quality_rolled SET NOT NULL
  `);
  await query(partnerRecruitJobCommentAndIndexSQL);
  console.log('✓ AI 伙伴招募表检测完成');
};
