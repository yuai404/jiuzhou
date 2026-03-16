/**
 * 爱发电共享规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 webhook 签名串、OpenAPI 签名和私信失败重试时间表的纯函数规则，避免接入细节散落后悄悄漂移。
 * 2. 做什么：验证方案配置查询与月卡奖励载荷只有一个单一来源，后续改需求时能明确看到断言变化。
 * 3. 不做什么：不请求真实爱发电接口、不校验数据库写入，也不覆盖路由响应格式。
 *
 * 输入/输出：
 * - 输入：固定的爱发电订单样本、OpenAPI 参数样本和重试次数。
 * - 输出：共享纯函数的稳定返回值。
 *
 * 数据流/状态流：
 * 测试样本 -> afdian/shared 纯函数 -> 断言签名原文 / MD5 / 重试时间 / 奖励结构。
 *
 * 关键边界条件与坑点：
 * 1. webhook 签名串顺序必须与官方文档一致，否则线上回调会全部校验失败。
 * 2. 重试时间表必须与私信投递服务共用，不能在测试里另写一套常量后各自漂移。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AFDIAN_MONTH_CARD_PLAN_ID,
  AFDIAN_PLAN_CONFIGS,
  buildAfdianOpenApiSign,
  buildAfdianWebhookSignText,
  computeAfdianMessageRetryAt,
  getAfdianPlanConfig,
  type AfdianWebhookOrder,
} from '../afdian/shared.js';

const SAMPLE_ORDER: AfdianWebhookOrder = {
  out_trade_no: '202603160001',
  user_id: 'afdian-user-001',
  plan_id: AFDIAN_MONTH_CARD_PLAN_ID,
  month: 1,
  total_amount: '18.00',
  status: 2,
};

test('buildAfdianWebhookSignText: 应按官方顺序拼接订单签名串', () => {
  assert.equal(
    buildAfdianWebhookSignText(SAMPLE_ORDER),
    '202603160001afdian-user-00104f7a35e210c11f182a752540025c37718.00',
  );
});

test('buildAfdianOpenApiSign: 应生成文档示例一致的 md5 签名', () => {
  assert.equal(
    buildAfdianOpenApiSign({
      token: '123',
      userId: 'abc',
      paramsText: '{"a":333}',
      ts: 1624339905,
    }),
    'a4acc28b81598b7e5d84ebdc3e91710c',
  );
});

test('computeAfdianMessageRetryAt: 应按预设退避节奏给出下次重试时间', () => {
  const base = new Date('2026-03-16T00:00:00.000Z');
  assert.equal(computeAfdianMessageRetryAt(1, base)?.toISOString(), '2026-03-16T00:01:00.000Z');
  assert.equal(computeAfdianMessageRetryAt(2, base)?.toISOString(), '2026-03-16T00:05:00.000Z');
  assert.equal(computeAfdianMessageRetryAt(3, base)?.toISOString(), '2026-03-16T00:30:00.000Z');
  assert.equal(computeAfdianMessageRetryAt(4, base)?.toISOString(), '2026-03-16T02:00:00.000Z');
  assert.equal(computeAfdianMessageRetryAt(5, base)?.toISOString(), '2026-03-17T00:00:00.000Z');
  assert.equal(computeAfdianMessageRetryAt(6, base), null);
});

test('爱发电方案配置应按 plan_id 返回对应奖励载荷', () => {
  assert.deepEqual(Object.keys(AFDIAN_PLAN_CONFIGS), [AFDIAN_MONTH_CARD_PLAN_ID]);
  assert.deepEqual(getAfdianPlanConfig(AFDIAN_MONTH_CARD_PLAN_ID), {
    rewardPayload: {
      items: [{ itemDefId: 'cons-monthcard-001', quantity: 1 }],
    },
  });
  assert.equal(getAfdianPlanConfig('other-plan'), null);
});
