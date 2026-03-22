/**
 * 玩家写回缓存服务
 *
 * 作用：
 * 1. 做什么：集中承接角色字段与物品字段的 pending 写入，统一提供“立即可读”和“延迟刷库”能力，避免属性点、货币、装备状态各自维护一套缓存逻辑。
 * 2. 做什么：提供按角色 flush、全量 flush、定时 flush 调度和读取覆盖入口，供角色面板、背包、装备校验等共享复用。
 * 3. 不做什么：不托管战斗状态、地图状态、挂机批次等其他系统数据，也不在 Redis 失败时回退为实时写库。
 *
 * 输入/输出：
 * - 输入：角色 ID、角色字段快照、物品基础快照与下一状态快照。
 * - 输出：覆盖后的角色/物品读取结果，以及按角色批量落库的 flush 行为。
 *
 * 数据流/状态流：
 * 业务写操作 -> queueCharacterWritebackSnapshot / queueInventoryItemWritebackSnapshot -> 内存 pending 快照
 * -> 角色/背包共享读取入口调用 applyPending* 立即看到最新状态
 * -> 定时 flush 或下线/关服强制 flush -> 批量 UPDATE/DELETE 落库 -> 清空 dirty 状态。
 *
 * 关键边界条件与坑点：
 * 1. 物品 pending 必须保留 base 快照；否则删除或位置变化后，背包占用数和后续覆盖读取无法知道“原来那行长什么样”。
 * 2. flush 成功前不能提前清空 dirty 状态；否则中途写库失败会导致内存快照丢失。
 */
import { query, withTransaction } from '../config/database.js';
import { CHARACTER_BASE_COLUMNS_SQL } from './shared/sqlFragments.js';

const PLAYER_WRITEBACK_FLUSH_INTERVAL_MS = 5_000;

type CharacterWritebackSnapshot = Partial<{
  nickname: string;
  title: string;
  gender: string;
  avatar: string | null;
  auto_cast_skills: boolean;
  auto_disassemble_enabled: boolean;
  auto_disassemble_rules: unknown;
  dungeon_no_stamina_cost: boolean;
  spirit_stones: number;
  silver: number;
  realm: string;
  sub_realm: string | null;
  exp: number;
  attribute_points: number;
  jing: number;
  qi: number;
  shen: number;
  attribute_type: string;
  attribute_element: string;
  current_map_id: string;
  current_room_id: string;
}>;

type CharacterWritebackRow = {
  id: number;
  user_id: number;
  stamina: number;
} & Required<CharacterWritebackSnapshot>;

type InventoryWritebackBaseSnapshot = {
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
};

type InventoryWritebackNextSnapshot = InventoryWritebackBaseSnapshot;

type InventoryWritebackPatch = Partial<InventoryWritebackBaseSnapshot>;

type PendingInventoryState = {
  base: InventoryWritebackBaseSnapshot;
  next: InventoryWritebackNextSnapshot | null;
};

type InventoryOccupancyRow = {
  location: string;
  location_slot: number | null;
};

const pendingCharacters = new Map<number, CharacterWritebackSnapshot>();
const pendingInventoryByCharacter = new Map<number, Map<number, PendingInventoryState>>();
const dirtyCharacterIds = new Set<number>();
const characterRuntimeVersions = new Map<number, number>();

let flushTimer: ReturnType<typeof setTimeout> | null = null;
const flushInFlight = new Map<number, Promise<void>>();

const isPositiveInteger = (value: number): boolean => {
  return Number.isInteger(value) && value > 0;
};

const cloneCharacterSnapshot = (
  snapshot: CharacterWritebackSnapshot,
): CharacterWritebackSnapshot => {
  return {
    ...snapshot,
    ...(snapshot.auto_disassemble_rules !== undefined
      ? { auto_disassemble_rules: snapshot.auto_disassemble_rules }
      : {}),
  };
};

const cloneInventorySnapshot = (
  snapshot: InventoryWritebackBaseSnapshot,
): InventoryWritebackBaseSnapshot => {
  return {
    ...snapshot,
    affixes: snapshot.affixes,
  };
};

