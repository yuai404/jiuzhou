#!/usr/bin/env tsx

/**
 * 修复生成技能中的光环宿主语义脚本。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：巡检 `generated_skill_def.effects` 中的 aura effect，找出“外层 `type/buffKey` 与 `auraEffects` 子效果整体语义冲突”的记录，并在显式 `--apply` 时批量修正。
 * 2. 做什么：统一把 `buff-aura/debuff-aura` 的判定规则复用到数据库治理链路，避免继续人工查一条改一条。
 * 3. 不做什么：不修改静态 seed，不改技能数值，不补 target，不重写 `auraEffects` 子效果结构。
 *
 * 输入 / 输出：
 * - 输入：CLI 参数 `--apply`、可选 `--limit=N`、可选 `--skill-id=...`。
 * - 输出：终端摘要、命中样本，以及在执行模式下的修复条数。
 *
 * 数据流 / 状态流：
 * `generated_skill_def.effects`
 * -> 本脚本复用共享 aura 语义规则做分类
 * -> dry-run 输出审计摘要 或 apply 事务内更新 JSONB。
 *
 * 复用设计说明：
 * - 语义判定全部复用 `shared/auraSemantic.ts`，让数据库巡检、运行时归一化保持同一口径。
 * - 更新只回写外层 `type/buffKey`，避免把数值层、升级层、子效果细节再拆成第二套修复规则。
 *
 * 关键边界条件与坑点：
 * 1. 只修“整体纯正向”或“整体纯负向”的光环；正负混合的 aura 会保留原样并在摘要里自然跳过，不能擅自选边。
 * 2. 默认 dry-run；只有显式 `--apply` 才会写库，避免脚本误触就批量改线上数据。
 */

import dotenv from 'dotenv';
import pg from 'pg';
import type { SkillEffect } from '../battle/types.js';
import {
  normalizeAuraHostEffect,
  resolveAuraHostMismatchKind,
  summarizeAuraSubEffectSemantics,
} from '../shared/auraSemantic.js';
import { resolveDatabaseConnectionString } from '../config/databaseConnection.js';

type ScriptOptions = {
  apply: boolean;
  limit: number | null;
  skillId: string | null;
};

type GeneratedSkillRow = {
  id: string;
  source_type: string;
  source_id: string;
  name: string;
  effects: SkillEffect[];
};

type AuraFixDetail = {
  effectIndex: number;
  mismatchKind: string;
  beforeType: string;
  afterType: string;
  beforeBuffKey: string;
  afterBuffKey: string;
  auraTarget: string;
  semanticSummary: ReturnType<typeof summarizeAuraSubEffectSemantics>;
};

type SkillFixPlan = {
  id: string;
  sourceType: string;
  sourceId: string;
  name: string;
  effects: SkillEffect[];
  nextEffects: SkillEffect[];
  fixes: AuraFixDetail[];
};

const DEFAULT_SAMPLE_LIMIT = 20;

const normalizeInteger = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseArgs = (argv: string[]): ScriptOptions => {
  let apply = false;
  let limit: number | null = null;
  let skillId: string | null = null;

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      limit = normalizeInteger(arg.slice('--limit='.length));
      continue;
    }
    if (arg.startsWith('--skill-id=')) {
      const value = arg.slice('--skill-id='.length).trim();
      skillId = value.length > 0 ? value : null;
    }
  }

  return { apply, limit, skillId };
};

