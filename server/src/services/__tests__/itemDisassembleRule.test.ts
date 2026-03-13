import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSeed, asArray, asObject, asText } from './seedTestUtils.js';
import { resolveItemCanDisassemble } from '../shared/itemDisassembleRule.js';

test('resolveItemCanDisassemble: 未配置 disassemblable 时应默认允许分解', () => {
  assert.equal(resolveItemCanDisassemble({}), true);
  assert.equal(resolveItemCanDisassemble(undefined), true);
  assert.equal(resolveItemCanDisassemble(null), true);
});

test('resolveItemCanDisassemble: 仅显式 false 时应禁止分解', () => {
  assert.equal(resolveItemCanDisassemble({ disassemblable: false }), false);
  assert.equal(resolveItemCanDisassemble({ disassemblable: true }), true);
});

test('item_def 种子: 旧物品未配置 disassemblable 时应沿用默认可分解口径', () => {
  const itemSeed = loadSeed('item_def.json');
  const itemList = asArray(itemSeed.items);
  const targetItem = itemList.find((value) => asText(asObject(value)?.id) === 'cons-001');

  assert.ok(targetItem, '缺少测试物品 cons-001');
  assert.equal(
    resolveItemCanDisassemble(asObject(targetItem) as { disassemblable?: boolean } | null),
    true,
  );
});
