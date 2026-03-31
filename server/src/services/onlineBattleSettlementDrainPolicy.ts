/**
 * OnlineBattleSettlementDrainPolicy — 延迟结算 tick 分片调度策略
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中定义常规 tick 是否还能继续补派任务的预算规则，避免 runner 主流程把“tick 总预算 / 收尾预留窗口 / 单轮派发上限”判断散落在循环内部。
 * 2. 做什么：为常规调度与测试提供同一份纯函数策略，确保线上行为与回归断言一致。
 * 3. 不做什么：不读取任务队列、不操作 Promise，也不修改任务状态。
 *
 * 输入 / 输出：
 * - 输入：当前是否强制 drain 全量、tick 已运行时长、已派发任务数、tick 总预算、收尾预留窗口和最大派发数。
 * - 输出：布尔值，表示本轮 tick 是否允许继续补派新任务。
 *
 * 数据流 / 状态流：
 * runner.tick -> 计算当前耗时/派发数 -> 调用本模块
 * -> true 时继续 pickRunnableTasks
 * -> false 时停止补派，仅等待已在跑任务收尾。
 *
 * 复用设计说明：
 * 1. 常规 tick 的“分片执行”规则会同时影响调度代码和回归测试，抽成纯函数后不需要在测试里复制一套预算判断。
 * 2. 高频变化点是预算参数而不是判断结构，因此把可变部分都收敛成入参，后续调参不改调用方流程。
 *
 * 关键边界条件与坑点：
 * 1. `drainAll=true` 时必须始终允许继续补派，否则显式 flush 会退化成和常规 tick 一样的分片语义。
 * 2. 常规 tick 命中“派发截止时间”或单轮派发上限任一阈值都必须停止补派；否则最后一批任务的收尾时间会把总耗时拖过 tick 节拍。
 */

export const shouldContinueOnlineBattleSettlementDispatch = (params: {
  drainAll: boolean;
  elapsedMs: number;
  dispatchedTaskCount: number;
  tickBudgetMs: number;
  drainTailReserveMs: number;
  maxDispatchedTaskCount: number;
}): boolean => {
  if (params.drainAll) {
    return true;
  }

  if (params.dispatchedTaskCount >= params.maxDispatchedTaskCount) {
    return false;
  }

  const dispatchBudgetMs = Math.max(0, params.tickBudgetMs - params.drainTailReserveMs);
  return params.elapsedMs < dispatchBudgetMs;
};
