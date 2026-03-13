import { describe, expect, it } from 'vitest';
import {
  buildBagItem,
  formatBagItemEffectLine,
  isDisassemblableBagItem,
} from '../bagShared';

describe('bagEffects', () => {
  it('formatBagItemEffectLine: 生成功法书效果应映射为中文', () => {
    expect(
      formatBagItemEffectLine({
        trigger: 'use',
        target: 'self',
        effect_type: 'learn_generated_technique',
      }),
    ).toBe('学习功法');
  });

  it('formatBagItemEffectLine: 增益效果应复用中文属性文案', () => {
    expect(
      formatBagItemEffectLine({
        trigger: 'use',
        target: 'self',
        effect_type: 'buff',
        duration_round: 3,
        params: {
          attr_key: 'wugong',
          value: 10,
          apply_type: 'flat',
        },
      }),
    ).toBe('物攻 +10，持续 3 回合');
  });

  it('formatBagItemEffectLine: 随机宝石奖励应输出中文范围描述', () => {
    expect(
      formatBagItemEffectLine({
        trigger: 'use',
        target: 'self',
        effect_type: 'loot',
        params: {
          loot_type: 'random_gem',
          min_level: 1,
          max_level: 4,
          gems_per_use: 1,
        },
      }),
    ).toBe('随机获得1~4级宝石');
  });

  it('buildBagItem: 效果列表应走共享中文映射', () => {
    const bagItem = buildBagItem({
      id: 1,
      item_def_id: 'book-generated-technique',
      qty: 1,
      location: 'bag',
      location_slot: 1,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      identified: false,
      locked: false,
      bind_type: 'none',
      created_at: '2026-03-08T00:00:00.000Z',
      def: {
        id: 'book-generated-technique',
        name: '《无名功法秘卷》',
        icon: '/assets/items/icon_bygj.png',
        quality: '玄',
        category: 'consumable',
        sub_category: 'technique_book',
        can_disassemble: true,
        stack_max: 1,
        description: 'AI研修生成的功法秘卷，使用后学习对应功法',
        long_desc: '通过洞府研修推演而成的秘卷。',
        tags: ['秘籍', '功法', '研修生成'],
        effect_defs: [
          {
            trigger: 'use',
            target: 'self',
            effect_type: 'learn_generated_technique',
          },
        ],
        base_attrs: {},
        equip_slot: null,
        use_type: 'instant',
      },
    });

    expect(bagItem?.effects).toEqual(['学习功法']);
  });

  it('buildBagItem: 普通功法书应解析出可学习功法 ID', () => {
    const bagItem = buildBagItem({
      id: 2,
      item_def_id: 'book-technique-normal',
      qty: 1,
      location: 'bag',
      location_slot: 2,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      identified: false,
      locked: false,
      bind_type: 'none',
      created_at: '2026-03-08T00:00:00.000Z',
      def: {
        id: 'book-technique-normal',
        name: '《养气诀》',
        icon: '/assets/items/icon_yqj.png',
        quality: '黄',
        category: 'consumable',
        sub_category: 'technique_book',
        can_disassemble: true,
        stack_max: 1,
        description: '使用后学习养气诀',
        long_desc: '记载基础吐纳法门。',
        tags: ['秘籍', '功法'],
        effect_defs: [
          {
            trigger: 'use',
            target: 'self',
            effect_type: 'learn_technique',
            params: {
              technique_id: 'tech-yangqi-jue',
            },
          },
        ],
        base_attrs: {},
        equip_slot: null,
        use_type: 'instant',
      },
    });

    expect(bagItem?.learnableTechniqueId).toBe('tech-yangqi-jue');
  });

  it('buildBagItem: 研修功法书应优先解析注入的生成功法 ID', () => {
    const bagItem = buildBagItem({
      id: 3,
      item_def_id: 'book-generated-technique',
      qty: 1,
      location: 'bag',
      location_slot: 3,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      identified: false,
      locked: false,
      bind_type: 'none',
      created_at: '2026-03-08T00:00:00.000Z',
      def: {
        id: 'book-generated-technique',
        name: '《太虚剑诀》秘卷',
        icon: '/assets/items/icon_bygj.png',
        quality: '玄',
        category: 'consumable',
        sub_category: 'technique_book',
        can_disassemble: true,
        stack_max: 1,
        description: 'AI研修生成的功法秘卷，使用后学习对应功法',
        long_desc: '通过洞府研修推演而成的秘卷。',
        tags: ['秘籍', '功法', '研修生成'],
        effect_defs: [
          {
            trigger: 'use',
            target: 'self',
            effect_type: 'learn_generated_technique',
          },
        ],
        base_attrs: {},
        equip_slot: null,
        use_type: 'instant',
        generated_technique_id: 'generated-technique-taixu-jianjue',
        generated_technique_name: '太虚剑诀',
      },
    });

    expect(bagItem?.learnableTechniqueId).toBe('generated-technique-taixu-jianjue');
  });

  it('buildBagItem: 后端未显式禁用时应默认保留分解动作', () => {
    const bagItem = buildBagItem({
      id: 4,
      item_def_id: 'mat-default-disassemble',
      qty: 2,
      location: 'bag',
      location_slot: 4,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      identified: false,
      locked: false,
      bind_type: 'none',
      created_at: '2026-03-08T00:00:00.000Z',
      def: {
        id: 'mat-default-disassemble',
        name: '灵木碎片',
        icon: '/assets/items/icon_lingmu.png',
        quality: '黄',
        category: 'material',
        sub_category: 'wood',
        can_disassemble: true,
        stack_max: 999,
        description: '基础炼器材料',
        long_desc: '基础炼器材料。',
        tags: ['材料'],
        effect_defs: [],
        base_attrs: {},
        equip_slot: null,
        use_type: null,
      },
    });

    expect(bagItem?.canDisassemble).toBe(true);
    expect(bagItem?.actions.includes('disassemble')).toBe(true);
    expect(bagItem && isDisassemblableBagItem(bagItem)).toBe(true);
  });

  it('buildBagItem: 显式禁用分解时应移除分解动作并标记不可分解', () => {
    const bagItem = buildBagItem({
      id: 5,
      item_def_id: 'quest-no-disassemble',
      qty: 1,
      location: 'bag',
      location_slot: 5,
      equipped_slot: null,
      strengthen_level: 0,
      refine_level: 0,
      affixes: [],
      identified: false,
      locked: false,
      bind_type: 'none',
      created_at: '2026-03-08T00:00:00.000Z',
      def: {
        id: 'quest-no-disassemble',
        name: '宗门密令',
        icon: '/assets/items/icon_miling.png',
        quality: '玄',
        category: 'quest',
        sub_category: 'token',
        can_disassemble: false,
        stack_max: 1,
        description: '不可分解的任务道具',
        long_desc: '宗门密令，不可擅自分解。',
        tags: ['任务'],
        effect_defs: [],
        base_attrs: {},
        equip_slot: null,
        use_type: null,
      },
    });

    expect(bagItem?.canDisassemble).toBe(false);
    expect(bagItem?.actions.includes('disassemble')).toBe(false);
    expect(bagItem && isDisassemblableBagItem(bagItem)).toBe(false);
  });
});
