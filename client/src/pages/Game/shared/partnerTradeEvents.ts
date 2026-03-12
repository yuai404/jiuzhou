/**
 * 伙伴交易联动事件
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护伙伴交易相关前端刷新事件名，供伙伴弹窗与坊市弹窗复用。
 * 2. 做什么：把“伙伴数据发生交易变更”的广播动作收口为单一入口，避免魔法字符串散落。
 * 3. 不做什么：不发起接口请求，不维护全局状态，也不替代 socket 角色刷新。
 *
 * 输入/输出：
 * - 输入：无，调用 `dispatchPartnerChangedEvent()` 即可。
 * - 输出：浏览器 `window` 上的 `partner:changed` 事件。
 *
 * 数据流/状态流：
 * - 伙伴上架/下架/购买成功 -> 派发本事件 -> PartnerModal / MarketModal 订阅后刷新本地数据。
 *
 * 关键边界条件与坑点：
 * 1. 该事件只表达“伙伴相关数据变了”，不传业务 payload，避免不同模块对事件体产生隐式耦合。
 * 2. 事件派发前必须先判断运行环境存在 `window`，避免 SSR 或测试环境直接访问浏览器对象。
 */

export const PARTNER_CHANGED_EVENT = 'partner:changed';

export const dispatchPartnerChangedEvent = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PARTNER_CHANGED_EVENT));
};
