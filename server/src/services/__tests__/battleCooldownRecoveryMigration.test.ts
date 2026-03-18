import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_BATTLE_COOLDOWN_TIMING_MODE, migrateRecoveredLegacyBattleCooldownState } from '../../battle/utils/cooldown.js';
import type { BattleAttrs, BattleState, BattleUnit } from '../../battle/types.js';

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

const createUnit = (id: string, canAct: boolean = true): BattleUnit => {
  const attrs = createAttrs();
  return {
    id,
    name: id,
    type: 'player',
    sourceId: id,
    baseAttrs: { ...attrs },
    currentAttrs: { ...attrs },
    qixue: attrs.max_qixue,
    lingqi: attrs.max_lingqi,
    shields: [],
    buffs: [],
    marks: [],
    momentum: null,
    skills: [],
    skillCooldowns: {},
    skillCooldownDiscountBank: {},
    setBonusEffects: [],
    controlDiminishing: {},
    isAlive: true,
    canAct,
    stats: {
      damageDealt: 0,
      damageTaken: 0,
      healingDone: 0,
      healingReceived: 0,
      killCount: 0,
    },
  };
};

const createLegacyState = (): BattleState => {
  const attacker = createUnit('attacker-1');
  const defender = createUnit('defender-1');
  return {
    battleId: 'battle-recover-cooldown',
    battleType: 'pve',
    teams: {
      attacker: {
        odwnerId: 1,
        units: [attacker],
        totalSpeed: attacker.currentAttrs.sudu,
      },
      defender: {
        odwnerId: 2,
        units: [defender],
        totalSpeed: defender.currentAttrs.sudu,
      },
    },
    roundCount: 3,
    currentTeam: 'attacker',
    currentUnitId: 'attacker-1',
    phase: 'action',
    firstMover: 'attacker',
    logs: [],
    randomSeed: 1,
    randomIndex: 0,
  };
};

test('恢复旧战斗时，当前轮已行动过的单位冷却应先换算掉一次 round_start 递减', () => {
  const state = createLegacyState();
  state.currentTeam = 'defender';
  state.currentUnitId = 'defender-1';
  state.teams.attacker.units[0]!.skillCooldowns['skill-a'] = 1;

  migrateRecoveredLegacyBattleCooldownState(state);

  assert.equal(state.teams.attacker.units[0]!.skillCooldowns['skill-a'], undefined);
  assert.equal(state.cooldownTimingMode, ACTIVE_BATTLE_COOLDOWN_TIMING_MODE);
});

test('恢复旧战斗时，本轮尚未轮到的单位不应提前扣掉下一次 round_start 冷却', () => {
  const state = createLegacyState();
  state.teams.defender.units[0]!.skillCooldowns['skill-b'] = 1;

  migrateRecoveredLegacyBattleCooldownState(state);

  assert.equal(state.teams.defender.units[0]!.skillCooldowns['skill-b'], 1);
  assert.equal(state.cooldownTimingMode, ACTIVE_BATTLE_COOLDOWN_TIMING_MODE);
});
