/**
 * 伙伴坊市状态共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护“伙伴是否已在坊市挂单中”的查询与映射，供伙伴服务与伙伴坊市服务复用。
 * 2. 做什么：统一返回伙伴的交易状态与挂单 ID，避免总览、培养、上架流程各写一套 active listing 判断。
 * 3. 不做什么：不处理成交扣费、不拼装伙伴展示快照，也不处理前端事件。
 *
 * 输入/输出：
 * - 输入：伙伴 ID 列表或单个伙伴 ID，以及是否需要 `FOR UPDATE` 锁。
 * - 输出：伙伴交易状态映射、单个有效挂单摘要。
 *
 * 数据流/状态流：
 * - partnerService / partnerMarketService 查询伙伴 -> 本模块读取 active listing -> 调用方决定允许操作或组装 DTO。
 *
 * 关键边界条件与坑点：
 * 1. 只有 `status = 'active'` 的挂单才算“交易中”，历史 sold/cancelled 记录不能继续阻断伙伴操作。
 * 2. 单个伙伴可能存在历史挂单记录，因此任何查询都必须显式限定最新 active 状态，不能只按 partner_id 判存在。
 */
import { query } from '../../config/database.js';
import type { PartnerTradeStatus } from './partnerView.js';

export type PartnerMarketTradeState = {
  tradeStatus: PartnerTradeStatus;
  marketListingId: number | null;
};

export type ActivePartnerMarketListingRow = {
  listingId: number;
  sellerUserId: number;
  sellerCharacterId: number;
  partnerId: number;
};

export const createPartnerTradeState = (
  marketListingId: number | null,
): PartnerMarketTradeState => ({
  tradeStatus: marketListingId === null ? 'none' : 'market_listed',
  marketListingId,
});

export const loadPartnerMarketTradeStateMap = async (
  partnerIds: number[],
): Promise<Map<number, PartnerMarketTradeState>> => {
  const normalizedPartnerIds = [
    ...new Set(
      partnerIds
        .map((partnerId) => Number(partnerId))
        .filter((partnerId) => Number.isInteger(partnerId) && partnerId > 0),
    ),
  ];
  const resultMap = new Map<number, PartnerMarketTradeState>();
  if (normalizedPartnerIds.length <= 0) return resultMap;

  const result = await query(
    `
      SELECT id, partner_id
      FROM market_partner_listing
      WHERE status = 'active'
        AND partner_id = ANY($1)
      ORDER BY id DESC
    `,
    [normalizedPartnerIds],
  );

  for (const row of result.rows as Array<{ id: number; partner_id: number }>) {
    const partnerId = Number(row.partner_id);
    if (resultMap.has(partnerId)) continue;
    resultMap.set(partnerId, createPartnerTradeState(Number(row.id)));
  }

  for (const partnerId of normalizedPartnerIds) {
    if (!resultMap.has(partnerId)) {
      resultMap.set(partnerId, createPartnerTradeState(null));
    }
  }

  return resultMap;
};

export const loadActivePartnerMarketListing = async (
  partnerId: number,
  forUpdate: boolean,
): Promise<ActivePartnerMarketListingRow | null> => {
  const lockSql = forUpdate ? 'FOR UPDATE' : '';
  const result = await query(
    `
      SELECT id, seller_user_id, seller_character_id, partner_id
      FROM market_partner_listing
      WHERE partner_id = $1
        AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
      ${lockSql}
    `,
    [partnerId],
  );
  if (result.rows.length <= 0) return null;
  const row = result.rows[0] as {
    id: number;
    seller_user_id: number;
    seller_character_id: number;
    partner_id: number;
  };
  return {
    listingId: Number(row.id),
    sellerUserId: Number(row.seller_user_id),
    sellerCharacterId: Number(row.seller_character_id),
    partnerId: Number(row.partner_id),
  };
};
