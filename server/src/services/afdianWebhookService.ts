/**
 * 爱发电 webhook 服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：校验爱发电 webhook 签名，按订单幂等落库，并在受支持方案命中时生成兑换码与私信任务。
 * 2. 做什么：把“订单入库、兑换码生成、私信任务创建”收敛到单一服务入口，避免路由层散落 SQL。
 * 3. 不做什么：不直接返回 HTTP 响应，也不管理后台定时器生命周期。
 *
 * 输入/输出：
 * - 输入：完整 webhook 负载。
 * - 输出：处理结果，以及本次是否生成/复用待发送私信任务。
 *
 * 数据流/状态流：
 * webhook 路由 -> verifyWebhookSignature -> afdian_order；
 * 命中受支持方案 -> redeemCodeService.getOrCreateCodeBySource -> afdian_message_delivery -> 即时尝试发送。
 *
 * 关键边界条件与坑点：
 * 1. webhook 可能重复推送，因此订单幂等必须基于 `out_trade_no`，不能靠内存态判断。
 * 2. 私信发送失败不能回滚订单与兑换码，否则会因为回调重放重复生成新码；发送状态必须拆成独立任务处理。
 */
import { createPublicKey, verify } from 'node:crypto';

import { query } from '../config/database.js';
import { Transactional } from '../decorators/transactional.js';
import { afdianMessageDeliveryService } from './afdianMessageDeliveryService.js';
import { redeemCodeService } from './redeemCodeService.js';
import {
  AFDIAN_REDEEM_SOURCE_TYPE,
  AFDIAN_WEBHOOK_PUBLIC_KEY,
  buildAfdianRedeemCodeMessage,
  buildAfdianWebhookSignText,
  getAfdianPlanConfig,
  type AfdianWebhookOrder,
  type AfdianWebhookPayload,
} from './afdian/shared.js';

type AfdianOrderRow = {
  id: number | string;
  redeem_code_id: number | string | null;
};

const AFDIAN_PUBLIC_KEY = createPublicKey(AFDIAN_WEBHOOK_PUBLIC_KEY);

const assertOrderField = (value: string, fieldName: string): void => {
  if (!value.trim()) {
    throw new Error(`爱发电 webhook 缺少必要字段：${fieldName}`);
  }
};

const normalizeWebhookOrder = (order: AfdianWebhookOrder): AfdianWebhookOrder => {
  return {
    ...order,
    out_trade_no: order.out_trade_no.trim(),
    user_id: order.user_id.trim(),
    plan_id: order.plan_id.trim(),
    total_amount: order.total_amount.trim(),
  };
};

const verifyWebhookSignature = (payload: AfdianWebhookPayload): void => {
  const sign = payload.sign.trim();
  if (!sign) {
    throw new Error('爱发电 webhook 缺少签名');
  }

  const signText = buildAfdianWebhookSignText(payload.data.order);
  const verified = verify(
    'RSA-SHA256',
    Buffer.from(signText, 'utf8'),
    AFDIAN_PUBLIC_KEY,
    Buffer.from(sign, 'base64'),
  );
  if (!verified) {
    throw new Error('爱发电 webhook 签名校验失败');
  }
};

class AfdianWebhookService {
  async handleWebhook(payload: AfdianWebhookPayload): Promise<void> {
    if (payload.data.type !== 'order') {
      return;
    }

    const order = normalizeWebhookOrder(payload.data.order);
    assertOrderField(order.out_trade_no, 'out_trade_no');
    assertOrderField(order.user_id, 'user_id');
    assertOrderField(order.total_amount, 'total_amount');

    verifyWebhookSignature({
      ...payload,
      data: {
        ...payload.data,
        order,
      },
    });

    const prepared = await this.prepareOrderDelivery(order);
    if (prepared.deliveryId) {
      await afdianMessageDeliveryService.processDeliveryById(prepared.deliveryId);
    }
  }

  @Transactional
  private async prepareOrderDelivery(order: AfdianWebhookOrder): Promise<{ deliveryId: number | null }> {
    let orderId = 0;
    let orderRedeemCodeId = 0;

    const existing = await query(
      `
        SELECT id, redeem_code_id
        FROM afdian_order
        WHERE out_trade_no = $1
        LIMIT 1
        FOR UPDATE
      `,
      [order.out_trade_no],
    );

    if (existing.rows.length > 0) {
      const existingRow = existing.rows[0] as AfdianOrderRow;
      orderId = Number(existingRow.id);
      orderRedeemCodeId = existingRow.redeem_code_id ? Number(existingRow.redeem_code_id) : 0;
      await query(
        `
          UPDATE afdian_order
          SET custom_order_id = $2,
              sponsor_user_id = $3,
              sponsor_private_id = $4,
              plan_id = $5,
              month_count = $6,
              total_amount = $7,
              status = $8,
              payload = $9::jsonb,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          orderId,
          order.custom_order_id?.trim() || null,
          order.user_id,
          order.user_private_id?.trim() || null,
          order.plan_id || null,
          order.month,
          order.total_amount,
          order.status,
          JSON.stringify(order),
        ],
      );
    } else {
      const inserted = await query(
        `
          INSERT INTO afdian_order (
            out_trade_no,
            custom_order_id,
            sponsor_user_id,
            sponsor_private_id,
            plan_id,
            month_count,
            total_amount,
            status,
            payload,
            processed_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, NOW())
          RETURNING id, redeem_code_id
        `,
        [
          order.out_trade_no,
          order.custom_order_id?.trim() || null,
          order.user_id,
          order.user_private_id?.trim() || null,
          order.plan_id || null,
          order.month,
          order.total_amount,
          order.status,
          JSON.stringify(order),
        ],
      );
      const insertedRow = inserted.rows[0] as AfdianOrderRow;
      orderId = Number(insertedRow.id);
      orderRedeemCodeId = insertedRow.redeem_code_id ? Number(insertedRow.redeem_code_id) : 0;
    }

    const planConfig = getAfdianPlanConfig(order.plan_id);
    if (!planConfig) {
      return { deliveryId: null };
    }

    const redeemCode = await redeemCodeService.getOrCreateCodeBySource({
      sourceType: AFDIAN_REDEEM_SOURCE_TYPE,
      sourceRefId: order.out_trade_no,
      rewardPayload: planConfig.rewardPayload,
    });

    if (orderRedeemCodeId !== redeemCode.id) {
      await query(
        `
          UPDATE afdian_order
          SET redeem_code_id = $2,
              processed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [orderId, redeemCode.id],
      );
    }

    const deliveryId = await afdianMessageDeliveryService.getOrCreateDeliveryTx({
      orderId,
      recipientUserId: order.user_id,
      content: buildAfdianRedeemCodeMessage(redeemCode.code),
    });

    return { deliveryId };
  }
}

export const afdianWebhookService = new AfdianWebhookService();
