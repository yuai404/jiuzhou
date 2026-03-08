import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import MarketItemTooltipContent from '../MarketItemTooltipContent';

vi.mock('../useTechniqueSkillDetails', () => ({
  useTechniqueSkillDetails: () => ({
    skills: [
      {
        id: 'skill-taixu-jianqi',
        name: '太虚剑气',
        icon: '',
        effects: [],
      },
    ],
    loading: false,
    error: null,
  }),
}));

vi.mock('../TechniqueSkillSection', () => ({
  TechniqueSkillSection: ({
    skills,
    variant,
  }: {
    skills: Array<{ name: string }>;
    variant: string;
  }) => (
    <div data-testid="technique-skill-section">
      {variant}:{skills.map((skill) => skill.name).join(',')}
    </div>
  ),
}));

const createTechniqueBookTooltipItem = () => ({
  name: '《太虚剑诀》',
  icon: '/assets/items/book.png',
  qty: 1,
  quality: '地',
  category: 'consumable',
  categoryLabel: '消耗品/功法书',
  description: '记载太虚剑诀的功法书。',
  longDesc: null,
  effectDefs: [],
  baseAttrs: {},
  equipSlot: null,
  equipReqRealm: null,
  useType: 'use',
  strengthenLevel: 0,
  refineLevel: 0,
  identified: true,
  affixes: [],
  socketedGems: null,
  learnableTechniqueId: 'generated-technique-taixu-jianjue',
});

describe('MarketItemTooltipContent', () => {
  it('功法书 tooltip 应展示可学习技能信息', () => {
    const html = renderToStaticMarkup(
      <MarketItemTooltipContent item={createTechniqueBookTooltipItem()} />,
    );

    expect(html).toContain('technique-skill-section');
    expect(html).toContain('tooltip:太虚剑气');
  });
});
