/**
 * 路由参数解析工具
 *
 * 作用：
 * - 统一 Express params/query 的“单值提取”逻辑
 * - 避免路由层重复出现 Array.isArray(param) ? param[0] : param 模板代码
 */

export const getSingleParam = (value: string | string[] | undefined): string => {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
};

export const getSingleQueryValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' ? first : '';
  }
  return '';
};

export const parsePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

