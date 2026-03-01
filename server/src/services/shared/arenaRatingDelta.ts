/**
 * 作用：
 * - 统一竞技场积分变化计算，避免在结算流程里重复实现分差规则。
 * - 采用“预期胜率 + 非对称 K 值”模型，使积分差越大时爆冷胜利加分越多。
 * - 保留原有体感基线：同分对局约为胜 +10、负 -5。
 *
 * 输入/输出：
 * - 输入：己方积分 selfRating、对手积分 opponentRating、对局结果 outcome（win/lose/draw）。
 * - 输出：本场积分变化值（整数；胜为正、负为负、平为 0）。
 *
 * 数据流/状态流：
 * - 先归一化双方积分为非负整数。
 * - 再根据分差计算 expectedWinRate（己方预期胜率）。
 * - 最后按胜负分支计算增减分并返回。
 *
 * 关键边界条件与坑点：
 * - 积分为 NaN/Infinity/负数时统一回退到默认积分，避免脏值污染结算。
 * - 极端分差下四舍五入可能出现 0，胜负分支都至少变动 1 分，避免“赢了不加/输了不掉”。
 */

export type ArenaBattleOutcome = 'win' | 'lose' | 'draw';

export const DEFAULT_ARENA_RATING = 1000;

const ELO_DIVISOR = 400;
const WIN_K = 20;
const LOSE_K = 10;

const normalizeRating = (value: number): number => {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized < 0) return DEFAULT_ARENA_RATING;
  return normalized;
};

const getExpectedWinRate = (selfRating: number, opponentRating: number): number => {
  const exponent = (opponentRating - selfRating) / ELO_DIVISOR;
  return 1 / (1 + Math.pow(10, exponent));
};

export const calculateArenaRatingDelta = (params: {
  selfRating: number;
  opponentRating: number;
  outcome: ArenaBattleOutcome;
}): number => {
  const selfRating = normalizeRating(params.selfRating);
  const opponentRating = normalizeRating(params.opponentRating);

  if (params.outcome === 'draw') return 0;

  const expectedWinRate = getExpectedWinRate(selfRating, opponentRating);

  if (params.outcome === 'win') {
    return Math.max(1, Math.round(WIN_K * (1 - expectedWinRate)));
  }

  return -Math.max(1, Math.round(LOSE_K * expectedWinRate));
};
