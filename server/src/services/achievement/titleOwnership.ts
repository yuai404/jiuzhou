import { query } from '../../config/database.js';
import { queueCharacterWritebackSnapshot } from '../playerWritebackCacheService.js';
import { asFiniteNonNegativeInt, asNonEmptyString } from './shared.js';
import { PVP_WEEKLY_TITLE_IDS } from './pvpWeeklyTitleConfig.js';

/**
 * 称号归属写入与过期清理复用模块
 *
 * 作用：
 * 1. 提供统一的称号发放/续期写入函数，避免 claim 与周结算重复 SQL；
 * 2. 统一处理“已过期且仍装备”的 PVP 周称号，保证属性与显示口径一致。
 *
 * 输入：
 * - 角色ID、称号ID、过期时间（可为 null，表示永久称号）。
 *
 * 输出：
 * - 发放函数：仅执行数据库写入；
 * - 清理函数：返回受影响角色ID列表，用于后续缓存失效。
 *
 * 数据流：
 * - achievement/claim.ts 通过本模块发放永久称号；
 * - arenaWeeklySettlementService 通过本模块发放限时称号与清理过期装备。
 *
 * 关键边界条件与坑点：
 * 1. UPSERT 必须保留 is_equipped，不能在续期时覆盖玩家主动装备状态。
 * 2. 过期清理后仅在“无任何有效装备称号”时回退 characters.title=散修，避免覆盖正常已装备称号。
 */

export const grantTitleOwnershipTx = async (
  characterId: number,
  titleId: string,
  expiresAt: Date | null,
): Promise<void> => {
  const cid = asFiniteNonNegativeInt(characterId, 0);
  const tid = asNonEmptyString(titleId);
  if (!cid) throw new Error('grantTitleOwnershipTx: characterId 无效');
  if (!tid) throw new Error('grantTitleOwnershipTx: titleId 不能为空');

  await query(
    `
      INSERT INTO character_title (character_id, title_id, is_equipped, obtained_at, expires_at, updated_at)
      VALUES ($1, $2, false, NOW(), $3, NOW())
      ON CONFLICT (character_id, title_id)
      DO UPDATE SET
        expires_at = EXCLUDED.expires_at,
        obtained_at = NOW(),
        updated_at = NOW()
    `,
    [cid, tid, expiresAt],
  );
};

export const grantPermanentTitleTx = async (
  characterId: number,
  titleId: string,
): Promise<void> => {
  await grantTitleOwnershipTx(characterId, titleId, null);
};

export const grantExpiringTitleTx = async (
  characterId: number,
  titleId: string,
  expiresAt: Date,
): Promise<void> => {
  await grantTitleOwnershipTx(characterId, titleId, expiresAt);
};

export const clearExpiredEquippedPvpWeeklyTitlesTx = async (
): Promise<number[]> => {
  const expiredRes = await query<{ character_id: number }>(
    `
      UPDATE character_title
      SET is_equipped = false,
          updated_at = NOW()
      WHERE is_equipped = true
        AND title_id = ANY($1::varchar[])
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
      RETURNING character_id
    `,
    [PVP_WEEKLY_TITLE_IDS],
  );

  const characterIds = Array.from(
    new Set(
      expiredRes.rows
        .map((row) => asFiniteNonNegativeInt(row.character_id, 0))
        .filter((id) => id > 0),
    ),
  );

  if (characterIds.length === 0) {
    return [];
  }

  const equippedTitleRes = await query(
    `
      SELECT DISTINCT ct.character_id
      FROM character_title ct
      WHERE ct.character_id = ANY($1::int[])
        AND ct.is_equipped = true
        AND (ct.expires_at IS NULL OR ct.expires_at > NOW())
    `,
    [characterIds],
  );
  const equippedCharacterIdSet = new Set(
    equippedTitleRes.rows
      .map((row) => asFiniteNonNegativeInt(row.character_id, 0))
      .filter((id) => id > 0),
  );
  for (const characterId of characterIds) {
    if (equippedCharacterIdSet.has(characterId)) continue;
    queueCharacterWritebackSnapshot(characterId, {
      title: '散修',
    });
  }

  return characterIds;
};
