/**
 * 洞府研修返还规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护洞府研修不同结果下的返还比例，并提供统一的返还数量与奖励载荷构造函数。
 * 2. 做什么：把“草稿过期只返还一半”“失败默认全额返还残页”“pending 失败时额外返还顿悟符”收敛到单一规则源，避免 service 内散落倍率常量与邮件附件拼装。
 * 3. 不做什么：不处理数据库写入、不负责物品发放，也不决定前端展示文案。
 *
 * 输入/输出：
 * - 输入：原始消耗 `costPoints` 与返还比例 `refundRate`，或已经算好的返还残页数与是否退回顿悟符。
 * - 输出：向下取整后的返还残页数量，以及可直接交给邮件奖励系统的规范奖励载荷。
 *
 * 数据流/状态流：
 * technique_generation_job.cost_points / used_cooldown_bypass_token -> techniqueResearchRefund -> techniqueGenerationService 退款流程。
 *
 * 关键边界条件与坑点：
 * 1. 消耗或比例异常时必须保守回退到非负整数，避免脏数据导致负数返还或小数入包。
 * 2. 顿悟符只应在“生成失败仍停留 pending”这类未真正产出草稿的场景返还；草稿过期或主动放弃不应误退令牌，因此奖励载荷构造必须显式传入布尔开关，而不是默认附带。
 */
import type { GrantedRewardPayload } from './rewardPayload.js';
import {
  TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_COST,
  TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_ITEM_DEF_ID,
} from './techniqueResearchCooldownBypass.js';
import { TECHNIQUE_RESEARCH_FRAGMENT_ITEM_DEF_ID } from './techniqueResearchCost.js';

export const TECHNIQUE_RESEARCH_FULL_REFUND_RATE = 1;
export const TECHNIQUE_RESEARCH_EXPIRED_DRAFT_REFUND_RATE = 0.5;

export const resolveTechniqueResearchRefundFragments = (
  costPoints: number,
  refundRate: number = TECHNIQUE_RESEARCH_FULL_REFUND_RATE,
): number => {
  const safeCostPoints = Math.max(0, Math.floor(Number(costPoints) || 0));
  const safeRefundRate = Math.max(0, Number(refundRate) || 0);
  return Math.max(0, Math.floor(safeCostPoints * safeRefundRate));
};

export const buildTechniqueResearchRefundRewardPayload = (params: {
  refundFragments: number;
  refundCooldownBypassToken?: boolean;
}): GrantedRewardPayload => {
  const refundFragments = Math.max(0, Math.floor(Number(params.refundFragments) || 0));
  const refundItems: NonNullable<GrantedRewardPayload['items']> = [];

  if (refundFragments > 0) {
    refundItems.push({
      itemDefId: TECHNIQUE_RESEARCH_FRAGMENT_ITEM_DEF_ID,
      quantity: refundFragments,
    });
  }

  if (params.refundCooldownBypassToken === true) {
    refundItems.push({
      itemDefId: TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_ITEM_DEF_ID,
      quantity: TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_COST,
    });
  }

  return refundItems.length > 0 ? { items: refundItems } : {};
};
