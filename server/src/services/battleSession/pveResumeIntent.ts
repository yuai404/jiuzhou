/**
 * 普通 PVE 续战意图持久化。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为“服务更新/进程重启后继续打同目标怪物”保存最小恢复信息，供 BattleSession 服务懒恢复使用。
 * 2. 做什么：把普通 PVE 的续战意图读写删收敛到单一模块，避免 battle action、teamHooks、session service 各自拼 Redis key。
 * 3. 不做什么：不保存完整 battle state，不恢复原回合，不参与前端视图切换。
 *
 * 输入/输出：
 * - 输入：ownerUserId、sessionId、monsterIds、participantUserIds、battleId、updatedAt。
 * - 输出：规范化后的续战意图记录；或删除结果。
 *
 * 数据流/状态流：
 * - BattleSession start/advance/abandon/leave-team -> 本模块写或删 Redis
 * - getCurrentBattleSessionDetail 在内存 session 缺失时 -> 本模块读取 -> session service 决定是否懒恢复
 *
 * 关键边界条件与坑点：
 * 1. 续战意图只表达“可重开同目标战斗”，不表达“从原回合继续”，因此禁止写入完整 BattleEngine 快照。
 * 2. `participantUserIds` 只是辅助快照；恢复时权威成员仍以当前 `startPVEBattle` 的组队解析结果为准。
 */

import { redis } from '../../config/redis.js';

export interface PveResumeIntentRecord {
  ownerUserId: number;
  sessionId: string;
  monsterIds: string[];
  participantUserIds: number[];
  battleId: string;
  updatedAt: number;
}

type StoredPveResumeIntentRecord = {
  ownerUserId?: number;
  sessionId?: string;
  monsterIds?: string[];
  participantUserIds?: number[];
  battleId?: string;
  updatedAt?: number;
};

export const PVE_RESUME_INTENT_REDIS_KEY_PREFIX = 'battle:session:pve-resume:';
export const PVE_RESUME_INTENT_TTL_SECONDS = 30 * 60;

const buildPveResumeIntentRedisKey = (ownerUserId: number): string => {
  return `${PVE_RESUME_INTENT_REDIS_KEY_PREFIX}${ownerUserId}`;
};

const normalizeStringList = (raw: string[] | undefined): string[] => {
  if (!Array.isArray(raw)) return [];
  const values = new Set<string>();
  for (const item of raw) {
    const normalized = String(item ?? '').trim();
    if (!normalized) continue;
    values.add(normalized);
  }
  return [...values];
};

const normalizeNumberList = (raw: number[] | undefined): number[] => {
  if (!Array.isArray(raw)) return [];
  const values = new Set<number>();
  for (const item of raw) {
    const normalized = Math.floor(Number(item));
    if (!Number.isFinite(normalized) || normalized <= 0) continue;
    values.add(normalized);
  }
  return [...values];
};

const normalizePveResumeIntentRecord = (
  raw: StoredPveResumeIntentRecord,
): PveResumeIntentRecord | null => {
  const ownerUserId = Math.floor(Number(raw.ownerUserId));
  const sessionId = String(raw.sessionId ?? '').trim();
  const monsterIds = normalizeStringList(raw.monsterIds);
  const participantUserIds = normalizeNumberList(raw.participantUserIds);
  const battleId = String(raw.battleId ?? '').trim();
  const updatedAt = Math.floor(Number(raw.updatedAt));

  if (!Number.isFinite(ownerUserId) || ownerUserId <= 0) return null;
  if (!sessionId) return null;
  if (monsterIds.length <= 0) return null;
  if (!battleId) return null;
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) return null;

  return {
    ownerUserId,
    sessionId,
    monsterIds,
    participantUserIds,
    battleId,
    updatedAt,
  };
};

export const upsertPveResumeIntent = async (
  record: PveResumeIntentRecord,
): Promise<PveResumeIntentRecord> => {
  const normalized = normalizePveResumeIntentRecord(record);
  if (!normalized) {
    throw new Error('普通 PVE 续战意图不合法');
  }
  await redis.setex(
    buildPveResumeIntentRedisKey(normalized.ownerUserId),
    PVE_RESUME_INTENT_TTL_SECONDS,
    JSON.stringify(normalized),
  );
  return normalized;
};

export const getPveResumeIntentByUserId = async (
  ownerUserId: number,
): Promise<PveResumeIntentRecord | null> => {
  const normalizedOwnerUserId = Math.floor(Number(ownerUserId));
  if (!Number.isFinite(normalizedOwnerUserId) || normalizedOwnerUserId <= 0) {
    return null;
  }
  const raw = await redis.get(buildPveResumeIntentRedisKey(normalizedOwnerUserId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPveResumeIntentRecord;
    return normalizePveResumeIntentRecord(parsed);
  } catch {
    return null;
  }
};

export const deletePveResumeIntentByUserId = async (
  ownerUserId: number,
): Promise<void> => {
  const normalizedOwnerUserId = Math.floor(Number(ownerUserId));
  if (!Number.isFinite(normalizedOwnerUserId) || normalizedOwnerUserId <= 0) {
    return;
  }
  await redis.del(buildPveResumeIntentRedisKey(normalizedOwnerUserId));
};
