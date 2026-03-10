/**
 * AI 伙伴招募共享规则
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中定义招募成本、冷却、预览保留时长、品质权重、属性约束与草稿校验规则。
 * 2) 做什么：统一把模型输出约束在稳定范围内，避免 service、worker、前端各自散落一份业务规则。
 * 3) 不做什么：不访问数据库、不执行扣费、不负责图片生成或任务调度。
 *
 * 输入/输出：
 * - 输入：模型返回草稿、最近一次冷却起点、当前时间。
 * - 输出：合法化后的伙伴草稿、冷却状态、格式化剩余时间等。
 *
 * 数据流/状态流：
 * 文本模型 -> validatePartnerRecruitDraft -> partnerRecruitService 落库/预览；
 * 历史任务时间 -> buildPartnerRecruitCooldownState -> 状态接口 / 创建任务拦截 / 前端倒计时。
 *
 * 关键边界条件与坑点：
 * 1) 草稿校验不允许偷偷兜底成“低质量占位伙伴”，任一关键字段非法都应直接失败退款。
 * 2) 冷却判断与状态接口必须共用同一套纯函数，否则前端倒计时与服务端拦截会在临界秒不一致。
 */

export type PartnerRecruitQuality = '黄' | '玄' | '地' | '天';
export type PartnerRecruitElement = 'jin' | 'mu' | 'shui' | 'huo' | 'tu' | 'none';
export type PartnerRecruitRole = '护卫' | '剑修' | '术师' | '药师' | '奇辅';
export type PartnerRecruitTechniqueKind = 'attack' | 'support' | 'guard';
export type PartnerRecruitPassiveKey =
  | 'max_qixue'
  | 'wugong'
  | 'fagong'
  | 'wufang'
  | 'fafang'
  | 'sudu'
  | 'zengshang'
  | 'zhiliao';

export type PartnerRecruitBaseAttrs = {
  max_qixue: number;
  wugong: number;
  fagong: number;
  wufang: number;
  fafang: number;
  sudu: number;
};

export type PartnerRecruitDraft = {
  partner: {
    name: string;
    description: string;
    quality: PartnerRecruitQuality;
    attributeElement: PartnerRecruitElement;
    role: PartnerRecruitRole;
    maxTechniqueSlots: number;
    baseAttrs: PartnerRecruitBaseAttrs;
    levelAttrGains: PartnerRecruitBaseAttrs;
  };
  innateTechniques: Array<{
    name: string;
    description: string;
    kind: PartnerRecruitTechniqueKind;
    passiveKey: PartnerRecruitPassiveKey;
    passiveValue: number;
  }>;
};

type AttrRange = {
  min: number;
  max: number;
};

type DraftStatRanges = {
  baseAttrs: Record<keyof PartnerRecruitBaseAttrs, AttrRange>;
  levelAttrGains: Record<keyof PartnerRecruitBaseAttrs, AttrRange>;
  techniqueSlots: AttrRange;
  innateTechniqueCount: AttrRange;
};

const SECOND_MS = 1_000;
const MINUTE_SECONDS = 60;
const HOUR_SECONDS = 60 * MINUTE_SECONDS;
const DAY_SECONDS = 24 * HOUR_SECONDS;

export const PARTNER_RECRUIT_SPIRIT_STONES_COST = 50_000;
export const PARTNER_RECRUIT_COOLDOWN_HOURS = 12;
export const PARTNER_RECRUIT_PREVIEW_EXPIRE_HOURS = 24;
export const PARTNER_RECRUIT_ALLOWED_ELEMENTS: readonly PartnerRecruitElement[] = ['jin', 'mu', 'shui', 'huo', 'tu', 'none'] as const;
export const PARTNER_RECRUIT_ALLOWED_ROLES: readonly PartnerRecruitRole[] = ['护卫', '剑修', '术师', '药师', '奇辅'] as const;
export const PARTNER_RECRUIT_ALLOWED_TECHNIQUE_KINDS: readonly PartnerRecruitTechniqueKind[] = ['attack', 'support', 'guard'] as const;
export const PARTNER_RECRUIT_ALLOWED_PASSIVE_KEYS: readonly PartnerRecruitPassiveKey[] = [
  'max_qixue',
  'wugong',
  'fagong',
  'wufang',
  'fafang',
  'sudu',
  'zengshang',
  'zhiliao',
] as const;

