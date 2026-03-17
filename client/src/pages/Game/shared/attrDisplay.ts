/**
 * 属性展示共享定义。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护属性中文名与“是否按百分比展示”的规则，供背包、伙伴等多个面板复用。
 * 2. 做什么：把高频变化的展示映射从业务组件中抽离，避免每个模块各抄一份属性表。
 * 3. 不做什么：不负责具体 UI 渲染，也不直接格式化数值字符串。
 *
 * 输入/输出：
 * - 输入：属性键字符串。
 * - 输出：属性中文名、百分比属性判断结果。
 *
 * 数据流/状态流：
 * 后端属性键 -> 本文件映射/判断 -> 业务模块决定具体文案与格式化方式。
 *
 * 关键边界条件与坑点：
 * 1. 伙伴功法被动会直接透出功法层的 passive key，映射缺项时前端会出现 `undefined`，因此展示键必须集中维护。
 * 2. `*_rating` 这类等级属性需要和基础属性共享同一中文根标签，否则不同面板会出现同义不同名。
 */

export const RATING_SUFFIX = '_rating';

export const RATING_BASE_ATTR_KEYS = [
  'mingzhong',
  'shanbi',
  'zhaojia',
  'baoji',
  'baoshang',
  'kangbao',
  'zengshang',
  'zhiliao',
  'jianliao',
  'xixue',
  'lengque',
  'kongzhi_kangxing',
  'jin_kangxing',
  'mu_kangxing',
  'shui_kangxing',
  'huo_kangxing',
  'tu_kangxing',
] as const;

const ATTR_LABEL_BASE: Record<string, string> = {
  qixue: '当前气血',
  max_qixue: '气血上限',
  lingqi: '当前灵气',
  max_lingqi: '灵气上限',
  wugong: '物攻',
  fagong: '法攻',
  wufang: '物防',
  fafang: '法防',
  mingzhong: '命中',
  shanbi: '闪避',
  zhaojia: '招架',
  baoji: '暴击',
  baoshang: '暴伤',
  jianbaoshang: '暴伤减免',
  kangbao: '抗暴',
  zengshang: '增伤',
  zhiliao: '治疗',
  jianliao: '减疗',
  xixue: '吸血',
  lengque: '冷却',
  sudu: '速度',
  qixue_huifu: '气血恢复',
  lingqi_huifu: '灵气恢复',
  kongzhi_kangxing: '控制抗性',
  jin_kangxing: '金抗性',
  mu_kangxing: '木抗性',
  shui_kangxing: '水抗性',
  huo_kangxing: '火抗性',
  tu_kangxing: '土抗性',
  fuyuan: '福源',
};

const ratingAttrLabelEntries = RATING_BASE_ATTR_KEYS.map((key) => {
  const baseLabel = ATTR_LABEL_BASE[key];
  return [`${key}${RATING_SUFFIX}`, `${baseLabel}等级`] as const;
});

export const attrLabel: Record<string, string> = {
  ...ATTR_LABEL_BASE,
  ...Object.fromEntries(ratingAttrLabelEntries),
};

export const percentAttrKeys = new Set<string>([
  'mingzhong',
  'shanbi',
  'zhaojia',
  'baoji',
  'baoshang',
  'jianbaoshang',
  'kangbao',
  'zengshang',
  'zhiliao',
  'jianliao',
  'xixue',
  'lengque',
  'kongzhi_kangxing',
  'jin_kangxing',
  'mu_kangxing',
  'shui_kangxing',
  'huo_kangxing',
  'tu_kangxing',
]);

export const getAttrLabel = (attrKey: string): string => {
  return attrLabel[attrKey] ?? '未知属性';
};

export const isPercentAttrKey = (attrKey: string): boolean => {
  return percentAttrKeys.has(attrKey);
};
