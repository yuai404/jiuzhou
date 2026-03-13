/**
 * 物品可分解规则共享模块
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一解释静态物品定义中的 `disassemblable` 配置，并输出服务端统一口径的“该物品是否允许分解”布尔值。
 * - 不做什么：不处理物品实例的锁定/位置/数量校验，也不负责计算分解奖励。
 *
 * 输入/输出：
 * - 输入：带有可选 `disassemblable` 字段的静态物品定义对象。
 * - 输出：`resolveItemCanDisassemble` 返回规范化后的布尔值；仅当配置显式为 `false` 时禁止分解，其余情况一律允许。
 *
 * 数据流/状态流：
 * - item_def / gem_def / equipment_def 静态配置
 * - -> 本模块统一解释默认值与显式禁用
 * - -> inventory/itemQuery 下发 `can_disassemble`
 * - -> inventory/disassemble 复用同一口径执行实际校验
 *
 * 关键边界条件与坑点：
 * 1) 默认值必须是“可分解”，否则旧种子未补字段时会批量变成不可分解，直接破坏现有玩法。
 * 2) 这里只解释静态配置，不兜底实例状态；位置、穿戴中、锁定等限制仍由背包领域服务各自处理，避免职责混杂。
 */
export type ItemDisassembleConfigLike = {
  disassemblable?: boolean | null;
} | null | undefined;

export const resolveItemCanDisassemble = (
  itemDef: ItemDisassembleConfigLike,
): boolean => {
  return itemDef?.disassemblable !== false;
};
