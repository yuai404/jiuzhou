import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine } from '../../battle/battleEngine.js';
import type { BattleAttrs, BattleSkill, BattleState, BattleUnit } from '../../battle/types.js';

const createAttrs = (): BattleAttrs => ({
  max_qixue: 1000,
  max_lingqi: 200,
  wugong: 120,
  fagong: 120,
  wufang: 80,
  fafang: 80,
  sudu: 100,
  mingzhong: 1,
  shanbi: 0,
  zhaojia: 0,
  baoji: 0,
  baoshang: 1.5,
  jianbaoshang: 0,
  jianfantan: 0,
  kangbao: 0,
  zengshang: 0,
  zhiliao: 0,
  jianliao: 0,
  xixue: 0,
  lengque: 0,
  kongzhi_kangxing: 0,
  jin_kangxing: 0,
  mu_kangxing: 0,
  shui_kangxing: 0,
  huo_kangxing: 0,
  tu_kangxing: 0,
  qixue_huifu: 0,
  lingqi_huifu: 0,
});

const createSkill = (id: string, cooldown: number): BattleSkill => ({
  id,
  name: id,
  triggerType: 'active',
  source: 'technique',
  cost: {
    lingqi: 0,
    lingqiRate: 0,
    qixue: 0,
    qixueRate: 0,
  },
  cooldown,
  targetType: 'self',
  targetCount: 1,
  damageType: undefined,
  element: 'none',
  effects: [],
  aiPriority: 100,
});

const createUnit = (id: string, name: string, skill: BattleSkill, speed: number): BattleUnit => {
  const attrs = createAttrs();
  attrs.sudu = speed;
  return {
    id,
    name,
    type: 'player',
    sourceId: Number(id.replace(/\D/g, '')) || 1,
    baseAttrs: { ...attrs },
    currentAttrs: { ...attrs },
    qixue: attrs.max_qixue,
    lingqi: attrs.max_lingqi,
    shields: [],
    buffs: [],
    marks: [],
    momentum: null,
    skills: [skill],
    skillCooldowns: {},
    skillCooldownDiscountBank: {},
    setBonusEffects: [],
    controlDiminishing: {},
    isAlive: true,
    canAct: true,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      healingDone: 0,
      healingReceived: 0,
      killCount: 0,
    },
  };
};

const createState = (skillCooldown: number): BattleState => {
  const attacker = createUnit('player-1', '甲', createSkill('skill-a', skillCooldown), 100);
  const defender = createUnit('player-2', '乙', createSkill('skill-b', 0), 80);
  return {
    battleId: 'battle-test-cooldown-turn',
    battleType: 'pve',
    phase: 'roundStart',
    roundCount: 0,
    currentTeam: 'attacker',
    firstMover: 'attacker',
    currentUnitId: null,
    result: undefined,
    logs: [],
    teams: {
      attacker: {
        odwnerId: 1,
        totalSpeed: attacker.currentAttrs.sudu,
        units: [attacker],
      },
      defender: {
        odwnerId: 2,
        totalSpeed: defender.currentAttrs.sudu,
        units: [defender],
      },
    },
    randomSeed: 1,
    randomIndex: 0,
  };
};

test('cooldown=1 会阻塞下一次自身行动，到再下一次自身行动前才解锁', () => {
  const state = createState(1);
  const engine = new BattleEngine(state);

  engine.startBattle();

  const firstAction = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(firstAction.success, true);
  assert.equal(state.teams.attacker.units[0].skillCooldowns['skill-a'], 1);
  assert.equal(state.roundCount, 1);
  assert.equal(state.currentTeam, 'defender');

  engine.aiAction(true);
  assert.equal(state.roundCount, 2);
  assert.equal(state.currentTeam, 'attacker');

  const blockedAction = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(blockedAction.success, false);
  assert.equal(blockedAction.error, '技能冷却中: 1回合');

  const normalAttack = engine.playerAction(1, 'skill-normal-attack', ['player-2']);
  assert.equal(normalAttack.success, true);
  assert.equal(state.teams.attacker.units[0].skillCooldowns['skill-a'], undefined);

  engine.aiAction(true);

  const thirdOwnTurn = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(thirdOwnTurn.success, true);
});

test('cooldown=2 会连续阻塞两次自身行动，第三次自身行动前才解锁', () => {
  const state = createState(2);
  const engine = new BattleEngine(state);

  engine.startBattle();

  const firstAction = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(firstAction.success, true);
  assert.equal(state.teams.attacker.units[0].skillCooldowns['skill-a'], 2);

  engine.aiAction(true);
  const secondOwnTurn = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(secondOwnTurn.success, false);
  assert.equal(secondOwnTurn.error, '技能冷却中: 2回合');

  engine.playerAction(1, 'skill-normal-attack', ['player-2']);
  assert.equal(state.teams.attacker.units[0].skillCooldowns['skill-a'], 1);
  engine.aiAction(true);

  const thirdOwnTurnBlocked = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(thirdOwnTurnBlocked.success, false);
  assert.equal(thirdOwnTurnBlocked.error, '技能冷却中: 1回合');

  engine.playerAction(1, 'skill-normal-attack', ['player-2']);
  assert.equal(state.teams.attacker.units[0].skillCooldowns['skill-a'], undefined);
  engine.aiAction(true);

  const fourthOwnTurn = engine.playerAction(1, 'skill-a', ['player-1']);
  assert.equal(fourthOwnTurn.success, true);
});
