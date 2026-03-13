/**
 * 月卡权益共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护月卡静态定义读取、激活态查询与冷却缩减计算，避免各业务服务分别手写月卡规则。
 * 2. 做什么：为伙伴招募、洞府研修等需要“按冷却秒数折算”的入口提供统一纯函数，减少同一折扣公式重复散落。
 * 3. 不做什么：不处理月卡购买、续期、领取奖励，也不负责前端展示文案拼装。
 *
 * 输入/输出：
 * - 输入：月卡 ID、角色 ID、基础冷却秒数、当前时间。
 * - 输出：月卡定义、当前有效冷却缩减比例，以及折算后的实际冷却秒数/小时数。
 *
 * 数据流/状态流：
 * month_card.json -> getMonthCardDefinitionById / getMonthCardCooldownReductionRate；
 * character_id + month_card_ownership -> getActiveMonthCardCooldownReductionRate；
 * 基础冷却秒数 + 缩减比例 -> applyCooldownReductionSeconds / convertCooldownSecondsToHours。
 *
 * 关键边界条件与坑点：
 * 1. 冷却缩减比例来自静态配置，必须先做 0 到 1 的裁剪，避免脏数据把冷却算成负数或放大。
 * 2. 业务层展示与拦截要共享同一折算结果，因此统一以“秒”为最小单位计算，再衍生小时展示值。
 * 3. 查询激活态时只认 `expire_at > now` 的有效月卡，不能把已过期但未清理的记录继续当成权益来源。
 */
import { query } from '../../config/database.js';
import {
  getMonthCardDefinitions,
  type MonthCardDef,
} from '../staticConfigLoader.js';

const HOUR_SECONDS = 3_600;

export const DEFAULT_MONTH_CARD_ID = 'monthcard-001';
export const DEFAULT_MONTH_CARD_ITEM_DEF_ID = 'cons-monthcard-001';

const normalizeNumber = (value: number | string | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const clampReductionRate = (reductionRate: number): number => {
  if (!Number.isFinite(reductionRate)) return 0;
  if (reductionRate <= 0) return 0;
  if (reductionRate >= 1) return 1;
  return reductionRate;
};

export const getMonthCardDefinitionById = (monthCardId: string): MonthCardDef | null => {
  const defs = getMonthCardDefinitions();
  return defs.find((item) => item.id === monthCardId && item.enabled !== false) ?? null;
};

export const getMonthCardCooldownReductionRate = (
  monthCardId: string = DEFAULT_MONTH_CARD_ID,
): number => {
  const definition = getMonthCardDefinitionById(monthCardId);
  if (!definition) return 0;
  return clampReductionRate(normalizeNumber(definition.cooldown_reduction_rate));
};

export const applyCooldownReductionSeconds = (
  baseCooldownSeconds: number,
  cooldownReductionRate: number,
): number => {
  const safeBaseCooldownSeconds = Math.max(0, Math.ceil(baseCooldownSeconds));
  const normalizedRate = clampReductionRate(cooldownReductionRate);
  if (safeBaseCooldownSeconds <= 0 || normalizedRate <= 0) {
    return safeBaseCooldownSeconds;
  }
  return Math.max(0, Math.ceil(safeBaseCooldownSeconds * (1 - normalizedRate)));
};

export const convertCooldownSecondsToHours = (cooldownSeconds: number): number => {
  const safeCooldownSeconds = Math.max(0, cooldownSeconds);
  return Math.round((safeCooldownSeconds / HOUR_SECONDS) * 10) / 10;
};

export const getActiveMonthCardCooldownReductionRate = async (
  characterId: number,
  monthCardId: string = DEFAULT_MONTH_CARD_ID,
  now: Date = new Date(),
): Promise<number> => {
  const reductionRate = getMonthCardCooldownReductionRate(monthCardId);
  if (reductionRate <= 0) return 0;

  const result = await query(
    `
      SELECT 1
      FROM month_card_ownership
      WHERE character_id = $1
        AND month_card_id = $2
        AND expire_at > $3::timestamptz
      LIMIT 1
    `,
    [characterId, monthCardId, now.toISOString()],
  );

  return result.rows.length > 0 ? reductionRate : 0;
};
