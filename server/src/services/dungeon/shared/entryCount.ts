/**
 * 秘境进入次数统计
 *
 * 作用：管理秘境日/周进入次数的查询、预检查与扣减。
 * 不做什么：不包含业务流程编排，仅负责计数维度的 CRUD。
 *
 * 输入：characterId + dungeonId + 限制值。
 * 输出：剩余次数统计 / 是否允许进入 / void（扣减后无返回）。
 *
 * 复用点：definitions.ts（预览时查剩余次数）、combat.ts（开战前校验并扣减）。
 *
 * 边界条件：
 * 1) 日/周重置逻辑通过 last_daily_reset / last_weekly_reset 判断，时区以服务器为准。
 * 2) dailyLimit <= 0 表示不限，不执行检查。
 */

import { query } from '../../../config/database.js';
import { asNumber } from './typeUtils.js';

/** 获取秘境日/周剩余进入次数 */
export const getDungeonEntryRemaining = async (
  characterId: number,
  dungeonId: string,
  dailyLimit: number,
  weeklyLimit: number
): Promise<{
  daily_limit: number;
  weekly_limit: number;
  daily_used: number;
  weekly_used: number;
  daily_remaining: number | null;
  weekly_remaining: number | null;
}> => {
  const res = await query(
    `SELECT daily_count, weekly_count, last_daily_reset, last_weekly_reset FROM dungeon_entry_count WHERE character_id = $1 AND dungeon_id = $2 LIMIT 1`,
    [characterId, dungeonId]
  );
  const row = (res.rows[0] ?? null) as Record<string, unknown> | null;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const day = row?.last_daily_reset instanceof Date ? row.last_daily_reset.toISOString().slice(0, 10) : String(row?.last_daily_reset ?? '');
  const dailyUsed = day === todayStr ? asNumber(row?.daily_count, 0) : 0;

  const weekStart = new Date(today);
  const weekday = weekStart.getDay();
  const diffToMonday = (weekday + 6) % 7;
  weekStart.setDate(weekStart.getDate() - diffToMonday);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const lastWeekResetStr =
    row?.last_weekly_reset instanceof Date ? row.last_weekly_reset.toISOString().slice(0, 10) : String(row?.last_weekly_reset ?? '');
  const weeklyUsed = lastWeekResetStr && lastWeekResetStr >= weekStartStr ? asNumber(row?.weekly_count, 0) : 0;

  return {
    daily_limit: dailyLimit,
    weekly_limit: weeklyLimit,
    daily_used: dailyUsed,
    weekly_used: weeklyUsed,
    daily_remaining: dailyLimit > 0 ? Math.max(0, dailyLimit - dailyUsed) : null,
    weekly_remaining: weeklyLimit > 0 ? Math.max(0, weeklyLimit - weeklyUsed) : null,
  };
};

/** 预检查进入权限：upsert 计数行、自动重置过期计数、检查是否超限 */
export const touchEntryCount = async (
  characterId: number,
  dungeonId: string,
  dailyLimit: number,
  weeklyLimit: number
): Promise<{ ok: true } | { ok: false; message: string }> => {
  if (dailyLimit <= 0 && weeklyLimit <= 0) return { ok: true };

  const res = await query(
    `
      INSERT INTO dungeon_entry_count (character_id, dungeon_id, daily_count, weekly_count, total_count, last_daily_reset, last_weekly_reset)
      VALUES ($1, $2, 0, 0, 0, CURRENT_DATE, CURRENT_DATE)
      ON CONFLICT (character_id, dungeon_id) DO NOTHING
    `,
    [characterId, dungeonId]
  );
  void res;

  await query(
    `
      UPDATE dungeon_entry_count
      SET
        daily_count = CASE WHEN last_daily_reset IS DISTINCT FROM CURRENT_DATE THEN 0 ELSE daily_count END,
        weekly_count = CASE WHEN last_weekly_reset IS NULL OR last_weekly_reset < date_trunc('week', CURRENT_DATE)::date THEN 0 ELSE weekly_count END,
        last_daily_reset = COALESCE(last_daily_reset, CURRENT_DATE),
        last_weekly_reset = COALESCE(last_weekly_reset, CURRENT_DATE)
      WHERE character_id = $1 AND dungeon_id = $2
    `,
    [characterId, dungeonId]
  );

  const cntRes = await query(
    `SELECT daily_count, weekly_count FROM dungeon_entry_count WHERE character_id = $1 AND dungeon_id = $2 LIMIT 1`,
    [characterId, dungeonId]
  );
  const dailyCount = asNumber(cntRes.rows?.[0]?.daily_count, 0);
  const weeklyCount = asNumber(cntRes.rows?.[0]?.weekly_count, 0);

  if (dailyLimit > 0 && dailyCount >= dailyLimit) return { ok: false, message: '今日进入次数已达上限' };
  if (weeklyLimit > 0 && weeklyCount >= weeklyLimit) return { ok: false, message: '本周进入次数已达上限' };
  return { ok: true };
};

/** 扣减进入次数（日/周/总各 +1） */
export const incEntryCount = async (characterId: number, dungeonId: string): Promise<void> => {
  await query(
    `
      UPDATE dungeon_entry_count
      SET
        daily_count = daily_count + 1,
        weekly_count = weekly_count + 1,
        total_count = total_count + 1
      WHERE character_id = $1 AND dungeon_id = $2
    `,
    [characterId, dungeonId]
  );
};
