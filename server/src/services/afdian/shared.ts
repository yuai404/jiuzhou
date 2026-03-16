/**
 * 爱发电接入共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护爱发电 webhook / OpenAPI 的常量、签名拼装、方案配置查询和私信重试节奏，避免路由、服务、定时器各写一套。
 * 2. 做什么：集中定义“爱发电订单 -> 本服兑换码消息”的固定文案与方案奖励配置，保证单一入口。
 * 3. 不做什么：不直接发 HTTP 请求、不写数据库，也不负责实际物品发放。
 *
 * 输入/输出：
 * - 输入：爱发电订单字段、OpenAPI 请求参数、当前重试次数。
 * - 输出：签名原文、OpenAPI 签名、兑换码私信正文、下次重试时间与固定奖励载荷。
 *
 * 数据流/状态流：
 * webhook 路由 / OpenAPI 服务 / 私信重试服务 -> 本模块纯函数 -> 上层决定落库、发消息或调度。
 *
 * 关键边界条件与坑点：
 * 1. webhook 签名串必须严格按 `out_trade_no + user_id + plan_id + total_amount` 拼接，顺序一旦错就会导致官方签名校验失败。
 * 2. OpenAPI `params` 参与签名时必须使用最终发送的 JSON 字符串，不能先按对象签名再让运行时改写顺序。
 */
import { createHash } from 'node:crypto';
import type {
  GrantedRewardItemPayload as RedeemCodeRewardItem,
  GrantedRewardPayload as RedeemCodeRewardPayload,
} from '../shared/rewardPayload.js';

export const AFDIAN_MONTH_CARD_PLAN_ID = '04f7a35e210c11f182a752540025c377';
export const AFDIAN_REDEEM_SOURCE_TYPE = 'afdian_order';
export const AFDIAN_MONTH_CARD_ITEM_DEF_ID = 'cons-monthcard-001';
export const AFDIAN_OPEN_API_DEFAULT_BASE_URL = 'https://ifdian.net';
export const AFDIAN_MESSAGE_RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 86400] as const;

export const AFDIAN_WEBHOOK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwwdaCg1Bt+UKZKs0R54y
lYnuANma49IpgoOwNmk3a0rhg/PQuhUJ0EOZSowIC44l0K3+fqGns3Ygi4AfmEfS
4EKbdk1ahSxu7Zkp2rHMt+R9GarQFQkwSS/5x1dYiHNVMiR8oIXDgjmvxuNes2Cr
8fw9dEF0xNBKdkKgG2qAawcN1nZrdyaKWtPVT9m2Hl0ddOO9thZmVLFOb9NVzgYf
jEgI+KWX6aY19Ka/ghv/L4t1IXmz9pctablN5S0CRWpJW3Cn0k6zSXgjVdKm4uN7
jRlgSRaf/Ind46vMCm3N2sgwxu/g3bnooW+db0iLo13zzuvyn727Q3UDQ0MmZcEW
MQIDAQAB
-----END PUBLIC KEY-----`;

export type { RedeemCodeRewardItem, RedeemCodeRewardPayload };

export type AfdianWebhookSkuDetail = {
  sku_id: string;
  count: number;
  name: string;
  album_id: string;
  pic: string;
};

export type AfdianWebhookOrder = {
  out_trade_no: string;
  custom_order_id?: string;
  user_id: string;
  user_private_id?: string;
  plan_id: string;
  month: number;
  total_amount: string;
  show_amount?: string;
  status: number;
  remark?: string;
  redeem_id?: string;
  product_type?: number;
  discount?: string;
  title?: string;
  sku_detail?: AfdianWebhookSkuDetail[];
  address_person?: string;
  address_phone?: string;
  address_address?: string;
};

export type AfdianWebhookPayload = {
  ec: number;
  em: string;
  sign: string;
  data: {
    type: 'order';
    order: AfdianWebhookOrder;
  };
};

export type AfdianOpenApiEnvelope<TData extends object> = {
  ec: number;
  em: string;
  data: TData;
};

export type AfdianPlanConfig = {
  rewardPayload: RedeemCodeRewardPayload;
};

export const AFDIAN_PLAN_CONFIGS: Readonly<Record<string, AfdianPlanConfig>> = {
  [AFDIAN_MONTH_CARD_PLAN_ID]: {
    rewardPayload: {
      items: [
        {
          itemDefId: AFDIAN_MONTH_CARD_ITEM_DEF_ID,
          quantity: 1,
        },
      ],
    },
  },
};

export const getAfdianOpenApiBaseUrl = (): string => {
  const raw = String(process.env.AFDIAN_OPEN_API_BASE_URL ?? AFDIAN_OPEN_API_DEFAULT_BASE_URL).trim();
  return raw.replace(/\/+$/u, '') || AFDIAN_OPEN_API_DEFAULT_BASE_URL;
};

export const getAfdianPlanConfig = (planId: string): AfdianPlanConfig | null => {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId) {
    return null;
  }
  return AFDIAN_PLAN_CONFIGS[normalizedPlanId] ?? null;
};

export const buildAfdianWebhookSignText = (order: AfdianWebhookOrder): string => {
  return `${order.out_trade_no}${order.user_id}${order.plan_id}${order.total_amount}`;
};

export const buildAfdianOpenApiSign = (input: {
  token: string;
  userId: string;
  paramsText: string;
  ts: number;
}): string => {
  const signText = `${input.token}params${input.paramsText}ts${String(input.ts)}user_id${input.userId}`;
  return createHash('md5').update(signText).digest('hex');
};

export const buildAfdianRedeemCodeMessage = (code: string): string => {
  return [
    '感谢你支持《九州修仙录》！',
    '这是为你生成的赞助兑换码：',
    code,
    '进入游戏后，在“设置 - 兑换码”中输入即可领取对应赞助奖励。',
  ].join('\n');
};

export const computeAfdianMessageRetryAt = (
  nextAttemptCount: number,
  now: Date = new Date(),
): Date | null => {
  const delaySeconds = AFDIAN_MESSAGE_RETRY_DELAYS_SECONDS[nextAttemptCount - 1];
  if (!delaySeconds) return null;
  return new Date(now.getTime() + delaySeconds * 1000);
};
