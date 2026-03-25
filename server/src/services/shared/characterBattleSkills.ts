/**
 * 角色战斗技能共享读取模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一读取角色当前战斗应携带的技能，保留主动技能槽顺序，并自动追加被动/反击/追击等非手动技能。
 * 2. 做什么：让功法服务与战斗准备层复用同一套“战斗带入技能 + 升级层数”口径，避免手动配技与实战装配串口径。
 * 3. 不做什么：不负责把技能定义转换成战斗引擎 SkillData，也不负责写入技能槽或功法数据。
 *
 * 输入/输出：
 * - 输入：characterId，或“已装备主动技能顺序 + 当前已解锁技能明细”。
 * - 输出：按“主动技能槽顺序 + 自动带入的非手动技能”返回 `{ skillId, upgradeLevel }[]`。
 *
 * 数据流/状态流：
 * character_skill_slot 已装备主动技能 -> characterAvailableSkills 读取当前已解锁技能全集
 * -> 保留槽位中的主动技能顺序，并自动追加 passive/counter/chase 等非手动技能
 * -> 调用方继续组装战斗技能。
 *
 * 关键边界条件与坑点：
 * 1. 主动技能仍只认技能槽顺序；未上槽的主动技能不能偷偷进战斗。
 * 2. passive/counter/chase 等非手动技能必须自动带入战斗，不能复用“手动可配置技能集合”把它们误删。
 */

import { query } from '../../config/database.js';
import {
  loadCharacterUnlockedSkillEntries,
  loadCharacterUnlockedSkillEntriesMap,
  type CharacterAvailableSkillEntry,
} from './characterAvailableSkills.js';
import { isManualSkillTriggerType } from '../../shared/skillTriggerType.js';

type CharacterSkillSlotRow = {
  character_id: number;
  skill_id: string | null;
};

export interface CharacterBattleSkillEntry {
  skillId: string;
  upgradeLevel: number;
}

const normalizeSkillId = (value: string | null): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const mapOrderedEquippedSkillIdRows = (
  rows: CharacterSkillSlotRow[],
): Map<number, string[]> => {
  const result = new Map<number, string[]>();

  for (const row of rows) {
    const characterId = Math.floor(Number(row.character_id) || 0);
    const skillId = normalizeSkillId(row.skill_id);
    if (characterId <= 0 || skillId.length <= 0) continue;

    const currentList = result.get(characterId) ?? [];
    currentList.push(skillId);
    result.set(characterId, currentList);
  }

  return result;
};

const loadOrderedEquippedSkillIdsMap = async (
  characterIds: number[],
): Promise<Map<number, string[]>> => {
  const normalizedCharacterIds = [...new Set(
    characterIds
      .map((characterId) => Math.floor(Number(characterId)))
      .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
  )];
  const resultMap = new Map<number, string[]>();
  if (normalizedCharacterIds.length <= 0) {
    return resultMap;
  }

  const slotResult = await query(
    `
      SELECT character_id, skill_id
      FROM character_skill_slot
      WHERE character_id = ANY($1)
      ORDER BY character_id ASC, slot_index ASC, id ASC
    `,
    [normalizedCharacterIds],
  );

  return mapOrderedEquippedSkillIdRows(slotResult.rows as CharacterSkillSlotRow[]);
};

const loadOrderedEquippedSkillIds = async (characterId: number): Promise<string[]> => {
  const slotResult = await query(
    'SELECT character_id, skill_id FROM character_skill_slot WHERE character_id = $1 ORDER BY slot_index, id ASC',
    [characterId],
  );
  if (slotResult.rows.length <= 0) return [];

  return mapOrderedEquippedSkillIdRows(slotResult.rows as CharacterSkillSlotRow[]).get(characterId) ?? [];
};

const toCharacterBattleSkillEntry = (
  skill: Pick<CharacterAvailableSkillEntry, 'skillId' | 'upgradeLevel'>,
): CharacterBattleSkillEntry => {
  return {
    skillId: skill.skillId,
    upgradeLevel: skill.upgradeLevel,
  };
};

export const mergeCharacterBattleSkillEntries = (params: {
  equippedSkillIds: string[];
  unlockedSkillEntries: CharacterAvailableSkillEntry[];
}): CharacterBattleSkillEntry[] => {
  const manualSkillEntryBySkillId = new Map<string, CharacterBattleSkillEntry>();
  const autoBattleEntries: CharacterBattleSkillEntry[] = [];

  for (const entry of params.unlockedSkillEntries) {
    if (isManualSkillTriggerType(entry.triggerType)) {
      if (!manualSkillEntryBySkillId.has(entry.skillId)) {
        manualSkillEntryBySkillId.set(entry.skillId, toCharacterBattleSkillEntry(entry));
      }
      continue;
    }
    autoBattleEntries.push(toCharacterBattleSkillEntry(entry));
  }

  const orderedEquippedEntries = params.equippedSkillIds
    .map((skillId) => manualSkillEntryBySkillId.get(skillId))
    .filter((entry): entry is CharacterBattleSkillEntry => entry !== undefined);

  return [...orderedEquippedEntries, ...autoBattleEntries];
};

export const loadCharacterBattleSkillEntries = async (
  characterId: number,
): Promise<CharacterBattleSkillEntry[]> => {
  const [equippedSkillIds, unlockedSkillEntries] = await Promise.all([
    loadOrderedEquippedSkillIds(characterId),
    loadCharacterUnlockedSkillEntries(characterId),
  ]);
  if (equippedSkillIds.length <= 0 && unlockedSkillEntries.length <= 0) return [];

  return mergeCharacterBattleSkillEntries({
    equippedSkillIds,
    unlockedSkillEntries,
  });
};

export const loadCharacterBattleSkillEntriesMap = async (
  characterIds: number[],
): Promise<Map<number, CharacterBattleSkillEntry[]>> => {
  const [equippedSkillIdsMap, unlockedSkillEntriesMap] = await Promise.all([
    loadOrderedEquippedSkillIdsMap(characterIds),
    loadCharacterUnlockedSkillEntriesMap(characterIds),
  ]);

  const result = new Map<number, CharacterBattleSkillEntry[]>();
  const normalizedCharacterIds = [...new Set(
    characterIds
      .map((characterId) => Math.floor(Number(characterId)))
      .filter((characterId) => Number.isFinite(characterId) && characterId > 0),
  )];

  for (const characterId of normalizedCharacterIds) {
    const equippedSkillIds = equippedSkillIdsMap.get(characterId) ?? [];
    const unlockedSkillEntries = unlockedSkillEntriesMap.get(characterId) ?? [];
    if (equippedSkillIds.length <= 0 && unlockedSkillEntries.length <= 0) {
      continue;
    }
    result.set(characterId, mergeCharacterBattleSkillEntries({
      equippedSkillIds,
      unlockedSkillEntries,
    }));
  }

  return result;
};
