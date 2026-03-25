/**
 * 秘境实例管理（创建/加入/查询）
 *
 * 作用：处理秘境实例的生命周期管理（不含战斗和结算）。
 * 不做什么：不处理战斗开启、推进、奖励发放。
 *
 * 输入：userId / instanceId / dungeonId / difficultyRank。
 * 输出：实例创建结果 / 加入结果 / 查询结果。
 *
 * 复用点：通过 service.ts 暴露给路由层。
 *
 * 边界条件：
 * 1) createDungeonInstance 组队时只有队长可创建。
 * 2) joinDungeonInstance 依赖事务 + 行锁，确保“检查状态 + 写入 participants”原子执行。
 */

import crypto from 'crypto';
import { getDungeonDifficultyById } from '../staticConfigLoader.js';
import {
  getDungeonProjection,
  getDungeonProjectionByBattleId,
  upsertDungeonProjection,
} from '../onlineBattleProjectionService.js';
import { getDungeonAndDifficulty } from './shared/stageData.js';
import {
  getUserAndCharacter,
  getTeamParticipants,
} from './shared/participants.js';
import { validateDungeonParticipantRealmAccess } from './shared/realmAccess.js';
import { asNumber } from './shared/typeUtils.js';
import type {
  DungeonInstanceStatus,
  DungeonInstanceParticipant,
} from './types.js';

type DungeonInstanceSnapshot = {
  id: string;
  dungeonId: string;
  difficultyId: string;
  difficultyRank: number;
  status: DungeonInstanceStatus;
  currentStage: number;
  currentWave: number;
  participants: DungeonInstanceParticipant[];
  currentBattleId: string | null;
  startTime: string | null;
  endTime: string | null;
};

type DungeonInstanceQuerySuccess = {
  success: true;
  data: {
    instance: DungeonInstanceSnapshot;
  };
};

type DungeonInstanceQueryFailure = { success: false; message: string };

const buildDungeonInstanceSnapshot = (projection: {
  instanceId: string;
  dungeonId: string;
  difficultyId: string;
  difficultyRank: number;
  status: DungeonInstanceStatus;
  currentStage: number;
  currentWave: number;
  participants: DungeonInstanceParticipant[];
  currentBattleId: string | null;
  startTime: string | null;
  endTime: string | null;
}): DungeonInstanceSnapshot => {
  const difficultyDef = getDungeonDifficultyById(projection.difficultyId);
  const difficultyRank =
    Number.isFinite(projection.difficultyRank)
      ? Math.floor(projection.difficultyRank)
      : difficultyDef && Number.isFinite(difficultyDef.difficulty_rank)
      ? Math.floor(difficultyDef.difficulty_rank)
      : 1;

  return {
    id: projection.instanceId,
    dungeonId: projection.dungeonId,
    difficultyId: projection.difficultyId,
    difficultyRank,
    status: projection.status,
    currentStage: asNumber(projection.currentStage, 1),
    currentWave: asNumber(projection.currentWave, 1),
    participants: projection.participants,
    currentBattleId: projection.currentBattleId,
    startTime: projection.startTime ?? null,
    endTime: projection.endTime ?? null,
  };
};

const ensureDungeonParticipantAccess = (
  userId: number,
  participants: DungeonInstanceParticipant[],
): DungeonInstanceQueryFailure | null => {
  if (participants.some((participant) => participant.userId === userId)) return null;
  return { success: false, message: '无权访问该秘境' };
};

const buildDungeonInstanceQuerySuccess = (projection: {
  instanceId: string;
  dungeonId: string;
  difficultyId: string;
  difficultyRank: number;
  status: DungeonInstanceStatus;
  currentStage: number;
  currentWave: number;
  participants: DungeonInstanceParticipant[];
  currentBattleId: string | null;
  startTime: string | null;
  endTime: string | null;
}): DungeonInstanceQuerySuccess => ({
  success: true,
  data: {
    instance: buildDungeonInstanceSnapshot(projection),
  },
});

/** 创建秘境实例 */
export const createDungeonInstance = async (
  userId: number,
  dungeonId: string,
  difficultyRank: number
): Promise<
  | { success: true; data: { instanceId: string; status: DungeonInstanceStatus; participants: DungeonInstanceParticipant[] } }
  | { success: false; message: string }