const buildSkillFixPlan = (row: GeneratedSkillRow): SkillFixPlan | null => {
  if (!Array.isArray(row.effects) || row.effects.length <= 0) return null;

  const nextEffects = row.effects.map((effect) => ({ ...effect }));
  const fixes: AuraFixDetail[] = [];

  for (let index = 0; index < nextEffects.length; index += 1) {
    const effect = nextEffects[index];
    if (!effect || effect.buffKind !== 'aura') continue;

    const mismatchKind = resolveAuraHostMismatchKind(effect);
    if (!mismatchKind) continue;

    const normalized = normalizeAuraHostEffect(effect);
    nextEffects[index] = normalized;
    fixes.push({
      effectIndex: index,
      mismatchKind,
      beforeType: effect.type,
      afterType: normalized.type,
      beforeBuffKey: effect.buffKey ?? '',
      afterBuffKey: normalized.buffKey ?? '',
      auraTarget: effect.auraTarget ?? '',
      semanticSummary: summarizeAuraSubEffectSemantics(effect.auraEffects),
    });
  }

  if (fixes.length <= 0) return null;
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    name: row.name,
    effects: row.effects,
    nextEffects,
    fixes,
  };
};

const printSummary = (plans: SkillFixPlan[], options: ScriptOptions): void => {
  const bySourceType = new Map<string, number>();
  const byMismatchKind = new Map<string, number>();
  const byAuraTarget = new Map<string, number>();

  for (const plan of plans) {
    bySourceType.set(plan.sourceType, (bySourceType.get(plan.sourceType) ?? 0) + 1);
    for (const fix of plan.fixes) {
      byMismatchKind.set(fix.mismatchKind, (byMismatchKind.get(fix.mismatchKind) ?? 0) + 1);
      byAuraTarget.set(fix.auraTarget, (byAuraTarget.get(fix.auraTarget) ?? 0) + 1);
    }
  }

  console.log(JSON.stringify({
    mode: options.apply ? 'apply' : 'dry-run',
    skillIdFilter: options.skillId,
    limit: options.limit,
    mismatchSkillCount: plans.length,
    mismatchAuraEffectCount: plans.reduce((sum, plan) => sum + plan.fixes.length, 0),
    bySourceType: Object.fromEntries(bySourceType),
    byMismatchKind: Object.fromEntries(byMismatchKind),
    byAuraTarget: Object.fromEntries(byAuraTarget),
  }, null, 2));

  const sample = plans.slice(0, DEFAULT_SAMPLE_LIMIT).map((plan) => ({
    id: plan.id,
    sourceType: plan.sourceType,
    sourceId: plan.sourceId,
    name: plan.name,
    fixes: plan.fixes,
  }));
  console.log(JSON.stringify({ sample }, null, 2));
};

async function main(): Promise<void> {
  dotenv.config();
  const options = parseArgs(process.argv.slice(2));
  const { Client } = pg;
  const client = new Client({
    connectionString: resolveDatabaseConnectionString(process.env),
  });

  await client.connect();

  try {
    const params: string[] = [];
    let whereSql = `
      where exists (
        select 1
        from jsonb_array_elements(s.effects::jsonb) effect
        where coalesce(effect->>'buffKind', '') = 'aura'
      )
    `;

    if (options.skillId) {
      params.push(options.skillId);
      whereSql += ` and s.id = $${params.length}`;
    }

    const limitSql = options.limit ? ` limit ${options.limit}` : '';
    const result = await client.query<GeneratedSkillRow>(`
      select
        s.id,
        s.source_type,
        s.source_id,
        s.name,
        s.effects
      from generated_skill_def s
      ${whereSql}
      order by s.updated_at desc
      ${limitSql}
    `, params);

    const plans = result.rows
      .map((row) => buildSkillFixPlan(row))
      .filter((plan): plan is SkillFixPlan => plan !== null);

    printSummary(plans, options);

    if (!options.apply || plans.length <= 0) {
      return;
    }

    await client.query('BEGIN');
    for (const plan of plans) {
      await client.query(
        `
          update generated_skill_def
          set effects = $2::jsonb,
              updated_at = now()
          where id = $1
        `,
        [plan.id, JSON.stringify(plan.nextEffects)],
      );
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({ updatedSkillCount: plans.length }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // 这里只做回滚兜底日志，不覆盖主异常。
    }
    throw error;
  } finally {
    await client.end();
  }
}

void main();
