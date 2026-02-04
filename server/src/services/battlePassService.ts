import { query } from '../config/database.js';

export type BattlePassTaskDto = {
  id: string;
  code: string;
  name: string;
  description: string;
  taskType: 'daily' | 'weekly' | 'season';
  condition: unknown;
  targetValue: number;
  rewardExp: number;
  rewardExtra: unknown[];
  enabled: boolean;
  sortWeight: number;
  progressValue: number;
  completed: boolean;
  claimed: boolean;
};

export type BattlePassTasksOverviewDto = {
  seasonId: string;
  daily: BattlePassTaskDto[];
  weekly: BattlePassTaskDto[];
  season: BattlePassTaskDto[];
};

export const getCharacterIdByUserId = async (userId: number): Promise<number | null> => {
  try {
    const res = await query('SELECT id FROM characters WHERE user_id = $1 LIMIT 1', [userId]);
    const characterId = Number(res.rows?.[0]?.id);
    if (!Number.isFinite(characterId) || characterId <= 0) return null;
    return characterId;
  } catch {
    return null;
  }
};

export const getActiveBattlePassSeasonId = async (now: Date = new Date()): Promise<string | null> => {
  try {
    const res = await query(
      `
        SELECT id
        FROM battle_pass_season_def
        WHERE enabled = true
          AND start_at <= $1
          AND end_at > $1
        ORDER BY sort_weight DESC, start_at DESC
        LIMIT 1
      `,
      [now.toISOString()],
    );
    const seasonId = String(res.rows?.[0]?.id || '');
    return seasonId || null;
  } catch {
    return null;
  }
};

export const getFallbackBattlePassSeasonId = async (): Promise<string | null> => {
  try {
    const res = await query(
      `
        SELECT id
        FROM battle_pass_season_def
        WHERE enabled = true
        ORDER BY sort_weight DESC, start_at DESC
        LIMIT 1
      `,
    );
    const seasonId = String(res.rows?.[0]?.id || '');
    return seasonId || null;
  } catch {
    return null;
  }
};

export const getBattlePassTasksOverview = async (userId: number, seasonId?: string): Promise<BattlePassTasksOverviewDto> => {
  const resolvedSeasonId =
    (typeof seasonId === 'string' && seasonId.trim() ? seasonId.trim() : null) ??
    (await getActiveBattlePassSeasonId()) ??
    (await getFallbackBattlePassSeasonId()) ??
    '';

  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) {
    return { seasonId: resolvedSeasonId, daily: [], weekly: [], season: [] };
  }

  if (!resolvedSeasonId) {
    return { seasonId: '', daily: [], weekly: [], season: [] };
  }

  const res = await query(
    `
      SELECT
        d.id,
        d.code,
        d.name,
        COALESCE(d.description, '') AS description,
        d.task_type,
        d.condition,
        d.target_value,
        d.reward_exp,
        d.reward_extra,
        d.enabled,
        d.sort_weight,
        COALESCE(p.progress_value, 0) AS progress_value,
        COALESCE(p.completed, false) AS completed,
        COALESCE(p.claimed, false) AS claimed
      FROM battle_pass_task_def d
      LEFT JOIN battle_pass_task_progress p
        ON p.task_id = d.id
       AND p.season_id = d.season_id
       AND p.character_id = $2
      WHERE d.season_id = $1
        AND d.enabled = true
      ORDER BY d.task_type ASC, d.sort_weight DESC, d.id ASC
    `,
    [resolvedSeasonId, characterId],
  );

  const rows: BattlePassTaskDto[] = (res.rows ?? []).map((r) => ({
    id: String(r.id || ''),
    code: String(r.code || ''),
    name: String(r.name || ''),
    description: String(r.description || ''),
    taskType: (String(r.task_type || 'daily') as BattlePassTaskDto['taskType']) ?? 'daily',
    condition: r.condition ?? {},
    targetValue: Number.isFinite(Number(r.target_value)) ? Number(r.target_value) : 1,
    rewardExp: Number.isFinite(Number(r.reward_exp)) ? Number(r.reward_exp) : 0,
    rewardExtra: Array.isArray(r.reward_extra) ? r.reward_extra : (() => {
      try {
        return typeof r.reward_extra === 'string' ? (JSON.parse(r.reward_extra) as unknown[]) : [];
      } catch {
        return [];
      }
    })(),
    enabled: r.enabled !== false,
    sortWeight: Number.isFinite(Number(r.sort_weight)) ? Number(r.sort_weight) : 0,
    progressValue: Number.isFinite(Number(r.progress_value)) ? Number(r.progress_value) : 0,
    completed: r.completed === true,
    claimed: r.claimed === true,
  }));

  return {
    seasonId: resolvedSeasonId,
    daily: rows.filter((x) => x.taskType === 'daily'),
    weekly: rows.filter((x) => x.taskType === 'weekly'),
    season: rows.filter((x) => x.taskType === 'season'),
  };
};

