/**
 * 功法模型联调共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中封装功法文本模型联调所需的参数解析辅助、模型请求、结果清洗、可选技能图标挂载、测试专用底模注入与摘要提取。
 * 2. 做什么：让单次联调脚本与批量功法书测试脚本共用同一套生成核心，避免 prompt、JSON 解析、校验与汇总逻辑再次分叉。
 * 3. 不做什么：不写数据库、不创建生成任务、不发放道具，也不决定批量文件如何命名与落盘。
 *
 * 输入 / 输出：
 * - 输入：功法品质、功法类型、可选 seed、可选底模、是否生成技能图标。
 * - 输出：包含模型名、seed、归一化 candidate、摘要信息的联调结果。
 *
 * 数据流 / 状态流：
 * CLI 参数
 * -> 本模块解析质量/类型/seed
 * -> 功法文本模型请求构造
 * -> 文本模型返回 JSON
 * -> 共享清洗与校验
 * -> 调用方决定打印或落盘。
 *
 * 复用设计说明：
 * - 单次联调与批量落盘都依赖同一条“请求模型 -> 清洗 -> 校验 -> 摘要”链路，集中到这里后只维护一份生成口径。
 * - 高频变化点是模型请求参数与结果结构校验，因此统一收在本模块，调用脚本只保留各自的 CLI 和输出职责。
 *
 * 关键边界条件与坑点：
 * 1. `server/tsconfig.json` 只编译 `src` 目录下的 TypeScript 文件，所以共享核心必须放在 `src` 下，才能被 `tsc -b` 实际校验。
 * 2. 批量测试默认不生成图片；是否挂技能图标必须由调用方显式声明，避免脚本因环境变量存在而偷偷扩大测试范围。
 */

import { callConfiguredTextModel } from '../../services/ai/openAITextClient.js';
import { readTextModelConfig } from '../../services/ai/modelConfig.js';
import type { TechniqueGenerationCandidate, TechniqueQuality } from '../../services/techniqueGenerationService.js';
import { validatePartnerRecruitRequestedBaseModel } from '../../services/shared/partnerRecruitBaseModel.js';
import {
  buildTechniqueGenerationTextModelRequest,
  sanitizeTechniqueGenerationCandidateFromModelDetailed,
  validateTechniqueGenerationCandidate,
} from '../../services/shared/techniqueGenerationCandidateCore.js';
import {
  GENERATED_TECHNIQUE_TYPE_LIST,
  type GeneratedTechniqueType,
} from '../../services/shared/techniqueGenerationConstraints.js';
import { generateTechniqueSkillIconMap } from '../../services/shared/techniqueSkillImageGenerator.js';
import { parseTechniqueTextModelJsonObject } from '../../services/shared/techniqueTextModelShared.js';

export type TechniqueModelDebugArgMap = Record<string, string | undefined>;

export type TechniqueModelDebugSummary = {
  techniqueName: string;
  techniqueType: TechniqueGenerationCandidate['technique']['type'];
  skillCount: number;
  layerCount: number;
};

export type TechniqueModelDebugGenerateParams = {
  quality: TechniqueQuality;
  techniqueType: GeneratedTechniqueType;
  seed?: number;
  baseModel?: string;
  includeSkillIcons: boolean;
};

export type TechniqueModelDebugGenerateResult = {
  modelName: string;
  promptSnapshot: string;
  seed: number;
  quality: TechniqueQuality;
  requestedTechniqueType: GeneratedTechniqueType;
  baseModel: string | null;
  candidate: TechniqueGenerationCandidate;
  summary: TechniqueModelDebugSummary;
};

type TechniqueModelDebugPromptContext = {
  techniqueBaseModel: string;
  techniqueBaseModelScopeRules: string[];
};

type TechniqueModelRequestUserPayload = {
  constraints?: {
    generalRules?: string[];
  };
  extraContext?: Record<string, string | string[]>;
};

const QUALITY_RANDOM_WEIGHT: Array<{ quality: TechniqueQuality; weight: number }> = [
  { quality: '黄', weight: 55 },
  { quality: '玄', weight: 30 },
  { quality: '地', weight: 12 },
  { quality: '天', weight: 3 },
];

export const QUALITY_MAX_LAYER: Record<TechniqueQuality, number> = {
  黄: 3,
  玄: 5,
  地: 7,
  天: 9,
};

export const TECHNIQUE_DEBUG_BASE_MODEL_GENERAL_RULE =
  '若 extraContext.techniqueBaseModel 存在，它表示本次功法测试指定的底模；请围绕该底模延展功法命名、描述、技能意象、机制母题与整体文风，但不要把它原样重复成固定前缀，也不要输出额外字段解释底模。';
