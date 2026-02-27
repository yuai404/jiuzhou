/**
 * 物品实例来源字段规范工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一规范 `item_instance.obtained_from` 的默认值与长度约束，避免各服务重复写字符串校验逻辑。
 * - 不做什么：不负责拼接来源语义，不负责数据库写入，不负责兜底截断。
 *
 * 输入/输出：
 * - 输入：上游传入的来源字符串（`unknown`），来源可为空或未定义。
 * - 输出：`{ success: true, value }` 或 `{ success: false, message }`，由调用方决定后续事务行为。
 *
 * 数据流/状态流：
 * - 业务层在入库前调用本工具，拿到规范化来源值。
 * - 校验通过后写入 `item_instance.obtained_from`。
 * - 校验失败时立即中断当前业务分支，避免触发数据库 `varchar` 超长异常。
 *
 * 关键边界条件与坑点：
 * 1) 允许空来源：空字符串会被规范为 `system`，保持历史业务语义一致。
 * 2) 禁止静默截断：超长直接返回失败，由业务层回滚，避免来源追踪信息被悄悄破坏。
 */

export const ITEM_INSTANCE_OBTAINED_FROM_MAX_LENGTH = 128;

type NormalizeItemInstanceSourceResult =
  | { success: true; value: string }
  | { success: false; message: string };

export const normalizeItemInstanceObtainedFrom = (
  obtainedFromRaw: unknown,
): NormalizeItemInstanceSourceResult => {
  const source =
    typeof obtainedFromRaw === 'string' ? obtainedFromRaw.trim() : '';
  const resolved = source || 'system';

  if (resolved.length > ITEM_INSTANCE_OBTAINED_FROM_MAX_LENGTH) {
    return {
      success: false,
      message: `来源标识过长（最大${ITEM_INSTANCE_OBTAINED_FROM_MAX_LENGTH}字符）`,
    };
  }

  return { success: true, value: resolved };
};
