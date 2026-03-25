/**
 * 秘境参与者工具
 *
 * 作用：解析/构建/查询秘境实例的参与者信息。
 * 不做什么：不处理战斗或奖励逻辑。
 *
 * 输入：JSON 参与者数据 / userId / teamId。
 * 输出：类型安全的参与者列表 / 昵称映射 / 角色信息。
 *
 * 复用点：instance.ts（创建/加入/查询）、combat.ts（开战/推进/结算）。
 *
 * 边界条件：
 * 1) parseParticipants 对 userId 去重（同一用户只保留最后一条记录）。
 * 2) getUserAndCharacter 拼接 realm + sub_realm 为完整境界名。
 */

import {
  getOnlineBattleCharacterSnapshotByUserId,
  getOnlineBattleCharacterSnapshotsByCharacterIds,
  getTeamProjectionByUserId,
} from '../../onlineBattleProjectionService.js';
import { asObject, asArray, asString } from './typeUtils.js';
import type { DungeonInstanceParticipant } from '../types.js';

/** 从 JSON 值解析参与者列表（自动去重） */
export const parseParticipants = (v: unknown): DungeonInstanceParticipant[] => {
  const arr = asArray(v);
  const list: DungeonInstanceParticipant[] = [];
  for (const it of arr) {
    const obj = asObject(it);
    if (!obj) continue;
    const userId = Number(obj.userId);
    const characterId = Number(obj.characterId);
    const role = obj.role === 'leader' ? 'leader' : obj.role === 'member' ? 'member' : null;
    if (!Number.isFinite(userId) || userId <= 0) continue;
    if (!Number.isFinite(characterId) || characterId <= 0) continue;
    if (!role) continue;
    list.push({ userId, characterId, role });
  }
  const uniq = new Map<number, DungeonInstanceParticipant>();
  for (const p of list) uniq.set(p.userId, p);
  return Array.from(uniq.values());
};

/** 构建参与者展示标签（如"队长【张三】(角色ID:1)"） */
export const buildParticipantLabel = (
  participant: DungeonInstanceParticipant,
  nicknameMap: Map<number, string>
): string => {
  const roleLabel = participant.role === 'leader' ? '队长' : '队员';
  const nickname = nicknameMap.get(participant.characterId);
  if (nickname) return `${roleLabel}【${nickname}】(角色ID:${participant.characterId})`;
  return `${roleLabel}(角色ID:${participant.characterId})`;
};

/** 批量加载参与者昵称映射（characterId -> nickname） */
export const getParticipantNicknameMap = async (participants: DungeonInstanceParticipant[]): Promise<Map<number, string>> => {
  const characterIds = Array.from(
    new Set(
      participants
        .map((participant) => participant.characterId)
        .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
    ),
  );
  if (characterIds.length === 0) return new Map<number, string>();
  const snapshots = await getOnlineBattleCharacterSnapshotsByCharacterIds(characterIds);
  const nicknameMap = new Map<number, string>();
  for (const characterId of characterIds) {
    const snapshot = snapshots.get(characterId);
    if (!snapshot) continue;
    const nickname = asString(snapshot.computed.nickname, '').trim();
    if (!nickname) continue;
    nicknameMap.set(characterId, nickname);
  }
  return nicknameMap;
};

/** 批量加载参与者完整境界映射（characterId -> 完整境界） */
export const getParticipantRealmMap = async (
  participants: DungeonInstanceParticipant[],
): Promise<Map<number, string>> => {
  const characterIds = Array.from(
    new Set(
      participants
        .map((participant) => participant.characterId)
        .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
    ),
  );
  if (characterIds.length === 0) return new Map<number, string>();
  const snapshots = await getOnlineBattleCharacterSnapshotsByCharacterIds(characterIds);
  const realmMap = new Map<number, string>();
  for (const characterId of characterIds) {
    const snapshot = snapshots.get(characterId);
    if (!snapshot) continue;
    const realm = asString(snapshot.computed.realm, '凡人').trim() || '凡人';
    const subRealm = asString(snapshot.computed.sub_realm, '').trim();
    realmMap.set(characterId, getFullRealm(realm, subRealm || null));
  }
  return realmMap;
};

/** 拼接主副境界为完整境界名（如"炼精化炁·养气期"） */
export const getFullRealm = (realm: string, subRealm: string | null): string => {
  if (!subRealm || realm === '凡人') return realm;
  return `${realm}·${subRealm}`;
};

/** 获取用户角色信息（含境界、队伍） */
export const getUserAndCharacter = async (
  userId: number
): Promise<
  | { ok: true; userId: number; characterId: number; realm: string; teamId: string | null; isLeader: boolean }
  | { ok: false; message: string }
> => {
  const snapshot = await getOnlineBattleCharacterSnapshotByUserId(userId);
  if (!snapshot) return { ok: false, message: '角色不存在' };
  const teamProjection = await getTeamProjectionByUserId(userId);
  return {
    ok: true,
    userId,
    characterId: snapshot.characterId,
    realm: getFullRealm(snapshot.computed.realm, snapshot.computed.sub_realm),
    teamId: teamProjection?.teamId ?? null,
    isLeader: teamProjection?.role === 'leader',
  };
};

/** 获取队伍所有成员作为秘境参与者 */
export const getTeamParticipants = async (leaderUserId: number): Promise<DungeonInstanceParticipant[]> => {
  const teamProjection = await getTeamProjectionByUserId(leaderUserId);
  if (!teamProjection?.teamId || teamProjection.memberCharacterIds.length <= 0) {
    return [];
  }
  const snapshots = await getOnlineBattleCharacterSnapshotsByCharacterIds(teamProjection.memberCharacterIds);
  const list: DungeonInstanceParticipant[] = [];
  for (const characterId of teamProjection.memberCharacterIds) {
    const snapshot = snapshots.get(characterId);
    if (!snapshot) continue;
    const userId = Number(snapshot.userId);
    const role = userId === leaderUserId ? 'leader' : 'member';
    if (!Number.isFinite(userId) || userId <= 0) continue;
    list.push({ userId, characterId, role });
  }
  return list.sort((left, right) => {
    if (left.role !== right.role) return left.role === 'leader' ? -1 : 1;
    return left.characterId - right.characterId;
  });
};