const resolveItemNextSnapshot = (
  base: InventoryWritebackBaseSnapshot,
  patch: InventoryWritebackPatch,
): InventoryWritebackNextSnapshot => {
  return {
    ...cloneInventorySnapshot(base),
    ...patch,
  };
};

const getPendingInventoryMap = (characterId: number): Map<number, PendingInventoryState> => {
  const existing = pendingInventoryByCharacter.get(characterId);
  if (existing) return existing;
  const created = new Map<number, PendingInventoryState>();
  pendingInventoryByCharacter.set(characterId, created);
  return created;
};

const markCharacterDirty = (characterId: number): void => {
  dirtyCharacterIds.add(characterId);
};

const bumpCharacterRuntimeVersion = (characterId: number): void => {
  characterRuntimeVersions.set(characterId, (characterRuntimeVersions.get(characterId) ?? 0) + 1);
};

const clearCharacterDirtyIfClean = (characterId: number): void => {
  const hasCharacter = pendingCharacters.has(characterId);
  const hasInventory = (pendingInventoryByCharacter.get(characterId)?.size ?? 0) > 0;
  if (hasCharacter || hasInventory) {
    dirtyCharacterIds.add(characterId);
    return;
  }
  dirtyCharacterIds.delete(characterId);
};

const scheduleFlushTimer = (): void => {
  if (flushTimer || dirtyCharacterIds.size <= 0) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushAllPlayerWriteback().catch((error: unknown) => {
      console.error('[playerWritebackCacheService] 定时 flush 失败:', error);
    });
  }, PLAYER_WRITEBACK_FLUSH_INTERVAL_MS);
};

const cancelFlushTimerIfIdle = (): void => {
  if (dirtyCharacterIds.size > 0) return;
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
};

const isInventoryRowLike = (value: unknown): value is { id?: unknown } & Record<string, unknown> => {
  return typeof value === 'object' && value !== null && 'id' in value;
};

const isSameOccupancy = (
  left: InventoryOccupancyRow | null,
  right: InventoryOccupancyRow | null,
): boolean => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return left.location === right.location && left.location_slot === right.location_slot;
};

const toOccupancyRow = (
  row: InventoryWritebackBaseSnapshot | InventoryWritebackNextSnapshot | null,
): InventoryOccupancyRow | null => {
  if (!row) return null;
  if (row.location !== 'bag' && row.location !== 'warehouse') return null;
  if (!Number.isInteger(row.location_slot) || Number(row.location_slot) < 0) return null;
  return {
    location: row.location,
    location_slot: row.location_slot,
  };
};

const flushCharacterSnapshot = async (
  characterId: number,
  snapshot: CharacterWritebackSnapshot,
): Promise<void> => {
  const setClauses: string[] = [];
  const params: unknown[] = [characterId];
  let paramIndex = 2;

  const pushSetClause = (sql: string, value: unknown): void => {
    setClauses.push(sql.replace('$VALUE', `$${paramIndex}`));
    params.push(value);
    paramIndex += 1;
  };

  if (snapshot.nickname !== undefined) pushSetClause('nickname = $VALUE', snapshot.nickname);
  if (snapshot.title !== undefined) pushSetClause('title = $VALUE', snapshot.title);
  if (snapshot.gender !== undefined) pushSetClause('gender = $VALUE', snapshot.gender);
  if (snapshot.avatar !== undefined) pushSetClause('avatar = $VALUE', snapshot.avatar);
  if (snapshot.auto_cast_skills !== undefined) pushSetClause('auto_cast_skills = $VALUE', snapshot.auto_cast_skills);
  if (snapshot.auto_disassemble_enabled !== undefined) {
    pushSetClause('auto_disassemble_enabled = $VALUE', snapshot.auto_disassemble_enabled);
  }
  if (snapshot.auto_disassemble_rules !== undefined) {
    pushSetClause('auto_disassemble_rules = $VALUE::jsonb', JSON.stringify(snapshot.auto_disassemble_rules));
  }
  if (snapshot.dungeon_no_stamina_cost !== undefined) {
    pushSetClause('dungeon_no_stamina_cost = $VALUE', snapshot.dungeon_no_stamina_cost);
  }
  if (snapshot.spirit_stones !== undefined) pushSetClause('spirit_stones = $VALUE', snapshot.spirit_stones);
  if (snapshot.silver !== undefined) pushSetClause('silver = $VALUE', snapshot.silver);
  if (snapshot.realm !== undefined) pushSetClause('realm = $VALUE', snapshot.realm);
  if (snapshot.sub_realm !== undefined) pushSetClause('sub_realm = $VALUE', snapshot.sub_realm);
  if (snapshot.exp !== undefined) pushSetClause('exp = $VALUE', snapshot.exp);
  if (snapshot.attribute_points !== undefined) pushSetClause('attribute_points = $VALUE', snapshot.attribute_points);
  if (snapshot.jing !== undefined) pushSetClause('jing = $VALUE', snapshot.jing);
  if (snapshot.qi !== undefined) pushSetClause('qi = $VALUE', snapshot.qi);
  if (snapshot.shen !== undefined) pushSetClause('shen = $VALUE', snapshot.shen);
  if (snapshot.attribute_type !== undefined) pushSetClause('attribute_type = $VALUE', snapshot.attribute_type);
  if (snapshot.attribute_element !== undefined) pushSetClause('attribute_element = $VALUE', snapshot.attribute_element);
  if (snapshot.current_map_id !== undefined) pushSetClause('current_map_id = $VALUE', snapshot.current_map_id);
  if (snapshot.current_room_id !== undefined) pushSetClause('current_room_id = $VALUE', snapshot.current_room_id);

  if (setClauses.length <= 0) return;
  await query(
    `
      UPDATE characters
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $1
    `,
    params,
  );
};

