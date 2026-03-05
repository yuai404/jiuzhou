/**
 * 秘境静态配置加载与查询
 *
 * 作用：封装静态配置（秘境定义/难度/关卡/波次）的过滤与转换逻辑。
 * 不做什么：不操作数据库，不含副作用。
 *
 * 输入：静态配置加载器返回的原始数据。
 * 输出：类型安全的 DTO 列表或单项。
 *
 * 复用点：definitions.ts（列表/预览）、instance.ts（创建/加入）、combat.ts（开战/推进）。
 *
 * 边界条件：
 * 1) 所有函数对 enabled===false 的条目自动过滤。
 * 2) 若某个 id 不存在，返回 null 或空数组，调用方需自行校验。
 */

import {
  getDungeonDefinitions,
  getDungeonDifficultiesByDungeonId,
  getDungeonStagesByDifficultyId,
  getDungeonWavesByStageId,
} from '../../staticConfigLoader.js';
import { asNumber, toDungeonType } from './typeUtils.js';
import type {
  DungeonDefDto,
  DungeonDifficultyRow,
  DungeonStageRow,
  DungeonWaveRow,
} from '../types.js';

/** 获取所有启用的秘境定义，过滤掉 enabled=false 和无效类型 */
export const getEnabledDungeonDefs = (): DungeonDefDto[] => {
  const list: DungeonDefDto[] = [];
  for (const entry of getDungeonDefinitions()) {
    if (entry.enabled === false) continue;
    const type = toDungeonType(entry.type);
    if (!type) continue;
    list.push({
      id: String(entry.id),
      name: String(entry.name),
      type,
      category: typeof entry.category === 'string' ? entry.category : null,
      description: typeof entry.description === 'string' ? entry.description : null,
      icon: typeof entry.icon === 'string' ? entry.icon : null,
      background: typeof entry.background === 'string' ? entry.background : null,
      min_players: asNumber(entry.min_players, 1),
      max_players: asNumber(entry.max_players, 5),
      min_realm: typeof entry.min_realm === 'string' ? entry.min_realm : null,
      recommended_realm: typeof entry.recommended_realm === 'string' ? entry.recommended_realm : null,
      unlock_condition: entry.unlock_condition ?? {},
      daily_limit: asNumber(entry.daily_limit, 0),
      weekly_limit: asNumber(entry.weekly_limit, 0),
      stamina_cost: asNumber(entry.stamina_cost, 0),
      time_limit_sec: asNumber(entry.time_limit_sec, 0),
      revive_limit: asNumber(entry.revive_limit, 0),
      tags: entry.tags ?? [],
      sort_weight: asNumber(entry.sort_weight, 0),
      enabled: true,
      version: asNumber(entry.version, 1),
    });
  }
  return list;
};

/** 按 ID 查询单个启用的秘境定义 */
export const getDungeonDefById = (dungeonId: string): DungeonDefDto | null => {
  return getEnabledDungeonDefs().find((entry) => entry.id === dungeonId) ?? null;
};

/** 获取指定秘境下所有启用的难度列表（按 difficulty_rank 升序） */
export const getEnabledDungeonDifficultiesByDungeonId = (dungeonId: string): DungeonDifficultyRow[] => {
  return getDungeonDifficultiesByDungeonId(dungeonId)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      id: String(entry.id),
      dungeon_id: String(entry.dungeon_id),
      name: String(entry.name || entry.id),
      difficulty_rank: asNumber(entry.difficulty_rank, 1),
      monster_level_add: asNumber(entry.monster_level_add, 0),
      monster_attr_mult: asNumber(entry.monster_attr_mult, 1),
      reward_mult: asNumber(entry.reward_mult, 1),
      min_realm: typeof entry.min_realm === 'string' ? entry.min_realm : null,
      unlock_prev_difficulty: entry.unlock_prev_difficulty === true,
      first_clear_rewards: entry.first_clear_rewards ?? {},
      drop_pool_id: typeof entry.drop_pool_id === 'string' ? entry.drop_pool_id : null,
      enabled: true,
    }))
    .sort(
      (left, right) =>
        left.difficulty_rank - right.difficulty_rank || left.id.localeCompare(right.id),
    );
};

/** 获取指定难度下所有启用的关卡列表（按 stage_index 升序） */
export const getEnabledDungeonStagesByDifficultyId = (difficultyId: string): DungeonStageRow[] => {
  return getDungeonStagesByDifficultyId(difficultyId)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      id: String(entry.id),
      difficulty_id: String(entry.difficulty_id),
      stage_index: asNumber(entry.stage_index, 1),
      name: typeof entry.name === 'string' ? entry.name : null,
      type: typeof entry.type === 'string' ? entry.type : 'battle',
      description: typeof entry.description === 'string' ? entry.description : null,
      time_limit_sec: asNumber(entry.time_limit_sec, 0),
      clear_condition: entry.clear_condition ?? {},
      fail_condition: entry.fail_condition ?? {},
      events: entry.events ?? [],
    }))
    .sort((left, right) => left.stage_index - right.stage_index || left.id.localeCompare(right.id));
};

/** 获取指定关卡下所有启用的波次列表（按 wave_index 升序） */
export const getEnabledDungeonWavesByStageId = (stageId: string): DungeonWaveRow[] => {
  return getDungeonWavesByStageId(stageId)
    .filter((entry) => entry.enabled !== false)
    .map((entry) => ({
      id: String(entry.id || `${stageId}#${asNumber(entry.wave_index, 1)}`),
      stage_id: String(entry.stage_id || stageId),
      wave_index: asNumber(entry.wave_index, 1),
      spawn_delay_sec: asNumber(entry.spawn_delay_sec, 0),
      monsters: Array.isArray(entry.monsters) ? entry.monsters : [],
      wave_rewards: entry.wave_rewards ?? {},
    }))
    .sort((left, right) => left.wave_index - right.wave_index || left.id.localeCompare(right.id));
};
