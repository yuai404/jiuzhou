/**
 * item_instance 槽位唯一索引同步工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：集中维护 `item_instance(owner_character_id, location, location_slot)` 在背包/仓库场景下的唯一部分索引定义。
 * - 做什么：提供幂等的索引同步入口，给 `db:sync` 与回归测试复用，避免库结构约束散落在脚本和业务 SQL 中。
 * - 不做什么：不分配槽位，不处理物品堆叠规则，不承担背包业务校验。
 *
 * 输入/输出：
 * - 输入：无；内部直接读取/写入 PostgreSQL 索引元数据。
 * - 输出：`Promise<void>`；保证目标唯一索引存在。
 *
 * 数据流/状态流：
 * - 业务 SQL 与测试从本模块复用同一份冲突目标与谓词；
 * - `ensureItemInstanceSlotUniqueIndex` 先查询 `pg_indexes`；
 * - 若索引缺失，则补建唯一部分索引；若已存在则直接复用。
 *
 * 关键边界条件与坑点：
 * 1) Prisma 当前不能直接表达这类部分唯一索引，所以运行时与 `db:sync` 都必须显式复用本模块，避免 schema 与数据库脱节。
 * 2) 索引谓词必须与 `ON CONFLICT` 的 conflict target 保持一致，否则 PostgreSQL 不会把它识别为可仲裁唯一索引。
 */
import { query } from '../../config/database.js';

export const ITEM_INSTANCE_SLOT_UNIQUE_INDEX_NAME = 'uq_item_instance_slot_occupied';
export const ITEM_INSTANCE_SLOT_INDEX_COLUMNS_SQL = '(owner_character_id, location, location_slot)';
export const ITEM_INSTANCE_SLOT_INDEX_PREDICATE_SQL = `
owner_character_id IS NOT NULL
AND location_slot IS NOT NULL
AND location IN ('bag', 'warehouse')
`;

export const ITEM_INSTANCE_SLOT_CONFLICT_CLAUSE = `
ON CONFLICT ${ITEM_INSTANCE_SLOT_INDEX_COLUMNS_SQL}
  WHERE ${ITEM_INSTANCE_SLOT_INDEX_PREDICATE_SQL}
DO NOTHING
`;

const buildCreateUniqueIndexSql = (): string => {
  return `
    CREATE UNIQUE INDEX IF NOT EXISTS ${ITEM_INSTANCE_SLOT_UNIQUE_INDEX_NAME}
    ON item_instance ${ITEM_INSTANCE_SLOT_INDEX_COLUMNS_SQL}
    WHERE ${ITEM_INSTANCE_SLOT_INDEX_PREDICATE_SQL}
  `;
};

export const ensureItemInstanceSlotUniqueIndex = async (): Promise<void> => {
  await query(buildCreateUniqueIndexSql());
};
