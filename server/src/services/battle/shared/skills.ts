/**
 * 战斗技能数据加载与转换
 *
 * 作用：
 * - 从静态配置和角色技能槽位加载并转换技能数据为战斗引擎所需格式
 * - 提供技能升级规则解析、应用、深拷贝等工具函数
 *
 * 不做什么：不执行战斗逻辑、不操作状态。
 *
 * 输入/输出：
 * - getCharacterBattleSkillData: characterId -> SkillData[]
 * - toBattleSkillData: SkillDefConfig -> SkillData
 * - toBattleSkill: SkillData -> BattleSkill
 *
 * 复用点：
 * - pve.ts / pvp.ts / snapshot.ts / preparation.ts 中调用 getCharacterBattleSkillData
 * - monsters.ts 中调用 toBattleSkillData / toBattleSkill / cloneBattleSkill
 *
 * 边界条件：
 * 1) getCharacterBattleSkillData 按槽位顺序返回，同 skillId 可出现多次（不去重）
 * 2) 升级规则按 layer 升序排列后截取到 upgradeLevel
 */

import type {
  BattleSkill,
} from "../../../battle/types.js";
import type { SkillData } from "../../../battle/battleFactory.js";
import {
  toBattleSkillFromSkillData,
} from "../../../battle/utils/skillConversion.js";
import type { SkillDefConfig } from "../../staticConfigLoader.js";
import {
  buildEffectiveTechniqueSkillData,
} from "../../shared/techniqueSkillProgression.js";
import {
  loadCharacterBattleSkillEntries,
  loadCharacterBattleSkillEntriesMap,
} from "../../shared/characterBattleSkills.js";
import { resolveSkillTriggerType } from "../../../shared/skillTriggerType.js";
import { toNumber, uniqueStringIds } from "./helpers.js";
import { getEnabledBattleSkillDefinitionMap } from "./staticDefinitionIndex.js";

export {
  applySkillUpgradeChanges,
  cloneSkillEffectList,
} from "../../shared/techniqueSkillProgression.js";

// ------ 基础转换 ------

const buildSkillDataFromEffectiveDefinition = (
  row: SkillDefConfig,
  effective: ReturnType<typeof buildEffectiveTechniqueSkillData>,
): SkillData => ({
  id: String(row.id),
  name: String(row.name || row.id),
  cost_lingqi: effective.cost_lingqi,
  cost_lingqi_rate: effective.cost_lingqi_rate,
  cost_qixue: effective.cost_qixue,
  cost_qixue_rate: effective.cost_qixue_rate,
  cooldown: effective.cooldown,
  target_type: String(row.target_type || "single_enemy"),
  target_count: effective.target_count,
  damage_type: String(row.damage_type || "none"),
  element: String(row.element || "none"),
  effects: effective.effects,
  trigger_type: resolveSkillTriggerType({
    triggerType: row.trigger_type,
    effects: effective.effects,
  }),
  ai_priority: effective.ai_priority,
});

const buildSkillDataWithBatchCache = (params: {
  definition: SkillDefConfig;
  skillId: string;
  upgradeLevel: number;
  cache: Map<string, SkillData>;
}): SkillData => {
  const cacheKey = `${params.skillId}:${params.upgradeLevel}`;
  const cached = params.cache.get(cacheKey);
  if (cached) {
    return {
      ...cached,
      effects: cached.effects.map((effect) => ({ ...effect })),
    };
  }

  const skillData = buildSkillDataFromEffectiveDefinition(
    params.definition,
    buildEffectiveTechniqueSkillData(params.definition, params.upgradeLevel),
  );
  params.cache.set(cacheKey, skillData);
  return {
    ...skillData,
    effects: skillData.effects.map((effect) => ({ ...effect })),
  };
};

/** 静态配置行 -> 战斗用 SkillData */
export function toBattleSkillData(row: SkillDefConfig): SkillData {
  return buildSkillDataFromEffectiveDefinition(
    row,
    buildEffectiveTechniqueSkillData(row),
  );
}

