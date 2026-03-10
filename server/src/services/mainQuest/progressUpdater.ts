/**
 * 主线任务目标进度统一更新器
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一处理主线目标事件匹配、批量推进、单次行锁读取与最终写回。
 * - 不做什么：不负责章节推进、对话流转、奖励发放，也不做事务开启。
 *
 * 输入/输出：
 * - 输入：`characterId` 与一个或多个 `MainQuestProgressEvent`。
 * - 输出：`{ success, message, updated, completed }`，表示本次是否推进以及是否进入可交付状态。
 *
 * 数据流/状态流：
 * - 先对 `character_main_quest_progress` 执行一次 `FOR UPDATE`，拿到当前任务节与目标进度；
 * - 再把所有事件按顺序应用到同一份进度快照；
 * - 最后统一写回一次，避免“同一事务内同一角色进度行被重复锁/重复更新”。
 *
 * 关键边界条件与坑点：
 * 1) 只在 `section_status='objectives'` 时推进，其他状态直接短路，避免误改对话/提交阶段。
 * 2) 批量事件会共享同一份内存进度快照，顺序敏感但不会突破各目标 `target` 上限。
 */
import { query } from '../../config/database.js';
import { getRealmOrderIndex } from '../shared/realmRules.js';
import { getMainQuestSectionById, getTechniqueDefinitions } from '../staticConfigLoader.js';
import { asArray, asNumber, asObject, asString } from '../shared/typeCoercion.js';
import type { MainQuestProgressEvent } from './types.js';

type ProgressUpdateResult = {
  success: boolean;
  message: string;
  updated: boolean;
  completed: boolean;
};

type ObjectiveRecord = {
  id?: unknown;
  type?: unknown;
  target?: unknown;
  params?: unknown;
};

type LockedProgressSnapshot = {
  currentProgress: Record<string, number>;
  objectives: ObjectiveRecord[];
};

const resolveTechniqueQuality = (techniqueId: string): string => {
  const techniqueDef = getTechniqueDefinitions().find(
    (entry) => entry.id === techniqueId && entry.enabled !== false,
  );
  return asString(techniqueDef?.quality).trim();
};

const getIncrementByEvent = (
  objective: ObjectiveRecord,
  event: MainQuestProgressEvent,
): number => {
  const objectiveType = asString(objective.type).trim();
  const params = asObject(objective.params);

  if (objectiveType === 'talk_npc' && event.type === 'talk_npc') {
    const requiredNpcId = asString(params.npc_id).trim();
    return !requiredNpcId || requiredNpcId === event.npcId ? 1 : 0;
  }

  if (objectiveType === 'kill_monster' && event.type === 'kill_monster') {
    const requiredMonsterId = asString(params.monster_id).trim();
    return !requiredMonsterId || requiredMonsterId === event.monsterId
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'gather_resource' && event.type === 'gather_resource') {
    const requiredResourceId = asString(params.resource_id).trim();
    return !requiredResourceId || requiredResourceId === event.resourceId
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'collect' && event.type === 'collect') {
    const requiredItemId = asString(params.item_id).trim();
    return !requiredItemId || requiredItemId === event.itemId
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'dungeon_clear' && event.type === 'dungeon_clear') {
    const requiredDungeonId = asString(params.dungeon_id).trim();
    const requiredDifficultyId = asString(params.difficulty_id).trim();
    const dungeonMatch = !requiredDungeonId || requiredDungeonId === event.dungeonId;
    const difficultyMatch = !requiredDifficultyId || requiredDifficultyId === (event.difficultyId ?? '');
    return dungeonMatch && difficultyMatch ? Math.max(1, Math.floor(event.count)) : 0;
  }

  if (objectiveType === 'craft_item' && event.type === 'craft_item') {
    const requiredRecipeId = asString(params.recipe_id).trim();
    const requiredRecipeType = asString(params.recipe_type).trim();
    const requiredCraftKind = asString(params.craft_kind).trim();
    const requiredItemId = asString(params.item_id).trim();

    const recipeIdMatch = !requiredRecipeId || requiredRecipeId === (event.recipeId ?? '');
    const recipeTypeMatch = !requiredRecipeType || requiredRecipeType === (event.recipeType ?? '');
    const craftKindMatch = !requiredCraftKind || requiredCraftKind === (event.craftKind ?? '');
    const itemIdMatch = !requiredItemId || requiredItemId === (event.itemId ?? '');

    return recipeIdMatch && recipeTypeMatch && craftKindMatch && itemIdMatch
      ? Math.max(1, Math.floor(event.count))
      : 0;
  }

  if (objectiveType === 'reach' && event.type === 'reach') {
    const requiredRoomId = asString(params.room_id).trim();
    return !requiredRoomId || requiredRoomId === event.roomId ? 1 : 0;
  }

  if (objectiveType === 'upgrade_technique' && event.type === 'upgrade_technique') {
    const requiredTechniqueId = asString(params.technique_id).trim();
    const requiredQuality = asString(params.quality).trim();
    const requiredLayer = asNumber(params.layer, 0);
    const layerMatch = requiredLayer <= 0 || event.layer >= requiredLayer;
    if (!layerMatch) return 0;
    if (requiredTechniqueId) {
      return requiredTechniqueId === event.techniqueId ? 1 : 0;
    }
    if (requiredQuality) {
      return resolveTechniqueQuality(event.techniqueId) === requiredQuality ? 1 : 0;
    }
    return 1;
  }

  if (objectiveType === 'upgrade_realm' && event.type === 'upgrade_realm') {
    const requiredRealm = asString(params.realm).trim();
    if (!requiredRealm) return 1;
    const requiredIndex = getRealmOrderIndex(requiredRealm);
    const eventIndex = getRealmOrderIndex(event.realm);
    return requiredIndex >= 0 && eventIndex >= requiredIndex ? 1 : 0;
  }

  return 0;
};

