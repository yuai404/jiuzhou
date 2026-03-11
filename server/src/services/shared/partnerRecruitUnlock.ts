/**
 * 伙伴招募解锁规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护伙伴招募的境界开放门槛，并提供统一的“是否已开放”纯函数，供状态接口、创建任务与确认收下共用。
 * 2. 做什么：把“角色当前境界 -> 招募开放态”收敛成单一出口，避免服务层在多个入口重复手写字符串比较。
 * 3. 不做什么：不查询数据库、不处理伙伴系统功能解锁、不处理冷却或灵石消耗。
 *
 * 输入/输出：
 * - 输入：角色当前主境界 `realm` 与小境界 `subRealm`。
 * - 输出：固定开放境界 `unlockRealm` 与布尔值 `unlocked`。
 *
 * 数据流/状态流：
 * characters.realm / characters.sub_realm -> buildPartnerRecruitUnlockState -> 招募状态接口 / 创建任务校验 / 确认收下校验。
 *
 * 关键边界条件与坑点：
 * 1. 主境界与小境界可能分列存储，也可能只传全称，必须复用统一境界归一化规则，不能在业务层自己拼接字符串。
 * 2. 未识别境界要按 `realmRules` 的保守口径回退到最低档，避免非法文本被误判为已开放。
 */
import {
  getRealmRankZeroBased,
  type RealmName,
} from './realmRules.js';

export const PARTNER_RECRUIT_UNLOCK_REALM: RealmName = '炼神返虚·养神期';

export type PartnerRecruitUnlockState = {
  unlockRealm: RealmName;
  unlocked: boolean;
};

export const buildPartnerRecruitUnlockState = (
  realm: string,
  subRealm: string | null,
): PartnerRecruitUnlockState => {
  return {
    unlockRealm: PARTNER_RECRUIT_UNLOCK_REALM,
    unlocked:
      getRealmRankZeroBased(realm, subRealm ?? undefined)
      >= getRealmRankZeroBased(PARTNER_RECRUIT_UNLOCK_REALM),
  };
};
