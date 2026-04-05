/**
 * BattleArea 行动轮转 key 回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“同回合同一单位额外行动”时 actionKey 必须变化，避免自动战斗把额外行动误判成旧回合。
 * 2. 做什么：验证重复同步同一份状态时 key 保持稳定，避免客户端重复自动施法。
 * 3. 不做什么：不挂载 BattleArea 组件、不建立 socket 连接，也不验证服务端额外行动结算。
 *
 * 输入 / 输出：
 * - 输入：最小化 BattleStateDto 快照、当前行动单位 ID、以及 battle log 数量。
 * - 输出：`buildBattleActionKey` 的字符串结果与相等性断言。
 *
 * 数据流 / 状态流：
 * battle state + battle log 条数
 * -> buildBattleActionKey
 * -> BattleArea / SkillFloatButton 用于判断“是否进入下一次可行动机会”。
 *
 * 关键边界条件与坑点：
 * 1. 额外行动场景里 `roundCount/currentTeam/currentUnitId` 可能完全不变，必须依赖日志增量区分前后两次行动。
 * 2. 同一份快照重复推送时 key 不能变化，否则自动战斗会在同一次行动窗口内重复触发。
 */

import { describe, expect, it } from 'vitest';

import type { BattleStateDto } from '../../../../services/api/combat-realm';
import { buildBattleActionKey } from '../BattleArea/battleActionKey';

const createBattleState = (overrides?: Partial<BattleStateDto>): BattleStateDto => ({
  battleId: 'battle-poxu-1',
  battleType: 'pve',
  teams: {
    attacker: {
      odwnerId: 1001,
      units: [],
      totalSpeed: 100,
    },
    defender: {
      units: [],
      totalSpeed: 80,
    },
  },
  roundCount: 3,
  currentTeam: 'attacker',
  currentUnitId: 'player-1001',
  phase: 'action',
  firstMover: 'attacker',
  ...overrides,
});

describe('buildBattleActionKey', () => {
  it('没有战斗状态时应返回 idle', () => {
    expect(buildBattleActionKey(null, null, 0)).toBe('idle');
  });

  it('同回合同一单位触发额外行动时，应因日志增量生成新 key', () => {
    const state = createBattleState();

    const previousKey = buildBattleActionKey(state, 'player-1001', 5);
    const nextKey = buildBattleActionKey(state, 'player-1001', 7);

    expect(previousKey).not.toBe(nextKey);
  });

  it('重复同步同一份可行动快照时，应保持相同 key', () => {
    const state = createBattleState();

    expect(buildBattleActionKey(state, 'player-1001', 7)).toBe(
      buildBattleActionKey(state, 'player-1001', 7),
    );
  });
});
