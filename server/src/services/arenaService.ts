import { query } from '../config/database.js';

const MAX_DAILY_CHALLENGES = 20;
const DEFAULT_RATING = 1000;

const computePower = (row: any): number => {
  const wugong = Number(row?.wugong ?? 0) || 0;
  const fagong = Number(row?.fagong ?? 0) || 0;
  const wufang = Number(row?.wufang ?? 0) || 0;
  const fafang = Number(row?.fafang ?? 0) || 0;
  const maxQixue = Number(row?.max_qixue ?? 0) || 0;
  const maxLingqi = Number(row?.max_lingqi ?? 0) || 0;
  const sudu = Number(row?.sudu ?? 0) || 0;
  return wugong + fagong + wufang + fafang + maxQixue + maxLingqi + sudu;
};

const ensureRatingRow = async (characterId: number): Promise<void> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return;
  await query(
    `INSERT INTO arena_rating(character_id, rating)
     VALUES ($1, $2)
     ON CONFLICT (character_id) DO NOTHING`,
    [id, DEFAULT_RATING]
  );
};

const getTodayChallengeCount = async (characterId: number): Promise<number> => {
  const id = Number(characterId);
  if (!Number.isFinite(id) || id <= 0) return 0;
  const res = await query(
    `
      SELECT COUNT(*)::int AS cnt
      FROM arena_battle
      WHERE challenger_character_id = $1
        AND created_at >= date_trunc('day', NOW())
    `,
    [id]
  );
  return Number(res.rows?.[0]?.cnt ?? 0) || 0;
};

export type ArenaStatus = {
  score: number;
  winCount: number;
  loseCount: number;
  todayUsed: number;
  todayLimit: number;
  todayRemaining: number;
};

export const getArenaStatus = async (
  characterId: number
): Promise<{ success: boolean; message: string; data?: ArenaStatus }> => {
  try {
    const id = Number(characterId);
    if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

    await ensureRatingRow(id);
    const ratingRes = await query(
      `SELECT rating, win_count, lose_count FROM arena_rating WHERE character_id = $1`,
      [id]
    );
    if (ratingRes.rows.length === 0) return { success: false, message: '竞技场数据异常' };

    const row = ratingRes.rows[0] as any;
    const score = Number(row.rating ?? DEFAULT_RATING) || DEFAULT_RATING;
    const winCount = Number(row.win_count ?? 0) || 0;
    const loseCount = Number(row.lose_count ?? 0) || 0;

    const used = await getTodayChallengeCount(id);
    const remaining = Math.max(0, MAX_DAILY_CHALLENGES - used);

    return {
      success: true,
      message: 'ok',
      data: {
        score,
        winCount,
        loseCount,
        todayUsed: used,
        todayLimit: MAX_DAILY_CHALLENGES,
        todayRemaining: remaining,
      },
    };
  } catch (error) {
    console.error('获取竞技场状态失败:', error);
    return { success: false, message: '获取竞技场状态失败' };
  }
};

export type ArenaOpponent = {
  id: number;
  name: string;
  realm: string;
  power: number;
  score: number;
};

