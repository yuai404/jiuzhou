/**
 * 伙伴战斗成员共享构建模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中构建“当前出战伙伴 -> 战斗成员快照”，供战斗缓存、伙伴服务、挂机快照复用。
 * 2. 做什么：集中读取伙伴功法、技能策略与技能定义，避免 partnerService 与缓存层重复拼装同一份战斗数据。
 * 3. 不做什么：不处理伙伴培养写操作，不决定是否允许携带伙伴参战，也不管理缓存生命周期。
 *
 * 输入/输出：
 * - 输入：角色 ID，或 `partnerId + 伙伴定义 + 功法行`。
 * - 输出：伙伴战斗成员 `PartnerBattleMember`，以及复用的技能策略状态。
 *
 * 数据流/状态流：
 * - character_partner -> partnerView / partnerSkillPolicy -> 本模块统一组装 -> partnerService / battle profile cache / idle snapshot。
 *
 * 关键边界条件与坑点：
 * 1. 必须只读取“当前出战伙伴”，不存在时返回 null；不能在这里隐式挑选其他伙伴顶替。
 * 2. 伙伴技能列表必须直接复用“已应用层数强化后的有效技能条目”，不能再按 skillId 回查静态技能表，否则会退回初始等级效果。
 */

import { query } from '../../config/database.js';
import type {
  CharacterData,
  SkillData,
} from '../../battle/battleFactory.js';
import type { PartnerDefConfig } from '../staticConfigLoader.js';
import {
  buildPartnerBattleSkillData,
  buildPartnerEffectiveSkillEntries,
  buildPartnerDisplay,
  loadPartnerTechniqueRows,
  normalizeInteger,
  normalizeText,
  type PartnerComputedAttrsDto,
  type PartnerRow,
  type PartnerTechniqueRow,
} from './partnerView.js';
import type { PartnerOwnerRealmContext } from './partnerLevelLimit.js';
import {
  buildPartnerBattleSkillPolicy,
  loadPartnerSkillPolicyRows,
  loadPartnerSkillPolicyRowsMap,
  type PartnerSkillPolicySlotDto,
} from './partnerSkillPolicy.js';
import {
  getPartnerDefinitionsByIds,
} from '../staticConfigLoader.js';

export interface PartnerBattleMember {
  data: CharacterData;
  skills: SkillData[];
  skillPolicy: { slots: PartnerSkillPolicySlotDto[] };
}

type ActivePartnerBattleRow = PartnerRow & {
  user_id: number;
  realm: string;
  sub_realm: string | null;
};

type ActivePartnerBattleRowWithCharacterId = ActivePartnerBattleRow & {
  character_id: number;
};

type PartnerBattleSkillPolicyState = {
  availableSkills: ReturnType<typeof buildPartnerEffectiveSkillEntries>;
  persistedRows: Awaited<ReturnType<typeof loadPartnerSkillPolicyRows>>;
};

const toPartnerBattleCharacterData = (
  userId: number,
  partnerId: number,
  nickname: string,
  avatar: string | null,
  attributeElement: string,
  computedAttrs: PartnerComputedAttrsDto,
): CharacterData => ({
  user_id: userId,
  id: partnerId,
  nickname,
  avatar,
  realm: '',
  sub_realm: null,
  attribute_element: attributeElement,
  qixue: computedAttrs.qixue,
  max_qixue: computedAttrs.max_qixue,
  lingqi: computedAttrs.lingqi,
  max_lingqi: computedAttrs.max_lingqi,
  wugong: computedAttrs.wugong,
  fagong: computedAttrs.fagong,
  wufang: computedAttrs.wufang,
  fafang: computedAttrs.fafang,
  sudu: computedAttrs.sudu,
  mingzhong: computedAttrs.mingzhong,
  shanbi: computedAttrs.shanbi,
  zhaojia: computedAttrs.zhaojia,
  baoji: computedAttrs.baoji,
  baoshang: computedAttrs.baoshang,
  jianbaoshang: computedAttrs.jianbaoshang,
  jianfantan: computedAttrs.jianfantan,
  kangbao: computedAttrs.kangbao,
  zengshang: computedAttrs.zengshang,
  zhiliao: computedAttrs.zhiliao,
  jianliao: computedAttrs.jianliao,
  xixue: computedAttrs.xixue,
  lengque: computedAttrs.lengque,
  kongzhi_kangxing: computedAttrs.kongzhi_kangxing,
  jin_kangxing: computedAttrs.jin_kangxing,
  mu_kangxing: computedAttrs.mu_kangxing,
  shui_kangxing: computedAttrs.shui_kangxing,
  huo_kangxing: computedAttrs.huo_kangxing,
  tu_kangxing: computedAttrs.tu_kangxing,
  qixue_huifu: computedAttrs.qixue_huifu,
  lingqi_huifu: computedAttrs.lingqi_huifu,
  setBonusEffects: [],
});

