/**
 * 角色属性注册表
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中维护角色二级属性的 key、中文名、百分比展示规则、功法被动模式与装备成长分类，作为服务端共享单一入口。
 * 2) 做什么：为角色计算、功法约束、装备成长、信息展示等模块提供统一集合，避免各处重复维护字符串名单。
 * 3) 不做什么：不负责具体数值计算、不读写数据库，也不直接执行战斗结算。
 *
 * 输入/输出：
 * - 输入：无，模块内部声明静态属性定义。
 * - 输出：属性注册表、中文名映射、百分比属性集合、功法被动规则、标题效果白名单等派生常量。
 *
 * 数据流/状态流：
 * 属性定义 -> 派生集合/映射 -> characterComputedService / techniqueGenerationConstraints / equipmentGrowthRules / infoTargetService 等复用。
 *
 * 关键边界条件与坑点：
 * 1) `wugong/fagong/wufang/fafang/max_qixue` 在常规面板里是数值属性，但在功法被动里是乘区百分比，必须显式区分两个口径。
 * 2) `jianfantan` 只用于“反弹伤害减免”，不能误并入普通增伤/减伤语义，否则战斗公式会漂移。
 */

export type CharacterAttrValueKind = 'flat' | 'ratio';
export type CharacterTechniquePassiveMode = 'flat' | 'percent' | 'multiply';
export type CharacterEquipmentAttrBucket = 'attack' | 'defense' | 'survival' | null;

type CharacterAttrRegistryEntry = {
  key: string;
  label: string;
  meaningLabel?: string;
  valueKind: CharacterAttrValueKind;
  techniquePassiveMode?: CharacterTechniquePassiveMode;
  allowTitleEffect?: boolean;
  equipmentBucket?: CharacterEquipmentAttrBucket;
};

