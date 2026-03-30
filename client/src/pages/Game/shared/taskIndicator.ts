/**
 * 任务入口角标共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一定义“哪些任务分类会出现在任务入口列表”和“哪些状态算可完成”，让 Game 页角标与 TaskModal 使用同一套口径。
 * 2. 做什么：提供普通任务的可完成数量计算，以及任务弹窗左侧分类红点映射，避免页面层再次散落 `category/status` 判断。
 * 3. 不做什么：不发起接口请求、不管理 React state，也不处理主线任务独立面板的进度口径。
 *
 * 输入/输出：
 * - 输入：普通任务 `TaskOverviewRowDto[]`，或单个任务状态/分类。
 * - 输出：分类布尔判断、状态布尔判断、可完成数量数字、任务弹窗分类红点布尔映射。
 *
 * 数据流/状态流：
 * - `/task/overview` / `/task/overview/summary` 响应 -> 本文件过滤分类与状态 -> Game 页功能角标 / TaskModal 保持一致。
 *
 * 关键边界条件与坑点：
 * 1. 普通任务角标必须排除 `main`，因为主线展示与刷新走独立面板，不能把两套来源混在同一个数字里。
 * 2. “可完成”只认 `turnin/claimable`，不能把 `ongoing` 视作红点，否则会误导玩家把进行中任务当成可领奖。
 * 3. 角标统计必须与任务弹窗分类共用同一组 `category/status` 规则，避免首页数字和弹窗红点不一致。
 */
import type {
  TaskOverviewSummaryRowDto,
  TaskStatus,
} from '../../../services/api';

export type TaskIndicatorListCategory = Extract<
  TaskOverviewSummaryRowDto['category'],
  'side' | 'daily' | 'event'
>;

export type TaskIndicatorCategory = TaskOverviewSummaryRowDto['category'];

export type TaskCategoryIndicatorMap = Record<TaskIndicatorCategory, boolean>;

type TaskIndicatorTaskRow = {
  category: TaskIndicatorCategory;
  status: TaskStatus;
};

const TASK_INDICATOR_COMPLETABLE_STATUS: ReadonlySet<TaskStatus> = new Set([
  'turnin',
  'claimable',
]);

export const isTaskIndicatorListCategory = (
  category: TaskIndicatorCategory,
): category is TaskIndicatorListCategory => {
  return category === 'side' || category === 'daily' || category === 'event';
};

export const isTaskIndicatorCompletableStatus = (
  status: TaskStatus,
): boolean => {
  return TASK_INDICATOR_COMPLETABLE_STATUS.has(status);
};

export const countCompletableTaskOverviewRows = (
  tasks: TaskIndicatorTaskRow[],
): number => {
  return tasks.reduce((total, task) => {
    if (!isTaskIndicatorListCategory(task.category)) return total;
    return isTaskIndicatorCompletableStatus(task.status) ? total + 1 : total;
  }, 0);
};

export const buildTaskCategoryIndicatorMap = (
  tasks: TaskIndicatorTaskRow[],
): TaskCategoryIndicatorMap => {
  const indicators: TaskCategoryIndicatorMap = {
    main: false,
    side: false,
    daily: false,
    event: false,
  };

  for (const task of tasks) {
    if (!isTaskIndicatorListCategory(task.category)) continue;
    if (!isTaskIndicatorCompletableStatus(task.status)) continue;
    indicators[task.category] = true;
  }

  return indicators;
};
