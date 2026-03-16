/**
 * 账号密码表单规则共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护账号密码的最小长度策略、“确认密码一致”与“新旧密码不同”校验，供注册表单和修改密码表单复用。
 * 2. 做什么：让前端交互提示与服务端密码策略保持同一条规则，减少散落在多个页面的重复校验。
 * 3. 不做什么：不负责发起接口请求，也不负责决定提交成功后的跳转或弹窗行为。
 *
 * 输入/输出：
 * - 输入：表单的 `getFieldValue` 读取函数、主密码字段名、以及可选的不一致提示文案。
 * - 输出：可直接挂到 Ant Design `Form.Item.rules` 的校验函数，以及统一的密码最小长度常量/提示。
 *
 * 数据流/状态流：
 * 表单输入 -> 共享规则读取主密码字段 -> 返回 Promise 校验结果 -> 登录注册页 / 设置页统一展示校验提示。
 *
 * 关键边界条件与坑点：
 * 1. 确认密码为空时由必填规则单独处理，这里只负责“一致性”校验，避免重复提示。
 * 2. 主密码字段名不是固定值时必须通过参数传入，防止复用到其他表单时误读错误字段。
 */

export const ACCOUNT_PASSWORD_MIN_LENGTH = 6;
export const ACCOUNT_PASSWORD_MIN_LENGTH_MESSAGE = `口令至少${ACCOUNT_PASSWORD_MIN_LENGTH}位`;
export const ACCOUNT_PASSWORD_SAME_AS_CURRENT_MESSAGE = '新密码不能与当前密码相同';

export const createConfirmPasswordValidator = (
  getFieldValue: (fieldName: string) => string | undefined,
  passwordFieldName: string = 'password',
  mismatchMessage: string = '两次口令不一致',
) => {
  return (_rule: object, value?: string): Promise<void> => {
    if (!value || getFieldValue(passwordFieldName) === value) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(mismatchMessage));
  };
};

export const createDistinctPasswordValidator = (
  getFieldValue: (fieldName: string) => string | undefined,
  currentPasswordFieldName: string = 'currentPassword',
  samePasswordMessage: string = ACCOUNT_PASSWORD_SAME_AS_CURRENT_MESSAGE,
) => {
  return (_rule: object, value?: string): Promise<void> => {
    if (!value || getFieldValue(currentPasswordFieldName) !== value) {
      return Promise.resolve();
    }
    return Promise.reject(new Error(samePasswordMessage));
  };
};
