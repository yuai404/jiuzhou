import { translateControlName } from "../../shared/controlNameMap";
import { translateKnownBuffKeyName } from "../../shared/buffNameMap";
export { translateControlName } from "../../shared/controlNameMap";

const ATTR_LABEL_MAP: Record<string, string> = {
  max_qixue: '气血上限',
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
  jianfantan: '反伤减免',
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
};

const ATTR_KEY_ALIAS: Record<string, string> = {
  'max-lingqi': 'max_lingqi',
  'max-qixue': 'max_qixue',
  'qixue-huifu': 'qixue_huifu',
  'lingqi-huifu': 'lingqi_huifu',
  'kongzhi-kangxing': 'kongzhi_kangxing',
  'jin-kangxing': 'jin_kangxing',
  'mu-kangxing': 'mu_kangxing',
  'shui-kangxing': 'shui_kangxing',
  'huo-kangxing': 'huo_kangxing',
  'tu-kangxing': 'tu_kangxing',
};

function normalizeAttrKey(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  if (!lowered) return '';
  const aliased = ATTR_KEY_ALIAS[lowered] ?? lowered;
  return aliased.replace(/-/g, '_');
}

function translateAttrLabel(raw: string): string | null {
  const key = normalizeAttrKey(raw);
  if (!key) return null;
  return ATTR_LABEL_MAP[key] ?? null;
}

export function translateBuffName(buffName: string | null | undefined): string {
  const raw = String(buffName ?? '').trim();
  if (!raw) return '';

  const special = translateKnownBuffKeyName(raw);
  if (special) return special;

  if (raw.startsWith('control-')) {
    return translateControlName(raw.slice('control-'.length));
  }

  const setBleed = /^set-[a-z0-9-]+-bleed$/i;
  if (setBleed.test(raw)) return '流血';

  const buffPattern = /^(buff|debuff)-([a-z0-9_-]+)-(up|down)$/i;
  const matched = buffPattern.exec(raw);
  if (matched) {
    const [, kind, attrRaw, dirRaw] = matched;
    const attrLabel = translateAttrLabel(attrRaw);
    if (attrLabel) {
      if (dirRaw.toLowerCase() === 'up') return `${attrLabel}提升`;
      if (dirRaw.toLowerCase() === 'down') return `${attrLabel}降低`;
      if (kind.toLowerCase() === 'buff') return `${attrLabel}提升`;
      return `${attrLabel}降低`;
    }
  }

  return raw;
}

export function translateBuffNames(names: string[] | null | undefined): string[] {
  return (names ?? [])
    .map((name) => translateBuffName(name))
    .filter((name) => !!name);
}
