/**
 * BattleArea 冷却状态补消费判定测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“冷却事件先到、角色身份稍后就绪”时，BattleArea 仍应补消费最近一次缓存冷却态，避免普通战斗偶发卡在终态页。
 * 2. 做什么：统一验证冷却事件去重 key，避免监听首帧回放与补消费 effect 重复触发下一步动作。
 * 3. 不做什么：不挂载 BattleArea 组件、不建立 socket 连接，也不验证具体 UI 文案。
 *
 * 输入/输出：
 * - 输入：最近一次缓存的战斗冷却状态、当前角色 ID、以及上一次已消费的冷却事件 key。
 * - 输出：是否应补消费该冷却状态，以及该状态对应的稳定去重 key。
 *
 * 数据流/状态流：
 * - socket `battle:cooldown-sync/ready` -> gameSocket 缓存 -> BattleArea 角色就绪后读取缓存 -> 本模块判定是否补消费。
 *
 * 关键边界条件与坑点：
 * 1. 角色 ID 未就绪时必须返回 false；但一旦角色 ID 补齐，同一条缓存事件应立即变为可消费。
 * 2. 相同时间戳的同一条冷却事件只能处理一次，否则会出现重复自动续战或重复 onNext。
 */

import { describe, expect, it } from 'vitest';

import type { BattleCooldownState } from '../../../../services/gameSocket';
import {
  buildBattleCooldownReplayKey,
  shouldReplayLatestBattleCooldown,
} from '../BattleArea/battleCooldownReplay';

const createCooldownState = (
  overrides?: Partial<BattleCooldownState>,
): BattleCooldownState => ({
  kind: 'sync',
  characterId: 1001,
  remainingMs: 2800,
  timestamp: 1_710_000_000_000,
  active: true,
  ...overrides,
});

describe('buildBattleCooldownReplayKey', () => {
  it('同一条冷却事件应生成稳定去重 key', () => {
    expect(
      buildBattleCooldownReplayKey(
        createCooldownState({
          kind: 'ready',
          remainingMs: 0,
          active: false,
        }),
      ),
    ).toBe('ready|1001|1710000000000|0');
  });
});

describe('shouldReplayLatestBattleCooldown', () => {
  it('角色 ID 迟到补齐后，应补消费最近一次缓存冷却状态', () => {
    expect(
      shouldReplayLatestBattleCooldown({
        cooldownState: createCooldownState(),
        characterId: 1001,
        lastHandledKey: '',
      }),
    ).toBe(true);
  });

  it('角色 ID 未就绪时，不应提前消费冷却状态', () => {
    expect(
      shouldReplayLatestBattleCooldown({
        cooldownState: createCooldownState(),
        characterId: null,
        lastHandledKey: '',
      }),
    ).toBe(false);
  });

  it('不同角色的缓存冷却状态，不应被当前 BattleArea 误消费', () => {
    expect(
      shouldReplayLatestBattleCooldown({
        cooldownState: createCooldownState({
          characterId: 2002,
        }),
        characterId: 1001,
        lastHandledKey: '',
      }),
    ).toBe(false);
  });

  it('已经处理过的同一条缓存冷却状态，不应重复补消费', () => {
    const cooldownState = createCooldownState();
    expect(
      shouldReplayLatestBattleCooldown({
        cooldownState,
        characterId: 1001,
        lastHandledKey: buildBattleCooldownReplayKey(cooldownState),
      }),
    ).toBe(false);
  });
});
