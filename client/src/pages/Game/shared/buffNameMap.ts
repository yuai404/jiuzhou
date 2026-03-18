/**
 * Buff 名称映射共享层（战斗日志 / 技能描述共用）
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：集中维护“后端 Buff 标识 -> 玩家可读中文名”的精确映射，避免战斗日志、技能说明各写一套特殊 Buff 文案。
 * - 做什么：为 aura、灼烧、持续治疗等内置 Buff 提供统一翻译入口，保证同一 Buff 在不同展示位名字一致。
 * - 不做什么：不负责属性型 Buff（如 `buff-wugong-up`）的规则推导，不负责完整句式拼接，也不负责持续回合等额外信息展示。
 *
 * 输入/输出：
 * - 输入：Buff 标识字符串，如 `buff-aura`、`debuff-burn`。
 * - 输出：已收录时返回中文名称；未收录或输入为空时返回空字符串，交给调用方继续走自己的通用规则。
 *
 * 数据流/状态流：
 * - 后端战斗日志 / 技能效果描述产出 Buff key
 * - 本模块做“精确命中型 Buff”的统一翻译
 * - 调用方在命中时直接展示中文名，未命中时继续执行属性 Buff / 控制 Buff 等各自的格式化逻辑
 *
 * 关键边界条件与坑点：
 * 1) 这里只处理“精确 key 映射”，不能吞掉未识别值，否则会把应当暴露的数据问题伪装成空文案。
 * 2) `buff-aura` 与 `debuff-aura` 必须区分成不同中文名，否则玩家虽然看不到内部 key，但仍无法判断是增益光环还是减益光环。
 */

const BUFF_NAME_MAP: Record<string, string> = {
  "debuff-burn": "灼烧",
  "buff-hot": "持续治疗",
  "buff-dodge-next": "下一次闪避",
  "buff-reflect-damage": "受击反震",
  "debuff-heal-forbid": "断脉",
  "buff-next-skill-chaos": "下一式异变",
  "buff-aura": "增益光环",
  "debuff-aura": "减益光环",
};

export function translateKnownBuffKeyName(buffKey: string | null | undefined): string {
  const raw = String(buffKey ?? "").trim();
  if (!raw) return "";
  return BUFF_NAME_MAP[raw] ?? "";
}
