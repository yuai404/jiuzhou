/**
 * 势能机制测试
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：验证“势”能在战斗技能里正确叠层、消耗，并把倍率加成施加到同次技能的伤害上。
 * 2) 不做什么：不覆盖完整 PVE/PVP 流程，也不测试前端展示。
 *
 * 输入/输出：
 * - 输入：构造后的 BattleState / BattleSkill / BattleUnit。
 * - 输出：技能执行结果、势层数变化与战斗日志中的势文案。
 *
 * 数据流/状态流：
 * momentum gain/consume skill -> executeSkill -> BattleUnit.momentum / ActionLog.targets。
 *
 * 关键边界条件与坑点：
 * 1) consume 必须按一次施法只消耗一次，不能因为多目标循环重复扣层。
 * 2) 势倍率应只影响本次技能后续效果，不应污染角色长期属性。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BattleSkill } from '../../battle/types.js';
import { executeSkill } from '../../battle/modules/skill.js';
import { decayUnitMomentumAtRoundEnd } from '../../battle/modules/momentum.js';
import { asActionLog, createState, createUnit } from './battleTestUtils.js';

test('势能技能应在施法后叠层并写入日志', () => {
  const caster = createUnit({ id: 'player-1', name: '剑修' });
  const target = createUnit({ id: 'monster-1', name: '木桩妖', type: 'monster' });
  const state = createState({ attacker: [caster], defender: [target] });

  const skill: BattleSkill = {
    id: 'skill-momentum-gain',
    name: '叠岳式',
    source: 'technique',
    sourceId: 'tech-test',
    cost: {},
    cooldown: 0,
    targetType: 'single_enemy',
    targetCount: 1,
    damageType: 'physical',
    element: 'none',
    effects: [
      {
        type: 'damage',
        valueType: 'flat',
        value: 30,
        damageType: 'true',
      },
      {
        type: 'momentum',
        momentumId: 'battle_momentum',
        operation: 'gain',
        gainStacks: 2,
        maxStacks: 5,
      },
    ],
    triggerType: 'active',
    aiPriority: 40,
  };

  const execution = executeSkill(state, caster, skill, [target.id]);
  assert.equal(execution.success, true);
  assert.equal(caster.momentum?.stacks, 2);

  const actionLog = asActionLog(execution.log);
  assert.deepEqual(actionLog.targets[0]?.momentumGained, ['势+2（当前2层）']);
});

test('势能 consume 应强化本次技能伤害并在回合结束衰减', () => {
  const caster = createUnit({ id: 'player-2', name: '刀修' });
  const target = createUnit({ id: 'monster-2', name: '木桩妖', type: 'monster' });
  caster.momentum = {
    id: 'battle_momentum',
    stacks: 2,
    maxStacks: 5,
  };
  const state = createState({ attacker: [caster], defender: [target] });

  const finisher: BattleSkill = {
    id: 'skill-momentum-consume',
    name: '断海斩',
    source: 'technique',
    sourceId: 'tech-test',
    cost: {},
    cooldown: 0,
    targetType: 'single_enemy',
    targetCount: 1,
    damageType: 'physical',
    element: 'none',
    effects: [
      {
        type: 'momentum',
        momentumId: 'battle_momentum',
        operation: 'consume',
        consumeMode: 'all',
        perStackRate: 0.25,
        bonusType: 'damage',
      },
      {
        type: 'damage',
        valueType: 'flat',
        value: 100,
        damageType: 'true',
      },
    ],
    triggerType: 'active',
    aiPriority: 80,
  };

  const execution = executeSkill(state, caster, finisher, [target.id]);
  assert.equal(execution.success, true);
  assert.equal(caster.momentum?.stacks, 0);

  const actionLog = asActionLog(execution.log);
  assert.deepEqual(actionLog.targets[0]?.momentumConsumed, ['消耗2层势（剩余0层）']);
  assert.equal(actionLog.targets[0]?.damage, 150);

  caster.momentum = {
    id: 'battle_momentum',
    stacks: 3,
    maxStacks: 5,
  };
  decayUnitMomentumAtRoundEnd(caster);
  assert.equal(caster.momentum?.stacks, 2);
});
