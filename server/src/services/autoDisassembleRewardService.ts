import { resolveQualityRank } from './equipmentDisassembleRules.js';
import { buildDisassembleRewardPlan } from './disassembleRewardPlanner.js';
import {
  shouldAutoDisassembleBySetting,
  type AutoDisassembleCandidateMeta,
  type AutoDisassembleSetting,
} from './autoDisassembleRules.js';
export type { AutoDisassembleRuleSet, AutoDisassembleSetting } from './autoDisassembleRules.js';

export type PendingMailItem = {
  item_def_id: string;
  qty: number;
  options?: {
    bindType?: string;
    equipOptions?: unknown;
  };
};

export interface GrantItemCreateResult {
  success: boolean;
  message: string;
  itemIds?: number[];
  equipment?: {
    quality?: string;
    qualityRank?: number;
  };
}

export type GrantItemCreateFn = (params: {
  itemDefId: string;
  qty: number;
  bindType?: string;
  obtainedFrom: string;
  equipOptions?: unknown;
}) => Promise<GrantItemCreateResult>;

export type DeleteItemInstancesFn = (characterId: number, itemIds: number[]) => Promise<void>;
export type AddCharacterSilverFn = (
  characterId: number,
  silver: number
) => Promise<{ success: boolean; message: string }>;

export interface GrantRewardItemWithAutoDisassembleInput {
  characterId: number;
  itemDefId: string;
  qty: number;
  bindType?: string;
  itemMeta: {
    itemName?: string | null;
    category: string;
    subCategory?: string | null;
    effectDefs?: unknown;
    level?: number | null;
    qualityRank?: number | null;
  };
  autoDisassembleSetting: AutoDisassembleSetting;
  sourceObtainedFrom: string;
  createItem: GrantItemCreateFn;
  deleteItemInstances: DeleteItemInstancesFn;
  addSilver?: AddCharacterSilverFn;
  sourceEquipOptions?: unknown;
}

export interface GrantedRewardItem {
  itemDefId: string;
  qty: number;
  itemIds: number[];
}

export interface GrantRewardItemWithAutoDisassembleResult {
  grantedItems: GrantedRewardItem[];
  pendingMailItems: PendingMailItem[];
  warnings: string[];
  gainedSilver: number;
}

const normalizeItemIds = (itemIds?: number[]): number[] => {
  if (!Array.isArray(itemIds)) return [];
  return itemIds.filter((id) => Number.isInteger(id) && id > 0);
};

const appendGrantedItem = (
  result: GrantRewardItemWithAutoDisassembleResult,
  itemDefId: string,
  qty: number,
  itemIds: number[]
): void => {
  const existing = result.grantedItems.find((item) => item.itemDefId === itemDefId);
  if (existing) {
    existing.qty += qty;
    if (itemIds.length > 0) {
      existing.itemIds.push(...itemIds);
    }
    return;
  }
  result.grantedItems.push({ itemDefId, qty, itemIds: [...itemIds] });
};

const appendPendingMailItem = (
  result: GrantRewardItemWithAutoDisassembleResult,
  mailItem: PendingMailItem
): void => {
  const targetOptions = mailItem.options;
  const targetBindType = targetOptions?.bindType || 'none';
  const targetEquipOptionsKey = JSON.stringify(targetOptions?.equipOptions || null);
  const existing = result.pendingMailItems.find((item) => {
    const bindType = item.options?.bindType || 'none';
    const equipOptionsKey = JSON.stringify(item.options?.equipOptions || null);
    return item.item_def_id === mailItem.item_def_id && bindType === targetBindType && equipOptionsKey === targetEquipOptionsKey;
  });

  if (existing) {
    existing.qty += mailItem.qty;
    return;
  }
  result.pendingMailItems.push({
    item_def_id: mailItem.item_def_id,
    qty: mailItem.qty,
    ...(targetOptions ? { options: { ...targetOptions } } : {}),
  });
};

const resolveGeneratedQualityRank = (createResult: GrantItemCreateResult): number => {
  const raw = Number(createResult.equipment?.qualityRank);
  if (Number.isInteger(raw) && raw > 0) return raw;
  return resolveQualityRank(createResult.equipment?.quality);
};

const mergeResult = (
  target: GrantRewardItemWithAutoDisassembleResult,
  source: GrantRewardItemWithAutoDisassembleResult
): void => {
  for (const item of source.grantedItems) {
    appendGrantedItem(target, item.itemDefId, item.qty, item.itemIds);
  }
  for (const mailItem of source.pendingMailItems) {
    appendPendingMailItem(target, mailItem);
  }
  if (source.gainedSilver > 0) {
    target.gainedSilver += source.gainedSilver;
  }
};

const createEmptyResult = (): GrantRewardItemWithAutoDisassembleResult => ({
  grantedItems: [],
  pendingMailItems: [],
  warnings: [],
  gainedSilver: 0,
});

