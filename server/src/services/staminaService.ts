/**
 * 体力恢复服务
 *
 * 作用：
 *   管理角色体力的恢复计算与持久化。每次读取体力时根据 stamina_recover_at
 *   时间戳惰性计算已恢复量，并写回 DB。
 *
 * 输入：characterId / userId
 * 输出：StaminaRecoveryState（当前体力、恢复量、是否变更）
 *
 * 数据流：
 *   读取：Redis 缓存（staminaCacheService）→ 命中则直接返回
 *         → 未命中则查 DB → 计算恢复 → 写 DB → 回填缓存
 *   事务内（applyStaminaRecoveryTx）：始终走 DB（需行锁），提交后由调用方同步缓存
 *
 * 关键边界条件：
 *   1. Redis 不可用时自动降级到纯 DB 路径，不影响核心功能
 *   2. 事务内操作不走缓存（需要 FOR UPDATE 行锁保证一致性）
 */

import { query } from '../config/database.js';
import { getCachedStamina, setCachedStamina, toRecoveryState } from './staminaCacheService.js';
import { getCharacterIdByUserId } from './shared/characterId.js';
import {
  isOnlineBattleProjectionReady,
  setOnlineBattleCharacterStamina,
} from './onlineBattleProjectionService.js';
import {
  DEFAULT_MONTH_CARD_ID,
  getMonthCardStaminaRecoveryRate,
  normalizeMonthCardBenefitWindow,
} from './shared/monthCardBenefits.js';
import {
  calcCharacterStaminaMaxByInsightLevel,
  resolveStaminaRecoveryState,
  STAMINA_BASE_MAX,
  type StaminaRecoverySpeedWindow,
} from './shared/staminaRules.js';

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v > 0 ? v : fallback;
};

const toNonNegativeInt = (value: unknown, fallback: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = Math.floor(n);
  return v >= 0 ? v : fallback;
};

const parseTime = (value: unknown, fallbackMs: number): { ms: number; fallbackUsed: boolean } => {
  if (value instanceof Date) return { ms: value.getTime(), fallbackUsed: false };
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return { ms: parsed, fallbackUsed: false };
  }
  return { ms: fallbackMs, fallbackUsed: true };
};

export const STAMINA_MAX = STAMINA_BASE_MAX;
export const STAMINA_RECOVER_PER_TICK = toPositiveInt(process.env.STAMINA_RECOVER_PER_TICK, 1);
export const STAMINA_RECOVER_INTERVAL_SEC = toPositiveInt(process.env.STAMINA_RECOVER_INTERVAL_SEC, 300);
const STAMINA_RECOVER_INTERVAL_MS = STAMINA_RECOVER_INTERVAL_SEC * 1000;

export type StaminaRecoveryState = {
  characterId: number;
  stamina: number;
  maxStamina: number;
  recovered: number;
  changed: boolean;
  staminaRecoverAt: Date;
  recoverySpeedWindow: StaminaRecoverySpeedWindow;
};

