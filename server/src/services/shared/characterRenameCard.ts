/**
 * 易名符语义共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中识别一个物品定义是否为“角色改名卡”，供改名服务复用，避免把同一 effect_type 判断散落在多个服务里。
 * 2. 做什么：对外暴露统一的改名效果文案标签，方便后续前端/服务端对齐展示语义。
 * 3. 不做什么：不处理物品扣除、不处理背包 UI 状态，也不决定路由入口。
 *
 * 输入/输出：
 * - 输入：静态物品定义。
 * - 输出：是否具备“改名卡”语义。
 *
 * 数据流/状态流：
 * item_def.effect_defs -> 本模块识别 `rename_character` 效果 -> 改名服务决定是否允许消耗。
 *
 * 关键边界条件与坑点：
 * 1. 不能只按物品名称判断，否则后续改文案或做多张改名卡时会失真。
 * 2. 只认显式 `effect_type = rename_character`，避免普通 consumable 被误判成改名道具。
 */
import type { ItemDefConfig } from '../staticConfigLoader.js';

export const CHARACTER_RENAME_EFFECT_TYPE = 'rename_character';

export const isCharacterRenameCardItemDefinition = (
  itemDef: ItemDefConfig | null,
): boolean => {
  if (!itemDef) {
    return false;
  }

  const effectDefs = Array.isArray(itemDef.effect_defs) ? itemDef.effect_defs : [];
  for (const effectDef of effectDefs) {
    if (!effectDef || typeof effectDef !== 'object' || Array.isArray(effectDef)) {
      continue;
    }

    const effectType = 'effect_type' in effectDef ? String(effectDef.effect_type || '').trim() : '';
    if (effectType === CHARACTER_RENAME_EFFECT_TYPE) {
      return true;
    }
  }

  return false;
};
