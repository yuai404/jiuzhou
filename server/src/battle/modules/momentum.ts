/**
 * 势能机制模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：统一处理“势”的配置解析、叠层、消耗、回合衰减与日志文案，供技能执行与 AI 生成功法共享。
 * 2) 不做什么：不负责目标选择、不直接写战斗日志、不处理技能主流程编排。
 *
 * 输入/输出：
 * - 输入：BattleUnit、技能 momentum 效果配置。
 * - 输出：解析后的配置、叠层/消耗结果，以及衰减后的势状态。
 *
 * 数据流/状态流：
 * 技能 effects[] -> resolveMomentumEffectConfig -> 读写 BattleUnit.momentum -> skill.ts / AI 约束消费。
 *
 * 关键边界条件与坑点：
 * 1) 势是施法者自身资源，不跟目标绑定，也不按来源隔离；同单位全程只有一份当前层数。
 * 2) `consume` 必须和施法流程解耦，避免 AOE 技能在逐目标结算时重复消耗同一份势。
 */
import type { ActiveMomentum, BattleUnit } from '../types.js';

export const BATTLE_MOMENTUM_ID = 'battle_momentum';
export const MOMENTUM_ID_LIST = [BATTLE_MOMENTUM_ID] as const;
export const MOMENTUM_OPERATION_LIST = ['gain', 'consume'] as const;
export const MOMENTUM_CONSUME_MODE_LIST = ['all', 'fixed'] as const;
export const MOMENTUM_BONUS_TYPE_LIST = ['damage', 'heal', 'shield', 'resource', 'all'] as const;

export type MomentumOperation = typeof MOMENTUM_OPERATION_LIST[number];
export type MomentumConsumeMode = typeof MOMENTUM_CONSUME_MODE_LIST[number];
export type MomentumBonusType = typeof MOMENTUM_BONUS_TYPE_LIST[number];

export interface ResolvedMomentumEffect {
  momentumId: string;
  operation: MomentumOperation;
  maxStacks: number;
  gainStacks: number;
  consumeMode: MomentumConsumeMode;
  consumeStacks: number;
  perStackRate: number;
  bonusType: MomentumBonusType;
}

export interface MomentumGainResult {
  gained: boolean;
  gainedStacks: number;
  totalStacks: number;
  text: string;
}

export interface MomentumConsumeResult {
  consumed: boolean;
  consumedStacks: number;
  remainingStacks: number;
  bonusRate: number;
  bonusType: MomentumBonusType;
  text: string;
}

const DEFAULT_MOMENTUM_MAX_STACKS = 5;

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const toText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.floor(toFiniteNumber(value, fallback));
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const readField = (raw: Record<string, unknown>, camel: string, snake: string): unknown => {
  if (raw[camel] !== undefined) return raw[camel];
  return raw[snake];
};

const normalizeMomentumOperation = (value: unknown): MomentumOperation | null => {
  const operation = toText(value).toLowerCase();
  if (operation === 'gain' || operation === 'consume') return operation;
  return null;
};

const normalizeMomentumConsumeMode = (value: unknown): MomentumConsumeMode => {
  const mode = toText(value).toLowerCase();
  return mode === 'fixed' ? 'fixed' : 'all';
};

const normalizeMomentumBonusType = (value: unknown): MomentumBonusType => {
  const bonusType = toText(value).toLowerCase();
  if (bonusType === 'heal') return 'heal';
  if (bonusType === 'shield') return 'shield';
  if (bonusType === 'resource') return 'resource';
  if (bonusType === 'all') return 'all';
  return 'damage';
};

export const ensureUnitMomentum = (unit: BattleUnit): ActiveMomentum => {
  if (!unit.momentum) {
    unit.momentum = {
      id: BATTLE_MOMENTUM_ID,
      stacks: 0,
      maxStacks: DEFAULT_MOMENTUM_MAX_STACKS,
    };
  }
  return unit.momentum;
};

export const resolveMomentumEffectConfig = (
  raw: Record<string, unknown>,
): ResolvedMomentumEffect | null => {
  const operation = normalizeMomentumOperation(readField(raw, 'operation', 'operation'));
  if (!operation) return null;

  return {
    momentumId: toText(readField(raw, 'momentumId', 'momentum_id')) || BATTLE_MOMENTUM_ID,
    operation,
    maxStacks: normalizePositiveInt(readField(raw, 'maxStacks', 'max_stacks'), DEFAULT_MOMENTUM_MAX_STACKS),
    gainStacks: normalizePositiveInt(
      readField(raw, 'gainStacks', 'gain_stacks')
        ?? readField(raw, 'stacks', 'stacks')
        ?? readField(raw, 'value', 'value'),
      1,
    ),
    consumeMode: normalizeMomentumConsumeMode(readField(raw, 'consumeMode', 'consume_mode')),
    consumeStacks: normalizePositiveInt(readField(raw, 'consumeStacks', 'consume_stacks'), 1),
    perStackRate: Math.max(0, toFiniteNumber(readField(raw, 'perStackRate', 'per_stack_rate'), 0)),
    bonusType: normalizeMomentumBonusType(readField(raw, 'bonusType', 'bonus_type')),
  };
};

export const gainMomentumStacks = (
  unit: BattleUnit,
  config: ResolvedMomentumEffect,
): MomentumGainResult => {
  const momentum = ensureUnitMomentum(unit);
  momentum.id = config.momentumId;
  momentum.maxStacks = Math.max(1, config.maxStacks);

  const nextStacks = Math.min(momentum.maxStacks, momentum.stacks + Math.max(1, config.gainStacks));
  const gainedStacks = Math.max(0, nextStacks - momentum.stacks);
  momentum.stacks = nextStacks;

  return {
    gained: gainedStacks > 0,
    gainedStacks,
    totalStacks: momentum.stacks,
    text: `势+${gainedStacks}（当前${momentum.stacks}层）`,
  };
};

export const consumeMomentumStacks = (
  unit: BattleUnit,
  config: ResolvedMomentumEffect,
): MomentumConsumeResult => {
  const momentum = ensureUnitMomentum(unit);
  const availableStacks = Math.max(0, momentum.stacks);
  if (availableStacks <= 0) {
    return {
      consumed: false,
      consumedStacks: 0,
      remainingStacks: 0,
      bonusRate: 0,
      bonusType: config.bonusType,
      text: '',
    };
  }

  const consumedStacks = config.consumeMode === 'fixed'
    ? Math.min(availableStacks, Math.max(1, config.consumeStacks))
    : availableStacks;
  const remainingStacks = Math.max(0, availableStacks - consumedStacks);
  momentum.stacks = remainingStacks;

  return {
    consumed: consumedStacks > 0,
    consumedStacks,
    remainingStacks,
    bonusRate: Math.max(0, consumedStacks * config.perStackRate),
    bonusType: config.bonusType,
    text: `消耗${consumedStacks}层势（剩余${remainingStacks}层）`,
  };
};

export const decayUnitMomentumAtRoundEnd = (unit: BattleUnit): void => {
  if (!unit.momentum) return;
  if (unit.momentum.stacks <= 0) return;
  unit.momentum.stacks = Math.max(0, unit.momentum.stacks - 1);
};
