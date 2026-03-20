/**
 * 战斗行动位自愈推进回归测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“当前行动位失效时，BattleEngine 仍能推进到下一个合法行动单位或下一行动方”的共享行为。
 * 2. 做什么：覆盖普通战斗/PVP/秘境共用的运行时骨架，避免 ticker 再次因为 `currentUnitId` 漂移直接卡死。
 * 3. 不做什么：不覆盖技能结算、掉落结算，也不验证前端自动继续按钮。
 *
 * 输入/输出：
 * - 输入：构造后的 BattleState 与失效行动位。
 * - 输出：`ensureActionableUnit` 是否推进成功，以及推进后的 currentTeam/currentUnitId。
 *
 * 数据流/状态流：
 * 失效 `currentUnitId`
 * -> BattleEngine.ensureActionableUnit
 * -> 修复行动游标
 * -> ticker / 玩家行动入口继续复用修复后的状态。
 *
 * 关键边界条件与坑点：
 * 1. 当前行动位若指向已死亡单位，必须跳到同阵营下一个可行动单位，不能停在空指针上。
 * 2. 当前行动方若已无任何可行动单位，必须切到下一行动方，不能把 `currentUnitId` 留空导致整场战斗停住。
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { BattleEngine } from '../../battle/battleEngine.js';
import { createState, createUnit } from './battleTestUtils.js';

test('ensureActionableUnit: 当前行动位指向已死亡单位时，应推进到同阵营下一个可行动单位', () => {
  const leader = createUnit({ id: 'player-1', name: '队长' });
  const member = createUnit({ id: 'player-2', name: '队员' });
  const monster = createUnit({ id: 'monster-1', name: '妖兽', type: 'monster' });
  leader.isAlive = false;

  const state = createState({
    attacker: [leader, member],
    defender: [monster],
  });
  state.currentTeam = 'attacker';
  state.phase = 'action';
  state.currentUnitId = leader.id;

  const engine = new BattleEngine(state);

  assert.equal(engine.ensureActionableUnit(), true);
  assert.equal(engine.getState().currentTeam, 'attacker');
  assert.equal(engine.getState().currentUnitId, member.id);
});

test('ensureActionableUnit: 当前行动方已无可行动单位时，应切到下一行动方继续推进', () => {
  const leader = createUnit({ id: 'player-1', name: '队长' });
  const member = createUnit({ id: 'player-2', name: '队员' });
  const monster = createUnit({ id: 'monster-1', name: '妖兽', type: 'monster' });
  leader.canAct = false;
  member.canAct = false;

  const state = createState({
    attacker: [leader, member],
    defender: [monster],
  });
  state.currentTeam = 'attacker';
  state.phase = 'action';
  state.currentUnitId = null;

  const engine = new BattleEngine(state);

  assert.equal(engine.ensureActionableUnit(), true);
  assert.equal(engine.getState().currentTeam, 'defender');
  assert.equal(engine.getState().currentUnitId, monster.id);
});

test('ensureActionableUnit: 当前行动游标丢失后，不能把本回合已经行动过的玩家重新选为当前单位', () => {
  const leader = createUnit({
    id: 'player-1',
    name: '队长',
    attrs: { sudu: 200 },
  });
  const member = createUnit({
    id: 'player-2',
    name: '队员',
    attrs: { sudu: 100 },
  });
  const monster = createUnit({
    id: 'monster-1',
    name: '妖兽',
    type: 'monster',
    attrs: { sudu: 80 },
  });

  const state = createState({
    attacker: [leader, member],
    defender: [monster],
  });
  const engine = new BattleEngine(state);

  engine.startBattle();
  const firstAction = engine.playerAction(1, 'skill-normal-attack', [monster.id]);

  assert.equal(firstAction.success, true);
  assert.equal(leader.canAct, false);
  assert.equal(engine.getState().currentTeam, 'attacker');
  assert.equal(engine.getState().currentUnitId, member.id);

  state.currentUnitId = null;

  assert.equal(engine.ensureActionableUnit(), true);
  assert.equal(engine.getState().currentTeam, 'attacker');
  assert.equal(engine.getState().currentUnitId, member.id);
});
