/**
 * 功法技能升级后属性共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一解析技能 upgrades，并计算某个 upgradeLevel 下的有效消耗、冷却、目标数、效果与 AI 优先级。
 * 2. 做什么：为战斗链路与功法面板提供同一套“升级后技能属性”口径，避免展示和实战各算一套。
 * 3. 不做什么：不读取角色槽位、不判断技能是否解锁，也不执行战斗逻辑。
 *
 * 输入/输出：
 * - 输入：`SkillDefConfig` 与技能升级层数 `upgradeLevel`。
 * - 输出：升级后的技能核心战斗数据，可直接供战斗构建或前端状态接口复用。
 *
 * 数据流/状态流：
 * skill_def/generated_skill_def + upgrades -> 本模块统一应用增量 -> 战斗技能组装 / 功法状态接口。
 *
 * 关键边界条件与坑点：
 * 1. upgrades 必须按 layer 升序后再截取到 `upgradeLevel`，否则多层强化会因为顺序漂移导致冷却和效果错位。
 * 2. 效果整包替换时必须保留基础伤害 effect；否则只做附加效果强化的技能会被错误洗掉主伤害。
 */
import type { SkillEffect } from '../../battle/types.js';
import type { SkillData } from '../../battle/battleFactory.js';
import type { SkillDefConfig } from '../staticConfigLoader.js';
import { normalizeSkillCost } from '../../shared/skillCost.js';

export type TechniqueSkillUpgradeRule = {
  layer: number;
  changes: Record<string, unknown>;
};

export type EffectiveTechniqueSkillData = Pick<
  SkillData,
  | 'cost_lingqi'
  | 'cost_lingqi_rate'
  | 'cost_qixue'
  | 'cost_qixue_rate'
  | 'cooldown'
  | 'target_count'
  | 'effects'
  | 'ai_priority'
>;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toRecord = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

export function cloneSkillEffectList(raw: unknown): SkillEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: SkillEffect[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    out.push({ ...(row as SkillEffect) });
  }
  return out;
}

function isDamageEffect(effect: unknown): effect is Record<string, unknown> {
  return Boolean(
    effect
    && typeof effect === 'object'
    && !Array.isArray(effect)
    && (effect as Record<string, unknown>).type === 'damage',
  );
}

const SKILL_EFFECT_TYPE_SET = new Set<SkillEffect['type']>([
  'damage',
  'heal',
  'shield',
  'buff',
  'debuff',
  'dispel',
  'resource',
  'restore_lingqi',
  'cleanse',
  'cleanse_control',
  'lifesteal',
  'control',
  'mark',
  'momentum',
  'delayed_burst',
  'fate_swap',
]);

function toSkillEffectRecord(effect: Record<string, unknown>): SkillEffect | null {
  const type = effect.type;
  if (typeof type !== 'string' || !SKILL_EFFECT_TYPE_SET.has(type as SkillEffect['type'])) {
    return null;
  }
  const skillEffect: SkillEffect = { type: type as SkillEffect['type'] };
  Object.assign(skillEffect, effect);
  skillEffect.type = type as SkillEffect['type'];
  return skillEffect;
}

function findFirstDamageEffect(effects: SkillEffect[]): SkillEffect | null {
  for (const effect of effects) {
    if (isDamageEffect(effect)) return toSkillEffectRecord(effect);
  }
  return null;
}

function hasDamageEffect(effects: SkillEffect[]): boolean {
  return effects.some((effect) => isDamageEffect(effect));
}

export function parseSkillUpgradeRules(raw: unknown): TechniqueSkillUpgradeRule[] {
  if (!Array.isArray(raw)) return [];
  const rules: TechniqueSkillUpgradeRule[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const row = toRecord(raw[index]);
    const changes = toRecord(row.changes);
    if (Object.keys(changes).length === 0) continue;
    const parsedLayer = toNumber(row.layer);
    const layer = Math.max(1, Math.floor(parsedLayer ?? index + 1));
    rules.push({ layer, changes });
  }
  rules.sort((left, right) => left.layer - right.layer);
  return rules;
}