export const TECHNIQUE_DEBUG_BASE_MODEL_SCOPE_GENERAL_RULE =
  '若 extraContext.techniqueBaseModelScopeRules 存在，必须逐条遵守这些作用范围限制；底模只能收束主题、套路倾向与表现母题，不得借此突破品质、层数、效果数量、目标数量、倍率、冷却、被动预算等既有硬约束。';
export const TECHNIQUE_DEBUG_BASE_MODEL_SCOPE_RULES = [
  '底模只用于限定本次功法的主体意象、套路母题、命名气质、描述文风、技能表现与局部机制倾向，不直接决定品质、层数、技能数量、目标数量与任何数值预算。',
  '若底模与当前功法类型不完全贴合，应做仙侠语境下的合理化转译；可以保留核心母题，但不要为了迎合底模强行拼接多体系、全覆盖或违和机制。',
  '底模可以让功法风格更鲜明，但不能产出全能通吃、超大范围、多段超高倍率、超长控制、超高回复或明显超出既有硬约束与预算的结果。',
] as const;

const asString = (value: string | undefined): string => (typeof value === 'string' ? value.trim() : '');

export const parseCliArgMap = (argv: string[]): TechniqueModelDebugArgMap => {
  const map: TechniqueModelDebugArgMap = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      map[key] = 'true';
      continue;
    }

    map[key] = next;
    index += 1;
  }

  return map;
};

export const resolveTechniqueQualityByRandom = (): TechniqueQuality => {
  const totalWeight = QUALITY_RANDOM_WEIGHT.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    throw new Error('功法品质权重配置非法');
  }

  const roll = Math.random() * totalWeight;
  let cursor = 0;
  for (const entry of QUALITY_RANDOM_WEIGHT) {
    cursor += entry.weight;
    if (roll <= cursor) return entry.quality;
  }

  return QUALITY_RANDOM_WEIGHT[QUALITY_RANDOM_WEIGHT.length - 1]!.quality;
};

export const resolveTechniqueQualityArg = (raw: string | undefined): TechniqueQuality | null => {
  const text = asString(raw);
  if (text === '黄' || text === '玄' || text === '地' || text === '天') return text;
  return null;
};

export const resolveTechniqueTypeByRandom = (): GeneratedTechniqueType => {
  const index = Math.floor(Math.random() * GENERATED_TECHNIQUE_TYPE_LIST.length);
  return GENERATED_TECHNIQUE_TYPE_LIST[index]!;
};

export const resolveTechniqueTypeArg = (raw: string | undefined): GeneratedTechniqueType | null => {
  const text = asString(raw);
  if (!text) return null;
  return GENERATED_TECHNIQUE_TYPE_LIST.find((entry) => entry === text) ?? null;
};

export const resolveOptionalPositiveIntegerArg = (
  raw: string | undefined,
  optionName: string,
): number | undefined => {
  const text = asString(raw);
  if (!text) return undefined;

  const value = Number(text);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`CLI 参数 --${optionName} 必须是正整数`);
  }

  return value;
};

export const overrideTechniqueModelName = (modelName: string | undefined): void => {
  const normalized = asString(modelName);
  if (!normalized) return;
  process.env.AI_TECHNIQUE_MODEL_NAME = normalized;
};

export const resolveTechniqueDebugBaseModelArg = (raw: string | undefined): string | null => {
  const validation = validatePartnerRecruitRequestedBaseModel(raw);
  if (!validation.success) {
    throw new Error(`CLI 参数 --base-model 无效：${validation.message}`);
  }
  return validation.value;
};

export const isTechniqueSkillImageGenerationConfigured = (): boolean => {
  const endpoint = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_URL);
  const apiKey = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_KEY);
  return endpoint.length > 0 && apiKey.length > 0;
};

const buildTechniqueModelDebugSummary = (
  candidate: TechniqueGenerationCandidate,
): TechniqueModelDebugSummary => {
  return {
    techniqueName: candidate.technique.name,
    techniqueType: candidate.technique.type,
    skillCount: candidate.skills.length,
    layerCount: candidate.layers.length,
  };
};

const parseTechniqueModelJson = (
  content: string,
): ReturnType<typeof parseTechniqueTextModelJsonObject> => {
  return parseTechniqueTextModelJsonObject(content, {
    preferredTopLevelKeys: ['technique', 'skills', 'layers'],
  });
};

