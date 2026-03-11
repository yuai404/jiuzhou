/**
 * 宗门商店商品目录共享模块。
 *
 * 作用：
 * - 集中维护宗门商店的商品定义、图标补齐与限购常量，避免商品规则散落在购买流程与测试里重复声明。
 * - 对外输出可直接下发前端的商品列表，以及少量会被服务层/测试复用的商品标识常量。
 * 不做：
 * - 不处理贡献扣除、周期限购校验、发货与日志落库。
 * - 不处理路由层入参与响应拼装。
 *
 * 输入/输出：
 * - 输入：静态物品定义表（通过 itemDefId 读取 icon）。
 * - 输出：`SECT_SHOP_ITEMS` 商品列表、关键商品 ID 与对应限购常量。
 *
 * 数据流：
 * - 先定义不含图标的基础商品目录。
 * - 再统一按 itemDefId 补齐 icon，生成最终给服务层返回的商品列表。
 * - 服务层与测试统一消费这里的配置，确保“配置源”只有一份。
 *
 * 关键边界条件与坑点：
 * 1) 不限购商品应直接省略 `purchaseLimit`，避免“0 是否代表不限购”的规则散落到调用方。
 * 2) icon 解析失败时返回 null，前端继续走现有占位图逻辑，避免在这里引入展示层兜底。
 */
import { getItemDefinitionById } from '../staticConfigLoader.js';
import { createDailyShopPurchaseLimit, createRollingDaysShopPurchaseLimit } from './shopPurchaseLimit.js';
import type { ShopItem } from './types.js';

type BaseShopItem = Omit<ShopItem, 'itemIcon'>;

export const CHUNYANG_GONG_SHOP_ITEM_ID = 'sect-shop-004';
export const CHUNYANG_GONG_LIMIT_WINDOW_DAYS = 30;
export const CHUNYANG_GONG_LIMIT_MAX_COUNT = 1;
export const TECHNIQUE_FRAGMENT_SHOP_ITEM_ID = 'sect-shop-005';
export const TECHNIQUE_FRAGMENT_DAILY_LIMIT = 500;
export const BAG_EXPAND_SHOP_ITEM_ID = 'sect-shop-007';
export const BAG_EXPAND_DAILY_LIMIT = 1;
export const REROLL_SCROLL_SHOP_ITEM_ID = 'sect-shop-008';
export const REROLL_SCROLL_DAILY_LIMIT = 50;

const resolveShopItemIcon = (itemDefId: string): string | null => {
  const rawIcon = getItemDefinitionById(itemDefId)?.icon;
  if (typeof rawIcon !== 'string') return null;
  const icon = rawIcon.trim();
  return icon.length > 0 ? icon : null;
};

const SHOP_BASE: BaseShopItem[] = [
  { id: 'sect-shop-001', name: '淬灵石×10', costContribution: 100, itemDefId: 'enhance-001', qty: 10 },
  {
    id: CHUNYANG_GONG_SHOP_ITEM_ID,
    name: '《纯阳功》×1',
    costContribution: 2200,
    itemDefId: 'book-chunyang-gong',
    qty: 1,
    purchaseLimit: createRollingDaysShopPurchaseLimit(CHUNYANG_GONG_LIMIT_WINDOW_DAYS, CHUNYANG_GONG_LIMIT_MAX_COUNT),
  },
  {
    id: TECHNIQUE_FRAGMENT_SHOP_ITEM_ID,
    name: '功法残页×1',
    costContribution: 50,
    itemDefId: 'mat-gongfa-canye',
    qty: 1,
    purchaseLimit: createDailyShopPurchaseLimit(TECHNIQUE_FRAGMENT_DAILY_LIMIT),
  },
  { id: 'sect-shop-006', name: '灵墨×5', costContribution: 1800, itemDefId: 'mat-lingmo', qty: 5 },
  {
    id: REROLL_SCROLL_SHOP_ITEM_ID,
    name: '洗炼符×1',
    costContribution: 1000,
    itemDefId: 'scroll-003',
    qty: 1,
    purchaseLimit: createDailyShopPurchaseLimit(REROLL_SCROLL_DAILY_LIMIT),
  },
  {
    id: BAG_EXPAND_SHOP_ITEM_ID,
    name: '背包扩容符×1',
    costContribution: 10000,
    itemDefId: 'func-001',
    qty: 1,
    purchaseLimit: createDailyShopPurchaseLimit(BAG_EXPAND_DAILY_LIMIT),
  },
];

export const SECT_SHOP_ITEMS: ShopItem[] = SHOP_BASE.map((item) => ({
  ...item,
  itemIcon: resolveShopItemIcon(item.itemDefId),
}));
