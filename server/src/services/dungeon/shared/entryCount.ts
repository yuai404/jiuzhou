/**
 * 秘境进入次数投影工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一读写在线战斗 Redis 权威的秘境进入次数投影，供预览、开战校验、扣减次数三处复用。
 * 2. 做什么：把“日重置 / 周重置 / 扣减后统计”逻辑收敛到一个模块，避免 definitions 与 combat 各自维护口径。
 * 3. 不做什么：不直接回读 DB，也不负责异步落库。
 *
 * 输入/输出：
 * - 输入：characterId、dungeonId、日/周限制。
 * - 输出：剩余次数统计、是否允许进入，以及最新次数投影。
 *
 * 数据流/状态流：
 * - startup 预热 -> onlineBattleProjectionService 把历史次数导入 Redis；
 * - 预览 / 开战前校验 -> 本模块只读投影；
 * - 开战成功 -> 本模块递增投影，后续同链路查询直接读到最新值。
 *
 * 关键边界条件与坑点：
 * 1. 日/周重置必须只依赖当前时间与投影里的 reset 日期，不能混入 DB 当前值，否则热路径会重新回退查库。
 * 2. dailyLimit / weeklyLimit <= 0 代表不限次，只跳过上限判断，不跳过投影初始化，避免后续统计形状不一致。
 */

import {
  applyDungeonEntryProjectionIncrement,
  type DungeonEntryCountProjectionRecord,
  ensureDungeonEntryProjection,
} from '../../onlineBattleProjectionService.js';

type DungeonEntryRemaining = {
  daily_limit: number;
  weekly_limit: number;
  daily_used: number;
  weekly_used: number;
  daily_remaining: number | null;
  weekly_remaining: number | null;
};

const buildDungeonEntryRemaining = (params: {
  dailyLimit: number;
  weeklyLimit: number;
  dailyUsed: number;
  weeklyUsed: number;
}): DungeonEntryRemaining => {
  const dailyLimit = Math.max(0, Math.floor(params.dailyLimit));
  const weeklyLimit = Math.max(0, Math.floor(params.weeklyLimit));
  const dailyUsed = Math.max(0, Math.floor(params.dailyUsed));
  const weeklyUsed = Math.max(0, Math.floor(params.weeklyUsed));

  return {
    daily_limit: dailyLimit,
    weekly_limit: weeklyLimit,
    daily_used: dailyUsed,
    weekly_used: weeklyUsed,
    daily_remaining: dailyLimit > 0 ? Math.max(0, dailyLimit - dailyUsed) : null,
    weekly_remaining: weeklyLimit > 0 ? Math.max(0, weeklyLimit - weeklyUsed) : null,
  };
};

/** 获取秘境日/周剩余进入次数。 */
export const getDungeonEntryRemaining = async (
  characterId: number,
  dungeonId: string,
  dailyLimit: number,
  weeklyLimit: number,
): Promise<DungeonEntryRemaining> => {
  const projection = await ensureDungeonEntryProjection(characterId, dungeonId);
  return buildDungeonEntryRemaining({
    dailyLimit,
    weeklyLimit,
    dailyUsed: projection.dailyCount,
    weeklyUsed: projection.weeklyCount,
  });
};

/** 预检查进入权限：确保投影存在、自动完成日/周重置并判断是否超限。 */
export const touchEntryCount = async (
  characterId: number,
  dungeonId: string,
  dailyLimit: number,
  weeklyLimit: number,
): Promise<{ ok: true } | { ok: false; message: string }> => {
  const remaining = await getDungeonEntryRemaining(characterId, dungeonId, dailyLimit, weeklyLimit);
  if (remaining.daily_remaining !== null && remaining.daily_remaining <= 0) {
    return { ok: false, message: '今日进入次数已达上限' };
  }
  if (remaining.weekly_remaining !== null && remaining.weekly_remaining <= 0) {
    return { ok: false, message: '本周进入次数已达上限' };
  }
  return { ok: true };
};

/** 扣减进入次数（日/周/总各 +1）。 */
export const incEntryCount = async (
  characterId: number,
  dungeonId: string,
): Promise<DungeonEntryCountProjectionRecord> => {
  return await applyDungeonEntryProjectionIncrement(characterId, dungeonId);
};
