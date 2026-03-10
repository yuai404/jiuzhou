/**
 * 功法学习规则共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护“学习功法时是否校验学习境界”的判定规则，供背包用书与直接学习接口复用。
 * 2. 不做什么：不负责查询角色数据、不执行学习落库，也不处理功法升级层数的境界门槛。
 *
 * 输入/输出：
 * - 输入：学习来源信息（效果类型、来源标记、物品定义 ID）。
 * - 输出：`true` 表示需要校验学习境界；`false` 表示跳过学习境界校验。
 *
 * 数据流/状态流：
 * 学习入口传入来源信息 -> 本模块识别是否属于洞府研修功法学习 -> itemService / characterTechniqueService 决定是否拦截学习。
 *
 * 关键边界条件与坑点：
 * 1. 这里只放“学习入口”的规则，不能把功法升级层级的 `required_realm` 混进来，否则会误伤已学后的正常成长节奏。
 * 2. 洞府研修功法的识别必须只看当前学习入口的来源语义，避免服务层再去猜测数据库状态，导致背包学习与直学接口规则不一致。
 */
const GENERATED_TECHNIQUE_BOOK_ITEM_DEF_ID = 'book-generated-technique';
const GENERATED_TECHNIQUE_OBTAINED_FROM_PREFIX = 'technique_generate:';

export type TechniqueLearnSource = {
  effectType?: 'learn_technique' | 'learn_generated_technique';
  obtainedFrom?: string;
  itemDefId?: string;
};

export const shouldValidateTechniqueLearnRealm = (source: TechniqueLearnSource): boolean => {
  if (source.effectType === 'learn_generated_technique') return false;
  if (source.itemDefId === GENERATED_TECHNIQUE_BOOK_ITEM_DEF_ID) return false;
  const obtainedFrom = source.obtainedFrom ?? '';
  return !obtainedFrom.startsWith(GENERATED_TECHNIQUE_OBTAINED_FROM_PREFIX);
};
