/**
 * 物品/货币消耗操作模块
 *
 * 作用：提供按物品定义 ID 消耗材料、按实例 ID 消耗道具、消耗/增加角色货币等原子操作。
 *       所有函数通过 `query()` 自动走事务连接，无需传入 client。
 *
 * 输入/输出：
 * - consumeMaterialByDefId(characterId, materialItemDefId, qty) — 按定义 ID 扣除材料
 * - consumeSpecificItemInstance(characterId, itemInstanceId, qty) — 按实例 ID 扣除道具
 * - consumeCharacterCurrencies(characterId, costs) — 扣除角色货币（银两/灵石）
 * - addCharacterCurrencies(characterId, gains) — 增加角色货币
 *
 * 被引用方：equipment.ts（强化/精炼/洗炼消耗）、socket.ts（镶嵌消耗）、
 *           disassemble.ts（拆解奖励增加货币）、bag.ts（如需）
 *
 * 数据流：
 * - 查询 item_instance / characters 表 → 校验余额 → 执行扣除/增加
 *
 * 边界条件：
 * 1. consumeMaterialByDefId 优先消耗未锁定、数量最多的堆叠行，全部锁定时报"材料已锁定"
 * 2. consumeCharacterCurrencies 在 silver/spiritStones 均为 0 时直接返回成功，不触发查询
 */
import { query } from "../../../config/database.js";
import {
  applyPendingCharacterWriteback,
  applyPendingInventoryItemWritebackRows,
  queueCharacterWritebackSnapshot,
  queueInventoryItemWritebackSnapshot,
} from "../../playerWritebackCacheService.js";
import { clampInt } from "./helpers.js";

type CharacterCurrencyRow = {
  id: number;
  attribute_points: number;
  jing: number;
  qi: number;
  shen: number;
  silver: number;
  spirit_stones: number;
};

const toCharacterWritebackSnapshot = (
  row: CharacterCurrencyRow,
): {
  attribute_points: number;
  jing: number;
  qi: number;
  shen: number;
  silver: number;
  spirit_stones: number;
} => {
  return {
    attribute_points: Number(row.attribute_points) || 0,
    jing: Number(row.jing) || 0,
    qi: Number(row.qi) || 0,
    shen: Number(row.shen) || 0,
    silver: Number(row.silver) || 0,
    spirit_stones: Number(row.spirit_stones) || 0,
  };
};

/**
 * 按物品定义 ID 消耗指定数量的材料
 * 从 bag/warehouse 位置的未锁定行中按数量降序扣除
 */
export const consumeMaterialByDefId = async (
  characterId: number,
  materialItemDefId: string,
  qty: number,
): Promise<{ success: boolean; message: string }> => {
  const need = clampInt(qty, 1, 999999);
  const rowResult = await query(
    `
      SELECT
        id,
        owner_character_id,
        item_def_id,
        qty,
        location,
        location_slot,
        equipped_slot,
        strengthen_level,
        refine_level,
        affixes,
        affix_gen_version,
        locked
      FROM item_instance
      WHERE owner_character_id = $1
        AND item_def_id = $2
        AND location IN ('bag', 'warehouse')
      ORDER BY qty DESC, id ASC
      FOR UPDATE
    `,
    [characterId, materialItemDefId],
  );

  if (rowResult.rows.length === 0) {
    return { success: false, message: "材料不足" };
  }

  const rows = applyPendingInventoryItemWritebackRows(characterId, rowResult.rows as Array<{
    id: number;
    owner_character_id: number;
    item_def_id: string;
    qty: number;
    location: string;
    location_slot: number | null;
    equipped_slot: string | null;
    strengthen_level: number;
    refine_level: number;
    affixes: unknown;
    affix_gen_version: number | null;
    locked: boolean;
  }>);
  const unlockedRows = rows.filter(
    (row) => !row.locked && (Number(row.qty) || 0) > 0,
  );
  const unlockedTotal = unlockedRows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.qty) || 0),
    0,
  );

  if (unlockedTotal < need) {
    if (unlockedTotal <= 0 && rows.some((row) => row.locked)) {
      return { success: false, message: "材料已锁定" };
    }
    return { success: false, message: "材料不足" };
  }

  let remaining = need;
  for (const row of unlockedRows) {
    if (remaining <= 0) break;
    const rowQty = Math.max(0, Number(row.qty) || 0);
    if (rowQty <= 0) continue;

    const consume = Math.min(rowQty, remaining);
    if (consume >= rowQty) {
      queueInventoryItemWritebackSnapshot(characterId, row, null);
    } else {
      queueInventoryItemWritebackSnapshot(characterId, row, {
        qty: rowQty - consume,
      });
    }
    remaining -= consume;
  }

  return { success: true, message: "扣除成功" };
};

/**
 * 按物品实例 ID 消耗指定数量的道具
 * 仅允许消耗 bag/warehouse 位置的未锁定物品
 */