export function applySkillUpgradeChanges(
  base: EffectiveTechniqueSkillData,
  changes: Record<string, unknown>,
): void {
  const preservedDamageEffect = findFirstDamageEffect(base.effects);

  const targetCount = toNumber(changes.target_count);
  if (targetCount !== null) {
    base.target_count = Math.max(1, Math.floor(targetCount));
  }

  const cooldownDelta = toNumber(changes.cooldown);
  if (cooldownDelta !== null) {
    base.cooldown = Math.max(0, Math.floor(base.cooldown + cooldownDelta));
  }

  const costLingqiDelta = toNumber(changes.cost_lingqi);
  if (costLingqiDelta !== null) {
    base.cost_lingqi = Math.max(0, Math.floor(base.cost_lingqi + costLingqiDelta));
  }
  const costLingqiRateDelta = toNumber(changes.cost_lingqi_rate);
  if (costLingqiRateDelta !== null) {
    base.cost_lingqi_rate = Math.max(0, base.cost_lingqi_rate + costLingqiRateDelta);
  }

  const costQixueDelta = toNumber(changes.cost_qixue);
  if (costQixueDelta !== null) {
    base.cost_qixue = Math.max(0, Math.floor(base.cost_qixue + costQixueDelta));
  }
  const costQixueRateDelta = toNumber(changes.cost_qixue_rate);
  if (costQixueRateDelta !== null) {
    base.cost_qixue_rate = Math.max(0, base.cost_qixue_rate + costQixueRateDelta);
  }

  const aiPriorityDelta = toNumber(changes.ai_priority);
  if (aiPriorityDelta !== null) {
    base.ai_priority = Math.max(0, Math.floor(base.ai_priority + aiPriorityDelta));
  }

  if (Array.isArray(changes.effects)) {
    const nextEffects = cloneSkillEffectList(changes.effects);
    if (preservedDamageEffect && !hasDamageEffect(nextEffects)) {
      nextEffects.unshift({ ...preservedDamageEffect });
    }
    base.effects = nextEffects;
  }

  const addEffect = changes.addEffect;
  if (
    addEffect
    && typeof addEffect === 'object'
    && !Array.isArray(addEffect)
  ) {
    const skillEffect = toSkillEffectRecord(addEffect as Record<string, unknown>);
    if (!skillEffect) return;
    base.effects = [
      ...base.effects,
      skillEffect,
    ];
  }
}

export function buildEffectiveTechniqueSkillData(
  row: SkillDefConfig,
  upgradeLevel: number = 0,
): EffectiveTechniqueSkillData {
  const cost = normalizeSkillCost(row);
  const effective: EffectiveTechniqueSkillData = {
    cost_lingqi: cost.lingqi ?? 0,
    cost_lingqi_rate: cost.lingqiRate ?? 0,
    cost_qixue: cost.qixue ?? 0,
    cost_qixue_rate: cost.qixueRate ?? 0,
    cooldown: Math.max(0, Math.floor(Number(row.cooldown ?? 0) || 0)),
    target_count: Math.max(1, Math.floor(Number(row.target_count ?? 1) || 1)),
    effects: cloneSkillEffectList(row.effects),
    ai_priority: Math.max(0, Math.floor(Number(row.ai_priority ?? 50) || 50)),
  };

  const normalizedUpgradeLevel = Math.max(0, Math.floor(upgradeLevel));
  if (normalizedUpgradeLevel <= 0) {
    return effective;
  }

  const rules = parseSkillUpgradeRules(row.upgrades);
  const applyRules = rules.slice(0, normalizedUpgradeLevel);
  for (const rule of applyRules) {
    applySkillUpgradeChanges(effective, rule.changes);
  }

  return effective;
}
