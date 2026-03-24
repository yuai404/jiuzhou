/**
 * 周期清理任务环境变量解析工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一解析 cleanup 类后台任务的布尔/整数环境变量，避免每个清理 service 各复制一套字符串归一化逻辑。
 * 2. 做什么：统一输出带作用域前缀的告警文案，让启动日志能定位具体是哪一个清理任务配置非法。
 * 3. 不做什么：不决定具体默认值，不维护业务 retention 规则，也不直接注册定时器。
 *
 * 输入/输出：
 * - 输入：环境变量名、默认值、上下界与日志作用域。
 * - 输出：已裁剪并归一化的布尔/整数配置值。
 *
 * 数据流/状态流：
 * cleanup service -> 本模块解析环境变量 -> service 生成 schedule/config -> cleanup worker 调度。
 *
 * 关键边界条件与坑点：
 * 1. 非法值必须显式告警而不是静默吞掉，否则线上配置错误很难定位。
 * 2. 这里只做解析，不做跨变量依赖校验；例如批量大小和轮次数的乘积约束仍由调用方自己决定。
 */
export const parseScheduledCleanupBooleanEnv = (
  name: string,
  fallback: boolean,
  logScope: string,
): boolean => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;

  console.warn(`[${logScope}] 环境变量 ${name}=${raw} 非法，回退默认值 ${String(fallback)}`);
  return fallback;
};

export const parseScheduledCleanupIntegerEnv = (
  name: string,
  fallback: number,
  min: number,
  max: number,
  logScope: string,
): number => {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    console.warn(`[${logScope}] 环境变量 ${name}=${raw} 非法，回退默认值 ${fallback}`);
    return fallback;
  }

  if (parsed < min) {
    console.warn(`[${logScope}] 环境变量 ${name}=${raw} 过小，提升到最小值 ${min}`);
    return min;
  }
  if (parsed > max) {
    console.warn(`[${logScope}] 环境变量 ${name}=${raw} 过大，降低到最大值 ${max}`);
    return max;
  }

  return Math.floor(parsed);
};
