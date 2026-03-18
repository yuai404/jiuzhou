import {
  getBountyTaskOverview,
  getTaskOverview,
  type BountyTaskOverviewResponse,
  type TaskOverviewResponse,
} from '../../../services/api';

/**
 * 任务总览请求共享层
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一承接普通任务总览与悬赏总览的并发请求合并，避免同一页面会话里的 Game 入口角标、任务弹窗等模块在同一时刻重复打到同一个接口。
 * 2. 做什么：把“按作用域共享 in-flight Promise”和“强制刷新可绕过去重”的规则放在页面共享层，减少业务组件各自维护一套请求时序状态。
 * 3. 不做什么：不缓存历史成功结果，不负责任务数据转换，不管理 React state，也不决定调用方何时刷新。
 *
 * 输入/输出：
 * - 输入：页面会话级 `scopeKey`，以及是否 `forceRefresh`。
 * - 输出：后端原始响应 `TaskOverviewResponse` / `BountyTaskOverviewResponse`。
 *
 * 数据流/状态流：
 * Game 创建页面会话作用域 -> Game / TaskModal 在同一 `scopeKey` 下共享进行中的 Promise -> 强制刷新时显式发新请求 -> 请求完成后按引用释放 inflight -> 调用方各自消费响应。
 *
 * 关键边界条件与坑点：
 * 1. 这里只合并“同一页面会话、同一时刻、同一接口”的请求，不做持久缓存；任务追踪、领奖后仍应由调用方显式强刷，避免读到旧数据。
 * 2. 普通任务和悬赏任务是两个独立接口，必须拆开维护 inflight，不能混成单一状态，否则会让一侧错误阻塞另一侧刷新。
 * 3. 作用域在页面卸载时必须清理，否则旧会话的 Promise 可能被新会话误复用。
 */

type TaskOverviewRequestScopeState = {
  taskOverviewInflight: Promise<TaskOverviewResponse> | null;
  bountyTaskOverviewInflight: Promise<BountyTaskOverviewResponse> | null;
};

type SharedTaskOverviewLoadOptions = {
  forceRefresh?: boolean;
};

const taskOverviewRequestScopeStateMap = new Map<string, TaskOverviewRequestScopeState>();

const createEmptyTaskOverviewRequestScopeState = (): TaskOverviewRequestScopeState => ({
  taskOverviewInflight: null,
  bountyTaskOverviewInflight: null,
});

const getTaskOverviewRequestScopeState = (
  scopeKey: string,
): TaskOverviewRequestScopeState => {
  const current = taskOverviewRequestScopeStateMap.get(scopeKey);
  if (current) return current;

  const created = createEmptyTaskOverviewRequestScopeState();
  taskOverviewRequestScopeStateMap.set(scopeKey, created);
  return created;
};

const clearTaskOverviewRequestScopeIfIdle = (scopeKey: string): void => {
  const state = taskOverviewRequestScopeStateMap.get(scopeKey);
  if (!state) return;
  if (state.taskOverviewInflight || state.bountyTaskOverviewInflight) return;
  taskOverviewRequestScopeStateMap.delete(scopeKey);
};

const runScopedTaskOverviewRequest = <T>(params: {
  scopeKey: string;
  forceRefresh?: boolean;
  getInflight: (state: TaskOverviewRequestScopeState) => Promise<T> | null;
  setInflight: (state: TaskOverviewRequestScopeState, request: Promise<T> | null) => void;
  requestFactory: () => Promise<T>;
}): Promise<T> => {
  const state = getTaskOverviewRequestScopeState(params.scopeKey);
  const inflight = params.getInflight(state);
  if (!params.forceRefresh && inflight) {
    return inflight;
  }

  const request = params.requestFactory().finally(() => {
    const latestState = taskOverviewRequestScopeStateMap.get(params.scopeKey);
    if (!latestState) return;
    if (params.getInflight(latestState) === request) {
      params.setInflight(latestState, null);
    }
    clearTaskOverviewRequestScopeIfIdle(params.scopeKey);
  });
  params.setInflight(state, request);
  return request;
};

export const clearTaskOverviewRequestScope = (scopeKey: string): void => {
  taskOverviewRequestScopeStateMap.delete(scopeKey);
};

export const loadSharedTaskOverview = (
  scopeKey: string,
  options?: SharedTaskOverviewLoadOptions,
): Promise<TaskOverviewResponse> => {
  return runScopedTaskOverviewRequest({
    scopeKey,
    forceRefresh: options?.forceRefresh,
    getInflight: (state) => state.taskOverviewInflight,
    setInflight: (state, request) => {
      state.taskOverviewInflight = request;
    },
    requestFactory: () => getTaskOverview(),
  });
};

export const loadSharedBountyTaskOverview = (
  scopeKey: string,
  options?: SharedTaskOverviewLoadOptions,
): Promise<BountyTaskOverviewResponse> => {
  return runScopedTaskOverviewRequest({
    scopeKey,
    forceRefresh: options?.forceRefresh,
    getInflight: (state) => state.bountyTaskOverviewInflight,
    setInflight: (state, request) => {
      state.bountyTaskOverviewInflight = request;
    },
    requestFactory: () => getBountyTaskOverview(),
  });
};
