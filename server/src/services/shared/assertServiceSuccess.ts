/**
 * 服务结果成功断言
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把 `success=false` 的可预期业务结果统一提升为 `BusinessError`，让错误中间件保留原始业务文案。
 * 2. 做什么：给主线奖励、对话效果这类“收到 ServiceResult 再继续串联流程”的调用方提供单一断言入口，避免各处重复写 `throw new Error(result.message)`。
 * 3. 不做什么：不负责记录日志，不负责兜底改写 message，也不处理系统异常对象。
 *
 * 输入/输出：
 * - 输入：最小结构为 `{ success: boolean; message: string }` 的服务返回值。
 * - 输出：成功时无返回值；失败时抛出 `BusinessError`。
 *
 * 数据流/状态流：
 * itemService / inventoryService 等 ServiceResult -> 本模块断言 -> BusinessError -> 全局错误中间件 -> 客户端原样提示。
 *
 * 关键边界条件与坑点：
 * 1. 这里只负责“业务失败结果”的抛错提升，调用方不要再外层包一层 `throw new Error(...)`，否则会重新退化成服务器错误。
 * 2. message 会直接暴露给前端，因此调用方传入的结果文案必须是可对外展示的业务提示，不能夹带内部细节。
 */
import { BusinessError } from '../../middleware/BusinessError.js';

export interface ServiceResultLike {
  success: boolean;
  message: string;
}

export const assertServiceSuccess = (result: ServiceResultLike): void => {
  if (result.success) {
    return;
  }
  throw new BusinessError(result.message);
};
