/**
 * 宗门商店限购规则共享模块。
 *
 * 作用：
 * - 统一声明宗门商店的周期限购结构、SQL 查询窗口与超限提示，避免“每日限购 / 30 天限购”散落在商品目录和购买流程里重复实现。
 * - 为商品目录提供限购构造函数，为购买服务提供同一份限购窗口与文案规则。
 * 不做：
 * - 不负责发放物品、扣除贡献或记录宗门日志。
 * - 不处理前端展示文案；前端只消费后端下发的结构化限购数据。
 *
 * 输入/输出：
 * - 输入：商品目录声明的限购参数，以及购买服务传入的结构化限购配置。
 * - 输出：标准化的 `ShopPurchaseLimit`、日志查询窗口条件和超限提示文案。
 *
 * 数据流：
 * - `shopCatalog.ts` 通过本模块创建统一的限购配置。
 * - `shop.ts` 复用本模块生成限购日志查询窗口，并基于同一配置返回失败提示。
 *
 * 关键边界条件与坑点：
 * 1) `rolling_days` 是滚动窗口，不是自然月；“30 天限购 1 次”表示最近 30 天内累计只能买 1 次。
 * 2) 本模块只接受正整数窗口和次数；商品若不限购，应直接省略 `purchaseLimit`，而不是传 0。
 */
import type { ShopPurchaseLimit } from './types.js';

const normalizePositiveInt = (value: number): number => {
  return Math.max(1, Math.floor(value));
};

export const createDailyShopPurchaseLimit = (maxCount: number): ShopPurchaseLimit => {
  return {
    kind: 'daily',
    maxCount: normalizePositiveInt(maxCount),
    windowDays: 1,
  };
};

export const createRollingDaysShopPurchaseLimit = (
  windowDays: number,
  maxCount: number
): ShopPurchaseLimit => {
  return {
    kind: 'rolling_days',
    maxCount: normalizePositiveInt(maxCount),
    windowDays: normalizePositiveInt(windowDays),
  };
};

export const buildShopPurchaseLimitWindowCondition = (
  purchaseLimit: ShopPurchaseLimit,
  paramIndex: number
): { sql: string; params: number[] } => {
  switch (purchaseLimit.kind) {
    case 'daily':
      return {
        sql: 'created_at::date = CURRENT_DATE',
        params: [],
      };
    case 'rolling_days':
      return {
        sql: `created_at >= NOW() - make_interval(days => $${paramIndex})`,
        params: [purchaseLimit.windowDays],
      };
  }
};

export const buildShopPurchaseLimitExceededMessage = (
  purchaseLimit: ShopPurchaseLimit,
  usedCount: number
): string => {
  const remain = Math.max(0, purchaseLimit.maxCount - usedCount);
  switch (purchaseLimit.kind) {
    case 'daily':
      if (purchaseLimit.maxCount <= 1) {
        return '该商品今日已兑换';
      }
      return `该商品今日最多兑换${purchaseLimit.maxCount}个（剩余${remain}个）`;
    case 'rolling_days':
      if (purchaseLimit.maxCount <= 1) {
        return `该商品${purchaseLimit.windowDays}天内仅可兑换1个`;
      }
      return `该商品${purchaseLimit.windowDays}天内最多兑换${purchaseLimit.maxCount}个（剩余${remain}个）`;
  }
};
