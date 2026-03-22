import { describe, expect, it } from 'vitest';

import {
  filterAvailableAffixPoolAffixes,
  formatAffixPoolPreviewTierRange,
} from '../affixPoolPreview';

describe('affixPoolPreview', () => {
  it('应过滤掉当前境界没有可用阶级的词条', () => {
    expect(filterAvailableAffixPoolAffixes([
      {
        key: 'hp_flat',
        name: '气血上限+',
        group: 'survival',
        is_legendary: false,
        apply_type: 'flat',
        tiers: [{ tier: 1, min: 28.7430013, max: 47.5150013 }],
        owned: false,
      },
      {
        key: 'hp_pct',
        name: '气血上限%',
        group: 'survival',
        is_legendary: false,
        apply_type: 'percent',
        tiers: [],
        owned: false,
      },
    ])).toEqual([
      {
        key: 'hp_flat',
        name: '气血上限+',
        group: 'survival',
        is_legendary: false,
        apply_type: 'flat',
        tiers: [{ tier: 1, min: 28.7430013, max: 47.5150013 }],
        owned: false,
      },
    ]);
  });

  it('应把阶级区间统一格式化为两位小数', () => {
    expect(formatAffixPoolPreviewTierRange(
      { tier: 1, min: 4.0722513, max: 6.2270013 },
      'flat',
    )).toBe('4.07 ~ 6.23');

    expect(formatAffixPoolPreviewTierRange(
      { tier: 1, min: 0.1, max: 0.235 },
      'percent',
    )).toBe('10.00% ~ 23.50%');
  });
});
