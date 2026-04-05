/**
 * 洞府研修残页消耗共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护洞府研修基础残页消耗与顿悟符折后消耗，避免 service、状态接口和前端展示各自硬编码 50%。
 * 2. 做什么：提供统一的“当前应使用哪个残页成本”纯函数，供创建任务与状态接口复用。
 * 3. 不做什么：不查询数据库、不判断顿悟符库存，也不执行材料扣除。
 *
 * 输入/输出：
 * - 输入：是否启用顿悟符。
 * - 输出：基础成本、顿悟符成本，以及当前应使用的残页成本。
 *
 * 数据流/状态流：
 * 前端顿悟符开关 / 服务端创建任务 -> techniqueResearchCost -> 当前残页消耗。
 *
 * 关键边界条件与坑点：
 * 1. 基础消耗必须保持单独常量；顿悟符只是派生折后值，不能反向修改基础值。
 * 2. 折后成本必须向下收敛为非负整数，避免未来倍率调整后把小数写进材料扣除流程。
 */

export const TECHNIQUE_RESEARCH_BASE_FRAGMENT_COST = 3_500;
export const TECHNIQUE_RESEARCH_FRAGMENT_ITEM_DEF_ID = 'mat-gongfa-canye';
export const TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_FRAGMENT_DISCOUNT_RATE = 0.5;
export const TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_FRAGMENT_COST = Math.max(
  0,
  Math.floor(TECHNIQUE_RESEARCH_BASE_FRAGMENT_COST * TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_FRAGMENT_DISCOUNT_RATE),
);

export const resolveTechniqueResearchFragmentCost = (
  cooldownBypassEnabled: boolean,
): number => {
  return cooldownBypassEnabled
    ? TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_FRAGMENT_COST
    : TECHNIQUE_RESEARCH_BASE_FRAGMENT_COST;
};
