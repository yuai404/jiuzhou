/**
 * 技能资源消耗展示与判定共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中格式化技能的固定值/百分比消耗文案，并统一计算前端侧资源校验所需的实际消耗。
 * 2. 做什么：供功法技能详情、战斗技能浮层等多个入口复用，避免“百分比消耗”在每个组件各写一份。
 * 3. 不做什么：不处理技能效果文案、不处理冷却，也不发起任何网络请求。
 *
 * 输入/输出：
 * - 输入：技能消耗字段与角色当前/最大资源。
 * - 输出：结构化消耗条目、单条展示文本，以及按最大资源换算的实际需求值。
 *
 * 数据流/状态流：
 * 技能 DTO -> normalizeSkillCost -> buildSkillCostEntries / resolveSkillCostRequirement
 * -> 功法详情展示 / 技能按钮可释放校验。
 *
 * 关键边界条件与坑点：
 * 1. 百分比消耗统一按最大资源计算，并向上取整，必须与服务端战斗结算保持一致。
 * 2. 同时存在固定值与百分比时，展示文案必须合并为单一条目，否则不同组件容易各漏一半信息。
 */

import { formatPercent } from './formatAttr';

export type SkillCostValue = {
  lingqi: number;
  lingqiRate: number;
  qixue: number;
  qixueRate: number;
};

export type SkillResourceState = {
  lingqi: number;
  qixue: number;
  maxLingqi: number;
  maxQixue: number;
};

export type SkillCostEntry = {
  key: 'lingqi' | 'qixue';
  label: '灵气' | '气血';
  value: string;
};

export type ResolvedSkillCost = {
  totalLingqi: number;
  totalQixue: number;
};

type SkillCostInput = Partial<{
  costLingqi: number;
  costLingqiRate: number;
  costQixue: number;
  costQixueRate: number;
}>;

const normalizeIntegerCost = (value: number | undefined): number => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.floor(next));
};

const normalizeRateCost = (value: number | undefined): number => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, next);
};

const resolveRateCostAmount = (maxValue: number, rate: number): number => {
  const normalizedMax = Math.max(0, Math.floor(Number(maxValue) || 0));
  if (normalizedMax <= 0 || rate <= 0) return 0;
  return Math.max(1, Math.ceil(normalizedMax * rate));
};

const buildSingleCostValue = (
  flatValue: number,
  rateValue: number,
  maxLabel: '最大灵气' | '最大气血',
): string => {
  const parts: string[] = [];
  if (flatValue > 0) parts.push(String(flatValue));
  if (rateValue > 0) parts.push(`${formatPercent(rateValue)}${maxLabel}`);
  return parts.join(' + ');
};

export const normalizeSkillCost = (input: SkillCostInput): SkillCostValue => {
  return {
    lingqi: normalizeIntegerCost(input.costLingqi),
    lingqiRate: normalizeRateCost(input.costLingqiRate),
    qixue: normalizeIntegerCost(input.costQixue),
    qixueRate: normalizeRateCost(input.costQixueRate),
  };
};

export const buildSkillCostEntries = (cost: SkillCostValue): SkillCostEntry[] => {
  const entries: SkillCostEntry[] = [];
  const lingqiValue = buildSingleCostValue(cost.lingqi, cost.lingqiRate, '最大灵气');
  if (lingqiValue) {
    entries.push({ key: 'lingqi', label: '灵气', value: lingqiValue });
  }
  const qixueValue = buildSingleCostValue(cost.qixue, cost.qixueRate, '最大气血');
  if (qixueValue) {
    entries.push({ key: 'qixue', label: '气血', value: qixueValue });
  }
  return entries;
};

export const resolveSkillCostRequirement = (
  cost: SkillCostValue,
  resourceState: Pick<SkillResourceState, 'maxLingqi' | 'maxQixue'>,
): ResolvedSkillCost => {
  return {
    totalLingqi: cost.lingqi + resolveRateCostAmount(resourceState.maxLingqi, cost.lingqiRate),
    totalQixue: cost.qixue + resolveRateCostAmount(resourceState.maxQixue, cost.qixueRate),
  };
};
