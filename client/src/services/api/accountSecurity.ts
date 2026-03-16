/**
 * 账号安全接口模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中封装账号安全相关接口，目前提供修改密码请求，供设置面板等入口复用。
 * 2. 做什么：保持账号安全接口与手机号绑定接口分层，避免把不同职责的账号能力混在同一个文件里。
 * 3. 不做什么：不处理表单校验、不拼接错误文案，也不直接操作本地登录态。
 *
 * 输入/输出：
 * - 输入：当前密码、新密码，以及可选的 Axios 请求配置。
 * - 输出：统一响应 `{ success, message }`。
 *
 * 数据流/状态流：
 * 交互组件提交表单 -> 本模块调用 `/account/password/change` -> 调用方根据统一响应决定提示与表单重置。
 *
 * 关键边界条件与坑点：
 * 1. 改密属于鉴权接口，调用时必须带上登录 token；token 注入由 `api/core.ts` 统一负责。
 * 2. 当前密码与新密码都由服务端再次校验，本模块不做额外兜底分支，避免前后规则分叉。
 */
import type { AxiosRequestConfig } from 'axios';
import api from './core';

export interface ChangePasswordResponse {
  success: boolean;
  message: string;
}

export const changePassword = (
  currentPassword: string,
  newPassword: string,
  requestConfig?: AxiosRequestConfig,
): Promise<ChangePasswordResponse> => {
  return api.post('/account/password/change', { currentPassword, newPassword }, requestConfig);
};
