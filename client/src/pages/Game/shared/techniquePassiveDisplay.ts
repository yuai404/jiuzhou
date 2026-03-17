/**
 * 功法被动展示共享规则。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一处理功法被动属性的展示口径，供人物功法与伙伴功法复用。
 * 2. 做什么：集中维护“哪些功法被动按百分比显示”，避免各模块各写一套导致同一被动展示不一致。
 * 3. 不做什么：不负责属性中文名映射，也不负责层级聚合。
 *
 * 输入/输出：
 * - 输入：被动属性 key、数值 amount。
 * - 输出：用于 UI 的格式化字符串，如 `+5%`、`+4`。
 *
 * 数据流/状态流：
 * 功法层配置 passives -> 本文件格式化 -> TechniqueModal / PartnerModal 展示。
 *
 * 关键边界条件与坑点：
 * 1. 功法被动的 `fagong/wugong/wufang/fafang/max_qixue` 等键虽然最终会影响面板数值，但在功法展示里是“百分比增益”口径，不能复用通用属性面板格式化。
 * 2. `lingqi_huifu`、`qixue_huifu` 这类恢复值在功法配置里仍按固定值展示，不能误乘 100。
 */
import { percentAttrKeys } from './attrDisplay';

const TECHNIQUE_PASSIVE_PERCENT_KEYS = new Set<string>([
  'max_qixue',
  'wugong',
  'fagong',
  'wufang',
  'fafang',
  ...percentAttrKeys,
]);

export const isTechniquePassivePercentKey = (key: string): boolean => {
  return TECHNIQUE_PASSIVE_PERCENT_KEYS.has(key);
};

export const formatTechniquePassiveAmount = (key: string, amount: number): string => {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const displayNumber = isTechniquePassivePercentKey(key) ? abs * 100 : abs;
  const fixed = Number.isInteger(displayNumber)
    ? String(displayNumber)
    : String(Number(displayNumber.toFixed(2)));
  return `${sign}${fixed}${isTechniquePassivePercentKey(key) ? '%' : ''}`;
};
