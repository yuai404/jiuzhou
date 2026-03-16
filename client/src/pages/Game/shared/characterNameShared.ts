/**
 * 角色道号前端共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护创角与改名弹窗共用的道号裁剪、长度校验与表单规则，避免两个入口重复写 2-12 字符判断。
 * 2. 做什么：输出统一错误文案，让前端不同入口与服务端返回保持同一语义。
 * 3. 不做什么：不发请求、不管理弹窗状态，也不处理敏感词与重名等服务端权威校验。
 *
 * 输入/输出：
 * - 输入：原始道号字符串，可选自定义必填提示。
 * - 输出：裁剪后的道号、长度错误文案，以及可直接给 Ant Design Form 复用的规则数组。
 *
 * 数据流/状态流：
 * 输入框原始值 -> `normalizeCharacterNameInput` -> `getCharacterNameLengthError` -> 表单规则 / 改名提交流程。
 *
 * 关键边界条件与坑点：
 * 1. 只要前端还允许录入首尾空白，就必须基于裁剪后的值做长度校验，否则创角与改名会出现前后不一致。
 * 2. 这里不做敏感词或重名预判，避免前端偷偷复制服务端业务规则。
 */
import type { Rule } from 'antd/es/form';

export const CHARACTER_NAME_MIN_LENGTH = 2;
export const CHARACTER_NAME_MAX_LENGTH = 12;
export const CHARACTER_NAME_REQUIRED_MESSAGE = '请输入道号';
export const CHARACTER_NAME_LENGTH_MESSAGE = '道号需2-12个字符';

export const normalizeCharacterNameInput = (value: string): string => {
  return String(value || '').trim();
};

export const getCharacterNameLengthError = (value: string): string | null => {
  const normalizedValue = normalizeCharacterNameInput(value);
  const length = normalizedValue.length;
  if (length < CHARACTER_NAME_MIN_LENGTH || length > CHARACTER_NAME_MAX_LENGTH) {
    return CHARACTER_NAME_LENGTH_MESSAGE;
  }
  return null;
};

const createCharacterNameLengthValidator = () => {
  return async (_rule: Rule, value: string | undefined): Promise<void> => {
    const normalizedValue = normalizeCharacterNameInput(String(value || ''));
    if (!normalizedValue) {
      return;
    }

    const lengthError = getCharacterNameLengthError(normalizedValue);
    if (lengthError) {
      throw new Error(lengthError);
    }
  };
};

export const buildCharacterNameFormRules = (
  requiredMessage: string = CHARACTER_NAME_REQUIRED_MESSAGE,
): Rule[] => {
  return [
    { required: true, whitespace: true, message: requiredMessage },
    { validator: createCharacterNameLengthValidator() },
  ];
};
