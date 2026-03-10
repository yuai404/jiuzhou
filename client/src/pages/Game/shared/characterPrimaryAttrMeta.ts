/**
 * 角色三维属性展示元数据
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：集中维护前端“精 / 气 / 神”的标签、悬浮说明与派生效果文案，避免角色面板、道具说明等位置各写一份。
 * - 不做什么：不负责角色数值计算，不从后端动态推导公式，也不处理 Tooltip 的具体 UI 渲染。
 *
 * 输入/输出：
 * - 输入：无运行时输入，模块以常量形式导出三维属性元数据。
 * - 输出：`CHARACTER_PRIMARY_ATTR_META_LIST`、`CHARACTER_PRIMARY_ATTR_META_MAP` 与 `CharacterPrimaryAttrKey`，供界面按 key 复用。
 *
 * 数据流/状态流：
 * - 后端 `characterPrimaryAttrs` 统一定义三维派生规则。
 * - 前端展示层只消费本模块的静态元数据，按 `jing/qi/shen` key 映射到 Tooltip 与标签，避免组件内散落重复文案。
 *
 * 关键边界条件与坑点：
 * 1) 这里的文案必须和后端 `applyCharacterPrimaryAttrsToStats` 保持同一口径，若公式变更，需要优先同步本模块。
 * 2) 该模块只描述当前已生效的基础派生，不提前写未来可能存在的扩展效果，避免提示与真实数值不一致。
 */

export const CHARACTER_PRIMARY_ATTR_KEY_LIST = ['jing', 'qi', 'shen'] as const;

export type CharacterPrimaryAttrKey = typeof CHARACTER_PRIMARY_ATTR_KEY_LIST[number];

export interface CharacterPrimaryAttrMeta {
  key: CharacterPrimaryAttrKey;
  label: '精' | '气' | '神';
  summary: string;
  effects: readonly [string, string, string] | readonly [string, string];
}

export const CHARACTER_PRIMARY_ATTR_META_LIST: readonly CharacterPrimaryAttrMeta[] = [
  {
    key: 'jing',
    label: '精',
    summary: '偏向体魄与生存的基础属性。',
    effects: ['每点 +5 气血上限', '每点 +2 物防', '每点 +2 法防'],
  },
  {
    key: 'qi',
    label: '气',
    summary: '偏向灵力与攻势的基础属性。',
    effects: ['每点 +5 灵气上限', '每点 +2 物攻', '每点 +2 法攻'],
  },
  {
    key: 'shen',
    label: '神',
    summary: '偏向感知与爆发的基础属性。',
    effects: ['每点 +0.2% 命中', '每点 +0.1% 暴击'],
  },
] as const;

export const CHARACTER_PRIMARY_ATTR_META_MAP: Readonly<Record<CharacterPrimaryAttrKey, CharacterPrimaryAttrMeta>> = {
  jing: CHARACTER_PRIMARY_ATTR_META_LIST[0],
  qi: CHARACTER_PRIMARY_ATTR_META_LIST[1],
  shen: CHARACTER_PRIMARY_ATTR_META_LIST[2],
};
