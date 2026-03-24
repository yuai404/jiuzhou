/**
 * 秘境参与者境界准入工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一计算“当前秘境实际要求的最低境界”，并校验所有参与者是否满足“当前境界或至多高 1 个境界”的挑战门槛。
 * - 做什么：把创建实例、加入实例、开始战斗三处都会用到的境界拦截收敛到单一入口，避免每个入口各写一遍比较逻辑。
 * - 不做什么：不负责人数、体力、次数等其他开战条件，也不写入数据库状态。
 *
 * 输入/输出：
 * - 输入：参与者列表、秘境基础最低境界、难度最低境界。
 * - 输出：成功时返回 `success: true` 与最终生效的 `requiredRealm`；失败时返回统一 message。
 *
 * 数据流/状态流：
 * - 先从秘境基础配置与难度配置里选出更高的准入境界；
 * - 再批量读取参与者当前完整境界与昵称；
 * - 最后按“参与者境界 + 1 >= 秘境要求境界”判断是否可进入，并返回首个不满足门槛的参与者错误。
 *
 * 关键边界条件与坑点：
 * 1. 基础秘境与难度都可能声明 `min_realm`，必须取两者中更高者，避免高难度被低难度入口口径放行。
 * 2. 角色境界或秘境要求若无法识别，不能静默按“凡人可进”处理；这里会直接拦截，避免错误配置绕过限制。
 */

import { getRealmOrderIndex } from '../../shared/realmRules.js';
import {
  buildParticipantLabel,
  getParticipantNicknameMap,
  getParticipantRealmMap,
} from './participants.js';
import type { DungeonInstanceParticipant } from '../types.js';

type DungeonRealmAccessValidationResult =
  | {
    success: true;
    requiredRealm: string | null;
  }
  | {
    success: false;
    message: string;
  };

const normalizeRequiredRealm = (realm: string | null): string | null => {
  if (typeof realm !== 'string') return null;
  const normalized = realm.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveRequiredRealm = (params: {
  dungeonMinRealm: string | null;
  difficultyMinRealm: string | null;
}): string | null => {
  const candidateRealms = [
    normalizeRequiredRealm(params.dungeonMinRealm),
    normalizeRequiredRealm(params.difficultyMinRealm),
  ].filter((realm): realm is string => realm !== null);
  if (candidateRealms.length === 0) return null;

  let requiredRealm = candidateRealms[0];
  let requiredRank = getRealmOrderIndex(requiredRealm);
  for (const candidateRealm of candidateRealms.slice(1)) {
    const candidateRank = getRealmOrderIndex(candidateRealm);
    if (candidateRank > requiredRank) {
      requiredRealm = candidateRealm;
      requiredRank = candidateRank;
    }
  }
  return requiredRealm;
};

export const validateDungeonParticipantRealmAccess = async (params: {
  participants: DungeonInstanceParticipant[];
  dungeonMinRealm: string | null;
  difficultyMinRealm: string | null;
}): Promise<DungeonRealmAccessValidationResult> => {
  const requiredRealm = resolveRequiredRealm({
    dungeonMinRealm: params.dungeonMinRealm,
    difficultyMinRealm: params.difficultyMinRealm,
  });
  if (requiredRealm === null) {
    return { success: true, requiredRealm: null };
  }

  const requiredRank = getRealmOrderIndex(requiredRealm);
  if (requiredRank < 0) {
    return { success: false, message: `秘境境界配置无效：${requiredRealm}` };
  }

  const [participantNicknameMap, participantRealmMap] = await Promise.all([
    getParticipantNicknameMap(params.participants),
    getParticipantRealmMap(params.participants),
  ]);

  for (const participant of params.participants) {
    const participantRealm = participantRealmMap.get(participant.characterId);
    const participantRank = getRealmOrderIndex(participantRealm);
    if (participantRank >= 0 && participantRank + 1 >= requiredRank) continue;

    const participantLabel = buildParticipantLabel(participant, participantNicknameMap);
    return {
      success: false,
      message: `${participantLabel}境界不足，最多只能挑战高于自身一个境界的秘境，当前目标需达到${requiredRealm}`,
    };
  }

  return { success: true, requiredRealm };
};
