/**
 * 终态结算失败重试回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定 finished 状态下若结算链路临时失败，ticker 不会立刻被停掉，而是保留重试机会。
 * 2. 做什么：验证后续 tick 能重新触发结算，覆盖线上偶发数据库/网络抖动导致的“战斗卡在最后一回合”场景。
 * 3. 不做什么：不验证具体奖励内容，也不覆盖 battle_finished 推送 payload 细节；这里只关心重试与 ticker 生命周期。
 *
 * 输入/输出：
 * - 输入：一场已 finished 的战斗、第一次抛错第二次成功的 mocked 结算函数。
 * - 输出：首次失败后 ticker 仍保持注册；后续 tick 会再次调用 finishBattle 并最终停止 ticker。
 *
 * 数据流/状态流：
 * startBattleTicker -> 立即 tick -> finishBattle 抛错
 * -> ticker 保留 -> 下一次 tick 重试结算成功 -> stopBattleTicker。
 *
 * 关键边界条件与坑点：
 * 1. 必须用真实 ticker 调度验证 battleTickers 注册表，否则测不到“失败后被提前停掉”的线上问题。
 * 2. 清理阶段要主动 stopBattleTicker/清空全局 Map，避免定时器串扰其它测试。
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { BattleEngine } from '../../battle/battleEngine.js';
import * as settlementModule from '../battle/settlement.js';
import {
    activeBattles,
    battleParticipants,
    battleTickers,
    BATTLE_TICK_MS,
} from '../battle/runtime/state.js';
import { startBattleTicker, stopBattleTicker } from '../battle/runtime/ticker.js';
import { createState, createUnit } from './battleTestUtils.js';

const wait = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
};

test('startBattleTicker: 终态结算临时失败时应保留 ticker 并在后续 tick 重试', async (t) => {
    const battleId = 'battle-finished-settlement-retry';
    const settleCalls: string[] = [];
    const state = {
        ...createState({
            attacker: [createUnit({ id: 'player-1', name: '主角' })],
            defender: [createUnit({ id: 'monster-1', name: '妖兽', type: 'monster' })],
        }),
        battleId,
        phase: 'finished' as const,
        result: 'attacker_win' as const,
    };
    const engine = new BattleEngine(state);

    activeBattles.set(battleId, engine);
    battleParticipants.set(battleId, [1]);

    t.after(() => {
        stopBattleTicker(battleId);
        activeBattles.delete(battleId);
        battleParticipants.delete(battleId);
    });

    t.mock.method(settlementModule, 'getBattleMonsters', async () => []);
    t.mock.method(settlementModule, 'finishBattle', async (nextBattleId: string) => {
        settleCalls.push(nextBattleId);
        if (settleCalls.length === 1) {
            throw new Error('transient settlement failure');
        }
        stopBattleTicker(nextBattleId);
        return {
            success: true,
            message: '战斗胜利',
        };
    });

    startBattleTicker(battleId);
    await wait(50);

    assert.deepEqual(settleCalls, [battleId]);
    assert.equal(battleTickers.has(battleId), true);

    await wait(BATTLE_TICK_MS + 150);

    assert.deepEqual(settleCalls, [battleId, battleId]);
    assert.equal(battleTickers.has(battleId), false);
});