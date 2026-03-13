/**
 * 图片生成调试与错误摘要共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中管理图片生成链路的调试开关与日志前缀，避免技能图标、伙伴头像各自复制一套环境变量判断。
 * 2) 做什么：把底层 Error / cause 链压缩成稳定、可读的错误摘要，方便快速判断是超时、中止还是连接被上游提前终止。
 * 3) 不做什么：不发起模型请求、不决定是否重试，也不吞掉业务异常。
 *
 * 输入/输出：
 * - 输入：调试作用域、日志片段，或图片生成阶段抛出的异常对象。
 * - 输出：调试日志输出；异常摘要字符串。
 *
 * 数据流/状态流：
 * 图片生成器 catch error -> summarizeImageGenerationError -> debugImageGenerationLog / throw new Error -> 上层日志或退款原因。
 *
 * 关键边界条件与坑点：
 * 1) 底层异常可能只有外层 `Connection error.`，真正线索藏在 `cause` 链里；如果不统一展开，排查时只能看到空洞结论。
 * 2) 这里只做调试与摘要，不在这里推断重试策略，避免把“日志解释”和“重试行为”耦合到一起。
 */

type ImageGenerationErrorLike = {
  cause?: ImageGenerationErrorInput;
  code?: number | string;
  message?: string;
  name?: string;
  status?: number;
  type?: string;
};

export type ImageGenerationErrorInput =
  | Error
  | ImageGenerationErrorLike
  | boolean
  | number
  | string
  | null
  | undefined;

type ImageGenerationLogArg = boolean | number | string | null | undefined;

const MAX_ERROR_CHAIN_DEPTH = 4;

const asString = (value: ImageGenerationLogArg): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const isDebugEnabled = (): boolean => {
  const raw = asString(process.env.AI_TECHNIQUE_IMAGE_DEBUG).toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const readErrorLike = (value: ImageGenerationErrorInput): ImageGenerationErrorLike | null => {
  if (value instanceof Error) {
    return {
      cause: value.cause as ImageGenerationErrorInput,
      code:
        typeof (value as Error & { code?: number | string }).code === 'number' ||
        typeof (value as Error & { code?: number | string }).code === 'string'
          ? (value as Error & { code?: number | string }).code
          : undefined,
      message: value.message,
      name: value.name,
      status:
        typeof (value as Error & { status?: number }).status === 'number'
          ? (value as Error & { status?: number }).status
          : undefined,
      type:
        typeof (value as Error & { type?: string }).type === 'string'
          ? (value as Error & { type?: string }).type
          : undefined,
    };
  }
  if (!value || typeof value !== 'object') return null;
  return value;
};

const buildErrorSegment = (value: ImageGenerationErrorInput): string => {
  const text = asString(
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : null,
  );
  if (text) return text;

  const errorLike = readErrorLike(value);
  if (!errorLike) return '';

  const pieces: string[] = [];
  const name = asString(errorLike.name);
  const message = asString(errorLike.message);
  const code = asString(errorLike.code);
  const status = typeof errorLike.status === 'number' ? String(errorLike.status) : '';
  const type = asString(errorLike.type);

  if (name && message) {
    pieces.push(`${name}: ${message}`);
  } else if (message) {
    pieces.push(message);
  } else if (name) {
    pieces.push(name);
  }

  if (code) pieces.push(`code=${code}`);
  if (status) pieces.push(`status=${status}`);
  if (type) pieces.push(`type=${type}`);
  return pieces.join(', ');
};

const buildErrorChain = (error: ImageGenerationErrorInput): string => {
  const segments: string[] = [];
  const seen = new Set<object>();
  let current: ImageGenerationErrorInput = error;
  let depth = 0;

  while (depth < MAX_ERROR_CHAIN_DEPTH) {
    const segment = buildErrorSegment(current);
    if (segment) segments.push(segment);

    const errorLike = readErrorLike(current);
    if (!errorLike?.cause || errorLike.cause === current) break;
    if (typeof errorLike.cause === 'object' && errorLike.cause !== null) {
      if (seen.has(errorLike.cause)) break;
      seen.add(errorLike.cause);
    }
    current = errorLike.cause;
    depth += 1;
  }

  return segments.join(' <- ');
};

const resolveErrorHint = (summary: string): string => {
  const normalized = summary.toLowerCase();
  if (!normalized) return '图片请求失败';
  if (/timed? ?out|timeout/.test(normalized)) return '图片请求超时';
  if (/abort|aborted|canceled|cancelled/.test(normalized)) return '图片请求被中止';
  if (/terminated|other side closed|socket hang up|econnreset|broken pipe/.test(normalized)) {
    return '图片连接被上游提前终止';
  }
  return '图片请求失败';
};

export const debugImageGenerationLog = (
  scope: string,
  ...args: readonly ImageGenerationLogArg[]
): void => {
  if (!isDebugEnabled()) return;
  console.log(`[${scope}]`, ...args);
};

export const summarizeImageGenerationError = (error: ImageGenerationErrorInput): string => {
  const chain = buildErrorChain(error);
  if (!chain) return '图片请求失败：未知异常';
  return `${resolveErrorHint(chain)}：${chain}`;
};
