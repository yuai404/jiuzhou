/**
 * 分解规则
 */

export const QUALITY_RANK_MAP: Record<string, number> = {
  黄: 1,
  玄: 2,
  地: 3,
  天: 4,
};

export const clampQualityRank = (value: unknown, fallback: number = 1): number => {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(1, Math.min(4, n));
};

export const resolveQualityRank = (quality: unknown): number => {
  const key = String(quality || '').trim();
  return QUALITY_RANK_MAP[key] || 0;
};

export const resolveDisassembleRewardItemDefIdByQualityRank = (qualityRank: number): string | null => {
  if (qualityRank >= 1 && qualityRank <= 2) return 'enhance-001';
  if (qualityRank >= 3 && qualityRank <= 4) return 'enhance-002';
  return null;
};

export const resolveDisassembleRewardItemDefIdByQuality = (quality: unknown): string | null => {
  return resolveDisassembleRewardItemDefIdByQualityRank(resolveQualityRank(quality));
};

export type TechniqueBookDisassembleReward = {
  itemDefId: string;
  qty: number;
};

const TECHNIQUE_BOOK_REWARD_QTY_BY_QUALITY_RANK: Record<number, number> = {
  1: 3,
  2: 6,
  3: 12,
  4: 24,
};

export const resolveTechniqueBookDisassembleRewardByQualityRank = (
  qualityRank: number
): TechniqueBookDisassembleReward | null => {
  const safeRank = clampQualityRank(qualityRank, 0);
  const qty = TECHNIQUE_BOOK_REWARD_QTY_BY_QUALITY_RANK[safeRank];
  if (!qty) return null;
  return { itemDefId: 'mat-gongfa-canye', qty };
};

export const resolveTechniqueBookDisassembleRewardByQuality = (
  quality: unknown
): TechniqueBookDisassembleReward | null => {
  return resolveTechniqueBookDisassembleRewardByQualityRank(resolveQualityRank(quality));
};
