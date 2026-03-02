/**
 * 秘境阶段与波次数据工具
 *
 * 作用：封装关卡/波次查询及怪物 ID 提取逻辑。
 * 不做什么：不操作数据库，不参与战斗或奖励。
 *
 * 输入：difficultyId / stageIndex / waveIndex / monstersConfig。
 * 输出：关卡+波次元数据 / 怪物定义 ID 列表 / 秘境+难度定义。
 *
 * 复用点：combat.ts（开战/推进时查当前波次并提取怪物 ID）。
 *
 * 边界条件：
 * 1) buildMonsterDefIdsFromWave 对 count 做 [1, 99] 限制，且总数不超过 maxCount。
 * 2) getStageAndWave 返回 stageCount 和 maxWaveIndexInStage 供调用方判断是否已打完。
 */

import { getDungeonDifficultyById } from '../../staticConfigLoader.js';
import {
  getEnabledDungeonStagesByDifficultyId,
  getEnabledDungeonWavesByStageId,
  getDungeonDefById,
} from './configLoader.js';
import { asObject, asArray, asNumber } from './typeUtils.js';
import { getDungeonPreview } from '../definitions.js';
import type {
  DungeonDefDto,
  DungeonDifficultyRow,
  DungeonStageRow,
  DungeonWaveRow,
} from '../types.js';

/** 从波次怪物配置中提取怪物定义 ID 列表（最多 maxCount 个） */
export const buildMonsterDefIdsFromWave = (monstersConfig: unknown, maxCount: number): string[] => {
  const ids: string[] = [];
  for (const it of asArray(monstersConfig)) {
    const obj = asObject(it);
    if (!obj) continue;
    const monsterDefId = obj.monster_def_id;
    const count = asNumber(obj.count, 1);
    if (typeof monsterDefId !== 'string' || !monsterDefId) continue;
    const safeCount = Math.max(1, Math.min(99, count));
    for (let i = 0; i < safeCount; i += 1) {
      ids.push(monsterDefId);
      if (ids.length >= maxCount) return ids;
    }
  }
  return ids.slice(0, maxCount);
};

/** 获取指定关卡与波次信息，返回 stage/wave/stageCount/maxWaveIndexInStage */
export const getStageAndWave = async (
  difficultyId: string,
  stageIndex: number,
  waveIndex: number
): Promise<
  | {
    ok: true;
    stage: Pick<DungeonStageRow, 'id' | 'stage_index' | 'name' | 'type'>;
    wave: Pick<DungeonWaveRow, 'id' | 'wave_index' | 'monsters'>;
    stageCount: number;
    maxWaveIndexInStage: number;
  }
  | { ok: false; message: string; stageCount: number }
> => {
  const stages = getEnabledDungeonStagesByDifficultyId(difficultyId);
  const stageCount = stages.length;
  const stage = stages.find((entry) => entry.stage_index === stageIndex) ?? null;
  if (!stage) return { ok: false, message: '关卡不存在', stageCount };

  const waves = getEnabledDungeonWavesByStageId(stage.id);
  const maxWaveIndexInStage = waves.reduce((max, entry) => Math.max(max, entry.wave_index), 0);
  const wave = waves.find((entry) => entry.wave_index === waveIndex) ?? null;
  if (!wave) return { ok: false, message: '波次不存在', stageCount };

  return {
    ok: true,
    stage: { id: stage.id, stage_index: stage.stage_index, name: stage.name, type: stage.type },
    wave: { id: wave.id, wave_index: wave.wave_index, monsters: wave.monsters },
    stageCount,
    maxWaveIndexInStage,
  };
};

/** 获取秘境定义与难度定义 */
export const getDungeonAndDifficulty = async (
  dungeonId: string,
  difficultyRank: number
): Promise<
  | { ok: true; dungeon: DungeonDefDto; difficulty: Pick<DungeonDifficultyRow, 'id' | 'name' | 'difficulty_rank' | 'min_realm'> }
  | { ok: false; message: string }
> => {
  const def = await getDungeonPreview(dungeonId, difficultyRank);
  if (!def?.dungeon) return { ok: false, message: '秘境不存在' };
  if (!def.difficulty) return { ok: false, message: '难度不存在' };
  const diffRow = getDungeonDifficultyById(def.difficulty.id);
  if (!diffRow || diffRow.enabled === false) return { ok: false, message: '难度不存在' };
  return {
    ok: true,
    dungeon: def.dungeon,
    difficulty: {
      id: String(diffRow.id || def.difficulty.id),
      name: String(diffRow.name || def.difficulty.name),
      difficulty_rank: asNumber(diffRow.difficulty_rank, difficultyRank),
      min_realm: typeof diffRow.min_realm === 'string' ? diffRow.min_realm : null,
    },
  };
};
