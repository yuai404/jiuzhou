/**
 * 嘲讽敌方目标解析回归测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：验证嘲讽对所有敌方目标型技能统一生效，避免群攻/随机敌方技能绕过强制目标。
 * - 不做什么：不覆盖前端提示文案，不验证 AI 选技优先级，只锁定服务端 executeSkill -> target.ts 的目标落点。
 *
 * 输入/输出：
 * - 输入：带有 taunt debuff 的施法者、不同 targetType 的敌方技能、两名存活敌人。
 * - 输出：技能执行结果、action 日志目标列表，以及实际受击单位的气血变化。
 *
 * 数据流/状态流：
 * - 测试用例 -> executeSkill -> resolveTargets -> resolveEnemyTargets -> executeSkillOnTarget。
 * - 通过 battleTestUtils 统一生成单位与战斗状态，避免每个用例重复拼基础属性与日志容器。
 *
 * 关键边界条件与坑点：
 * 1) taunt 必须先于 all_enemy/random_enemy 的默认分支生效，否则群攻和随机技能会绕过控制。
 * 2) random_enemy 在被嘲讽时也只能命中嘲讽者一次，不能保留 targetCount 再额外命中其他敌人。
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeSkill } from '../../battle/modules/skill.js';
import type { BattleSkill, ActiveBuff } from '../../battle/types.js';
import { asActionLog, createState, createUnit } from './battleTestUtils.js';

function createTauntedEnemySkill(targetType: BattleSkill['targetType'], targetCount: number): BattleSkill {
  return {
    id: `skill-taunt-target-${targetType}`,
    name: `嘲讽目标测试-${targetType}`,
    source: 'technique',
    sourceId: 'tech-test',
    cost: {},
    cooldown: 0,
    targetType,
    targetCount,
    damageType: 'magic',
    element: 'shui',
    effects: [
      {
        type: 'damage',
        valueType: 'flat',
        value: 180,
      },
    ],
    triggerType: 'active',
    aiPriority: 50,
  };
}

function createTauntBuff(sourceUnitId: string): ActiveBuff {
  return {
    id: `control-taunt-${sourceUnitId}`,
    buffDefId: 'control-taunt',
    name: '嘲讽',
    type: 'debuff',
    category: 'control',
    sourceUnitId,
    maxStacks: 1,
    control: 'taunt',
    tags: ['soft_control', 'taunt'],
    dispellable: true,
    remainingDuration: 2,
    stacks: 1,
  };
}

test('被嘲讽时，全体敌方技能应只命中嘲讽者', () => {
  const caster = createUnit({ id: 'monster-1', name: '被控妖物', type: 'monster' });
  const taunter = createUnit({ id: 'player-1', name: '镇岳修士' });
  const teammate = createUnit({ id: 'player-2', name: '队友' });
  const skill = createTauntedEnemySkill('all_enemy', 2);
  caster.skills = [skill];
  caster.buffs = [createTauntBuff(taunter.id)];

  const state = createState({
    attacker: [taunter, teammate],
    defender: [caster],
  });

  const result = executeSkill(state, caster, skill);
  assert.equal(result.success, true);

  const actionLog = asActionLog(result.log);
  assert.deepEqual(actionLog.targets.map((entry) => entry.targetId), [taunter.id]);
  assert.ok(taunter.qixue < taunter.currentAttrs.max_qixue, '嘲讽者应实际受到伤害');
  assert.equal(teammate.qixue, teammate.currentAttrs.max_qixue, '其他单位不应再被群攻波及');
});

test('被嘲讽时，随机敌方技能应只命中嘲讽者一次', () => {
  const caster = createUnit({ id: 'monster-2', name: '被控妖物', type: 'monster' });
  const taunter = createUnit({ id: 'player-3', name: '镇岳修士' });
  const teammate = createUnit({ id: 'player-4', name: '队友' });
  const skill = createTauntedEnemySkill('random_enemy', 2);
  caster.skills = [skill];
  caster.buffs = [createTauntBuff(taunter.id)];

  const state = createState({
    attacker: [taunter, teammate],
    defender: [caster],
  });

  const result = executeSkill(state, caster, skill);
  assert.equal(result.success, true);

  const actionLog = asActionLog(result.log);
  assert.deepEqual(actionLog.targets.map((entry) => entry.targetId), [taunter.id]);
  assert.ok(taunter.qixue < taunter.currentAttrs.max_qixue, '嘲讽者应实际受到伤害');
  assert.equal(teammate.qixue, teammate.currentAttrs.max_qixue, '随机敌方技能不应再抽到其他目标');
});
