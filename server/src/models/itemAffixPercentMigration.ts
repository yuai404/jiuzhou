import { query } from '../config/database.js';
import { runDbMigrationOnce } from './migrationHistoryTable.js';

type JsonRecord = Record<string, unknown>;

const RATIO_ATTR_KEYS = new Set([
  'shuxing_shuzhi',
  'mingzhong',
  'shanbi',
  'zhaojia',
  'baoji',
  'baoshang',
  'kangbao',
  'zengshang',
  'zhiliao',
  'jianliao',
  'xixue',
  'lengque',
  'kongzhi_kangxing',
  'jin_kangxing',
  'mu_kangxing',
  'shui_kangxing',
  'huo_kangxing',
  'tu_kangxing',
]);

const RATE_PARAM_KEYS = ['chance', 'scale_rate', 'rate', 'ratio'] as const;

const toJsonRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const normalizeLegacyPercentValue = (value: number, attrKeyRaw?: unknown): number => {
  if (!Number.isFinite(value)) return value;
  const attrKey = typeof attrKeyRaw === 'string' ? attrKeyRaw : '';
  const threshold = attrKey === 'baoshang' ? 10 : 1;
  if (value > 1000) return Number((value / 10000).toFixed(6));
  if (value > threshold) return Number((value / 100).toFixed(6));
  return value;
};

const normalizeNumericFieldAsPercent = (
  row: JsonRecord,
  field: string,
  attrKeyHint?: unknown
): boolean => {
  const raw = toFiniteNumber(row[field]);
  if (raw === null) return false;
  const normalized = normalizeLegacyPercentValue(raw, attrKeyHint);
  if (normalized === raw) return false;
  row[field] = normalized;
  return true;
};

const isRatioValueContext = (
  applyTypeRaw: unknown,
  attrKeyRaw: unknown,
  effectTypeRaw?: unknown,
  params?: JsonRecord | null
): boolean => {
  if (applyTypeRaw === 'percent') return true;
  if (typeof attrKeyRaw === 'string' && RATIO_ATTR_KEYS.has(attrKeyRaw)) return true;
  if (applyTypeRaw !== 'special') return false;

  const effectType = typeof effectTypeRaw === 'string' ? effectTypeRaw : '';
  const paramApplyType = params && typeof params.apply_type === 'string' ? params.apply_type : '';
  const paramAttrKey = params && typeof params.attr_key === 'string' ? params.attr_key : '';
  const damageType = params && typeof params.damage_type === 'string' ? params.damage_type : '';
  const debuffType = params && typeof params.debuff_type === 'string' ? params.debuff_type : '';

  if ((effectType === 'buff' || effectType === 'debuff') && (paramApplyType === 'percent' || RATIO_ATTR_KEYS.has(paramAttrKey))) {
    return true;
  }
  if (effectType === 'damage' && damageType === 'reflect') return true;
  if (effectType === 'debuff' && debuffType === 'bleed') return true;
  return false;
};

const normalizeAffixParamsPercentFields = (
  paramsRaw: unknown,
  fallbackApplyType: string,
  fallbackAttrKey: string,
  effectTypeRaw?: unknown
): { normalizedParams?: JsonRecord; changed: boolean } => {
  const params = toJsonRecord(paramsRaw);
  if (!params) return { changed: false };

  const nextParams: JsonRecord = { ...params };
  let changed = false;

  for (const key of RATE_PARAM_KEYS) {
    changed = normalizeNumericFieldAsPercent(nextParams, key) || changed;
  }

  const paramApplyType =
    typeof nextParams.apply_type === 'string' ? nextParams.apply_type : fallbackApplyType;
  const paramAttrKey =
    typeof nextParams.attr_key === 'string' ? nextParams.attr_key : fallbackAttrKey;
  if (isRatioValueContext(paramApplyType, paramAttrKey, effectTypeRaw, nextParams)) {
    changed = normalizeNumericFieldAsPercent(nextParams, 'value', paramAttrKey) || changed;
  }

  return { normalizedParams: nextParams, changed };
};