export const getArenaOpponents = async (
  characterId: number,
  limit: number = 10
): Promise<{ success: boolean; message: string; data?: ArenaOpponent[] }> => {
  try {
    const id = Number(characterId);
    if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

    const l = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
    const charRes = await query(
      `SELECT id, nickname, realm, wugong, fagong, wufang, fafang, max_qixue, max_lingqi, sudu FROM characters WHERE id = $1`,
      [id]
    );
    if (charRes.rows.length === 0) return { success: false, message: '角色不存在' };
    const me = charRes.rows[0] as any;
    const myPower = Math.max(1, computePower(me));
    const ranges = [
      { min: 0.8, max: 1.2 },
      { min: 0.6, max: 1.4 },
      { min: 0.4, max: 1.6 },
      { min: 0.2, max: 2.0 },
      { min: 0.0, max: 2147483647 },
    ];

    const sql = `
      SELECT
        c.id,
        COALESCE(NULLIF(c.nickname, ''), CONCAT('修士', c.id::text)) AS nickname,
        c.realm,
        (
          COALESCE(c.wugong, 0)
          + COALESCE(c.fagong, 0)
          + COALESCE(c.wufang, 0)
          + COALESCE(c.fafang, 0)
          + COALESCE(c.max_qixue, 0)
          + COALESCE(c.max_lingqi, 0)
          + COALESCE(c.sudu, 0)
        )::int AS power,
        COALESCE(ar.rating, $4)::int AS score
      FROM characters c
      LEFT JOIN arena_rating ar ON ar.character_id = c.id
      WHERE c.id <> $1
        AND (
          COALESCE(c.wugong, 0)
          + COALESCE(c.fagong, 0)
          + COALESCE(c.wufang, 0)
          + COALESCE(c.fafang, 0)
          + COALESCE(c.max_qixue, 0)
          + COALESCE(c.max_lingqi, 0)
          + COALESCE(c.sudu, 0)
        ) BETWEEN $2 AND $3
      ORDER BY ABS((
          COALESCE(c.wugong, 0)
          + COALESCE(c.fagong, 0)
          + COALESCE(c.wufang, 0)
          + COALESCE(c.fafang, 0)
          + COALESCE(c.max_qixue, 0)
          + COALESCE(c.max_lingqi, 0)
          + COALESCE(c.sudu, 0)
        ) - $5) ASC, score DESC, c.id ASC
      LIMIT $6
    `;

    let data: ArenaOpponent[] = [];
    for (const r of ranges) {
      const minPower = Math.max(0, Math.floor(myPower * r.min));
      const maxPower = Math.max(minPower, Math.min(2147483647, Math.ceil(myPower * r.max)));
      const oppRes = await query(sql, [id, minPower, maxPower, DEFAULT_RATING, myPower, l]);
      data = oppRes.rows.map((row: any) => ({
        id: Number(row.id),
        name: String(row.nickname ?? ''),
        realm: String(row.realm ?? '凡人'),
        power: Number(row.power ?? 0) || 0,
        score: Number(row.score ?? DEFAULT_RATING) || DEFAULT_RATING,
      }));
      if (data.length > 0) break;
    }

    return { success: true, message: 'ok', data };
  } catch (error) {
    console.error('获取竞技场对手列表失败:', error);
    return { success: false, message: '获取竞技场对手列表失败' };
  }
};

export type ArenaRecord = {
  id: string;
  ts: number;
  opponentName: string;
  opponentRealm: string;
  opponentPower: number;
  result: 'win' | 'lose' | 'draw';
  deltaScore: number;
  scoreAfter: number;
};

export const getArenaRecords = async (
  characterId: number,
  limit: number = 50
): Promise<{ success: boolean; message: string; data?: ArenaRecord[] }> => {
  try {
    const id = Number(characterId);
    if (!Number.isFinite(id) || id <= 0) return { success: false, message: '无效的角色ID' };

    const l = Math.max(1, Math.min(200, Math.floor(Number(limit) || 50)));
    const res = await query(
      `
        SELECT
          ab.battle_id,
          ab.created_at,
          ab.result,
          ab.delta_score,
          ab.score_after,
          c.nickname AS opponent_name,
          c.realm AS opponent_realm,
          (
            COALESCE(c.wugong, 0)
            + COALESCE(c.fagong, 0)
            + COALESCE(c.wufang, 0)
            + COALESCE(c.fafang, 0)
            + COALESCE(c.max_qixue, 0)
            + COALESCE(c.max_lingqi, 0)
            + COALESCE(c.sudu, 0)
          )::int AS opponent_power
        FROM arena_battle ab
        JOIN characters c ON c.id = ab.opponent_character_id
        WHERE ab.challenger_character_id = $1
          AND ab.status = 'finished'
        ORDER BY ab.created_at DESC
        LIMIT $2
      `,
      [id, l]
    );

    const data: ArenaRecord[] = res.rows.map((r: any) => ({
      id: String(r.battle_id),
      ts: new Date(r.created_at).getTime(),
      opponentName: String(r.opponent_name ?? ''),
      opponentRealm: String(r.opponent_realm ?? '凡人'),
      opponentPower: Number(r.opponent_power ?? 0) || 0,
      result: (r.result === 'win' || r.result === 'lose' || r.result === 'draw' ? r.result : 'draw') as any,
      deltaScore: Number(r.delta_score ?? 0) || 0,
      scoreAfter: Number(r.score_after ?? DEFAULT_RATING) || DEFAULT_RATING,
    }));

    return { success: true, message: 'ok', data };
  } catch (error) {
    console.error('获取竞技场战报失败:', error);
    return { success: false, message: '获取竞技场战报失败' };
  }
};

export const canChallengeToday = async (
  characterId: number
): Promise<{ allowed: boolean; remaining: number }> => {
  const used = await getTodayChallengeCount(characterId);
  const remaining = Math.max(0, MAX_DAILY_CHALLENGES - used);
  return { allowed: remaining > 0, remaining };
};