const DRAFT_STAT_RANGES_BY_QUALITY: Record<PartnerRecruitQuality, DraftStatRanges> = {
  黄: {
    baseAttrs: {
      max_qixue: { min: 120, max: 220 },
      wugong: { min: 12, max: 28 },
      fagong: { min: 12, max: 28 },
      wufang: { min: 10, max: 24 },
      fafang: { min: 10, max: 24 },
      sudu: { min: 10, max: 18 },
    },
    levelAttrGains: {
      max_qixue: { min: 10, max: 22 },
      wugong: { min: 1, max: 4 },
      fagong: { min: 1, max: 4 },
      wufang: { min: 1, max: 3 },
      fafang: { min: 1, max: 3 },
      sudu: { min: 1, max: 2 },
    },
    techniqueSlots: { min: 2, max: 2 },
    innateTechniqueCount: { min: 1, max: 1 },
  },
  玄: {
    baseAttrs: {
      max_qixue: { min: 180, max: 300 },
      wugong: { min: 18, max: 36 },
      fagong: { min: 18, max: 36 },
      wufang: { min: 14, max: 30 },
      fafang: { min: 14, max: 30 },
      sudu: { min: 12, max: 22 },
    },
    levelAttrGains: {
      max_qixue: { min: 16, max: 30 },
      wugong: { min: 2, max: 5 },
      fagong: { min: 2, max: 5 },
      wufang: { min: 1, max: 4 },
      fafang: { min: 1, max: 4 },
      sudu: { min: 1, max: 3 },
    },
    techniqueSlots: { min: 2, max: 3 },
    innateTechniqueCount: { min: 1, max: 1 },
  },
  地: {
    baseAttrs: {
      max_qixue: { min: 240, max: 400 },
      wugong: { min: 24, max: 46 },
      fagong: { min: 24, max: 46 },
      wufang: { min: 18, max: 38 },
      fafang: { min: 18, max: 38 },
      sudu: { min: 14, max: 26 },
    },
    levelAttrGains: {
      max_qixue: { min: 22, max: 40 },
      wugong: { min: 3, max: 6 },
      fagong: { min: 3, max: 6 },
      wufang: { min: 2, max: 5 },
      fafang: { min: 2, max: 5 },
      sudu: { min: 1, max: 3 },
    },
    techniqueSlots: { min: 3, max: 3 },
    innateTechniqueCount: { min: 2, max: 2 },
  },
  天: {
    baseAttrs: {
      max_qixue: { min: 320, max: 520 },
      wugong: { min: 30, max: 58 },
      fagong: { min: 30, max: 58 },
      wufang: { min: 24, max: 46 },
      fafang: { min: 24, max: 46 },
      sudu: { min: 16, max: 30 },
    },
    levelAttrGains: {
      max_qixue: { min: 28, max: 52 },
      wugong: { min: 4, max: 8 },
      fagong: { min: 4, max: 8 },
      wufang: { min: 2, max: 6 },
      fafang: { min: 2, max: 6 },
      sudu: { min: 2, max: 4 },
    },
    techniqueSlots: { min: 3, max: 4 },
    innateTechniqueCount: { min: 2, max: 2 },
  },
};

const QUALITY_ROLL_TABLE: ReadonlyArray<{ quality: PartnerRecruitQuality; weight: number }> = [
  { quality: '黄', weight: 55 },
  { quality: '玄', weight: 28 },
  { quality: '地', weight: 12 },
  { quality: '天', weight: 5 },
];

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

const asInt = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 0;
};

const isPartnerRecruitQuality = (raw: unknown): raw is PartnerRecruitQuality => {
  return raw === '黄' || raw === '玄' || raw === '地' || raw === '天';
};

const isPartnerRecruitElement = (raw: unknown): raw is PartnerRecruitElement => {
  return PARTNER_RECRUIT_ALLOWED_ELEMENTS.includes(raw as PartnerRecruitElement);
};

const isPartnerRecruitRole = (raw: unknown): raw is PartnerRecruitRole => {
  return PARTNER_RECRUIT_ALLOWED_ROLES.includes(raw as PartnerRecruitRole);
};

const isPartnerRecruitTechniqueKind = (raw: unknown): raw is PartnerRecruitTechniqueKind => {
  return PARTNER_RECRUIT_ALLOWED_TECHNIQUE_KINDS.includes(raw as PartnerRecruitTechniqueKind);
};

const isPartnerRecruitPassiveKey = (raw: unknown): raw is PartnerRecruitPassiveKey => {
  return PARTNER_RECRUIT_ALLOWED_PASSIVE_KEYS.includes(raw as PartnerRecruitPassiveKey);
};

const normalizeBaseAttrs = (raw: unknown): PartnerRecruitBaseAttrs | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  return {
    max_qixue: asInt(row.max_qixue),
    wugong: asInt(row.wugong),
    fagong: asInt(row.fagong),
    wufang: asInt(row.wufang),
    fafang: asInt(row.fafang),
    sudu: asInt(row.sudu),
  };
};

