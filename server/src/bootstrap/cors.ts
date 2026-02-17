/**
 * CORS 选项构建工具
 *
 * 作用：
 * - 统一解析 CORS_ORIGIN 环境变量
 * - 提供默认白名单策略（仅允许 6010 端口页面发起跨域）
 */
export type CorsOriginFn = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void
) => void;

const parseCorsOrigins = (raw: string): string[] => {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
};

const buildDefaultCorsOriginOption = (): CorsOriginFn => {
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    const value = String(origin).trim();
    if (!value) return cb(null, true);
    try {
      const url = new URL(value);
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      return cb(null, port === '6010');
    } catch {
      return cb(null, false);
    }
  };
};

export const buildCorsOriginOption = (raw: string | undefined): string | CorsOriginFn => {
  const value = String(raw ?? '').trim();
  if (!value) return buildDefaultCorsOriginOption();
  if (value === '*') return (_origin, cb) => cb(null, true);
  const origins = parseCorsOrigins(value);
  if (origins.length <= 1) return origins[0] ?? buildDefaultCorsOriginOption();
  return (origin, cb) => {
    if (!origin) return cb(null, true);
    return cb(null, origins.includes(origin));
  };
};

