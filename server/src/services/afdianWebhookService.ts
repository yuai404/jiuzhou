/**
 * 爱发电 webhook 服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：接收爱发电 webhook 订单通知，回查 OpenAPI 核验订单后按幂等落库，并在受支持方案命中时生成兑换码与私信任务。
 * 2. 做什么：把“订单入库、兑换码生成、私信任务创建”收敛到单一服务入口，避免路由层散落 SQL。
 * 3. 不做什么：不直接返回 HTTP 响应，也不管理后台定时器生命周期。
 *
 * 输入/输出：
 * - 输入：完整 webhook 负载。
 * - 输出：处理结果，以及本次是否生成/复用待发送私信任务。
 *
 * 数据流/状态流：
 * webhook 路由 -> query-order 回查核验 -> afdian_order；
 * 命中受支持方案 -> redeemCodeService.getOrCreateCodeBySource -> afdian_message_delivery -> 即时尝试发送。
 *
 * 关键边界条件与坑点：
 * 1. webhook 可能重复推送，因此订单幂等必须基于 `out_trade_no`，不能靠内存态判断。
 * 2. 私信发送失败不能回滚订单与兑换码，否则会因为回调重放重复生成新码；发送状态必须拆成独立任务处理。
 */
import { query } from '../config/database.js';
import { Transactional } from '../decorators/transactional.js';
import { afdianMessageDeliveryService } from './afdianMessageDeliveryService.js';
import { queryAfdianOrdersByOutTradeNo } from './afdianOpenApiService.js';
import { redeemCodeService } from './redeemCodeService.js';
import {
  AFDIAN_REDEEM_SOURCE_TYPE,
  assertAfdianOrderMatchesWebhook,
  buildAfdianLogContext,
  buildAfdianOrderRewardPayload,
  buildAfdianRedeemCodeMessage,
  findAfdianOrderByOutTradeNo,
  getAfdianPlanConfig,
  hasAfdianWebhookOrderPayload,
  type AfdianWebhookOrder,
  type AfdianWebhookPayloadInput,
} from './afdian/shared.js';

type AfdianOrderRow = {
  id: number | string;
  redeem_code_id: number | string | null;
};

const normalizeRequiredTextField = (value: string | undefined, fieldName: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`爱发电 webhook 缺少必要字段：${fieldName}`);
  }
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error(`爱发电 webhook 缺少必要字段：${fieldName}`);
  }
  return normalizedValue;
};

const normalizeRequiredPositiveIntegerField = (value: number | undefined, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`爱发电 webhook 缺少必要字段：${fieldName}`);
  }
  return value;
};

const normalizeRequiredNumberField = (value: number | undefined, fieldName: string): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`爱发电 webhook 缺少必要字段：${fieldName}`);
  }
  return value;
};

const normalizeWebhookOrder = (order: Partial<AfdianWebhookOrder>): AfdianWebhookOrder => {
  return {
    ...order,
    out_trade_no: normalizeRequiredTextField(order.out_trade_no, 'out_trade_no'),
    user_id: normalizeRequiredTextField(order.user_id, 'user_id'),
    plan_id: normalizeRequiredTextField(order.plan_id, 'plan_id'),
    month: normalizeRequiredPositiveIntegerField(order.month, 'month'),
    total_amount: normalizeRequiredTextField(order.total_amount, 'total_amount'),
    status: normalizeRequiredNumberField(order.status, 'status'),
  };
};

class AfdianWebhookService {
  async handleWebhook(payload: AfdianWebhookPayloadInput): Promise<void> {
    if (!hasAfdianWebhookOrderPayload(payload)) {
      return;
    }

    const webhookOrder = normalizeWebhookOrder(payload.data.order);
    const orderLogContext = buildAfdianLogContext({
      outTradeNo: webhookOrder.out_trade_no,
      planId: webhookOrder.plan_id,
      month: webhookOrder.month,
      totalAmount: webhookOrder.total_amount,
      userId: webhookOrder.user_id,
    });
    const queriedOrders = await queryAfdianOrdersByOutTradeNo(webhookOrder.out_trade_no);
    const verifiedOrder = findAfdianOrderByOutTradeNo(queriedOrders, webhookOrder.out_trade_no);
    if (!verifiedOrder) {
      throw new Error('爱发电订单回查失败：未找到对应订单');
    }
    const order = normalizeWebhookOrder(verifiedOrder);
    assertAfdianOrderMatchesWebhook(webhookOrder, order);
    console.log(`[AfdianWebhook] 订单回查核验通过 ${orderLogContext}`.trim());

    const prepared = await this.prepareOrderDelivery(order);
    if (prepared.deliveryId) {
      console.log(
        `[AfdianWebhook] 已触发私信投递 ${buildAfdianLogContext({
          outTradeNo: order.out_trade_no,
          deliveryId: prepared.deliveryId,
        })}`.trim(),
      );
      await afdianMessageDeliveryService.processDeliveryById(prepared.deliveryId);
    }
  }

  @Transactional
  private async prepareOrderDelivery(order: AfdianWebhookOrder): Promise<{ deliveryId: number | null }> {
    let orderId = 0;
    let orderRedeemCodeId = 0;
    let orderCreated = false;

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
      orderCreated = true;
    }

    console.log(
      `[AfdianWebhook] 订单已${orderCreated ? '创建' : '更新'} ${buildAfdianLogContext({
        outTradeNo: order.out_trade_no,
        orderId,
        month: order.month,
        planId: order.plan_id,
      })}`.trim(),
    );

    const planConfig = getAfdianPlanConfig(order.plan_id);
    if (!planConfig) {
      console.log(
        `[AfdianWebhook] 已忽略未配置方案 ${buildAfdianLogContext({
          outTradeNo: order.out_trade_no,
          planId: order.plan_id,
        })}`.trim(),
      );
      return { deliveryId: null };
    }

    const redeemCode = await redeemCodeService.getOrCreateCodeBySource({
      sourceType: AFDIAN_REDEEM_SOURCE_TYPE,
      sourceRefId: order.out_trade_no,
      rewardPayload: buildAfdianOrderRewardPayload(planConfig, order),
    });
    console.log(
      `[AfdianWebhook] 兑换码已${redeemCode.created ? '创建' : '复用'} ${buildAfdianLogContext({
        outTradeNo: order.out_trade_no,
        redeemCodeId: redeemCode.id,
        sourceRefId: order.out_trade_no,
      })}`.trim(),
    );

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

    const delivery = await afdianMessageDeliveryService.getOrCreateDeliveryTx({
      orderId,
      recipientUserId: order.user_id,
      content: buildAfdianRedeemCodeMessage(redeemCode.code),
    });
    console.log(
      `[AfdianWebhook] 私信任务已${delivery.created ? '创建' : '复用'} ${buildAfdianLogContext({
        outTradeNo: order.out_trade_no,
        orderId,
        deliveryId: delivery.id,
        recipientUserId: order.user_id,
      })}`.trim(),
    );

    return { deliveryId: delivery.id };
  }
}

export const afdianWebhookService = new AfdianWebhookService();
