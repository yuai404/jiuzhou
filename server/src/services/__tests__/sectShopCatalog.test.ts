import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHUNYANG_GONG_LIMIT_MAX_COUNT,
  CHUNYANG_GONG_LIMIT_WINDOW_DAYS,
  CHUNYANG_GONG_SHOP_ITEM_ID,
  SECT_SHOP_ITEMS,
  TECHNIQUE_FRAGMENT_DAILY_LIMIT,
  TECHNIQUE_FRAGMENT_SHOP_ITEM_ID,
} from '../sect/shopCatalog.js';

test('功法残页在宗门商店应为单张兑换且每日最多兑换500次', () => {
  const techniqueFragmentShopItem = SECT_SHOP_ITEMS.find((item) => item.id === TECHNIQUE_FRAGMENT_SHOP_ITEM_ID);

  assert.ok(techniqueFragmentShopItem);
  assert.deepEqual(techniqueFragmentShopItem.purchaseLimit, {
    kind: 'daily',
    maxCount: TECHNIQUE_FRAGMENT_DAILY_LIMIT,
    windowDays: 1,
  });
  assert.equal(techniqueFragmentShopItem.costContribution, 50);
  assert.equal(techniqueFragmentShopItem.qty, 1);
});

test('纯阳功在宗门商店应为30天限购1本', () => {
  const chunyangGongShopItem = SECT_SHOP_ITEMS.find((item) => item.id === CHUNYANG_GONG_SHOP_ITEM_ID);

  assert.ok(chunyangGongShopItem);
  assert.deepEqual(chunyangGongShopItem.purchaseLimit, {
    kind: 'rolling_days',
    maxCount: CHUNYANG_GONG_LIMIT_MAX_COUNT,
    windowDays: CHUNYANG_GONG_LIMIT_WINDOW_DAYS,
  });
  assert.equal(chunyangGongShopItem.costContribution, 2200);
  assert.equal(chunyangGongShopItem.qty, 1);
});
