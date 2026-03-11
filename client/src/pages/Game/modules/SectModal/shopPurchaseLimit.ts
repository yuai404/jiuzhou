/**
 * 宗门商店限购展示工具。
 *
 * 作用：
 * - 统一解析后端下发的宗门商店限购结构，并给商店面板提供展示文案与本地批量输入上限。
 * - 避免“每日限购 / 30 天限购”的判断继续散落在 `ShopPanel.tsx` 中重复实现。
 * 不做：
 * - 不记录玩家已购买次数；真实校验仍以后端购买接口为准。
 * - 不处理 UI 渲染，只返回结构化结果和字符串文案。
 *
 * 输入/输出：
 * - 输入：`SectShopPurchaseLimitDto`、个人贡献、单次兑换消耗。
 * - 输出：规范化后的限购对象、限购标签文本、当前可输入的最大兑换次数。
 *
 * 数据流：
 * - `ShopPanel.tsx` 先调用本模块规范化限购结构。
 * - 再复用同一份结果计算输入上限和渲染限购标签，确保展示和交互共用单一规则。
 *
 * 关键边界条件与坑点：
 * 1) 前端拿不到玩家在当前周期内的已购次数，所以这里只按“周期总上限”约束输入框，不在前端伪造剩余次数。
 * 2) `rolling_days` 表示滚动天数窗口，因此标签使用“30天限购 1”而不是“每月限购 1”。
 */
import type { SectShopPurchaseLimitDto } from '../../../../services/api';
import { SECT_SHOP_BATCH_BUY_INPUT_MAX } from './constants';

export interface NormalizedSectShopPurchaseLimit {
  kind: 'daily' | 'rolling_days';
  maxCount: number;
  windowDays: number;
}

const normalizePositiveInt = (value: number): number => {
  return Math.max(1, Math.floor(value));
};

export const normalizeSectShopPurchaseLimit = (
  rawLimit: SectShopPurchaseLimitDto | undefined
): NormalizedSectShopPurchaseLimit | null => {
  if (!rawLimit) return null;
  switch (rawLimit.kind) {
    case 'daily':
      return {
        kind: 'daily',
        maxCount: normalizePositiveInt(rawLimit.maxCount),
        windowDays: 1,
      };
    case 'rolling_days':
      return {
        kind: 'rolling_days',
        maxCount: normalizePositiveInt(rawLimit.maxCount),
        windowDays: normalizePositiveInt(rawLimit.windowDays),
      };
  }
  const exhaustiveCheck: never = rawLimit.kind;
  return exhaustiveCheck;
};

export const formatSectShopPurchaseLimitLabel = (
  purchaseLimit: NormalizedSectShopPurchaseLimit | null
): string | null => {
  if (!purchaseLimit) return null;
  switch (purchaseLimit.kind) {
    case 'daily':
      return `每日限购 ${purchaseLimit.maxCount}`;
    case 'rolling_days':
      return `${purchaseLimit.windowDays}天限购 ${purchaseLimit.maxCount}`;
  }
  const exhaustiveCheck: never = purchaseLimit.kind;
  return exhaustiveCheck;
};

export const calcSectShopMaxBuyCount = (
  myContribution: number,
  costContribution: number,
  purchaseLimit: NormalizedSectShopPurchaseLimit | null
): number => {
  const maxByContribution =
    costContribution > 0 ? Math.max(0, Math.floor(myContribution / costContribution)) : SECT_SHOP_BATCH_BUY_INPUT_MAX;
  const maxByPurchaseLimit = purchaseLimit ? purchaseLimit.maxCount : SECT_SHOP_BATCH_BUY_INPUT_MAX;
  return Math.max(0, Math.min(SECT_SHOP_BATCH_BUY_INPUT_MAX, maxByContribution, maxByPurchaseLimit));
};
