import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveItemUseResourceDelta, rollItemUseAmount } from '../shared/itemUseValueRules.js';

test('rollItemUseAmount: 固定值效果应按使用次数累加', () => {
  const amount = rollItemUseAmount({ qty: 3, value: 12 });

  assert.equal(amount, 36);
});

test('rollItemUseAmount: 随机区间应按每次使用独立累计', () => {
  const rolls = [10, 15, 20];
  let index = 0;
  const amount = rollItemUseAmount(
    { qty: 3, min: 10, max: 20 },
    () => {
      const next = rolls[index];
      index += 1;
      return next;
    },
  );

  assert.equal(amount, 45);
});

test('resolveItemUseResourceDelta: resource=stamina 应映射到体力恢复', () => {
  const delta = resolveItemUseResourceDelta(
    {
      trigger: 'use',
      target: 'self',
      effect_type: 'resource',
      params: {
        resource: 'stamina',
        min: 10,
        max: 20,
      },
    },
    1,
    () => 18,
  );

  assert.deepEqual(delta, {
    qixue: 0,
    lingqi: 0,
    stamina: 18,
    exp: 0,
  });
});

test('resolveItemUseResourceDelta: heal 效果默认映射为气血恢复', () => {
  const delta = resolveItemUseResourceDelta(
    {
      trigger: 'use',
      target: 'self',
      effect_type: 'heal',
      value: 50,
    },
    2,
  );

  assert.deepEqual(delta, {
    qixue: 100,
    lingqi: 0,
    stamina: 0,
    exp: 0,
  });
});