const normalizeAffixDefRecord = (raw: unknown): { normalized: unknown; changed: boolean } => {
  const row = toJsonRecord(raw);
  if (!row) return { normalized: raw, changed: false };

  const next: JsonRecord = { ...row };
  const applyType = typeof next.apply_type === 'string' ? next.apply_type : '';
  const attrKey = typeof next.attr_key === 'string' ? next.attr_key : '';
  const effectType = next.effect_type;
  const params = toJsonRecord(next.params);

  let changed = false;
  if (isRatioValueContext(applyType, attrKey, effectType, params) && Array.isArray(next.tiers)) {
    let tiersChanged = false;
    const normalizedTiers = next.tiers.map((tierRaw) => {
      const tier = toJsonRecord(tierRaw);
      if (!tier) return tierRaw;
      const nextTier: JsonRecord = { ...tier };
      let tierChanged = false;
      tierChanged = normalizeNumericFieldAsPercent(nextTier, 'min', attrKey) || tierChanged;
      tierChanged = normalizeNumericFieldAsPercent(nextTier, 'max', attrKey) || tierChanged;
      if (!tierChanged) return tierRaw;
      tiersChanged = true;
      return nextTier;
    });
    if (tiersChanged) {
      next.tiers = normalizedTiers;
      changed = true;
    }
  }

  const { normalizedParams, changed: paramsChanged } = normalizeAffixParamsPercentFields(
    next.params,
    applyType,
    attrKey,
    effectType
  );
  if (paramsChanged && normalizedParams) {
    next.params = normalizedParams;
    changed = true;
  }

  return { normalized: next, changed };
};

const normalizeGeneratedAffixRecord = (raw: unknown): { normalized: unknown; changed: boolean } => {
  const row = toJsonRecord(raw);
  if (!row) return { normalized: raw, changed: false };

  const next: JsonRecord = { ...row };
  const applyType = typeof next.apply_type === 'string' ? next.apply_type : '';
  const attrKey = typeof next.attr_key === 'string' ? next.attr_key : '';
  const effectType = next.effect_type;
  const params = toJsonRecord(next.params);

  let changed = false;
  if (isRatioValueContext(applyType, attrKey, effectType, params)) {
    changed = normalizeNumericFieldAsPercent(next, 'value', attrKey) || changed;
  }

  const { normalizedParams, changed: paramsChanged } = normalizeAffixParamsPercentFields(
    next.params,
    applyType,
    attrKey,
    effectType
  );
  if (paramsChanged && normalizedParams) {
    next.params = normalizedParams;
    changed = true;
  }

  return { normalized: next, changed };
};

export const migrateLegacyAffixPoolPercentValues = async (): Promise<void> => {
  const result = await query(`
    SELECT id, rules, affixes
    FROM affix_pool
    WHERE affixes IS NOT NULL
  `);

  let updatedCount = 0;
  for (const row of result.rows) {
    if (!Array.isArray(row.affixes)) continue;

    let affixesChanged = false;
    const normalizedAffixes = row.affixes.map((affixRaw: unknown) => {
      const { normalized, changed } = normalizeAffixDefRecord(affixRaw);
      if (changed) affixesChanged = true;
      return normalized;
    });

    const rulesRecord = toJsonRecord(row.rules);
    let rulesChanged = false;
    let normalizedRules: unknown = row.rules;
    if (rulesRecord) {
      const nextRules: JsonRecord = { ...rulesRecord };
      rulesChanged = normalizeNumericFieldAsPercent(nextRules, 'legendary_chance') || rulesChanged;
      if (rulesChanged) normalizedRules = nextRules;
    }

    if (!affixesChanged && !rulesChanged) continue;

    await query(
      `
        UPDATE affix_pool
        SET rules = $2::jsonb,
            affixes = $3::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        row.id,
        JSON.stringify(normalizedRules ?? {}),
        JSON.stringify(normalizedAffixes),
      ]
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(`词条池历史百分比口径迁移完成: ${updatedCount} 条`);
  }
};

export const migrateLegacyItemInstanceAffixes = async (): Promise<void> => {
  const result = await query(`
    SELECT id, affixes
    FROM item_instance
    WHERE affixes IS NOT NULL
      AND jsonb_typeof(affixes) = 'array'
  `);

  let updatedCount = 0;
  for (const row of result.rows) {
    if (!Array.isArray(row.affixes)) continue;

    let affixesChanged = false;
    const normalizedAffixes = row.affixes.map((affixRaw: unknown) => {
      const { normalized, changed } = normalizeGeneratedAffixRecord(affixRaw);
      if (changed) affixesChanged = true;
      return normalized;
    });
    if (!affixesChanged) continue;

    await query(
      `
        UPDATE item_instance
        SET affixes = $2::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [row.id, JSON.stringify(normalizedAffixes)]
    );
    updatedCount += 1;
  }

  if (updatedCount > 0) {
    console.log(`装备实例历史词条百分比口径迁移完成: ${updatedCount} 条`);
  }
};

export const runItemAffixPercentMigrations = async (): Promise<void> => {
  await runDbMigrationOnce({
    migrationKey: 'item_affix_percent_actual_value_v1',
    description: '装备词条相关百分比字段统一为比例值（1=100%）',
    execute: async () => {
      await migrateLegacyAffixPoolPercentValues();
      await migrateLegacyItemInstanceAffixes();
    },
  });
};