export const grantRewardItemWithAutoDisassemble = async (
  input: GrantRewardItemWithAutoDisassembleInput
): Promise<GrantRewardItemWithAutoDisassembleResult> => {
  const result = createEmptyResult();

  const normalizedQty = Math.max(0, Math.floor(input.qty));
  if (normalizedQty <= 0) return result;

  const category = String(input.itemMeta.category || '').trim();
  const subCategory = input.itemMeta.subCategory ?? null;
  const itemName = String(input.itemMeta.itemName || '').trim();
  const effectDefs = input.itemMeta.effectDefs;
  const itemLevel = Math.max(0, Math.floor(Number(input.itemMeta.level) || 0));
  const baseQualityRank = (() => {
    const n = Number(input.itemMeta.qualityRank);
    if (Number.isInteger(n) && n > 0) return n;
    return 1;
  })();

  if (!input.autoDisassembleSetting.enabled) {
    const createResult = await input.createItem({
      itemDefId: input.itemDefId,
      qty: normalizedQty,
      ...(input.bindType ? { bindType: input.bindType } : {}),
      obtainedFrom: input.sourceObtainedFrom,
      ...(input.sourceEquipOptions ? { equipOptions: input.sourceEquipOptions } : {}),
    });

    if (createResult.success) {
      appendGrantedItem(result, input.itemDefId, normalizedQty, normalizeItemIds(createResult.itemIds));
      return result;
    }

    if (createResult.message === '背包已满') {
      const options =
        input.bindType || input.sourceEquipOptions
          ? {
              ...(input.bindType ? { bindType: input.bindType } : {}),
              ...(input.sourceEquipOptions ? { equipOptions: input.sourceEquipOptions } : {}),
            }
          : undefined;
      appendPendingMailItem(result, {
        item_def_id: input.itemDefId,
        qty: normalizedQty,
        ...(options ? { options } : {}),
      });
      appendGrantedItem(result, input.itemDefId, normalizedQty, []);
      return result;
    }

    result.warnings.push(`物品创建失败: ${input.itemDefId}, ${createResult.message}`);
    return result;
  }

  for (let i = 0; i < normalizedQty; i++) {
    const sourceCreateOptions = {
      itemDefId: input.itemDefId,
      qty: 1,
      ...(input.bindType ? { bindType: input.bindType } : {}),
      obtainedFrom: input.sourceObtainedFrom,
      ...(input.sourceEquipOptions ? { equipOptions: input.sourceEquipOptions } : {}),
    } as const;

    const sourceCreateResult = await input.createItem({
      ...sourceCreateOptions,
    });

    if (!sourceCreateResult.success) {
      if (sourceCreateResult.message === '背包已满') {
        const options =
          input.bindType || input.sourceEquipOptions
            ? {
                ...(input.bindType ? { bindType: input.bindType } : {}),
                ...(input.sourceEquipOptions ? { equipOptions: input.sourceEquipOptions } : {}),
              }
            : undefined;
        appendPendingMailItem(result, {
          item_def_id: input.itemDefId,
          qty: 1,
          ...(options ? { options } : {}),
        });
        appendGrantedItem(result, input.itemDefId, 1, []);
      } else {
        result.warnings.push(`物品创建失败: ${input.itemDefId}, ${sourceCreateResult.message}`);
      }
      continue;
    }

    const sourceItemIds = normalizeItemIds(sourceCreateResult.itemIds);
    const generatedQualityRank = resolveGeneratedQualityRank(sourceCreateResult) || baseQualityRank;
    const candidateMeta: AutoDisassembleCandidateMeta = {
      itemName,
      category,
      subCategory,
      qualityRank: generatedQualityRank,
    };

    if (!shouldAutoDisassembleBySetting(input.autoDisassembleSetting, candidateMeta)) {
      appendGrantedItem(result, input.itemDefId, 1, sourceItemIds);
      continue;
    }

    const rewardPlan = buildDisassembleRewardPlan({
      category,
      subCategory,
      effectDefs,
      qualityRankRaw: generatedQualityRank,
      itemLevelRaw: itemLevel,
      strengthenLevelRaw: 0,
      refineLevelRaw: 0,
      affixesRaw: [],
      qty: 1,
    });
    if (!rewardPlan.success) {
      result.warnings.push(`自动分解规则计算失败: ${input.itemDefId}, ${rewardPlan.message}`);
      appendGrantedItem(result, input.itemDefId, 1, sourceItemIds);
      continue;
    }

    const tempResult = createEmptyResult();
    let rewardApplySuccess = true;

    for (const rewardItem of rewardPlan.rewards.items) {
      const rewardCreateResult = await input.createItem({
        itemDefId: rewardItem.itemDefId,
        qty: rewardItem.qty,
        obtainedFrom: 'auto_disassemble',
      });

      if (rewardCreateResult.success) {
        appendGrantedItem(tempResult, rewardItem.itemDefId, rewardItem.qty, normalizeItemIds(rewardCreateResult.itemIds));
        continue;
      }

      if (rewardCreateResult.message === '背包已满') {
        appendPendingMailItem(tempResult, {
          item_def_id: rewardItem.itemDefId,
          qty: rewardItem.qty,
        });
        appendGrantedItem(tempResult, rewardItem.itemDefId, rewardItem.qty, []);
        continue;
      }

      rewardApplySuccess = false;
      result.warnings.push(`自动分解奖励入包失败: ${rewardItem.itemDefId}, ${rewardCreateResult.message}`);
      break;
    }

    if (rewardApplySuccess && rewardPlan.rewards.silver > 0) {
      if (!input.addSilver) {
        rewardApplySuccess = false;
        result.warnings.push(`自动分解银两发放失败: ${input.itemDefId}, 缺少addSilver实现`);
      } else {
        const addSilverResult = await input.addSilver(input.characterId, rewardPlan.rewards.silver);
        if (!addSilverResult.success) {
          rewardApplySuccess = false;
          result.warnings.push(`自动分解银两发放失败: ${input.itemDefId}, ${addSilverResult.message}`);
        } else {
          tempResult.gainedSilver += rewardPlan.rewards.silver;
        }
      }
    }

    if (!rewardApplySuccess) {
      appendGrantedItem(result, input.itemDefId, 1, sourceItemIds);
      continue;
    }

    if (sourceItemIds.length > 0) {
      await input.deleteItemInstances(input.characterId, sourceItemIds);
    }
    mergeResult(result, tempResult);
  }

  return result;
};
