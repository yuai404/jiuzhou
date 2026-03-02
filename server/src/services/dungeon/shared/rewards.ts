/**
 * 秘境奖励计算工具
 *
 * 作用：封装秘境通关奖励的随机生成、合并、规范化逻辑。
 * 不做什么：不操作数据库，不发放物品（发放由 combat.ts 完成）。
 *
 * 输入：奖励配置 JSON / rewardMult 倍率。
 * 输出：DungeonRewardBundle（exp + silver + items）。
 *
 * 复用点：combat.ts（通关结算时计算首通奖励包）。
 *
 * 边界条件：
 * 1) rollRewardItems 按 chance 概率投掷，chance<=0 必不掉落。
 * 2) normalizeRewardAmount 支持固定数值和 {min, max} 区间两种配置格式。
 */

import { asObject, asArray, asNumber, asString } from './typeUtils.js';
import type { DungeonRewardItem, DungeonRewardBundle } from '../types.js';

/** 随机整数（含两端） */
export const randomIntInclusive = (min: number, max: number): number => {
  const safeMin = Math.floor(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  if (safeMin === safeMax) return safeMin;
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
};

/** 规范化奖励数值：支持固定数值和 {min, max} 区间 */
export const normalizeRewardAmount = (value: unknown): number => {
  if (typeof value === 'number' || typeof value === 'string') {
    return Math.max(0, Math.floor(asNumber(value, 0)));
  }
  const obj = asObject(value);
  if (!obj) return 0;
  const min = Math.max(0, Math.floor(asNumber(obj.min, 0)));
  const max = Math.max(min, Math.floor(asNumber(obj.max, min)));
  return randomIntInclusive(min, max);
};

/** 合并同名物品（按 itemDefId + bindType 去重累加数量） */
export const mergeRewardItems = (items: DungeonRewardItem[]): DungeonRewardItem[] => {
  const merged = new Map<string, DungeonRewardItem>();
  for (const item of items) {
    const key = `${item.itemDefId}|${item.bindType ?? ''}`;
    const existing = merged.get(key);
    if (existing) {
      existing.qty += item.qty;
      continue;
    }
    merged.set(key, { ...item });
  }
  return Array.from(merged.values());
};

/** 按概率生成奖励物品列表 */
export const rollRewardItems = (itemsValue: unknown): DungeonRewardItem[] => {
  const items: DungeonRewardItem[] = [];
  for (const raw of asArray(itemsValue)) {
    const obj = asObject(raw);
    if (!obj) continue;
    const itemDefId = asString(obj.item_def_id, '').trim();
    if (!itemDefId) continue;
    const chance = Math.max(0, Math.min(1, asNumber(obj.chance, 1)));
    if (chance <= 0 || Math.random() > chance) continue;

    const qtyExact = Math.floor(asNumber(obj.qty, 0));
    const qtyMin = Math.max(1, Math.floor(asNumber(obj.qty_min, qtyExact > 0 ? qtyExact : 1)));
    const qtyMax = Math.max(qtyMin, Math.floor(asNumber(obj.qty_max, qtyExact > 0 ? qtyExact : qtyMin)));
    const qty = qtyExact > 0 ? qtyExact : randomIntInclusive(qtyMin, qtyMax);
    if (qty <= 0) continue;

    const bindType = asString(obj.bind_type, '').trim();
    items.push({
      itemDefId,
      qty,
      ...(bindType ? { bindType } : {}),
    });
  }
  return mergeRewardItems(items);
};

/** 按奖励配置和倍率生成一个完整奖励包 */
export const rollDungeonRewardBundle = (rewardConfig: unknown, rewardMult: number): DungeonRewardBundle => {
  const rewardObj = asObject(rewardConfig);
  if (!rewardObj) return { exp: 0, silver: 0, items: [] };
  const mult = rewardMult > 0 ? rewardMult : 1;
  return {
    exp: Math.max(0, Math.floor(normalizeRewardAmount(rewardObj.exp) * mult)),
    silver: Math.max(0, Math.floor(normalizeRewardAmount(rewardObj.silver) * mult)),
    items: rollRewardItems(rewardObj.items),
  };
};

/** 合并两个奖励包 */
export const mergeDungeonRewardBundle = (base: DungeonRewardBundle, append: DungeonRewardBundle): DungeonRewardBundle => {
  return {
    exp: base.exp + append.exp,
    silver: base.silver + append.silver,
    items: mergeRewardItems([...base.items, ...append.items]),
  };
};
