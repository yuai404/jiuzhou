/**
 * 洞府研修最近成功描述提示词共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中声明“最近 10 次成功生成功法参考”的 prompt 协议与差异化规则，供洞府研修提示词单点复用。
 * 2. 做什么：把业务层读取到的最近成功记录归一化为稳定 extraContext，避免 service、测试与后续复用链路各自拼字段。
 * 3. 不做什么：不直接查询数据库，不负责任务状态判定，也不决定 AI 最终产物是否合法。
 *
 * 输入/输出：
 * - 输入：最近成功生成功法的参考条目数组。
 * - 输出：可直接注入功法生成 extraContext 的结构化参考；无有效条目时返回 undefined。
 *
 * 数据流/状态流：
 * 业务层读取最近成功记录 -> 本模块归一化/去重/截断 -> buildTechniqueGenerationTextModelRequest 透传到 extraContext -> 模型按差异化规则生成。
 *
 * 关键边界条件与坑点：
 * 1. 最近参考只用于“避免重复”和“拉开机制分布”，不能让模型把多门旧功法硬拼成一门新功法。
 * 2. extraContext 字段名属于共享 prompt 协议；若后续改名，必须同步更新约束文案与测试，否则模型会读不到这些语境。
 */
import type { TechniqueQuality } from '../techniqueGenerationService.js';

export const TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT = 10;

export const TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_GENERAL_RULE =
  `若 extraContext.techniqueRecentSuccessfulDescriptions 存在，它们表示该玩家最近 ${TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT} 次成功生成功法的参考描述；本次必须主动避开其中已经出现过的高重合命名意象、description/longDesc 句式与核心机制外观，禁止只换词复写`;

export const TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_SCOPE_GENERAL_RULE =
  '若 extraContext.techniqueRecentSuccessfulDescriptionDiversityRules 存在，必须逐条遵守这些差异化约束；即便沿用相近主题，也要优先拉开技能机制、触发条件、资源节奏与层级递进';

export const TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_DIVERSITY_RULES = [
  '最近参考只用于避免重复与拉开创意分布，不代表要把多个旧功法拼接在一起；新功法仍应围绕 1~2 个核心机制自洽展开。',
  '若最近参考已经集中在同类主机制上，本次优先切换至少一个核心机制轴线，例如把直伤连段改为蓄势爆发、把常驻增益改为印记消耗、把纯回复改为反制护体或延迟结算，而不是只换名称与文风。',
  '禁止直接复用最近参考中的完整名称、完整 description、完整 longDesc，技能机制也不能只是同构换皮；至少在触发条件、资源代价、效果组合、成长曲线中拉开明显差异。',
] as const;

export type TechniqueRecentSuccessfulDescriptionReference = {
  name: string;
  quality: TechniqueQuality;
  type: string;
  description: string;
  longDesc: string;
};

export type TechniqueRecentSuccessfulDescriptionPromptContext = {
  techniqueRecentSuccessfulDescriptions: TechniqueRecentSuccessfulDescriptionReference[];
  techniqueRecentSuccessfulDescriptionDiversityRules: string[];
};

const normalizeText = (raw: string): string => raw.trim();

export const buildTechniqueRecentSuccessfulDescriptionPromptContext = (
  entries: readonly TechniqueRecentSuccessfulDescriptionReference[],
): TechniqueRecentSuccessfulDescriptionPromptContext | undefined => {
  const normalizedEntries: TechniqueRecentSuccessfulDescriptionReference[] = [];
  const seenKeys = new Set<string>();

  for (const entry of entries) {
    const name = normalizeText(entry.name);
    const type = normalizeText(entry.type);
    const description = normalizeText(entry.description);
    const longDesc = normalizeText(entry.longDesc);

    if (!description && !longDesc) {
      continue;
    }

    const dedupeKey = [name, entry.quality, type, description, longDesc].join('\n');
    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    normalizedEntries.push({
      name,
      quality: entry.quality,
      type,
      description,
      longDesc,
    });

    if (normalizedEntries.length >= TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT) {
      break;
    }
  }

  if (normalizedEntries.length <= 0) {
    return undefined;
  }

  return {
    techniqueRecentSuccessfulDescriptions: normalizedEntries,
    techniqueRecentSuccessfulDescriptionDiversityRules: [
      ...TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_DIVERSITY_RULES,
    ],
  };
};