const loadLockedProgressSnapshot = async (
  characterId: number,
): Promise<LockedProgressSnapshot | null> => {
  const progressRes = await query(
    `SELECT current_section_id, section_status, objectives_progress
     FROM character_main_quest_progress
     WHERE character_id = $1 FOR UPDATE`,
    [characterId],
  );
  if (!progressRes.rows?.[0]) {
    return null;
  }

  const progress = progressRes.rows[0] as {
    current_section_id?: unknown;
    section_status?: unknown;
    objectives_progress?: unknown;
  };
  if (asString(progress.section_status) !== 'objectives') {
    return { currentProgress: {}, objectives: [] };
  }

  const sectionId = asString(progress.current_section_id).trim();
  if (!sectionId) {
    throw new Error('当前任务节不存在');
  }

  const sectionDef = getMainQuestSectionById(sectionId);
  if (!sectionDef) {
    throw new Error('任务节配置不存在');
  }

  return {
    currentProgress: asObject(progress.objectives_progress) as Record<string, number>,
    objectives: asArray<ObjectiveRecord>(sectionDef.objectives),
  };
};

export const updateSectionProgressByEvents = async (
  characterId: number,
  events: MainQuestProgressEvent[],
): Promise<ProgressUpdateResult> => {
  const cid = Number(characterId);
  if (!Number.isFinite(cid) || cid <= 0) {
    return { success: false, message: '角色不存在', updated: false, completed: false };
  }
  if (events.length === 0) {
    return { success: true, message: '无事件', updated: false, completed: false };
  }

  const snapshot = await loadLockedProgressSnapshot(cid);
  if (!snapshot) {
    return { success: false, message: '主线进度不存在', updated: false, completed: false };
  }
  if (snapshot.objectives.length === 0) {
    return { success: true, message: '当前不在目标阶段', updated: false, completed: false };
  }

  const { currentProgress, objectives } = snapshot;
  let updated = false;

  for (const event of events) {
    for (const objective of objectives) {
      const objectiveId = asString(objective.id).trim();
      const target = Math.max(1, Math.floor(asNumber(objective.target, 1)));
      if (!objectiveId) continue;

      const current = asNumber(currentProgress[objectiveId], 0);
      if (current >= target) continue;

      const increment = getIncrementByEvent(objective, event);
      if (increment <= 0) continue;

      currentProgress[objectiveId] = Math.min(target, current + increment);
      updated = true;
    }
  }

  if (!updated) {
    return { success: true, message: '无匹配目标', updated: false, completed: false };
  }

  const allCompleted = objectives.every((objective) => {
    const objectiveId = asString(objective.id).trim();
    const target = Math.max(1, Math.floor(asNumber(objective.target, 1)));
    return objectiveId.length === 0 || asNumber(currentProgress[objectiveId], 0) >= target;
  });

  if (allCompleted) {
    await query(
      `UPDATE character_main_quest_progress
       SET section_status = 'turnin',
           objectives_progress = $2::jsonb,
           updated_at = NOW()
       WHERE character_id = $1`,
      [cid, JSON.stringify(currentProgress)],
    );
    return { success: true, message: '目标已全部完成', updated: true, completed: true };
  }

  await query(
    `UPDATE character_main_quest_progress
     SET objectives_progress = $2::jsonb,
         updated_at = NOW()
     WHERE character_id = $1`,
    [cid, JSON.stringify(currentProgress)],
  );
  return { success: true, message: '进度已更新', updated: true, completed: false };
};

export const updateSectionProgressByEvent = async (
  characterId: number,
  event: MainQuestProgressEvent,
): Promise<ProgressUpdateResult> => {
  return updateSectionProgressByEvents(characterId, [event]);
};
