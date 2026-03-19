import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine } from '../../battle/battleEngine.js';
import type { BattleSkill, SkillEffect } from '../../battle/types.js';
import { createState, createUnit } from './battleTestUtils.js';

/**
 * 战斗速度类光环回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定“回合开始结算出的增速/减速效果，会立即参与本回合先手判定与队内出手排序”。
 * 2. 做什么：覆盖增速光环与减速光环两条链路，避免只修友方增速、敌方减速仍停留在属性面板。
 * 3. 不做什么：不验证中途行动后的动态重排，本文件只关心回合开始阶段的排程快照。
 *
 * 输入/输出：
 * - 输入：带有 passive aura 的战斗单位与初始 BattleState。
 * - 输出：`startBattle()` 后的 `currentTeam`、`currentUnitId` 与速度属性断言。
 *
 * 数据流/状态流：
 * passive skill -> processPassiveSkills -> processRoundStart/processAuraEffect -> currentAttrs.sudu 变化
 * -> battleEngine.refreshRoundActionOrder -> firstMover/currentUnitId。
 *
 * 关键边界条件与坑点：
 * 1. 必须让基础总速度与光环生效后的总速度跨过临界值，才能证明“先手判定”真的吃到了新速度。
 * 2. 必须同时构造同队两人速度反超，才能证明“队内排序”不是只重算了 totalSpeed。
 */

const createPassiveAuraSkill = (id: string, auraTarget: 'all_ally' | 'all_enemy' | 'self', auraEffects: SkillEffect[]): BattleSkill => ({
  id,
  name: id,
  triggerType: 'passive',
  source: 'technique',
  cost: {
    lingqi: 0,
    lingqiRate: 0,
    qixue: 0,
    qixueRate: 0,
  },
  cooldown: 0,
  targetType: 'self',
  targetCount: 1,
  damageType: undefined,
  element: 'none',
  effects: [{
    type: 'buff',
    buffKind: 'aura',
    buffKey: 'buff-aura',
    auraTarget,
    auraEffects,
  }],
  aiPriority: 100,
});

test('回合开始后的增速光环应立即刷新本回合先手与队内排序', () => {
  const auraCaster = createUnit({
    id: 'player-1',
    name: '风灵修',
    attrs: { sudu: 100 },
  });
  const ally = createUnit({
    id: 'player-2',
    name: '剑修同伴',
    type: 'partner',
    attrs: { sudu: 120 },
  });
  const defender = createUnit({
    id: 'monster-1',
    name: '山魈',
    type: 'monster',
    attrs: { sudu: 225 },
  });

  auraCaster.skills = [createPassiveAuraSkill('skill-speed-up-aura', 'self', [{
    type: 'buff',
    buffKind: 'attr',
    buffKey: 'buff-sudu-up',
    attrKey: 'sudu',
    applyType: 'flat',
    value: 60,
    duration: 1,
  }])];

  const state = createState({
    attacker: [auraCaster, ally],
    defender: [defender],
  });
  const engine = new BattleEngine(state);

  engine.startBattle();

  assert.equal(auraCaster.currentAttrs.sudu, 160, '增速光环应先改写施法者当前速度');
  assert.equal(engine.getState().currentTeam, 'attacker', '增速后应改写本回合先手方');
  assert.equal(engine.getState().currentUnitId, auraCaster.id, '增速后应让被超速的单位先于队友行动');
});

test('回合开始后的减速光环应立即刷新敌方总速度并改写先手', () => {
  const attacker = createUnit({
    id: 'player-10',
    name: '天书',
    attrs: { sudu: 200 },
  });
  const defenderA = createUnit({
    id: 'monster-10',
    name: '噬骨鬣犬甲',
    type: 'monster',
    attrs: { sudu: 120 },
  });
  const defenderB = createUnit({
    id: 'monster-11',
    name: '噬骨鬣犬乙',
    type: 'monster',
    attrs: { sudu: 110 },
  });

  attacker.skills = [createPassiveAuraSkill('skill-speed-down-aura', 'all_enemy', [{
    type: 'debuff',
    buffKind: 'attr',
    buffKey: 'debuff-sudu-down',
    attrKey: 'sudu',
    applyType: 'flat',
    value: 30,
    duration: 1,
  }])];

  const state = createState({
    attacker: [attacker],
    defender: [defenderA, defenderB],
  });
  const engine = new BattleEngine(state);

  engine.startBattle();

  assert.equal(defenderA.currentAttrs.sudu, 90, '减速光环应改写敌方当前速度');
  assert.equal(defenderB.currentAttrs.sudu, 80, '减速光环应对范围内所有敌人生效');
  assert.equal(engine.getState().currentTeam, 'attacker', '敌方被减速后应失去本回合先手');
  assert.equal(engine.getState().currentUnitId, attacker.id, '先手切换后应由攻击方首个可行动单位行动');
});