/** SkillData -> 战斗引擎 BattleSkill */
export function toBattleSkill(skill: SkillData): BattleSkill {
  return toBattleSkillFromSkillData(skill);
}

export function cloneBattleSkill(skill: BattleSkill): BattleSkill {
  return {
    ...skill,
    cost: { ...skill.cost },
    effects: skill.effects.map((effect) => ({ ...effect })),
  };
}

// ------ 角色战斗技能加载 ------

/**
 * 加载角色战斗技能数据
 *
 * 数据流：
 * characterBattleSkills.loadCharacterBattleSkillEntries -> 技能槽位列表
 * -> getSkillDefinitions 查静态配置 -> 应用升级规则 -> SkillData[]
 */
export async function getCharacterBattleSkillData(
  characterId: number,
): Promise<SkillData[]> {
  if (!Number.isFinite(characterId) || characterId <= 0) return [];

  const battleSkillEntries = await loadCharacterBattleSkillEntries(characterId);
  if (battleSkillEntries.length <= 0) return [];

  const orderedSkillSlots = battleSkillEntries
    .map((s) => ({
      skillId: String(s?.skillId ?? "").trim(),
      upgradeLevel: Math.max(0, Math.floor(toNumber(s?.upgradeLevel) ?? 0)),
    }))
    .filter((x) => x.skillId.length > 0);

  const orderedSkillIds = orderedSkillSlots.map((x) => x.skillId);

  if (orderedSkillIds.length === 0) return [];

  const uniqIds = uniqueStringIds(orderedSkillIds);
  const skillDefinitionById = getEnabledBattleSkillDefinitionMap();
  const byId = new Map<string, SkillDefConfig>();
  for (const skillId of uniqIds) {
    const definition = skillDefinitionById.get(skillId);
    if (definition) {
      byId.set(skillId, definition);
    }
  }

  const skills: SkillData[] = [];
  const batchSkillDataCache = new Map<string, SkillData>();
  for (const slot of orderedSkillSlots) {
    const row = byId.get(slot.skillId);
    if (!row) continue;

    skills.push(buildSkillDataWithBatchCache({
      definition: row,
      skillId: slot.skillId,
      upgradeLevel: slot.upgradeLevel,
      cache: batchSkillDataCache,
    }));
  }

  return skills;
}

export async function getCharacterBattleSkillDataMap(
  characterIds: number[],
): Promise<Map<number, SkillData[]>> {
  const battleSkillEntriesMap = await loadCharacterBattleSkillEntriesMap(characterIds);
  const result = new Map<number, SkillData[]>();
  if (battleSkillEntriesMap.size <= 0) {
    return result;
  }

  const allSkillIds = Array.from(
    new Set(
      Array.from(battleSkillEntriesMap.values())
        .flatMap((entries) => entries.map((entry) => entry.skillId)),
    ),
  );
  if (allSkillIds.length <= 0) {
    return result;
  }

  const skillDefinitionById = getEnabledBattleSkillDefinitionMap();
  const byId = new Map<string, SkillDefConfig>();
  for (const skillId of allSkillIds) {
    const definition = skillDefinitionById.get(skillId);
    if (definition) {
      byId.set(skillId, definition);
    }
  }

  const batchSkillDataCache = new Map<string, SkillData>();
  for (const [characterId, battleSkillEntries] of battleSkillEntriesMap.entries()) {
    const skills: SkillData[] = [];
    for (const entry of battleSkillEntries) {
      const row = byId.get(entry.skillId);
      if (!row) continue;

      skills.push(buildSkillDataWithBatchCache({
        definition: row,
        skillId: entry.skillId,
        upgradeLevel: entry.upgradeLevel,
        cache: batchSkillDataCache,
      }));
    }
    result.set(characterId, skills);
  }

  return result;
}