type QueryRunner = (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
const staminaRecoveryInFlight = new Map<number, Promise<StaminaRecoveryState | null>>();

const syncOnlineBattleCharacterStaminaIfReady = async (
  characterId: number,
  stamina: number,
): Promise<void> => {
  if (!isOnlineBattleProjectionReady()) return;
  await setOnlineBattleCharacterStamina(characterId, stamina);
};

const runStaminaRecoverySingleFlight = async (
  characterId: number,
  loader: () => Promise<StaminaRecoveryState | null>,
): Promise<StaminaRecoveryState | null> => {
  const existing = staminaRecoveryInFlight.get(characterId);
  if (existing) {
    return existing;
  }

  const pending = loader().finally(() => {
    staminaRecoveryInFlight.delete(characterId);
  });
  staminaRecoveryInFlight.set(characterId, pending);
  return pending;
};

/**
 * 从 DB 行数据计算恢复并写回（内部核心逻辑，不走缓存）
 */
const applyRecoveryFromRow = async (
  runQuery: QueryRunner,
  row: Record<string, unknown>,
): Promise<StaminaRecoveryState | null> => {
  const characterId = toNonNegativeInt(row.id, 0);
  if (characterId <= 0) return null;

  const nowMs = Date.now();
  const rawStamina = toNonNegativeInt(row.stamina, 0);
  const insightLevel = toNonNegativeInt(row.insight_level, 0);
  const staminaMax = calcCharacterStaminaMaxByInsightLevel(insightLevel);
  const currentStamina = Math.min(staminaMax, rawStamina);
  const parsedRecoverAt = parseTime(row.stamina_recover_at, nowMs);
  const recoverySpeedWindow = normalizeMonthCardBenefitWindow(
    row.month_card_start_at as Date | string | number | null | undefined,
    row.month_card_expire_at as Date | string | number | null | undefined,
  );
  const recoveryResult = resolveStaminaRecoveryState({
    stamina: currentStamina,
    maxStamina: staminaMax,
    recoverAtMs: parsedRecoverAt.ms,
    nowMs,
    recoverPerTick: STAMINA_RECOVER_PER_TICK,
    recoverIntervalMs: STAMINA_RECOVER_INTERVAL_MS,
    recoverySpeedRate: getMonthCardStaminaRecoveryRate(),
    recoverySpeedWindow,
  });
  const nextStamina = recoveryResult.stamina;
  const nextRecoverAtMs = recoveryResult.nextRecoverAtMs;
  const recovered = recoveryResult.recovered;

  const staminaChanged = rawStamina !== nextStamina;
  const recoverAtChanged = parsedRecoverAt.fallbackUsed || nextRecoverAtMs !== parsedRecoverAt.ms;
  const changed = staminaChanged || recoverAtChanged;

  if (changed) {
    if (staminaChanged) {
      await runQuery(
        'UPDATE characters SET stamina = $2, stamina_recover_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [characterId, nextStamina, new Date(nextRecoverAtMs)],
      );
    } else {
      await runQuery('UPDATE characters SET stamina_recover_at = $2 WHERE id = $1', [characterId, new Date(nextRecoverAtMs)]);
    }
  }

  const state: StaminaRecoveryState = {
    characterId,
    stamina: nextStamina,
    maxStamina: staminaMax,
    recovered,
    changed,
    staminaRecoverAt: new Date(nextRecoverAtMs),
    recoverySpeedWindow,
  };

  // 回填缓存（DB 写入后同步）
  await setCachedStamina(characterId, nextStamina, new Date(nextRecoverAtMs), staminaMax, recoverySpeedWindow);
  await syncOnlineBattleCharacterStaminaIfReady(characterId, nextStamina);

  return state;
};

/**
 * 从 DB 查询并计算恢复（内部函数，不走缓存）
 */
const applyRecoveryByCharacterIdFromDB = async (
  runQuery: QueryRunner,
  characterId: number,
  lockRow: boolean,
): Promise<StaminaRecoveryState | null> => {
  if (!Number.isFinite(characterId) || characterId <= 0) return null;
  const selectSql = lockRow
    ? `
      SELECT
        c.id,
        c.stamina,
        c.stamina_recover_at,
        COALESCE(cip.level, 0) AS insight_level,
        mco.start_at AS month_card_start_at,
        mco.expire_at AS month_card_expire_at
      FROM characters c
      LEFT JOIN character_insight_progress cip ON cip.character_id = c.id
      LEFT JOIN month_card_ownership mco
        ON mco.character_id = c.id
       AND mco.month_card_id = $2
      WHERE c.id = $1
      LIMIT 1
      FOR UPDATE OF c
    `
    : `
      SELECT
        c.id,
        c.stamina,
        c.stamina_recover_at,
        COALESCE(cip.level, 0) AS insight_level,
        mco.start_at AS month_card_start_at,
        mco.expire_at AS month_card_expire_at
      FROM characters c
      LEFT JOIN character_insight_progress cip ON cip.character_id = c.id
      LEFT JOIN month_card_ownership mco
        ON mco.character_id = c.id
       AND mco.month_card_id = $2
      WHERE c.id = $1
      LIMIT 1
    `;
  const rowRes = await runQuery(selectSql, [characterId, DEFAULT_MONTH_CARD_ID]);
  const row = rowRes.rows[0];
  if (!row) return null;
  return applyRecoveryFromRow(runQuery, row);
};

/**
 * 按角色 ID 获取体力状态（含恢复计算）
 *
 * 优先从 Redis 缓存读取，未命中则走 DB 并回填缓存
 */
export const applyStaminaRecoveryByCharacterId = async (characterId: number): Promise<StaminaRecoveryState | null> => {
  if (!Number.isFinite(characterId) || characterId <= 0) return null;

  // 优先走缓存
  const cached = await getCachedStamina(characterId);
  if (cached) return toRecoveryState(cached);

  // 缓存未命中时，同一角色只允许一条恢复链路落到 DB，避免登录/重连风暴重复写同一行。
  return runStaminaRecoverySingleFlight(characterId, async () => {
    const cachedAfterJoin = await getCachedStamina(characterId);
    if (cachedAfterJoin) {
      return toRecoveryState(cachedAfterJoin);
    }

    // 缓存未命中，走 DB（applyRecoveryFromRow 内部会回填缓存）
    return applyRecoveryByCharacterIdFromDB((text, params) => query(text, params), characterId, false);
  });
};

export const applyStaminaRecoveryByCharacterIds = async (
  characterIds: number[],
): Promise<Map<number, StaminaRecoveryState>> => {
  const normalizedCharacterIds = Array.from(
    new Set(
      characterIds
        .map((characterId) => Math.floor(Number(characterId)))
        .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
    ),
  );
  const result = new Map<number, StaminaRecoveryState>();
  if (normalizedCharacterIds.length <= 0) return result;

  const states = await Promise.all(
    normalizedCharacterIds.map(async (characterId) => ({
      characterId,
      state: await applyStaminaRecoveryByCharacterId(characterId),
    })),
  );

  for (const entry of states) {
    if (!entry.state) continue;
    result.set(entry.characterId, entry.state);
  }
  return result;
};

/**
 * 按用户 ID 获取体力状态（含恢复计算）
 *
 * 复用角色 ID 缓存与体力缓存，避免在登录/读角色链路里重复整行查库。
 */
export const applyStaminaRecoveryByUserId = async (userId: number): Promise<StaminaRecoveryState | null> => {
  if (!Number.isFinite(userId) || userId <= 0) return null;
  const characterId = await getCharacterIdByUserId(userId);
  if (!characterId) return null;

  return applyStaminaRecoveryByCharacterId(characterId);
};

/**
 * 事务内获取体力状态（带行锁，不走缓存）
 *
 * 事务需要 FOR UPDATE 行锁保证一致性，不适合走缓存。
 * 调用方在事务提交后应自行调用 setCachedStamina 同步缓存。
 */
export const applyStaminaRecoveryTx = async (characterId: number): Promise<StaminaRecoveryState | null> => {
  return applyRecoveryByCharacterIdFromDB((text, params) => query(text, params), characterId, true);
};

/**
 * 按角色 ID 恢复体力（事务内）
 *
 * 设计说明：
 * 1. 先复用 `applyStaminaRecoveryTx` 拿到带行锁的当前体力，避免直接对过期值做加法。
 * 2. 体力恢复道具与自然恢复共用同一份 `stamina_recover_at` 状态：未回满时保留原计时，回满时写入当前时间并同步缓存。
 */
export const recoverStaminaByCharacterId = async (
  characterId: number,
  amount: number,
): Promise<StaminaRecoveryState | null> => {
  if (!Number.isFinite(characterId) || characterId <= 0) return null;

  return applyStaminaDeltaByCharacterId(characterId, toNonNegativeInt(amount, 0));
};

/**
 * 按角色 ID 应用体力增减（支持正负值）。
 *
 * 作用：
 * 1. 统一处理“先按当前时间结算自然恢复，再应用本次体力变更，再同步 DB + 缓存”的流程，避免不同业务各自拼体力 SQL。
 * 2. 同时覆盖恢复与扣减场景；正数用于补体力，负数用于消耗体力。
 *
 * 输入/输出：
 * - 输入：characterId、delta（可正可负）。
 * - 输出：变更后的体力状态；若角色不存在则返回 null。
 *
 * 数据流：
 * - 调用方 -> applyStaminaRecoveryTx 获取事务内最新体力
 * - 计算 nextStamina / nextRecoverAt
 * - UPDATE characters -> setCachedStamina
 *
 * 关键边界条件与坑点：
 * 1. 负值扣减后若体力从满值进入未满状态，必须重置 `stamina_recover_at` 为当前时间，避免恢复计时停滞。
 * 2. 这里只负责体力状态持久化，不负责“是否允许扣减”的业务校验；调用方必须先保证不会越权扣体力。
 */
export const applyStaminaDeltaByCharacterId = async (
  characterId: number,
  delta: number,
): Promise<StaminaRecoveryState | null> => {
  if (!Number.isFinite(characterId) || characterId <= 0) return null;

  const normalizedDelta = Math.floor(Number(delta));
  const current = await applyStaminaRecoveryTx(characterId);
  if (!current) return null;
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return current;

  const nextStamina = Math.max(0, Math.min(current.maxStamina, current.stamina + normalizedDelta));
  const nextRecoverAt =
    nextStamina >= current.maxStamina
      ? new Date()
      : normalizedDelta < 0 && current.stamina >= current.maxStamina
        ? new Date()
        : current.staminaRecoverAt;
  const changed =
    nextStamina !== current.stamina ||
    nextRecoverAt.getTime() !== current.staminaRecoverAt.getTime();

  if (!changed) return current;

  await query(
    'UPDATE characters SET stamina = $2, stamina_recover_at = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [characterId, nextStamina, nextRecoverAt],
  );
  await setCachedStamina(
    characterId,
    nextStamina,
    nextRecoverAt,
    current.maxStamina,
    current.recoverySpeedWindow,
  );
  await syncOnlineBattleCharacterStaminaIfReady(characterId, nextStamina);

  return {
    ...current,
    stamina: nextStamina,
    recovered: current.recovered + Math.max(0, nextStamina - current.stamina),
    changed: true,
    staminaRecoverAt: nextRecoverAt,
    recoverySpeedWindow: current.recoverySpeedWindow,
  };
};