const CHARACTER_ATTR_REGISTRY = [
  {
    key: 'qixue',
    label: '气血',
    meaningLabel: '当前气血',
    valueKind: 'flat',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'max_qixue',
    label: '气血上限',
    meaningLabel: '最大气血',
    valueKind: 'flat',
    techniquePassiveMode: 'multiply',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'lingqi',
    label: '灵气',
    meaningLabel: '当前灵气',
    valueKind: 'flat',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'max_lingqi',
    label: '灵气上限',
    meaningLabel: '最大灵气',
    valueKind: 'flat',
    techniquePassiveMode: 'flat',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'wugong',
    label: '物攻',
    meaningLabel: '物理攻击',
    valueKind: 'flat',
    techniquePassiveMode: 'multiply',
    allowTitleEffect: true,
    equipmentBucket: 'attack',
  },
  {
    key: 'fagong',
    label: '法攻',
    meaningLabel: '法术攻击',
    valueKind: 'flat',
    techniquePassiveMode: 'multiply',
    allowTitleEffect: true,
    equipmentBucket: 'attack',
  },
  {
    key: 'wufang',
    label: '物防',
    meaningLabel: '物理防御',
    valueKind: 'flat',
    techniquePassiveMode: 'multiply',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'fafang',
    label: '法防',
    meaningLabel: '法术防御',
    valueKind: 'flat',
    techniquePassiveMode: 'multiply',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'sudu',
    label: '速度',
    valueKind: 'flat',
    techniquePassiveMode: 'flat',
    allowTitleEffect: true,
    equipmentBucket: null,
  },
  {
    key: 'fuyuan',
    label: '福源',
    valueKind: 'flat',
    allowTitleEffect: true,
    equipmentBucket: null,
  },
  {
    key: 'mingzhong',
    label: '命中',
    meaningLabel: '命中率',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'attack',
  },
  {
    key: 'shanbi',
    label: '闪避',
    meaningLabel: '闪避率',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'zhaojia',
    label: '招架',
    meaningLabel: '招架率',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'baoji',
    label: '暴击',
    meaningLabel: '暴击率',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'attack',
  },
  {
    key: 'baoshang',
    label: '暴伤',
    meaningLabel: '暴击伤害倍率',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'attack',
  },
  {
    key: 'jianbaoshang',
    label: '暴伤减免',
    meaningLabel: '暴击伤害减免',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'jianfantan',
    label: '反伤减免',
    meaningLabel: '反弹伤害减免',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'kangbao',
    label: '抗暴',
    meaningLabel: '抗暴率',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'zengshang',
    label: '增伤',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'attack',
  },
  {
    key: 'zhiliao',
    label: '治疗',
    meaningLabel: '治疗加成',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'jianliao',
    label: '减疗',
    meaningLabel: '受疗减免',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'xixue',
    label: '吸血',
    meaningLabel: '吸血比例',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'lengque',
    label: '冷却',
    meaningLabel: '冷却缩减',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: null,
  },
  {
    key: 'kongzhi_kangxing',
    label: '控制抗性',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'jin_kangxing',
    label: '金抗性',
    meaningLabel: '金系抗性',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'mu_kangxing',
    label: '木抗性',
    meaningLabel: '木系抗性',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'shui_kangxing',
    label: '水抗性',
    meaningLabel: '水系抗性',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'huo_kangxing',
    label: '火抗性',
    meaningLabel: '火系抗性',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'tu_kangxing',
    label: '土抗性',
    meaningLabel: '土系抗性',
    valueKind: 'ratio',
    techniquePassiveMode: 'percent',
    allowTitleEffect: true,
    equipmentBucket: 'defense',
  },
  {
    key: 'qixue_huifu',
    label: '气血恢复',
    meaningLabel: '每回合气血恢复',
    valueKind: 'flat',
    techniquePassiveMode: 'flat',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
  {
    key: 'lingqi_huifu',
    label: '灵气恢复',
    meaningLabel: '每回合灵气恢复',
    valueKind: 'flat',
    techniquePassiveMode: 'flat',
    allowTitleEffect: true,
    equipmentBucket: 'survival',
  },
] as const satisfies ReadonlyArray<CharacterAttrRegistryEntry>;

export type RegisteredCharacterAttrKey = (typeof CHARACTER_ATTR_REGISTRY)[number]['key'];

export const CHARACTER_ATTR_DEFINITION_LIST = CHARACTER_ATTR_REGISTRY;
const characterAttrRegistryEntries: ReadonlyArray<CharacterAttrRegistryEntry> = CHARACTER_ATTR_REGISTRY;

export const CHARACTER_ATTR_LABEL_MAP = Object.freeze(
  Object.fromEntries(characterAttrRegistryEntries.map((entry) => [entry.key, entry.label])),
) as Readonly<Record<RegisteredCharacterAttrKey, string>>;

export const CHARACTER_RATIO_ATTR_KEYS = Object.freeze(
  characterAttrRegistryEntries
    .filter((entry) => entry.valueKind === 'ratio')
    .map((entry) => entry.key),
) as readonly RegisteredCharacterAttrKey[];

export const CHARACTER_RATIO_ATTR_KEY_SET = new Set<string>(CHARACTER_RATIO_ATTR_KEYS);

export const TITLE_EFFECT_KEYS = Object.freeze(
  characterAttrRegistryEntries
    .filter((entry) => entry.allowTitleEffect)
    .map((entry) => entry.key),
) as readonly RegisteredCharacterAttrKey[];

export const TITLE_EFFECT_KEY_SET = new Set<string>(TITLE_EFFECT_KEYS);

const TECHNIQUE_PASSIVE_SUFFIX_BY_MODE: Record<CharacterTechniquePassiveMode, string> = {
  flat: '（固定值加成）',
  percent: '（加算百分比）',
  multiply: '（百分比加成）',
};

const techniquePassiveEntries = characterAttrRegistryEntries.filter(
  (entry): entry is CharacterAttrRegistryEntry & { techniquePassiveMode: CharacterTechniquePassiveMode } =>
    entry.techniquePassiveMode !== undefined,
);

export const TECHNIQUE_PASSIVE_KEY_MEANING_MAP = Object.freeze(
  Object.fromEntries(
    techniquePassiveEntries.map((entry) => {
      const meaningLabel = entry.meaningLabel ?? entry.label;
      return [entry.key, `${meaningLabel}${TECHNIQUE_PASSIVE_SUFFIX_BY_MODE[entry.techniquePassiveMode]}`];
    }),
  ),
) as Readonly<Record<string, string>>;

export const TECHNIQUE_PASSIVE_MODE_BY_KEY = Object.freeze(
  Object.fromEntries(
    techniquePassiveEntries.map((entry) => [entry.key, entry.techniquePassiveMode]),
  ),
) as Readonly<Record<string, CharacterTechniquePassiveMode>>;

export const TECHNIQUE_PASSIVE_KEYS = Object.freeze(
  techniquePassiveEntries.map((entry) => entry.key),
) as readonly RegisteredCharacterAttrKey[];

export const TECHNIQUE_PASSIVE_KEY_SET = new Set<string>(TECHNIQUE_PASSIVE_KEYS);

export const TECHNIQUE_PASSIVE_PERCENT_ADDITIVE_KEYS = Object.freeze(
  techniquePassiveEntries
    .filter((entry) => entry.techniquePassiveMode === 'percent')
    .map((entry) => entry.key),
) as readonly RegisteredCharacterAttrKey[];

export const TECHNIQUE_PASSIVE_PERCENT_ADDITIVE_KEY_SET = new Set<string>(
  TECHNIQUE_PASSIVE_PERCENT_ADDITIVE_KEYS,
);

export const TECHNIQUE_PASSIVE_PERCENT_MULTIPLY_KEYS = Object.freeze(
  techniquePassiveEntries
    .filter((entry) => entry.techniquePassiveMode === 'multiply')
    .map((entry) => entry.key),
) as readonly RegisteredCharacterAttrKey[];

export const TECHNIQUE_PASSIVE_PERCENT_MULTIPLY_KEY_SET = new Set<string>(
  TECHNIQUE_PASSIVE_PERCENT_MULTIPLY_KEYS,
);

const buildEquipmentBucketKeySet = (
  bucket: CharacterEquipmentAttrBucket,
): ReadonlySet<string> => {
  return new Set<string>(
    CHARACTER_ATTR_REGISTRY
      .map((entry) => entry)
      .filter((entry) => entry.equipmentBucket === bucket)
      .map((entry) => entry.key),
  );
};

export const ATTACK_ATTR_KEY_SET = buildEquipmentBucketKeySet('attack');
export const DEFENSE_ATTR_KEY_SET = buildEquipmentBucketKeySet('defense');
export const SURVIVAL_ATTR_KEY_SET = buildEquipmentBucketKeySet('survival');