const isAttrInRange = (value: number, range: AttrRange): boolean => {
  return Number.isInteger(value) && value >= range.min && value <= range.max;
};

const validateBaseAttrs = (
  attrs: PartnerRecruitBaseAttrs,
  ranges: Record<keyof PartnerRecruitBaseAttrs, AttrRange>,
): boolean => {
  return (
    isAttrInRange(attrs.max_qixue, ranges.max_qixue) &&
    isAttrInRange(attrs.wugong, ranges.wugong) &&
    isAttrInRange(attrs.fagong, ranges.fagong) &&
    isAttrInRange(attrs.wufang, ranges.wufang) &&
    isAttrInRange(attrs.fafang, ranges.fafang) &&
    isAttrInRange(attrs.sudu, ranges.sudu)
  );
};

export const resolvePartnerRecruitQualityByWeight = (): PartnerRecruitQuality => {
  const totalWeight = QUALITY_ROLL_TABLE.reduce((sum, entry) => sum + entry.weight, 0);
  let rolled = Math.random() * totalWeight;
  for (const entry of QUALITY_ROLL_TABLE) {
    rolled -= entry.weight;
    if (rolled <= 0) return entry.quality;
  }
  return '黄';
};

export const getPartnerRecruitTechniqueMaxLayer = (
  quality: PartnerRecruitQuality,
): number => {
  if (quality === '黄') return 3;
  if (quality === '玄') return 4;
  if (quality === '地') return 5;
  return 6;
};

export const getPartnerRecruitExpectedInnateTechniqueCount = (
  quality: PartnerRecruitQuality,
): number => {
  return quality === '地' || quality === '天' ? 2 : 1;
};

export const buildPartnerRecruitPromptInput = (quality: PartnerRecruitQuality): Record<string, unknown> => {
  const ranges = DRAFT_STAT_RANGES_BY_QUALITY[quality];
  return {
    worldview: '中国仙侠世界《九州修仙录》',
    quality,
    allowedElements: [...PARTNER_RECRUIT_ALLOWED_ELEMENTS],
    allowedRoles: [...PARTNER_RECRUIT_ALLOWED_ROLES],
    allowedTechniqueKinds: [...PARTNER_RECRUIT_ALLOWED_TECHNIQUE_KINDS],
    allowedPassiveKeys: [...PARTNER_RECRUIT_ALLOWED_PASSIVE_KEYS],
    techniqueCount: getPartnerRecruitExpectedInnateTechniqueCount(quality),
    techniqueMaxLayer: getPartnerRecruitTechniqueMaxLayer(quality),
    statRanges: ranges,
    constraints: [
      '必须返回严格 JSON 对象，禁止额外解释文本',
      '伙伴名字 2-6 个中文字符，不得包含标点或空格',
      '伙伴描述 35-90 个中文字符',
      '每个天生功法名字 2-6 个中文字符，描述 18-60 个中文字符',
      '属性、槽位、天生功法数量必须落在给定范围内',
    ],
  };
};

export const validatePartnerRecruitDraft = (
  raw: unknown,
): PartnerRecruitDraft | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const partnerRaw = data.partner;
  if (!partnerRaw || typeof partnerRaw !== 'object' || Array.isArray(partnerRaw)) return null;
  const partner = partnerRaw as Record<string, unknown>;
  const quality = partner.quality;
  const attributeElement = partner.attributeElement;
  const role = partner.role;
  if (!isPartnerRecruitQuality(quality) || !isPartnerRecruitElement(attributeElement) || !isPartnerRecruitRole(role)) {
    return null;
  }

  const name = asString(partner.name);
  const description = asString(partner.description);
  if (name.length < 2 || name.length > 12 || description.length < 18 || description.length > 120) {
    return null;
  }

  const baseAttrs = normalizeBaseAttrs(partner.baseAttrs);
  const levelAttrGains = normalizeBaseAttrs(partner.levelAttrGains);
  if (!baseAttrs || !levelAttrGains) return null;

  const ranges = DRAFT_STAT_RANGES_BY_QUALITY[quality];
  const maxTechniqueSlots = asInt(partner.maxTechniqueSlots);
  if (!validateBaseAttrs(baseAttrs, ranges.baseAttrs) || !validateBaseAttrs(levelAttrGains, ranges.levelAttrGains)) {
    return null;
  }
  if (!isAttrInRange(maxTechniqueSlots, ranges.techniqueSlots)) {
    return null;
  }

  const innateTechniquesRaw = Array.isArray(data.innateTechniques) ? data.innateTechniques : null;
  if (!innateTechniquesRaw) return null;
  if (!isAttrInRange(innateTechniquesRaw.length, ranges.innateTechniqueCount)) {
    return null;
  }

  const innateTechniques = innateTechniquesRaw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    const techniqueName = asString(row.name);
    const techniqueDescription = asString(row.description);
    const kind = row.kind;
    const passiveKey = row.passiveKey;
    const passiveValue = asInt(row.passiveValue);
    if (
      techniqueName.length < 2 ||
      techniqueName.length > 12 ||
      techniqueDescription.length < 12 ||
      techniqueDescription.length > 100 ||
      !isPartnerRecruitTechniqueKind(kind) ||
      !isPartnerRecruitPassiveKey(passiveKey) ||
      passiveValue <= 0
    ) {
      return [];
    }
    return [{
      name: techniqueName,
      description: techniqueDescription,
      kind,
      passiveKey,
      passiveValue,
    }];
  });

  if (innateTechniques.length !== innateTechniquesRaw.length) return null;
  if (maxTechniqueSlots < innateTechniques.length) return null;

  return {
    partner: {
      name,
      description,
      quality,
      attributeElement,
      role,
      maxTechniqueSlots,
      baseAttrs,
      levelAttrGains,
    },
    innateTechniques,
  };
};

