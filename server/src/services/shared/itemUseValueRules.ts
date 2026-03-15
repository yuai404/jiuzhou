/**
 * 道具使用数值规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一处理道具使用时的固定值/随机区间数值结算，并把 `heal` / `resource` 效果映射成角色资源增量。
 * 2. 不做什么：不处理数据库写入、不扣除道具、不执行掉落/解绑/扩容等副作用。
 *
 * 输入/输出：
 * - 输入：单条 use effect、使用数量、可选随机整数函数。
 * - 输出：本次使用累计后的资源增量（气血/灵气/体力/经验）。
 *
 * 数据流/状态流：
 * - item_def.effect_defs -> itemService.useItem -> resolveItemUseResourceDelta / rollItemUseAmount -> 角色资源更新服务。
 *
 * 关键边界条件与坑点：
 * 1. `min/max` 需要按“每次使用独立随机，再累计总值”处理，不能简单用一次区间乘以数量，否则多次使用会失真。
 * 2. 只有 `trigger=use` 且 `target=self` 的即时资源效果才会在这里生效，避免把其他用途的 effect 混进来。
 */

export type ItemUseEffectParams = {
  resource?: string;
  resource_type?: string;
  min?: number | string;
  max?: number | string;
};

export type ItemUseEffectLike = {
  trigger?: string;
  target?: string;
  effect_type?: string;
  value?: number | string;
  params?: ItemUseEffectParams | null;
};

export type ItemUseResourceDelta = {
  qixue: number;
  lingqi: number;
  stamina: number;
  exp: number;
};

type RollRandomInt = (min: number, max: number) => number;

const EMPTY_DELTA: ItemUseResourceDelta = {
  qixue: 0,
  lingqi: 0,
  stamina: 0,
  exp: 0,
};

const toFiniteNumber = (value: number | string | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  return parsed;
};

const toNonNegativeInt = (value: number | string | undefined): number | null => {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return null;
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : null;
};

const normalizeQty = (qty: number): number => {
  const normalized = Math.floor(Number(qty) || 0);
  return normalized > 0 ? normalized : 1;
};

const defaultRollRandomInt: RollRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const rollItemUseAmount = (
  options: {
    qty: number;
    value?: number | string;
    min?: number | string;
    max?: number | string;
  },
  rollRandomInt: RollRandomInt = defaultRollRandomInt,
): number => {
  const safeQty = normalizeQty(options.qty);
  const min = toNonNegativeInt(options.min);
  const max = toNonNegativeInt(options.max);

  if (min !== null && max !== null) {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    let total = 0;
    for (let index = 0; index < safeQty; index += 1) {
      total += rollRandomInt(lower, upper);
    }
    return total;
  }

  const value = toFiniteNumber(options.value);
  if (value === null) return 0;
  return Math.max(0, Math.floor(value * safeQty));
};

export const resolveItemUseResourceDelta = (
  effect: ItemUseEffectLike,
  qty: number,
  rollRandomInt: RollRandomInt = defaultRollRandomInt,
): ItemUseResourceDelta => {
  if (String(effect.trigger || '') !== 'use') return EMPTY_DELTA;
  if (String(effect.target || 'self') !== 'self') return EMPTY_DELTA;

  const effectType = String(effect.effect_type || '').trim();
  const amount = rollItemUseAmount(
    {
      qty,
      value: effect.value,
      min: effect.params?.min,
      max: effect.params?.max,
    },
    rollRandomInt,
  );

  if (amount <= 0) return EMPTY_DELTA;

  if (!effectType || effectType === 'heal') {
    return { ...EMPTY_DELTA, qixue: amount };
  }

  if (effectType !== 'resource') return EMPTY_DELTA;

  const resource = String(effect.params?.resource || effect.params?.resource_type || '').trim();
  if (resource === 'qixue') return { ...EMPTY_DELTA, qixue: amount };
  if (resource === 'lingqi') return { ...EMPTY_DELTA, lingqi: amount };
  if (resource === 'stamina') return { ...EMPTY_DELTA, stamina: amount };
  if (resource === 'exp') return { ...EMPTY_DELTA, exp: amount };
  return EMPTY_DELTA;
};
