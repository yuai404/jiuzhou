/**
 * 技能资源消耗共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中标准化技能的固定值/百分比资源消耗，并统一计算战斗中实际扣除的灵气与气血。
 * 2. 做什么：为技能定义读取、战斗可释放判定、战斗扣费提供单一入口，避免多个模块各写一套百分比换算。
 * 3. 不做什么：不处理技能效果、不处理冷却，也不负责前端展示文案。
 *
 * 输入/输出：
 * - 输入：技能静态字段（`cost_lingqi` / `cost_lingqi_rate` / `cost_qixue` / `cost_qixue_rate`）与单位当前最大资源。
 * - 输出：标准化后的消耗结构，以及按单位最大资源换算出的实际扣费结果。
 *
 * 数据流/状态流：
 * skill_def / AI 生成功法 -> normalizeSkillCost -> BattleSkill.cost
 * BattleSkill.cost + unit.currentAttrs -> resolveSkillCostForResourceState -> 可释放判定 / 实际扣费。
 *
 * 关键边界条件与坑点：
 * 1. 百分比消耗统一按“最大灵气/最大气血”计算，而不是按当前值计算，否则前后端展示与战斗结果会漂移。
 * 2. 百分比消耗只要大于 0 且最大资源大于 0，就至少向上取整为 1，避免低资源角色出现“有百分比但实际免费”的隐性分支。
 */

export type SkillCostInput = {
  cost_lingqi?: number | null;
  cost_lingqi_rate?: number | null;
  cost_qixue?: number | null;
  cost_qixue_rate?: number | null;
};

export type SkillCostValue = {
  lingqi?: number;
  lingqiRate?: number;
  qixue?: number;
  qixueRate?: number;
};

export type SkillResourceState = {
  lingqi: number;
  qixue: number;
  maxLingqi: number;
  maxQixue: number;
};

export type ResolvedSkillCost = {
  lingqiFlat: number;
  lingqiRate: number;
  qixueFlat: number;
  qixueRate: number;
  totalLingqi: number;
  totalQixue: number;
};

const normalizeIntegerCost = (value: number | null | undefined): number => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, Math.floor(next));
};

const normalizeRateCost = (value: number | null | undefined): number => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.max(0, next);
};

const resolveRateCostAmount = (maxValue: number, rate: number): number => {
  const normalizedMax = Math.max(0, Math.floor(Number(maxValue) || 0));
  if (normalizedMax <= 0 || rate <= 0) return 0;
  return Math.max(1, Math.ceil(normalizedMax * rate));
};

export const normalizeSkillCost = (input: SkillCostInput): SkillCostValue => {
  const lingqi = normalizeIntegerCost(input.cost_lingqi);
  const lingqiRate = normalizeRateCost(input.cost_lingqi_rate);
  const qixue = normalizeIntegerCost(input.cost_qixue);
  const qixueRate = normalizeRateCost(input.cost_qixue_rate);

  const cost: SkillCostValue = {};
  if (lingqi > 0) cost.lingqi = lingqi;
  if (lingqiRate > 0) cost.lingqiRate = lingqiRate;
  if (qixue > 0) cost.qixue = qixue;
  if (qixueRate > 0) cost.qixueRate = qixueRate;
  return cost;
};

export const resolveSkillCostForResourceState = (
  cost: SkillCostValue,
  resourceState: Pick<SkillResourceState, 'maxLingqi' | 'maxQixue'>,
): ResolvedSkillCost => {
  const lingqiFlat = normalizeIntegerCost(cost.lingqi);
  const lingqiRate = normalizeRateCost(cost.lingqiRate);
  const qixueFlat = normalizeIntegerCost(cost.qixue);
  const qixueRate = normalizeRateCost(cost.qixueRate);

  const rateLingqi = resolveRateCostAmount(resourceState.maxLingqi, lingqiRate);
  const rateQixue = resolveRateCostAmount(resourceState.maxQixue, qixueRate);

  return {
    lingqiFlat,
    lingqiRate,
    qixueFlat,
    qixueRate,
    totalLingqi: lingqiFlat + rateLingqi,
    totalQixue: qixueFlat + rateQixue,
  };
};

export const resolveSkillCostForUnit = (
  cost: SkillCostValue,
  unit: Pick<SkillResourceState, 'maxLingqi' | 'maxQixue'>,
): ResolvedSkillCost => {
  return resolveSkillCostForResourceState(cost, unit);
};