export type PartnerRecruitCooldownState = {
  cooldownHours: number;
  cooldownUntil: string | null;
  cooldownRemainingSeconds: number;
  isCoolingDown: boolean;
};

const buildIdleCooldownState = (): PartnerRecruitCooldownState => ({
  cooldownHours: PARTNER_RECRUIT_COOLDOWN_HOURS,
  cooldownUntil: null,
  cooldownRemainingSeconds: 0,
  isCoolingDown: false,
});

export const buildPartnerRecruitCooldownState = (
  latestStartedAt: string | null,
  now: Date = new Date(),
): PartnerRecruitCooldownState => {
  const startedAtMs = latestStartedAt ? new Date(latestStartedAt).getTime() : Number.NaN;
  if (!Number.isFinite(startedAtMs)) return buildIdleCooldownState();
  const cooldownUntilMs = startedAtMs + PARTNER_RECRUIT_COOLDOWN_HOURS * HOUR_SECONDS * SECOND_MS;
  const remainingSeconds = Math.max(0, Math.ceil((cooldownUntilMs - now.getTime()) / SECOND_MS));
  return {
    cooldownHours: PARTNER_RECRUIT_COOLDOWN_HOURS,
    cooldownUntil: new Date(cooldownUntilMs).toISOString(),
    cooldownRemainingSeconds: remainingSeconds,
    isCoolingDown: remainingSeconds > 0,
  };
};

export const buildPartnerRecruitPreviewExpireAt = (finishedAtIso: string | null): string | null => {
  if (!finishedAtIso) return null;
  const finishedAtMs = new Date(finishedAtIso).getTime();
  if (!Number.isFinite(finishedAtMs)) return null;
  return new Date(finishedAtMs + PARTNER_RECRUIT_PREVIEW_EXPIRE_HOURS * HOUR_SECONDS * SECOND_MS).toISOString();
};

export const isPartnerRecruitPreviewExpired = (
  finishedAtIso: string | null,
  now: Date = new Date(),
): boolean => {
  const expireAt = buildPartnerRecruitPreviewExpireAt(finishedAtIso);
  if (!expireAt) return false;
  return new Date(expireAt).getTime() <= now.getTime();
};

export const formatPartnerRecruitCooldownRemaining = (cooldownRemainingSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(cooldownRemainingSeconds));
  if (safeSeconds >= DAY_SECONDS) {
    const days = Math.floor(safeSeconds / DAY_SECONDS);
    const hours = Math.floor((safeSeconds % DAY_SECONDS) / HOUR_SECONDS);
    const minutes = Math.floor((safeSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
    if (minutes > 0) return `${days}天${hours}小时${minutes}分`;
    if (hours > 0) return `${days}天${hours}小时`;
    return `${days}天`;
  }
  if (safeSeconds >= HOUR_SECONDS) {
    const hours = Math.floor(safeSeconds / HOUR_SECONDS);
    const minutes = Math.floor((safeSeconds % HOUR_SECONDS) / MINUTE_SECONDS);
    if (minutes > 0) return `${hours}小时${minutes}分`;
    return `${hours}小时`;
  }
  if (safeSeconds >= MINUTE_SECONDS) {
    const minutes = Math.floor(safeSeconds / MINUTE_SECONDS);
    const seconds = safeSeconds % MINUTE_SECONDS;
    if (seconds > 0) return `${minutes}分${seconds}秒`;
    return `${minutes}分`;
  }
  return `${safeSeconds}秒`;
};