const flushInventoryState = async (
  itemId: number,
  state: PendingInventoryState,
): Promise<void> => {
  if (state.next === null) {
    await query('DELETE FROM item_instance WHERE id = $1 AND owner_character_id = $2', [itemId, state.base.owner_character_id]);
    return;
  }

  await query(
    `
      UPDATE item_instance
      SET qty = $2,
          location = $3,
          location_slot = $4,
          equipped_slot = $5,
          strengthen_level = $6,
          refine_level = $7,
          affixes = $8::jsonb,
          affix_gen_version = $9,
          updated_at = NOW()
      WHERE id = $1
        AND owner_character_id = $10
    `,
    [
      itemId,
      state.next.qty,
      state.next.location,
      state.next.location_slot,
      state.next.equipped_slot,
      state.next.strengthen_level,
      state.next.refine_level,
      JSON.stringify(state.next.affixes),
      state.next.affix_gen_version,
      state.base.owner_character_id,
    ],
  );
};

export const queueCharacterWritebackSnapshot = (
  characterId: number,
  snapshot: CharacterWritebackSnapshot,
): void => {
  if (!isPositiveInteger(characterId)) return;
  const previous = pendingCharacters.get(characterId) ?? {};
  pendingCharacters.set(characterId, {
    ...cloneCharacterSnapshot(previous),
    ...cloneCharacterSnapshot(snapshot),
  });
  markCharacterDirty(characterId);
  bumpCharacterRuntimeVersion(characterId);
  scheduleFlushTimer();
};

export const getPendingCharacterWritebackSnapshot = (
  characterId: number,
): CharacterWritebackSnapshot | null => {
  if (!isPositiveInteger(characterId)) return null;
  const snapshot = pendingCharacters.get(characterId);
  return snapshot ? cloneCharacterSnapshot(snapshot) : null;
};

export const applyPendingCharacterWriteback = <TRow extends { id?: unknown }>(
  row: TRow,
): TRow => {
  const characterId = Number(row.id);
  if (!isPositiveInteger(characterId)) return row;
  const pending = pendingCharacters.get(characterId);
  if (!pending) return row;
  return {
    ...row,
    ...pending,
  };
};

export const loadCharacterWritebackRowByCharacterId = async (
  characterId: number,
  options?: { forUpdate?: boolean },
): Promise<CharacterWritebackRow | null> => {
  if (!isPositiveInteger(characterId)) return null;
  const lockSql = options?.forUpdate === true ? 'FOR UPDATE' : '';
  const result = await query(
    `
      SELECT
        ${CHARACTER_BASE_COLUMNS_SQL}
      FROM characters
      WHERE id = $1
      LIMIT 1
      ${lockSql}
    `,
    [characterId],
  );
  if (result.rows.length <= 0) return null;
  return applyPendingCharacterWriteback(result.rows[0] as CharacterWritebackRow);
};

