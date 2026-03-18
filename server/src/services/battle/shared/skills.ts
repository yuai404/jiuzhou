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
import type { SkillDefConfig } from "../../staticConfigLoader.js";
import { getSkillDefinitions } from "../../staticConfigLoader.js";
import { characterTechniqueService } from "../../characterTechniqueService.js";
import {
  buildEffectiveTechniqueSkillData,
} from "../../shared/techniqueSkillProgression.js";
import {
  toNumber,
  toText,
  uniqueStringIds,
} from "./helpers.js";

export {
  applySkillUpgradeChanges,
  cloneSkillEffectList,
} from "../../shared/techniqueSkillProgression.js";

// ------ 常量 ------

const MONSTER_SKILL_TARGET_TYPE_SET = new Set<BattleSkill["targetType"]>([
  "self",
  "single_enemy",
  "single_ally",
  "all_enemy",
  "all_ally",
  "random_enemy",
  "random_ally",
]);

// ------ 基础转换 ------

export function normalizeSkillTargetType(raw: unknown): BattleSkill["targetType"] {
  const target = toText(raw);
  return MONSTER_SKILL_TARGET_TYPE_SET.has(target as BattleSkill["targetType"])
    ? (target as BattleSkill["targetType"])
    : "single_enemy";
}

export function normalizeSkillDamageType(raw: unknown): BattleSkill["damageType"] {
  const value = toText(raw);
  if (value === "physical" || value === "magic" || value === "true")
    return value;
  return undefined;
}

/** 静态配置行 -> 战斗用 SkillData */
export function toBattleSkillData(row: SkillDefConfig): SkillData {
  const effective = buildEffectiveTechniqueSkillData(row);
  return {
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
    ai_priority: effective.ai_priority,
  };
}

/** SkillData -> 战斗引擎 BattleSkill */
export function toBattleSkill(skill: SkillData): BattleSkill {
  return {
    id: skill.id,
    name: skill.name,
    source: "innate",
    cost: {
      lingqi: skill.cost_lingqi,
      lingqiRate: skill.cost_lingqi_rate,
      qixue: skill.cost_qixue,
      qixueRate: skill.cost_qixue_rate,
    },
    cooldown: skill.cooldown,
    targetType: normalizeSkillTargetType(skill.target_type),
    targetCount: Math.max(1, Math.floor(skill.target_count || 1)),
    damageType: normalizeSkillDamageType(skill.damage_type),
    element: String(skill.element || "none"),
    effects: skill.effects.map((effect) => ({ ...effect })),
    triggerType: "active",
    aiPriority: Math.max(0, Math.floor(skill.ai_priority || 0)),
  };
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
 * characterTechniqueService.getBattleSkills -> 技能槽位列表
 * -> getSkillDefinitions 查静态配置 -> 应用升级规则 -> SkillData[]
 */
export async function getCharacterBattleSkillData(
  characterId: number,
): Promise<SkillData[]> {
  if (!Number.isFinite(characterId) || characterId <= 0) return [];

  const battleSkillsRes =
    await characterTechniqueService.getBattleSkills(characterId);
  if (!battleSkillsRes.success || !battleSkillsRes.data) return [];

  const orderedSkillSlots = battleSkillsRes.data
    .map((s) => ({
      skillId: String(s?.skillId ?? "").trim(),
      upgradeLevel: Math.max(0, Math.floor(toNumber(s?.upgradeLevel) ?? 0)),
    }))
    .filter((x) => x.skillId.length > 0);

  const orderedSkillIds = orderedSkillSlots.map((x) => x.skillId);

  if (orderedSkillIds.length === 0) return [];

  const uniqIds = uniqueStringIds(orderedSkillIds);
  const idSet = new Set(uniqIds);
  const byId = new Map<
    string,
    ReturnType<typeof getSkillDefinitions>[number]
  >();
  for (const row of getSkillDefinitions()) {
    if (row.enabled === false) continue;
    if (!idSet.has(row.id)) continue;
    byId.set(row.id, row);
  }

  const skills: SkillData[] = [];
  for (const slot of orderedSkillSlots) {
    const row = byId.get(slot.skillId);
    if (!row) continue;

    const skillData = buildEffectiveTechniqueSkillData(row, slot.upgradeLevel);

    skills.push({
      id: String(row.id),
      name: String(row.name || row.id),
      cost_lingqi: skillData.cost_lingqi,
      cost_lingqi_rate: skillData.cost_lingqi_rate,
      cost_qixue: skillData.cost_qixue,
      cost_qixue_rate: skillData.cost_qixue_rate,
      cooldown: skillData.cooldown,
      target_type: String(row.target_type || "single_enemy"),
      target_count: skillData.target_count,
      damage_type: String(row.damage_type || "none"),
      element: String(row.element || "none"),
      effects: skillData.effects,
      ai_priority: skillData.ai_priority,
    });
  }

  return skills;
}
