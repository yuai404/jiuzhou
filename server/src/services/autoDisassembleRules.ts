/**
 * 自动分解规则归一化与匹配
 *
 * 目标：
 * - 将客户端提交/数据库存储的规则标准化
 * - 提供统一匹配函数，供战斗掉落、秘境结算等自动分解入口复用
 */
import { clampQualityRank } from './equipmentDisassembleRules.js';

export interface AutoDisassembleRuleSet {
  categories: string[];
  subCategories: string[];
  excludedSubCategories: string[];
  includeNameKeywords: string[];
  excludeNameKeywords: string[];
}

export interface AutoDisassembleSetting {
  enabled: boolean;
  maxQualityRank: number;
  rules: AutoDisassembleRuleSet;
}

export interface AutoDisassembleCandidateMeta {
  itemName: string;
  category: string;
  subCategory: string | null;
  qualityRank: number;
}

const normalizeStringList = (raw: unknown, maxSize: number = 100): string[] => {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const value = String(row ?? '').trim().toLowerCase();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= maxSize) break;
  }
  return out;
};

const normalizeKeywordList = (raw: unknown, maxSize: number = 100): string[] => {
  return normalizeStringList(raw, maxSize);
};

/**
 * 归一化规则：
 * - 未配置 categories 时默认仅自动分解装备（保持现有行为）
 * - 其他数组规则统一去重并限制长度
 * - 名称关键词统一按小写匹配，便于大小写无关检索
 */
export const normalizeAutoDisassembleRuleSet = (raw: unknown): AutoDisassembleRuleSet => {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const categories = normalizeStringList(record.categories);
  const subCategories = normalizeStringList(record.subCategories);
  const excludedSubCategories = normalizeStringList(record.excludedSubCategories);
  const includeNameKeywords = normalizeKeywordList(record.includeNameKeywords);
  const excludeNameKeywords = normalizeKeywordList(record.excludeNameKeywords);

  return {
    categories: categories.length > 0 ? categories : ['equipment'],
    subCategories,
    excludedSubCategories,
    includeNameKeywords,
    excludeNameKeywords,
  };
};

export const normalizeAutoDisassembleSetting = (raw: {
  enabled?: unknown;
  maxQualityRank?: unknown;
  rules?: unknown;
}): AutoDisassembleSetting => {
  return {
    enabled: Boolean(raw.enabled),
    maxQualityRank: clampQualityRank(raw.maxQualityRank, 1),
    rules: normalizeAutoDisassembleRuleSet(raw.rules),
  };
};

const matchesRuleSet = (ruleSet: AutoDisassembleRuleSet, meta: AutoDisassembleCandidateMeta): boolean => {
  const category = String(meta.category || '').trim().toLowerCase();
  const subCategory = String(meta.subCategory || '').trim().toLowerCase();
  const itemName = String(meta.itemName || '').trim().toLowerCase();

  if (ruleSet.categories.length > 0 && !ruleSet.categories.includes(category)) {
    return false;
  }

  if (ruleSet.subCategories.length > 0 && !ruleSet.subCategories.includes(subCategory)) {
    return false;
  }

  if (ruleSet.excludedSubCategories.includes(subCategory)) {
    return false;
  }

  if (
    ruleSet.includeNameKeywords.length > 0 &&
    !ruleSet.includeNameKeywords.some((keyword) => itemName.includes(keyword))
  ) {
    return false;
  }

  if (ruleSet.excludeNameKeywords.some((keyword) => itemName.includes(keyword))) {
    return false;
  }

  return true;
};

export const shouldAutoDisassembleBySetting = (
  setting: AutoDisassembleSetting,
  meta: AutoDisassembleCandidateMeta
): boolean => {
  if (!setting.enabled) return false;
  const qualityRank = Number(meta.qualityRank);
  if (!Number.isInteger(qualityRank) || qualityRank <= 0) return false;
  if (qualityRank > setting.maxQualityRank) return false;
  return matchesRuleSet(setting.rules, meta);
};