> => {
  try {
    const user = await getUserAndCharacter(userId);
    if (!user.ok) return { success: false, message: user.message };

    const dd = await getDungeonAndDifficulty(dungeonId, difficultyRank);
    if (!dd.ok) return { success: false, message: dd.message };

    if (user.teamId && !user.isLeader) {
      return { success: false, message: '组队中只有队长可以创建秘境' };
    }

    const participants: DungeonInstanceParticipant[] = user.teamId
      ? await getTeamParticipants(userId)
      : [{ userId, characterId: user.characterId, role: 'leader' as const }];

    if (participants.length < dd.dungeon.min_players) {
      return { success: false, message: `人数不足，需要至少${dd.dungeon.min_players}人` };
    }
    if (participants.length > dd.dungeon.max_players) {
      return { success: false, message: `人数超限，最多${dd.dungeon.max_players}人` };
    }

    const realmAccess = await validateDungeonParticipantRealmAccess({
      participants,
      dungeonMinRealm: dd.dungeon.min_realm,
      difficultyMinRealm: dd.difficulty.min_realm,
    });
    if (!realmAccess.success) {
      return realmAccess;
    }

    const instanceId = crypto.randomUUID();
    await upsertDungeonProjection({
      instanceId,
      dungeonId,
      difficultyId: dd.difficulty.id,
      difficultyRank,
      creatorCharacterId: user.characterId,
      teamId: user.teamId,
      status: 'preparing',
      currentStage: 1,
      currentWave: 1,
      participants,
      currentBattleId: null,
      rewardEligibleCharacterIds: [],
      startTime: null,
      endTime: null,
    });

    return { success: true, data: { instanceId, status: 'preparing', participants } };
  } catch (error) {
    console.error('创建秘境实例失败:', error);
    return { success: false, message: '创建秘境实例失败' };
  }
};

/** 加入秘境实例 */
export const joinDungeonInstance = async (
  userId: number,
  instanceId: string
): Promise<
  | { success: true; data: { instanceId: string; status: DungeonInstanceStatus; participants: DungeonInstanceParticipant[] } }
  | { success: false; message: string }
> => {
  try {
    const user = await getUserAndCharacter(userId);
    if (!user.ok) return { success: false, message: user.message };
    if (!user.teamId) return { success: false, message: '未加入队伍，无法加入秘境' };

    const projection = await getDungeonProjection(instanceId);
    if (!projection) return { success: false, message: '秘境实例不存在' };
    if (projection.status !== 'preparing') return { success: false, message: '该秘境已开始或已结束' };
    if (!projection.teamId || projection.teamId !== user.teamId) return { success: false, message: '不是同一队伍，无法加入' };

    const curParticipants = projection.participants.slice();
    if (curParticipants.some((p) => p.userId === userId)) {
      return { success: true, data: { instanceId, status: projection.status, participants: curParticipants } };
    }

    const dd = await getDungeonAndDifficulty(projection.dungeonId, projection.difficultyRank);
    if (!dd.ok) return { success: false, message: dd.message };

    const nextParticipants = [...curParticipants, { userId, characterId: user.characterId, role: 'member' as const }];
    if (nextParticipants.length > dd.dungeon.max_players) {
      return { success: false, message: `人数超限，最多${dd.dungeon.max_players}人` };
    }

    const realmAccess = await validateDungeonParticipantRealmAccess({
      participants: nextParticipants,
      dungeonMinRealm: dd.dungeon.min_realm,
      difficultyMinRealm: dd.difficulty.min_realm,
    });
    if (!realmAccess.success) {
      return realmAccess;
    }

    await upsertDungeonProjection({
      ...projection,
      participants: nextParticipants,
    });
    return { success: true, data: { instanceId, status: projection.status, participants: nextParticipants } };
  } catch (error) {
    console.error('加入秘境实例失败:', error);
    return { success: false, message: '加入秘境实例失败' };
  }
};

/** 获取秘境实例状态 */
export const getDungeonInstance = async (
  userId: number,
  instanceId: string
): Promise<
  DungeonInstanceQuerySuccess | DungeonInstanceQueryFailure
> => {
  try {
    const projection = await getDungeonProjection(instanceId);
    if (!projection) return { success: false, message: '秘境实例不存在' };
    const accessError = ensureDungeonParticipantAccess(userId, projection.participants);
    if (accessError) return accessError;
    return buildDungeonInstanceQuerySuccess(projection);
  } catch (error) {
    console.error('获取秘境实例失败:', error);
    return { success: false, message: '获取秘境实例失败' };
  }
};

/** 按 battleId 获取当前运行中的秘境实例状态 */
export const getDungeonInstanceByBattleId = async (
  userId: number,
  battleId: string,
): Promise<DungeonInstanceQuerySuccess | DungeonInstanceQueryFailure> => {
  try {
    const projection = await getDungeonProjectionByBattleId(battleId);
    if (!projection) return { success: false, message: '运行中的秘境实例不存在' };
    const accessError = ensureDungeonParticipantAccess(userId, projection.participants);
    if (accessError) return accessError;
    return buildDungeonInstanceQuerySuccess(projection);
  } catch (error) {
    console.error('按 battleId 获取秘境实例失败:', error);
    return { success: false, message: '按 battleId 获取秘境实例失败' };
  }
};
