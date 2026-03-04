/**
 * 作用：
 * - 统一物品 `bind_type` 的前端展示语义，提供“详情文案 + 格子角标文案”的单一映射入口，避免 Bag/Market 重复写判断。
 * - 不做什么：不参与交易可否上架等业务判定，仅负责展示层映射。
 *
 * 输入/输出：
 * - 输入：后端返回的任意 `bind_type` 原始值（unknown）。
 * - 输出：`ItemBindMeta`，包含标准化类型、是否已绑定、详情标签文案与格子角标文案。
 *
 * 数据流/状态流：
 * - 业务模块在 DTO -> ViewModel（`buildBagItem`）阶段调用 `resolveItemBindMeta`。
 * - UI 组件只消费 `ItemBindMeta` 渲染，不再直接判断 `bind_type`。
 *
 * 边界条件与坑点：
 * - `bind_type` 可能为空、大小写不一致或出现未知值，都会标准化并回退到“已绑定”通用展示。
 * - `none` 虽然不显示角标，但详情仍返回“未绑定”，确保状态信息可见且一致。
 */

export type ItemBindTone = "none" | "pickup" | "equip" | "other";

export type ItemBindMeta = {
  type: string;
  tone: ItemBindTone;
  isBound: boolean;
  detailLabel: string;
  cellBadgeLabel: string | null;
};

const normalizeBindType = (value: unknown): string => {
  if (typeof value !== "string") return "none";
  const normalized = value.trim().toLowerCase();
  return normalized || "none";
};

export const resolveItemBindMeta = (value: unknown): ItemBindMeta => {
  const type = normalizeBindType(value);
  if (type === "none") {
    return {
      type,
      tone: "none",
      isBound: false,
      detailLabel: "未绑定",
      cellBadgeLabel: null,
    };
  }
  if (type === "pickup") {
    return {
      type,
      tone: "pickup",
      isBound: true,
      detailLabel: "拾取绑定",
      cellBadgeLabel: "拾绑",
    };
  }
  if (type === "equip") {
    return {
      type,
      tone: "equip",
      isBound: true,
      detailLabel: "装备绑定",
      cellBadgeLabel: "装绑",
    };
  }
  return {
    type,
    tone: "other",
    isBound: true,
    detailLabel: "已绑定",
    cellBadgeLabel: "绑定",
  };
};
