/**
 * 伙伴招募解锁规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证伙伴招募统一开放境界固定为“炼神返虚·养神期”，并校验不同境界输入下的开放结果。
 * 2. 不做什么：不覆盖数据库查询、状态接口与招募事务，只验证共享纯函数。
 *
 * 输入/输出：
 * - 输入：角色当前主境界与小境界。
 * - 输出：开放境界常量与 `unlocked` 判断结果。
 *
 * 数据流/状态流：
 * 角色境界文本 -> buildPartnerRecruitUnlockState -> 招募状态接口 / 创建任务校验 / 确认收下校验。
 *
 * 关键边界条件与坑点：
 * 1. 主境界与小境界分列时也必须正确识别，避免角色表存储格式变化导致门槛失效。
 * 2. 刚好达到养神期时应视为已开放，不能错误要求更高境界。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPartnerRecruitUnlockState,
  PARTNER_RECRUIT_UNLOCK_REALM,
} from '../shared/partnerRecruitUnlock.js';

test('PARTNER_RECRUIT_UNLOCK_REALM: 应固定为炼神返虚·养神期', () => {
  assert.equal(PARTNER_RECRUIT_UNLOCK_REALM, '炼神返虚·养神期');
});

test('buildPartnerRecruitUnlockState: 结胎期时未开放', () => {
  const state = buildPartnerRecruitUnlockState('炼炁化神', '结胎期');

  assert.equal(state.unlockRealm, '炼神返虚·养神期');
  assert.equal(state.unlocked, false);
});

test('buildPartnerRecruitUnlockState: 养神期时应开放', () => {
  const state = buildPartnerRecruitUnlockState('炼神返虚·养神期', null);

  assert.equal(state.unlockRealm, '炼神返虚·养神期');
  assert.equal(state.unlocked, true);
});

test('buildPartnerRecruitUnlockState: 更高境界时应保持已开放', () => {
  const state = buildPartnerRecruitUnlockState('炼神返虚', '还虚期');

  assert.equal(state.unlockRealm, '炼神返虚·养神期');
  assert.equal(state.unlocked, true);
});