const attachGeneratedSkillIcons = async (
  candidate: TechniqueGenerationCandidate,
): Promise<TechniqueGenerationCandidate> => {
  if (candidate.skills.length <= 0) return candidate;

  const iconMap = await generateTechniqueSkillIconMap(candidate.skills.map((skill) => ({
    skillId: skill.id,
    techniqueName: candidate.technique.name,
    techniqueType: candidate.technique.type,
    techniqueQuality: candidate.technique.quality,
    techniqueElement: candidate.technique.attributeElement,
    skillName: skill.name,
    skillDescription: skill.description,
    skillEffects: skill.effects,
  })));

  if (iconMap.size <= 0) return candidate;

  return {
    ...candidate,
    skills: candidate.skills.map((skill) => {
      const icon = iconMap.get(skill.id);
      return icon ? { ...skill, icon } : skill;
    }),
  };
};

const buildTechniqueModelDebugPromptContext = (
  baseModel: string | undefined,
): TechniqueModelDebugPromptContext | undefined => {
  const normalized = resolveTechniqueDebugBaseModelArg(baseModel);
  if (!normalized) return undefined;

  return {
    techniqueBaseModel: normalized,
    techniqueBaseModelScopeRules: [...TECHNIQUE_DEBUG_BASE_MODEL_SCOPE_RULES],
  };
};

const applyTechniqueModelDebugPromptContext = (params: {
  userMessage: string;
  promptContext?: TechniqueModelDebugPromptContext;
}): string => {
  if (!params.promptContext) {
    return params.userMessage;
  }

  const payload = JSON.parse(params.userMessage) as TechniqueModelRequestUserPayload;
  const nextGeneralRules = [
    ...(payload.constraints?.generalRules ?? []),
    TECHNIQUE_DEBUG_BASE_MODEL_GENERAL_RULE,
    TECHNIQUE_DEBUG_BASE_MODEL_SCOPE_GENERAL_RULE,
  ];

  return JSON.stringify({
    ...payload,
    constraints: {
      ...(payload.constraints ?? {}),
      generalRules: nextGeneralRules,
    },
    extraContext: {
      ...(payload.extraContext ?? {}),
      ...params.promptContext,
    },
  });
};

export const generateTechniqueModelDebugResult = async (
  params: TechniqueModelDebugGenerateParams,
): Promise<TechniqueModelDebugGenerateResult> => {
  const modelConfig = readTextModelConfig('technique');
  if (!modelConfig) {
    throw new Error('缺少功法文本模型配置，请检查 AI_TECHNIQUE_MODEL_PROVIDER/URL/KEY/NAME');
  }

  const debugPromptContext = buildTechniqueModelDebugPromptContext(params.baseModel);
  const request = buildTechniqueGenerationTextModelRequest({
    techniqueType: params.techniqueType,
    quality: params.quality,
    maxLayer: QUALITY_MAX_LAYER[params.quality],
    seed: params.seed,
  });
  const userMessage = applyTechniqueModelDebugPromptContext({
    userMessage: request.userMessage,
    promptContext: debugPromptContext,
  });

  const response = await callConfiguredTextModel({
    modelScope: 'technique',
    responseFormat: request.responseFormat,
    systemMessage: request.systemMessage,
    userMessage,
    seed: request.seed,
    temperature: request.temperature,
    timeoutMs: request.timeoutMs,
  });
  if (!response) {
    throw new Error('功法文本模型调用失败：未读取到可用模型配置');
  }

  const parsedResult = parseTechniqueModelJson(response.content);
  if (!parsedResult.success) {
    if (parsedResult.reason === 'empty_content') {
      throw new Error('模型返回内容为空');
    }
    throw new Error('模型返回不是合法 JSON 对象');
  }

  const sanitizedResult = sanitizeTechniqueGenerationCandidateFromModelDetailed(
    parsedResult.data,
    params.techniqueType,
    params.quality,
    QUALITY_MAX_LAYER[params.quality],
  );
  if (!sanitizedResult.success) {
    throw new Error(`AI结果清洗失败：${sanitizedResult.reason}`);
  }

  const validation = validateTechniqueGenerationCandidate({
    candidate: sanitizedResult.candidate,
    expectedTechniqueType: params.techniqueType,
    expectedQuality: params.quality,
    expectedMaxLayer: QUALITY_MAX_LAYER[params.quality],
  });
  if (!validation.success) {
    throw new Error(`AI结果校验失败：${validation.message}`);
  }

  const candidate = params.includeSkillIcons
    ? await attachGeneratedSkillIcons(sanitizedResult.candidate)
    : sanitizedResult.candidate;

  return {
    modelName: response.modelName,
    promptSnapshot: response.promptSnapshot,
    seed: request.seed,
    quality: params.quality,
    requestedTechniqueType: params.techniqueType,
    baseModel: debugPromptContext?.techniqueBaseModel ?? null,
    candidate,
    summary: buildTechniqueModelDebugSummary(candidate),
  };
};