export const loadPartnerBattleSkillPolicyState = async (params: {
  partnerId: number;
  definition: PartnerDefConfig;
  techniqueRows: PartnerTechniqueRow[];
  forUpdate: boolean;
}): Promise<PartnerBattleSkillPolicyState> => {
  const availableSkills = buildPartnerEffectiveSkillEntries(
    params.definition,
    params.techniqueRows,
  );
  const persistedRows = await loadPartnerSkillPolicyRows(
    params.partnerId,
    params.forUpdate,
  );
  return {
    availableSkills,
    persistedRows,
  };
};

export const loadActivePartnerBattleMember = async (
  characterId: number,
): Promise<PartnerBattleMember | null> => {
  const memberMap = await loadActivePartnerBattleMemberMap([characterId]);
  return memberMap.get(normalizeInteger(characterId)) ?? null;
};

/**
 * 批量读取角色当前出战伙伴战斗成员。
 *
 * 作用：
 * 1. 供在线战斗启动预热按批拉取出战伙伴，避免 1 个角色触发 1 次伙伴行 / 功法 / 策略查询。
 * 2. 仍复用伙伴展示与技能策略的同一套纯组装逻辑，保证 warmup / 运行时的伙伴战斗快照口径一致。
 *
 * 输入/输出：
 * - 输入：角色 ID 列表。
 * - 输出：按角色 ID 组织的 `PartnerBattleMember | null` 映射；无出战伙伴的角色不会写入结果。
 *
 * 数据流/状态流：
 * warmupCharacterSnapshots -> 本函数批量查 active partner / technique / skill policy -> 组装伙伴战斗成员。
 *
 * 关键边界条件与坑点：
 * 1. 这里只认 `is_active = TRUE` 的唯一当前伙伴；缺失时必须直接返回空，不能隐式挑其他伙伴补位。
 * 2. 伙伴定义、功法层数和技能策略都必须从同一批查询结果里组装，不能部分走单查导致字段口径漂移。
 */
export const loadActivePartnerBattleMemberMap = async (
  characterIds: number[],
): Promise<Map<number, PartnerBattleMember>> => {
  const normalizedCharacterIds = [...new Set(
    characterIds
      .map((characterId) => normalizeInteger(characterId))
      .filter((characterId) => characterId > 0),
  )];
  const result = new Map<number, PartnerBattleMember>();
  if (normalizedCharacterIds.length <= 0) {
    return result;
  }

  const rows = await query(
    `
      SELECT cp.*, c.user_id
           , c.realm
           , c.sub_realm
      FROM character_partner cp
      JOIN characters c ON c.id = cp.character_id
      WHERE cp.character_id = ANY($1)
        AND cp.is_active = TRUE
      ORDER BY cp.character_id ASC, cp.id ASC
    `,
    [normalizedCharacterIds],
  );
  if (rows.rows.length <= 0) {
    return result;
  }

  const activePartnerRows = new Map<number, ActivePartnerBattleRowWithCharacterId>();
  for (const row of rows.rows as ActivePartnerBattleRowWithCharacterId[]) {
    const normalizedCharacterId = normalizeInteger(row.character_id);
    if (normalizedCharacterId <= 0 || activePartnerRows.has(normalizedCharacterId)) {
      continue;
    }
    activePartnerRows.set(normalizedCharacterId, row);
  }

  const partnerRows = Array.from(activePartnerRows.values());
  const [partnerDefMap, techniqueMap, skillPolicyMap] = await Promise.all([
    getPartnerDefinitionsByIds(partnerRows.map((partnerRow) => partnerRow.partner_def_id)),
    loadPartnerTechniqueRows(partnerRows.map((partnerRow) => partnerRow.id), false),
    loadPartnerSkillPolicyRowsMap(partnerRows.map((partnerRow) => partnerRow.id), false),
  ]);

  for (const partnerRow of partnerRows) {
    const partnerDef = partnerDefMap.get(partnerRow.partner_def_id);
    if (!partnerDef) {
      throw new Error(`伙伴模板不存在: ${partnerRow.partner_def_id}`);
    }

    const techniqueRows = techniqueMap.get(partnerRow.id) ?? [];
    const ownerRealm: PartnerOwnerRealmContext = {
      realm: normalizeText(partnerRow.realm) || '凡人',
      subRealm: normalizeText(partnerRow.sub_realm) || null,
    };
    const partnerDisplay = buildPartnerDisplay({
      row: partnerRow,
      definition: partnerDef,
      techniqueRows,
      ownerRealm,
    });
    const availableSkills = buildPartnerEffectiveSkillEntries(
      partnerDef,
      techniqueRows,
    );
    const persistedRows = skillPolicyMap.get(partnerRow.id) ?? [];
    const skills = buildPartnerBattleSkillData(availableSkills);

    result.set(normalizeInteger(partnerRow.character_id), {
      data: toPartnerBattleCharacterData(
        normalizeInteger(partnerRow.user_id),
        partnerRow.id,
        partnerDisplay.nickname,
        partnerDisplay.avatar,
        normalizeText(partnerDef.attribute_element) || 'none',
        partnerDisplay.computedAttrs,
      ),
      skills,
      skillPolicy: buildPartnerBattleSkillPolicy({
        availableSkills,
        persistedRows,
      }),
    });
  }

  return result;
};
