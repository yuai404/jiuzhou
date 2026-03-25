/**
 * 战斗资料 Redis 缓存
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：缓存角色战斗补充资料（技能、套装/词缀战斗效果）与当前出战伙伴战斗成员，覆盖高频开战准备热路径。
 * 2. 做什么：提供“读取缓存”和“主动刷新缓存”双入口，供读链路和写链路共享，避免各处散落手写 Redis 逻辑。
 * 3. 不做什么：不缓存角色实时血量/灵气、地图位置、挂机状态、战斗中状态等高动态数据。
 *
 * 输入/输出：
 * - 输入：角色 ID。
 * - 输出：角色战斗补充资料 `CharacterBattleLoadout`，以及当前出战伙伴 `PartnerBattleMember | null`。
 *
 * 数据流/状态流：
 * - 读：battle / idle -> 本模块 get -> memory -> Redis -> loader。
 * - 写：属性/技能/伙伴变更入口 -> 本模块 refresh -> loader -> memory + Redis。
 *
 * 关键边界条件与坑点：
 * 1. 角色缓存只存“可主动失效的静态补充资料”，绝不把实时资源写进长 TTL 缓存，否则会让开战资格判断读到旧血量。
 * 2. 伙伴缓存必须缓存“无出战伙伴”这一结果；否则单人不带伙伴的高频刷怪会反复查库。
 */

import type { BattleSetBonusEffect } from '../../../battle/types.js';
import type { CharacterData, SkillData } from '../../../battle/battleFactory.js';
import { afterTransactionCommit } from '../../../config/database.js';
import { getCharacterComputedByCharacterId } from '../../characterComputedService.js';
import { createCacheLayer } from '../../shared/cacheLayer.js';
import { loadActivePartnerBattleMember, type PartnerBattleMember } from '../../shared/partnerBattleMember.js';
import {
  loadCharacterBattleEffectsMap,
} from './effects.js';
import {
  getCharacterBattleSkillDataMap,
} from './skills.js';

const BATTLE_PROFILE_REDIS_TTL_SEC = 6 * 60 * 60;
const BATTLE_PROFILE_MEMORY_TTL_MS = 10 * 60_000;

export type CharacterBattleLoadout = {
  setBonusEffects: BattleSetBonusEffect[];
  skills: SkillData[];
};

type ActivePartnerBattleCacheValue = {
  hasPartner: boolean;
  member: PartnerBattleMember | null;
};

type LoadoutBatchInstrumentation = {
  onPhase?: (detail: string, durationMs: number) => void;
};

const hasOwnAvatarField = (
  member: PartnerBattleMember | null,
): boolean => {
  if (!member) return true;
  return Object.prototype.hasOwnProperty.call(member.data, 'avatar');
};

/**
 * 直接构建角色战斗装配快照。
 *
 * 作用：
 * 1. 供缓存 loader 与启动预热共用同一份装配构建逻辑，避免“走缓存入口”和“走预热入口”各自复制战斗装配拼装。
 * 2. 允许调用方在已拿到角色计算结果时直接复用，减少启动预热对同一角色的重复属性查询。
 *
 * 输入/输出：
 * - 输入：角色 ID，以及可选的已计算角色战斗数据。
 * - 输出：角色战斗装配快照；角色不存在时返回 null。
 *
 * 数据流/状态流：
 * 启动预热 / cache loader -> 本函数 -> 套装/词缀效果 + 技能列表 -> CharacterBattleLoadout。
 *
 * 关键边界条件与坑点：
 * 1. `computed` 仅用于复用已算好的角色战斗基础数据，不会绕过技能和套装效果查询。
 * 2. 这里返回的是“未写缓存的最新快照”；是否写入缓存由上层调用方决定，避免预热时额外产生一层无意义 Redis 写入。
 */
export const loadCharacterBattleLoadoutByCharacterId = async (
  characterId: number,
  computed?: CharacterData,
): Promise<CharacterBattleLoadout | null> => {
  const loadoutMap = await loadCharacterBattleLoadoutsByCharacterIds(
    [characterId],
    computed ? new Map([[characterId, computed]]) : undefined,
  );
  return loadoutMap.get(characterId) ?? null;
};

/**
 * 批量构建角色战斗装配快照。
 *
 * 作用：
 * 1. 供在线战斗启动预热按批装配角色 loadout，避免技能与装备效果查询按角色 N 次往返。
 * 2. 仍复用单角色装配的同一份静态规则与返回结构，保证 warmup / 运行时口径一致。
 *
 * 输入/输出：
 * - 输入：角色 ID 列表，以及可选的已计算角色战斗基础数据映射。
 * - 输出：按角色 ID 组织的 `CharacterBattleLoadout` 映射；不存在的角色不会写入结果。
 *
 * 数据流/状态流：
 * warmupCharacterSnapshots -> 本函数批量查技能/装备效果 -> 组装 loadout -> 在线战斗角色快照。
 *
 * 关键边界条件与坑点：
 * 1. `computedMap` 只用于复用已算好的角色基础数据，缺失角色仍会按单角色路径补齐，不能把半成品写进结果。
 * 2. 本函数只批量收口“静态战斗装配”；实时血量/灵气等动态字段仍由角色属性服务单独维护。
 */
