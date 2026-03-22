/**
 * 词条池预览共享逻辑
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一处理词条池预览里的“当前境界可展示词条”过滤与阶级区间文案格式化，避免弹窗组件里同时散落过滤、计数和数值拼接逻辑。
 * - 做什么：把“无可用阶级不展示”收敛成单一入口，让桌面端与移动端共用同一个预览组件时口径一致。
 * - 不做什么：不负责请求数据、不负责搜索关键词匹配，也不负责 UI 样式与分组标题渲染。
 *
 * 输入/输出：
 * - 输入：后端返回的词条池预览词条数组，或其中单个 tier 配置。
 * - 输出：可直接用于 UI 的“可展示词条”数组，以及保留两位小数的阶级区间文本。
 *
 * 数据流/状态流：
 * - 后端 affixes -> `filterAvailableAffixPoolAffixes` 过滤当前境界可展示词条 -> 组件基于过滤结果做统计、搜索、分组与渲染。
 * - 单个 tier -> `formatAffixPoolPreviewTierRange` -> UI 展示文案。
 *
 * 关键边界条件与坑点：
 * 1. 词条是否可展示只看当前返回的 `tiers` 是否为空，不能在组件里再复制一份“显示空态卡片”的分支，否则统计与列表会不一致。
 * 2. 数值区间需要固定保留两位小数，不能沿用别处“去尾零”的展示口径，否则这个弹窗会继续出现长浮点噪声或位数不统一。
 */

import type {
  AffixPoolPreviewAffixEntry,
  AffixPoolPreviewTierEntry,
} from '../../../../services/api/inventory';

const AFFIX_POOL_PREVIEW_DECIMALS = 2;

const formatFixedPreviewValue = (value: number): string => {
  const rounded = Number(value.toFixed(AFFIX_POOL_PREVIEW_DECIMALS));
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  return normalized.toFixed(AFFIX_POOL_PREVIEW_DECIMALS);
};

export const filterAvailableAffixPoolAffixes = (
  affixes: AffixPoolPreviewAffixEntry[],
): AffixPoolPreviewAffixEntry[] => {
  return affixes.filter((affix) => affix.tiers.length > 0);
};

export const formatAffixPoolPreviewTierRange = (
  tier: AffixPoolPreviewTierEntry,
  applyType: string,
): string => {
  const suffix = applyType === 'percent' ? '%' : '';
  const min = applyType === 'percent' ? tier.min * 100 : tier.min;
  const max = applyType === 'percent' ? tier.max * 100 : tier.max;
  return `${formatFixedPreviewValue(min)}${suffix} ~ ${formatFixedPreviewValue(max)}${suffix}`;
};
