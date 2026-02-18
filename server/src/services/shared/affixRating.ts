/**
 * 副属性 Rating 体系工具（WoW 风格）
 *
 * 作用：
 * 1) 定义副属性从百分比 <-> rating 的统一换算；
 * 2) 定义“境界档位 -> 有效等级”的统一映射；
 * 3) 提供 rating 属性键的解析工具（如 baoji_rating -> baoji）。
 *
 * 约束：
 * - 仅对“比率类属性”生效（命中/闪避/暴击/增伤等）；
 * - 公式使用连续函数，确保单调递增且边际收益递减；
 * - 不在此处做战斗硬上限，硬上限仍由战斗常量层兜底。
 */

import { isRatioAttrKey } from './affixModifier.js';
import { getRealmRankOneBasedStrict } from './realmRules.js';

interface RatingCurveConfig {
  /** 理论上限系数，影响曲线天花板形状（不是战斗硬上限） */
  k: number;
  /** 1级时的基础换算难度 */
  s0: number;
  /** 每提升1级，有效难度增长率 */
  growth: number;
}

const RATING_SUFFIX = '_rating';

/**
 * rating 数值放大系数：
 * - 让落地的 rating 更接近 MMO 常见“整数点数”体验；
 * - 换算时会自动缩放回连续值。
 */
const RATING_POINT_SCALE = 100;

const REALM_MIN_RANK = 1;
const REALM_MAX_RANK = 13;
const EFFECTIVE_LEVEL_BASE = 1;
const EFFECTIVE_LEVEL_STEP_PER_REALM = 7;

const DEFAULT_CURVE: RatingCurveConfig = {
  k: 1,
  s0: 120,
  growth: 0.012,
};

const CURVE_BY_ATTR_KEY: Record<string, RatingCurveConfig> = {
  // 爆伤天生可高于 100%，给更大的曲线空间。
  baoshang: { k: 2.5, s0: 140, growth: 0.012 },
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const clampInt = (value: number, min: number, max: number): number => {
  const n = Number.isFinite(value) ? Math.floor(value) : min;
  return Math.max(min, Math.min(max, n));
};

const roundRatio = (value: number): number => {
  return Math.round(value * 1_000_000) / 1_000_000;
};

const getCurveConfig = (attrKeyRaw: unknown): RatingCurveConfig => {
  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw.trim() : '';
  if (!attrKey) return DEFAULT_CURVE;
  return CURVE_BY_ATTR_KEY[attrKey] ?? DEFAULT_CURVE;
};

const getScaleByEffectiveLevel = (curve: RatingCurveConfig, effectiveLevelRaw: unknown): number => {
  const level = clampInt(toFiniteNumber(effectiveLevelRaw, 1), 1, 999);
  const multiplier = 1 + Math.max(0, level - 1) * curve.growth;
  return Math.max(1e-9, curve.s0 * multiplier);
};

const normalizeRatingValue = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value);
  if (rounded !== 0) return rounded;
  return value > 0 ? 1 : value < 0 ? -1 : 0;
};

/** 根据角色境界档位，计算用于 rating 换算的“有效等级”。 */
export const getEffectiveLevelByRealmRank = (realmRankRaw: unknown): number => {
  const rank = clampInt(toFiniteNumber(realmRankRaw, 1), REALM_MIN_RANK, REALM_MAX_RANK);
  return EFFECTIVE_LEVEL_BASE + (rank - REALM_MIN_RANK) * EFFECTIVE_LEVEL_STEP_PER_REALM;
};

/** 根据角色境界文本，计算有效等级。 */
export const getEffectiveLevelByRealm = (realmRaw: unknown, subRealmRaw?: unknown): number => {
  const rank = getRealmRankOneBasedStrict(realmRaw, subRealmRaw);
  return getEffectiveLevelByRealmRank(rank);
};

/** 主属性键 -> rating 键。 */
export const toRatingAttrKey = (attrKeyRaw: unknown): string | null => {
  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw.trim() : '';
  if (!attrKey) return null;
  return `${attrKey}${RATING_SUFFIX}`;
};

/** rating 键 -> 主属性键（失败时返回 null）。 */
export const resolveRatingBaseAttrKey = (attrKeyRaw: unknown): string | null => {
  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw.trim() : '';
  if (!attrKey || !attrKey.endsWith(RATING_SUFFIX)) return null;
  const base = attrKey.slice(0, -RATING_SUFFIX.length).trim();
  return base.length > 0 ? base : null;
};

/** 判断一个属性键是否是 rating 键。 */
export const isRatingAttrKey = (attrKeyRaw: unknown): boolean => {
  return resolveRatingBaseAttrKey(attrKeyRaw) !== null;
};

/**
 * 百分比 -> rating
 *
 * 说明：
 * - 输入百分比采用系统内比率格式（0.1 表示 10%）。
 * - 返回值是整型 rating 点数（可正可负）。
 */
export const convertPercentToRating = (
  attrKeyRaw: unknown,
  percentRaw: unknown,
  effectiveLevelRaw: unknown,
): number => {
  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw.trim() : '';
  if (!attrKey || !isRatioAttrKey(attrKey)) return 0;

  const percent = toFiniteNumber(percentRaw, 0);
  if (!Number.isFinite(percent) || percent === 0) return 0;

  const sign = percent < 0 ? -1 : 1;
  const absPercent = Math.abs(percent);
  const curve = getCurveConfig(attrKey);
  const maxPercent = Math.max(1e-9, curve.k * (1 - 1e-9));
  const cappedPercent = Math.min(absPercent, maxPercent);
  const scale = getScaleByEffectiveLevel(curve, effectiveLevelRaw);

  const ratio = 1 - cappedPercent / curve.k;
  const safeRatio = Math.max(1e-9, ratio);
  const normalizedRating = -scale * Math.log(safeRatio);
  const points = normalizedRating * RATING_POINT_SCALE;
  return normalizeRatingValue(points) * sign;
};

/**
 * rating -> 百分比
 *
 * 说明：
 * - 输入 rating 为点数（整数）；
 * - 输出为系统内比率格式（0.1 表示 10%）。
 */
export const convertRatingToPercent = (
  attrKeyRaw: unknown,
  ratingRaw: unknown,
  effectiveLevelRaw: unknown,
): number => {
  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw.trim() : '';
  if (!attrKey || !isRatioAttrKey(attrKey)) return 0;

  const rating = toFiniteNumber(ratingRaw, 0);
  if (!Number.isFinite(rating) || rating === 0) return 0;

  const sign = rating < 0 ? -1 : 1;
  const absRating = Math.abs(rating);
  const normalizedRating = absRating / RATING_POINT_SCALE;
  const curve = getCurveConfig(attrKey);
  const scale = getScaleByEffectiveLevel(curve, effectiveLevelRaw);

  const percent = curve.k * (1 - Math.exp(-normalizedRating / scale));
  return roundRatio(percent * sign);
};
