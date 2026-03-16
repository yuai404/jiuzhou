/**
 * 认证尝试防护服务
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：基于 Redis 维护登录/改密的失败计数与临时锁定，拦截撞库和密码爆破。
 * 2. 做什么：把“账号 + IP”“账号”“IP”三种维度的失败统计集中管理，避免路由层重复拼 Redis key 和阈值判断。
 * 3. 不做什么：不负责验证码校验、不负责密码比对，也不负责决定认证接口的具体业务文案。
 *
 * 输入/输出：
 * - 输入：认证动作、主体标识（用户名或用户 ID）与请求 IP。
 * - 输出：允许继续尝试时正常返回；超出阈值时抛出 429 BusinessError；失败/成功后负责更新或清理 Redis 计数。
 *
 * 数据流/状态流：
 * 路由层构造尝试作用域 -> assertCredentialAttemptAllowed 检查锁定状态 -> 认证失败 recordCredentialAttemptFailure ->
 * 达阈值后写入 block key -> 后续请求直接 429；认证成功 clearCredentialAttemptFailures 清理主体相关失败计数。
 *
 * 关键边界条件与坑点：
 * 1. Redis key 里的主体和 IP 都要做编码，避免用户名包含特殊字符时污染 key 结构。
 * 2. 成功后只清理“主体 + IP / 主体”维度，不清理纯 IP 维度，避免同一出口 IP 上其他异常流量被无意重置。
 */
import { redis } from '../config/redis.js';
import { BusinessError } from '../middleware/BusinessError.js';

export type CredentialAttemptAction = 'login' | 'password-change';

export type CredentialAttemptScope = {
  action: CredentialAttemptAction;
  subject: string;
  ip: string;
};

type CredentialGuardPolicy = {
  failureWindowMs: number;
  blockWindowMs: number;
  subjectIpFailureLimit: number;
  subjectFailureLimit: number;
  ipFailureLimit: number;
  blockedMessage: string;
};

const LOGIN_POLICY: CredentialGuardPolicy = {
  failureWindowMs: 15 * 60 * 1000,
  blockWindowMs: 15 * 60 * 1000,
  subjectIpFailureLimit: 5,
  subjectFailureLimit: 10,
  ipFailureLimit: 20,
  blockedMessage: '登录尝试过于频繁，请15分钟后再试',
};

const PASSWORD_CHANGE_POLICY: CredentialGuardPolicy = {
  failureWindowMs: 10 * 60 * 1000,
  blockWindowMs: 10 * 60 * 1000,
  subjectIpFailureLimit: 5,
  subjectFailureLimit: 8,
  ipFailureLimit: 16,
  blockedMessage: '密码验证失败次数过多，请10分钟后再试',
};

const CREDENTIAL_GUARD_POLICY_MAP: Record<CredentialAttemptAction, CredentialGuardPolicy> = {
  login: LOGIN_POLICY,
  'password-change': PASSWORD_CHANGE_POLICY,
};

const normalizeCredentialKeyPart = (value: string, fieldName: string): string => {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new Error(`${fieldName} 不能为空`);
  }
  return encodeURIComponent(normalizedValue.toLowerCase());
};

const buildCredentialGuardKeys = (scope: CredentialAttemptScope) => {
  const normalizedAction = normalizeCredentialKeyPart(scope.action, 'action');
  const normalizedSubject = normalizeCredentialKeyPart(scope.subject, 'subject');
  const normalizedIp = normalizeCredentialKeyPart(scope.ip, 'ip');
  const baseKey = `auth:attempt-guard:${normalizedAction}`;
  return {
    subjectIpFailureKey: `${baseKey}:failure:subject-ip:${normalizedSubject}:${normalizedIp}`,
    subjectFailureKey: `${baseKey}:failure:subject:${normalizedSubject}`,
    ipFailureKey: `${baseKey}:failure:ip:${normalizedIp}`,
    subjectIpBlockKey: `${baseKey}:block:subject-ip:${normalizedSubject}:${normalizedIp}`,
    subjectBlockKey: `${baseKey}:block:subject:${normalizedSubject}`,
    ipBlockKey: `${baseKey}:block:ip:${normalizedIp}`,
  };
};

const getCredentialGuardPolicy = (action: CredentialAttemptAction): CredentialGuardPolicy => {
  return CREDENTIAL_GUARD_POLICY_MAP[action];
};

const touchFailureCounter = async (redisKey: string, windowMs: number): Promise<number> => {
  const currentCount = await redis.incr(redisKey);
  if (currentCount === 1) {
    await redis.pexpire(redisKey, windowMs);
  }
  return currentCount;
};

const writeBlockKey = async (redisKey: string, blockWindowMs: number): Promise<void> => {
  await redis.psetex(redisKey, blockWindowMs, '1');
};

export const assertCredentialAttemptAllowed = async (
  scope: CredentialAttemptScope,
): Promise<void> => {
  const policy = getCredentialGuardPolicy(scope.action);
  const keys = buildCredentialGuardKeys(scope);
  const blockFlags = await redis.mget(
    keys.subjectIpBlockKey,
    keys.subjectBlockKey,
    keys.ipBlockKey,
  );

  if (blockFlags.some((value) => value === '1')) {
    throw new BusinessError(policy.blockedMessage, 429);
  }
};

export const recordCredentialAttemptFailure = async (
  scope: CredentialAttemptScope,
): Promise<void> => {
  const policy = getCredentialGuardPolicy(scope.action);
  const keys = buildCredentialGuardKeys(scope);
  const [subjectIpFailureCount, subjectFailureCount, ipFailureCount] = await Promise.all([
    touchFailureCounter(keys.subjectIpFailureKey, policy.failureWindowMs),
    touchFailureCounter(keys.subjectFailureKey, policy.failureWindowMs),
    touchFailureCounter(keys.ipFailureKey, policy.failureWindowMs),
  ]);

  const blockTasks: Promise<void>[] = [];
  if (subjectIpFailureCount >= policy.subjectIpFailureLimit) {
    blockTasks.push(writeBlockKey(keys.subjectIpBlockKey, policy.blockWindowMs));
  }
  if (subjectFailureCount >= policy.subjectFailureLimit) {
    blockTasks.push(writeBlockKey(keys.subjectBlockKey, policy.blockWindowMs));
  }
  if (ipFailureCount >= policy.ipFailureLimit) {
    blockTasks.push(writeBlockKey(keys.ipBlockKey, policy.blockWindowMs));
  }

  await Promise.all(blockTasks);
};

export const clearCredentialAttemptFailures = async (
  scope: CredentialAttemptScope,
): Promise<void> => {
  const keys = buildCredentialGuardKeys(scope);
  await redis.del(
    keys.subjectIpFailureKey,
    keys.subjectFailureKey,
    keys.subjectIpBlockKey,
    keys.subjectBlockKey,
  );
};