export const loadCharacterWritebackRowByUserId = async (
  userId: number,
  options?: { forUpdate?: boolean },
): Promise<CharacterWritebackRow | null> => {
  const uid = Math.floor(Number(userId));
  if (!isPositiveInteger(uid)) return null;
  const lockSql = options?.forUpdate === true ? 'FOR UPDATE' : '';
  const result = await query(
    `
      SELECT
        ${CHARACTER_BASE_COLUMNS_SQL}
      FROM characters
      WHERE user_id = $1
      LIMIT 1
      ${lockSql}
    `,
    [uid],
  );
  if (result.rows.length <= 0) return null;
  return applyPendingCharacterWriteback(result.rows[0] as CharacterWritebackRow);
};

export const queueInventoryItemWritebackSnapshot = (
  characterId: number,
  base: InventoryWritebackBaseSnapshot,
  nextPatch: InventoryWritebackPatch | null,
): void => {
  if (!isPositiveInteger(characterId) || !isPositiveInteger(base.id)) return;
  const itemMap = getPendingInventoryMap(characterId);
  const existing = itemMap.get(base.id);
  const baseSnapshot = existing ? existing.base : cloneInventorySnapshot(base);

  if (nextPatch === null) {
    itemMap.set(base.id, {
      base: baseSnapshot,
      next: null,
    });
  } else {
    const previousNext = existing?.next ?? baseSnapshot;
    itemMap.set(base.id, {
      base: baseSnapshot,
      next: resolveItemNextSnapshot(previousNext, nextPatch),
    });
  }

  markCharacterDirty(characterId);
  bumpCharacterRuntimeVersion(characterId);
  scheduleFlushTimer();
};

export const getPlayerWritebackRuntimeVersion = (characterId: number): number => {
  if (!isPositiveInteger(characterId)) return 0;
  return characterRuntimeVersions.get(characterId) ?? 0;
};

export const getPendingInventoryItemState = (
  characterId: number,
  itemId: number,
): PendingInventoryState | null => {
  if (!isPositiveInteger(characterId) || !isPositiveInteger(itemId)) return null;
  return pendingInventoryByCharacter.get(characterId)?.get(itemId) ?? null;
};

export const applyPendingInventoryItemWritebackRows = <TRow extends { id?: unknown }>(
  characterId: number,
  rows: TRow[],
): TRow[] => {
  if (!isPositiveInteger(characterId) || rows.length <= 0) return rows;
  const itemMap = pendingInventoryByCharacter.get(characterId);
  if (!itemMap || itemMap.size <= 0) return rows;

  const output: TRow[] = [];
  for (const row of rows) {
    if (!isInventoryRowLike(row)) {
      output.push(row);
      continue;
    }

    const itemId = Number(row.id);
    if (!isPositiveInteger(itemId)) {
      output.push(row);
      continue;
    }

    const pending = itemMap.get(itemId);
    if (!pending) {
      output.push(row);
      continue;
    }

    if (pending.next === null) {
      continue;
    }

    output.push({
      ...row,
      ...pending.next,
    });
  }
  return output;
};

export const applyPendingInventoryItemWritebackRow = <TRow extends { id?: unknown }>(
  characterId: number,
  row: TRow | null,
): TRow | null => {
  if (!row) return null;
  const rows = applyPendingInventoryItemWritebackRows(characterId, [row]);
  return rows[0] ?? null;
};

export const applyPendingInventoryUsageToInfo = <TInfo extends {
  bag_used?: unknown;
  warehouse_used?: unknown;
}>(
  characterId: number,
  info: TInfo,
): TInfo => {
  if (!isPositiveInteger(characterId)) return info;
  const itemMap = pendingInventoryByCharacter.get(characterId);
  if (!itemMap || itemMap.size <= 0) return info;

  let bagUsed = Math.max(0, Math.floor(Number(info.bag_used) || 0));
  let warehouseUsed = Math.max(0, Math.floor(Number(info.warehouse_used) || 0));

  for (const state of itemMap.values()) {
    const before = toOccupancyRow(state.base);
    const after = toOccupancyRow(state.next);
    if (isSameOccupancy(before, after)) continue;

    if (before?.location === 'bag') bagUsed = Math.max(0, bagUsed - 1);
    if (before?.location === 'warehouse') warehouseUsed = Math.max(0, warehouseUsed - 1);
    if (after?.location === 'bag') bagUsed += 1;
    if (after?.location === 'warehouse') warehouseUsed += 1;
  }

  return {
    ...info,
    bag_used: bagUsed,
    warehouse_used: warehouseUsed,
  };
};

