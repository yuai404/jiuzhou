/**
 * 请求 IP 解析工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一从 Express Request 里读取并校验请求 IP，供限流与认证防护复用。
 * 2. 做什么：把“IP 不能为空”的边界收口到一个函数，避免多个路由重复写相同的 trim/判空逻辑。
 * 3. 不做什么：不做代理链解析、不兜底猜测真实来源 IP，也不改写 Express 的信任代理配置。
 *
 * 输入/输出：
 * - 输入：Express `Request`。
 * - 输出：去首尾空白后的非空 IP 字符串。
 *
 * 数据流/状态流：
 * 路由或中间件传入 req -> 读取 req.ip -> trim -> 返回给 QPS 限流 / 失败锁定服务。
 *
 * 关键边界条件与坑点：
 * 1. 当 `req.ip` 缺失或为空时直接抛错，不做 fallback，避免安全控制在无来源标识下继续执行。
 * 2. 本工具只保证“有值且非空”，不负责把 IPv6 映射地址转换成 IPv4 文本。
 */
import type { Request } from 'express';

export const resolveRequestIp = (req: Request): string => {
  const requestIp = req.ip?.trim();
  if (!requestIp) {
    throw new Error('请求 IP 不能为空');
  }
  return requestIp;
};
