/**
 * 可学习功法解析工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一从物品定义展示字段里解析“可学习功法 ID”，供背包详情、仓库 tooltip、坊市 tooltip 复用。
 * 2. 做什么：兼容普通功法书与生成功法书两类数据入口，避免多个模块各自遍历 `effect_defs`。
 * 3. 不做什么：不负责发请求、不判断 UI 是否显示技能区，也不改写任何物品展示文案。
 *
 * 输入/输出：
 * - 输入：只包含 `generated_technique_id` 与 `effect_defs` 的轻量物品定义对象。
 * - 输出：命中的功法 ID；未命中时返回 `null`。
 *
 * 数据流/状态流：
 * inventory/market DTO -> 本工具解析功法 ID -> 技能查询 Hook / tooltip / 详情面板。
 *
 * 关键边界条件与坑点：
 * 1. 生成功法书优先读取 `generated_technique_id`，因为这类物品的 `effect_defs` 可能只有通用效果类型，缺少真实功法 ID。
 * 2. `effect_defs` 结构来自后端动态配置，必须逐层判空，避免前端在 tooltip 场景里因脏数据直接报错。
 */
type LearnableTechniqueSource = {
  generated_technique_id?: string | null;
  effect_defs?: unknown;
};

type EffectDefRecord = {
  effect_type?: unknown;
  params?: unknown;
};

const normalizeToken = (value: unknown): string => {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const coerceEffectDefs = (value: unknown): EffectDefRecord[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is EffectDefRecord => {
    return Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry);
  });
};

export const getLearnableTechniqueId = (
  source?: LearnableTechniqueSource | null,
): string | null => {
  const generatedTechniqueId =
    typeof source?.generated_technique_id === 'string'
      ? source.generated_technique_id.trim()
      : '';
  if (generatedTechniqueId) return generatedTechniqueId;

  for (const rawEffect of coerceEffectDefs(source?.effect_defs)) {
    const effectType = normalizeToken(rawEffect.effect_type);
    if (effectType !== 'learn_technique' && effectType !== 'learn_generated_technique') {
      continue;
    }

    const params = toRecord(rawEffect.params);
    if (!params) continue;

    const techniqueId =
      typeof params.technique_id === 'string' ? params.technique_id.trim() : '';
    if (techniqueId) return techniqueId;

    const generatedId =
      typeof params.generated_technique_id === 'string'
        ? params.generated_technique_id.trim()
        : '';
    if (generatedId) return generatedId;
  }

  return null;
};

