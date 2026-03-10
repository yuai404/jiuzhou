/**
 * 功法作用域共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中定义角色专属/伙伴专属功法作用域，并提供角色侧过滤函数。
 * 2) 做什么：让功法列表、角色学习、伙伴战斗共用同一套作用域判断，避免字符串散落。
 * 3) 不做什么：不读取数据库、不决定功法可否发布，也不处理前端展示。
 *
 * 输入/输出：
 * - 输入：功法定义上的 `usage_scope`。
 * - 输出：标准化作用域值与角色可见性判断结果。
 *
 * 数据流/状态流：
 * generated/static technique definition -> techniqueUsageScope -> characterTechnique/item/partner/techniqueService。
 *
 * 关键边界条件与坑点：
 * 1) 静态功法默认视为 `character_only`，这样不会把现有全量静态定义误判为伙伴专属。
 * 2) 伙伴专属功法可以被伙伴系统读取，但绝不能流入角色功法列表、角色学习链路与可交易功法书展示。
 */

export type TechniqueUsageScope = 'character_only' | 'partner_only';

export type TechniqueUsageScopeCarrier = {
  usage_scope?: string | null;
};

export const DEFAULT_TECHNIQUE_USAGE_SCOPE: TechniqueUsageScope = 'character_only';

export const normalizeTechniqueUsageScope = (
  usageScope: unknown,
): TechniqueUsageScope => {
  return usageScope === 'partner_only' ? 'partner_only' : DEFAULT_TECHNIQUE_USAGE_SCOPE;
};

export const isPartnerOnlyTechniqueDefinition = (
  technique: TechniqueUsageScopeCarrier | null | undefined,
): boolean => {
  return normalizeTechniqueUsageScope(technique?.usage_scope) === 'partner_only';
};

export const isCharacterVisibleTechniqueDefinition = (
  technique: TechniqueUsageScopeCarrier | null | undefined,
): boolean => {
  return !isPartnerOnlyTechniqueDefinition(technique);
};