export const consumeSpecificItemInstance = async (
  characterId: number,
  itemInstanceId: number,
  qty: number,
): Promise<{ success: boolean; message: string; itemDefId?: string }> => {
  const need = clampInt(qty, 1, 999999);
  const result = await query(
    `
      SELECT
        id,
        owner_character_id,
        item_def_id,
        qty,
        location,
        location_slot,
        equipped_slot,
        strengthen_level,
        refine_level,
        affixes,
        affix_gen_version,
        locked
      FROM item_instance
      WHERE id = $1 AND owner_character_id = $2
      FOR UPDATE
      LIMIT 1
    `,
    [itemInstanceId, characterId],
  );

  if (result.rows.length === 0)
    return { success: false, message: "道具不存在" };

  const row = applyPendingInventoryItemWritebackRows(characterId, result.rows as Array<{
    id: number;
    owner_character_id: number;
    item_def_id: string;
    qty: number;
    location_slot: number | null;
    equipped_slot: string | null;
    strengthen_level: number;
    refine_level: number;
    affixes: unknown;
    affix_gen_version: number | null;
    locked: boolean;
    location: string;
  }>)[0];
  if (!row) return { success: false, message: "道具不存在" };
  if (row.locked) return { success: false, message: "道具已锁定" };
  if (!["bag", "warehouse"].includes(String(row.location))) {
    return { success: false, message: "道具当前位置不可消耗" };
  }
  if ((Number(row.qty) || 0) < need)
    return { success: false, message: "道具数量不足" };

  if ((Number(row.qty) || 0) === need) {
    queueInventoryItemWritebackSnapshot(characterId, row, null);
  } else {
    queueInventoryItemWritebackSnapshot(characterId, row, {
      qty: (Number(row.qty) || 0) - need,
    });
  }
  return {
    success: true,
    message: "扣除成功",
    itemDefId: String(row.item_def_id),
  };
};

/**
 * 扣除角色货币（银两、灵石）
 * 两者均为 0 时直接返回成功
 */
export const consumeCharacterCurrencies = async (
  characterId: number,
  costs: { silver?: number; spiritStones?: number },
): Promise<{ success: boolean; message: string }> => {
  const silverCost = Math.max(0, Math.floor(Number(costs.silver) || 0));
  const spiritCost = Math.max(0, Math.floor(Number(costs.spiritStones) || 0));
  if (silverCost <= 0 && spiritCost <= 0)
    return { success: true, message: "无需扣除货币" };

  const charResult = await query(
    `
      SELECT
        id,
        attribute_points,
        jing,
        qi,
        shen,
        silver,
        spirit_stones
      FROM characters
      WHERE id = $1
      FOR UPDATE
      LIMIT 1
    `,
    [characterId],
  );
  if (charResult.rows.length === 0)
    return { success: false, message: "角色不存在" };

  const current = applyPendingCharacterWriteback(charResult.rows[0] as CharacterCurrencyRow);
  const curSilver = Number(current.silver ?? 0) || 0;
  const curSpirit = Number(current.spirit_stones ?? 0) || 0;
  if (curSilver < silverCost)
    return { success: false, message: `银两不足，需要${silverCost}` };
  if (curSpirit < spiritCost)
    return { success: false, message: `灵石不足，需要${spiritCost}` };

  queueCharacterWritebackSnapshot(characterId, {
    ...toCharacterWritebackSnapshot(current),
    silver: curSilver - silverCost,
    spirit_stones: curSpirit - spiritCost,
  });
  return { success: true, message: "扣除成功" };
};

/**
 * 增加角色货币（银两、灵石）
 * 两者均为 0 时直接返回成功
 */
export const addCharacterCurrencies = async (
  characterId: number,
  gains: { silver?: number; spiritStones?: number },
): Promise<{ success: boolean; message: string }> => {
  const silverGain = Math.max(0, Math.floor(Number(gains.silver) || 0));
  const spiritGain = Math.max(0, Math.floor(Number(gains.spiritStones) || 0));
  if (silverGain <= 0 && spiritGain <= 0)
    return { success: true, message: "无需增加货币" };

  const charResult = await query(
    `
      SELECT
        id,
        attribute_points,
        jing,
        qi,
        shen,
        silver,
        spirit_stones
      FROM characters
      WHERE id = $1
      FOR UPDATE
      LIMIT 1
    `,
    [characterId],
  );
  if (charResult.rows.length === 0)
    return { success: false, message: "角色不存在" };

  const current = applyPendingCharacterWriteback(charResult.rows[0] as CharacterCurrencyRow);
  queueCharacterWritebackSnapshot(characterId, {
    ...toCharacterWritebackSnapshot(current),
    silver: (Number(current.silver) || 0) + silverGain,
    spirit_stones: (Number(current.spirit_stones) || 0) + spiritGain,
  });
  return { success: true, message: "增加成功" };
};
