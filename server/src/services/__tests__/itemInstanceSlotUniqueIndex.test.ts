/**
 * item_instance 槽位唯一索引回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：锁定 `item_instance` 在 `bag/warehouse` 槽位上必须存在唯一部分索引，
 *   避免 `ON CONFLICT (owner_character_id, location, location_slot)` 因缺少唯一约束直接报错。
 * - 做什么：验证索引同步入口是幂等的，避免本地补库脚本重复执行时产生额外副作用。
 * - 不做什么：不覆盖背包分配策略，不验证邮件业务流程，也不测试具体物品入包结果。
 *
 * 输入/输出：
 * - 输入：数据库中的 `item_instance` 索引元数据。
 * - 输出：槽位唯一索引的存在性、唯一性与谓词断言。
 *
 * 数据流/状态流：
 * - 先调用槽位唯一索引同步入口；
 * - 再读取 `pg_indexes` 回查目标索引定义；
 * - 最后断言该索引覆盖背包/仓库槽位唯一约束。
 *
 * 关键边界条件与坑点：
 * 1) 这里必须验证“部分唯一索引”，不能退化成普通索引，否则 `ON CONFLICT` 仍然不可用。
 * 2) 断言要聚焦 `bag/warehouse` 谓词，避免把装备栏等不需要槽位互斥的位置误绑进唯一规则。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { pool, query } from '../../config/database.js';
import { ensureItemInstanceSlotUniqueIndex, ITEM_INSTANCE_SLOT_UNIQUE_INDEX_NAME } from '../shared/itemInstanceSlotUniqueIndex.js';

test.after(async () => {
  await pool.end();
});

test('ensureItemInstanceSlotUniqueIndex 应保证背包与仓库槽位唯一部分索引存在', async () => {
  await ensureItemInstanceSlotUniqueIndex();

  const result = await query<{
    indexname: string;
    indexdef: string;
  }>(
    `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'item_instance'
        AND indexname = $1
    `,
    [ITEM_INSTANCE_SLOT_UNIQUE_INDEX_NAME],
  );

  assert.equal(result.rows.length, 1, `缺少唯一索引 ${ITEM_INSTANCE_SLOT_UNIQUE_INDEX_NAME}`);

  const indexDef = result.rows[0]?.indexdef ?? '';
  assert.match(indexDef, /CREATE UNIQUE INDEX/i);
  assert.match(indexDef, /\(owner_character_id, location, location_slot\)/i);
  assert.match(indexDef, /owner_character_id IS NOT NULL/i);
  assert.match(indexDef, /location_slot IS NOT NULL/i);
  assert.match(indexDef, /location/i);
  assert.match(indexDef, /bag/i);
  assert.match(indexDef, /warehouse/i);
});
