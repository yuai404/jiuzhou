/**
 * BattleArea 行动轮转 key 生成器
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把 BattleArea“当前是否进入下一次可行动时机”的判定收口为单一纯函数，避免主组件、技能面板各自拼接 key。
 * 2. 做什么：把 battle log 增量纳入 key，覆盖“同回合同一单位因额外行动继续出手”但 round/team/currentUnitId 不变的场景。
 * 3. 不做什么：不判断战斗状态新旧，不处理日志格式化，也不直接参与技能释放。
 *
 * 输入 / 输出：
 * - 输入：当前战斗状态、当前行动单位 ID、以及完整战斗日志条数。
 * - 输出：稳定字符串 key；当任一会影响“下一次行动机会”的字段变化时，key 必须同步变化。
 *
 * 数据流 / 状态流：
 * socket / action 返回的 BattleStateDto + battleLogs.length
 * -> 本模块生成 actionKey
 * -> BattleArea `onTurnChange`
 * -> SkillFloatButton 按 key 判定是否需要重新出手。
 *
 * 复用设计说明：
 * 1. 之前 actionKey 拼接散落在 BattleArea 内，额外行动场景缺少日志维度，导致同一单位连动时无法统一刷新。
 * 2. 抽成纯函数后，BattleArea 与回归测试共用同一入口，后续若新增新的行动推进维度，只需要改这里一处。
 * 3. 高变化点是“什么字段代表一次新的可行动机会”，因此集中放在独立模块中，避免展示组件继续复制拼接规则。
 *
 * 关键边界条件与坑点：
 * 1. `currentUnitId` 在额外行动时可能完全不变，若不引入日志增量，自动战斗会误判成“已经处理过本次行动”。
 * 2. 重复同步同一份 battle state 时，key 必须保持稳定，不能因为非战斗字段抖动导致自动战斗重复出手。
 */

import type { BattleStateDto } from '../../../../services/api/combat-realm';

export const buildBattleActionKey = (
  state: BattleStateDto | null,
  activeUnitId: string | null,
  battleLogCount: number,
): string => {
  if (!state) return 'idle';

  const safeBattleLogCount = Number.isFinite(battleLogCount) && battleLogCount > 0
    ? Math.floor(battleLogCount)
    : 0;

  return [
    state.battleId,
    state.roundCount,
    state.currentTeam,
    state.currentUnitId ?? '',
    activeUnitId ?? '',
    safeBattleLogCount,
  ].join('-');
};