export const loadCharacterBattleLoadoutsByCharacterIds = async (
  characterIds: number[],
  computedMap?: ReadonlyMap<number, CharacterData>,
  instrumentation?: LoadoutBatchInstrumentation,
): Promise<Map<number, CharacterBattleLoadout>> => {
  const normalizedCharacterIds = [...new Set(
    characterIds
      .map((characterId) => Math.floor(Number(characterId)))
      .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
  )];
  const result = new Map<number, CharacterBattleLoadout>();
  if (normalizedCharacterIds.length <= 0) {
    return result;
  }

  const skillStartAt = Date.now();
  const skillDataMap = await getCharacterBattleSkillDataMap(normalizedCharacterIds);
  instrumentation?.onPhase?.('技能装配', Date.now() - skillStartAt);

  const battleEffectsStartAt = Date.now();
  const battleEffectsMap = await loadCharacterBattleEffectsMap(normalizedCharacterIds);
  instrumentation?.onPhase?.('装备效果装配', Date.now() - battleEffectsStartAt);

  const assembleStartAt = Date.now();
  await Promise.all(
    normalizedCharacterIds.map(async (normalizedCharacterId) => {
      const computedCharacter =
        computedMap?.get(normalizedCharacterId)
        ?? await getCharacterComputedByCharacterId(normalizedCharacterId);
      if (!computedCharacter) {
        return;
      }

      const setBonusEffects = battleEffectsMap.get(normalizedCharacterId) ?? [];

      result.set(normalizedCharacterId, {
        setBonusEffects,
        skills: skillDataMap.get(normalizedCharacterId) ?? [],
      });
    }),
  );
  instrumentation?.onPhase?.('loadout 汇总', Date.now() - assembleStartAt);

  return result;
};

const buildActivePartnerBattleCacheValue = async (
  characterId: number,
): Promise<ActivePartnerBattleCacheValue | null> => {
  const normalizedCharacterId = Math.floor(Number(characterId));
  if (!Number.isFinite(normalizedCharacterId) || normalizedCharacterId <= 0) {
    return null;
  }

  const member = await loadActivePartnerBattleMember(normalizedCharacterId);
  return {
    hasPartner: member !== null,
    member,
  };
};

const characterBattleLoadoutCache = createCacheLayer<number, CharacterBattleLoadout>({
  keyPrefix: 'battle:profile:character-loadout:v1:',
  redisTtlSec: BATTLE_PROFILE_REDIS_TTL_SEC,
  memoryTtlMs: BATTLE_PROFILE_MEMORY_TTL_MS,
  loader: (characterId) => loadCharacterBattleLoadoutByCharacterId(characterId),
});

const activePartnerBattleMemberCache = createCacheLayer<number, ActivePartnerBattleCacheValue>({
  keyPrefix: 'battle:profile:active-partner:v2:',
  redisTtlSec: BATTLE_PROFILE_REDIS_TTL_SEC,
  memoryTtlMs: BATTLE_PROFILE_MEMORY_TTL_MS,
  loader: buildActivePartnerBattleCacheValue,
});

export const getCharacterBattleLoadoutByCharacterId = async (
  characterId: number,
): Promise<CharacterBattleLoadout | null> => {
  return characterBattleLoadoutCache.get(characterId);
};

export const refreshCharacterBattleLoadoutByCharacterId = async (
  characterId: number,
): Promise<CharacterBattleLoadout | null> => {
  const nextValue = await loadCharacterBattleLoadoutByCharacterId(characterId);
  if (!nextValue) {
    await characterBattleLoadoutCache.invalidate(characterId);
    return null;
  }
  await characterBattleLoadoutCache.set(characterId, nextValue);
  return nextValue;
};

export const scheduleCharacterBattleLoadoutRefreshByCharacterId = async (
  characterId: number,
): Promise<void> => {
  await afterTransactionCommit(async () => {
    await refreshCharacterBattleLoadoutByCharacterId(characterId);
  });
};

export const getActivePartnerBattleMemberByCharacterId = async (
  characterId: number,
): Promise<PartnerBattleMember | null> => {
  const cached = await activePartnerBattleMemberCache.get(characterId);
  if (!cached) {
    return null;
  }
  if (!hasOwnAvatarField(cached.member)) {
    const nextValue = await buildActivePartnerBattleCacheValue(characterId);
    if (!nextValue) {
      await activePartnerBattleMemberCache.invalidate(characterId);
      return null;
    }
    await activePartnerBattleMemberCache.set(characterId, nextValue);
    return nextValue.member;
  }
  return cached.member;
};

export const refreshActivePartnerBattleCacheByCharacterId = async (
  characterId: number,
): Promise<PartnerBattleMember | null> => {
  const nextValue = await buildActivePartnerBattleCacheValue(characterId);
  if (!nextValue) {
    await activePartnerBattleMemberCache.invalidate(characterId);
    return null;
  }
  await activePartnerBattleMemberCache.set(characterId, nextValue);
  return nextValue.member;
};

export const scheduleActivePartnerBattleCacheRefreshByCharacterId = async (
  characterId: number,
): Promise<void> => {
  await afterTransactionCommit(async () => {
    await refreshActivePartnerBattleCacheByCharacterId(characterId);
  });
};