export const applyPendingInventoryItemTotal = (
  characterId: number,
  location: string,
  total: number,
): number => {
  if (!isPositiveInteger(characterId)) return total;
  const itemMap = pendingInventoryByCharacter.get(characterId);
  if (!itemMap || itemMap.size <= 0) return total;

  let nextTotal = Math.max(0, Math.floor(Number(total) || 0));
  for (const state of itemMap.values()) {
    const beforeMatches = state.base.location === location;
    const afterMatches = state.next?.location === location;
    if (beforeMatches === afterMatches) continue;
    if (beforeMatches) {
      nextTotal = Math.max(0, nextTotal - 1);
      continue;
    }
    nextTotal += 1;
  }
  return nextTotal;
};

export const flushPlayerWritebackByCharacterId = async (
  characterId: number,
): Promise<void> => {
  if (!isPositiveInteger(characterId)) return;

  const existing = flushInFlight.get(characterId);
  if (existing) {
    await existing;
    return;
  }

  const flushPromise = (async () => {
    const characterSnapshot = pendingCharacters.get(characterId);
    const inventoryMap = pendingInventoryByCharacter.get(characterId);
    if (!characterSnapshot && (!inventoryMap || inventoryMap.size <= 0)) {
      clearCharacterDirtyIfClean(characterId);
      cancelFlushTimerIfIdle();
      return;
    }

    const inventoryEntries = inventoryMap
      ? Array.from(inventoryMap.entries()).map(([itemId, state]) => [itemId, state] as const)
      : [];

    await withTransaction(async () => {
      if (characterSnapshot) {
        await flushCharacterSnapshot(characterId, characterSnapshot);
      }
      for (const [itemId, state] of inventoryEntries) {
        await flushInventoryState(itemId, state);
      }
    });

    const latestCharacterSnapshot = pendingCharacters.get(characterId);
    if (latestCharacterSnapshot === characterSnapshot) {
      pendingCharacters.delete(characterId);
    }

    const latestInventoryMap = pendingInventoryByCharacter.get(characterId);
    if (latestInventoryMap) {
      for (const [itemId, state] of inventoryEntries) {
        const current = latestInventoryMap.get(itemId);
        if (current === state) {
          latestInventoryMap.delete(itemId);
        }
      }
      if (latestInventoryMap.size <= 0) {
        pendingInventoryByCharacter.delete(characterId);
      }
    }

    clearCharacterDirtyIfClean(characterId);
    const { invalidateCharacterComputedCache } = await import('./characterComputedService.js');
    await invalidateCharacterComputedCache(characterId);
    if (dirtyCharacterIds.size > 0) {
      scheduleFlushTimer();
    } else {
      cancelFlushTimerIfIdle();
    }
  })();

  flushInFlight.set(characterId, flushPromise);
  try {
    await flushPromise;
  } finally {
    flushInFlight.delete(characterId);
  }
};

export const flushAllPlayerWriteback = async (): Promise<void> => {
  const characterIds = Array.from(dirtyCharacterIds.values());
  for (const characterId of characterIds) {
    await flushPlayerWritebackByCharacterId(characterId);
  }
};

export const startPlayerWritebackFlushLoop = (): void => {
  scheduleFlushTimer();
};

export const stopPlayerWritebackFlushLoop = (): void => {
  if (!flushTimer) return;
  clearTimeout(flushTimer);
  flushTimer = null;
};

export const resetPlayerWritebackStateForTests = (): void => {
  stopPlayerWritebackFlushLoop();
  pendingCharacters.clear();
  pendingInventoryByCharacter.clear();
  dirtyCharacterIds.clear();
  characterRuntimeVersions.clear();
  flushInFlight.clear();
};
