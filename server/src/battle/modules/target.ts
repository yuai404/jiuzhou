/**
 * 九州修仙录 - 目标解析模块
 */

import type { BattleState, BattleUnit, BattleSkill } from '../types.js';
import { shuffle } from '../utils/random.js';
import { resolveSingleAllyTargetId } from '../utils/allyTargeting.js';
import { resolveTauntLockedTarget } from './control.js';

/**
 * 解析技能目标
 */
export function resolveTargets(
  state: BattleState,
  caster: BattleUnit,
  skill: BattleSkill,
  selectedTargetIds?: string[]
): BattleUnit[] {
  const isAttacker = state.teams.attacker.units.some(u => u.id === caster.id);
  const allies = isAttacker ? state.teams.attacker.units : state.teams.defender.units;
  const enemies = isAttacker ? state.teams.defender.units : state.teams.attacker.units;
  
  const aliveAllies = allies.filter(u => u.isAlive);
  const aliveEnemies = enemies.filter(u => u.isAlive);

  switch (skill.targetType) {
    case 'self':
      return [caster];
      
    case 'single_enemy':
      return resolveEnemyTargets(state, caster, skill, aliveEnemies, selectedTargetIds);
      
    case 'single_ally':
      return resolveSingleAlly(caster, skill, aliveAllies, selectedTargetIds);
      
    case 'all_enemy':
      return resolveEnemyTargets(state, caster, skill, aliveEnemies);
      
    case 'all_ally':
      return aliveAllies;
      
    case 'random_enemy':
      return resolveEnemyTargets(state, caster, skill, aliveEnemies);
      
    case 'random_ally':
      return resolveRandomTargets(state, aliveAllies, skill.targetCount);
      
    default:
      return [];
  }
}

/**
 * 解析敌方目标（统一处理嘲讽锁定）
 *
 * 作用：
 * - 集中处理所有敌方指向技能的目标解析，避免 single/all/random enemy 各自维护一套嘲讽判断。
 * - 在嘲讽生效时统一收敛为嘲讽者单目标，保证控制语义与技能描述一致。
 *
 * 输入/输出：
 * - 输入：战斗状态、施法者、技能定义、存活敌人列表，以及可选显式目标。
 * - 输出：最终命中的敌方目标列表；若没有可用敌人则返回空数组。
 *
 * 关键边界条件与坑点：
 * 1) 嘲讽优先级必须高于显式选敌、群攻和随机选敌，否则新控制会被 AoE/随机技能绕过。
 * 2) random_enemy 在嘲讽下也只能命中嘲讽者一次，不能继续按 targetCount 扩散到其他敌人。
 */
function resolveEnemyTargets(
  state: BattleState,
  caster: BattleUnit,
  skill: BattleSkill,
  enemies: BattleUnit[],
  selectedTargetIds?: string[]
): BattleUnit[] {
  const tauntTarget = resolveTauntLockedTarget(caster, enemies);
  if (tauntTarget) {
    return [tauntTarget];
  }

  switch (skill.targetType) {
    case 'single_enemy':
      return resolveSingleEnemy(enemies, selectedTargetIds);
    case 'all_enemy':
      return enemies;
    case 'random_enemy':
      return resolveRandomTargets(state, enemies, skill.targetCount);
    default:
      return [];
  }
}

/**
 * 解析单体敌方目标（不处理嘲讽）
 */
function resolveSingleEnemy(
  enemies: BattleUnit[],
  selectedTargetIds?: string[]
): BattleUnit[] {
  // 使用玩家选择的目标
  if (selectedTargetIds && selectedTargetIds.length > 0) {
    const target = enemies.find(e => e.id === selectedTargetIds[0]);
    if (target) {
      return [target];
    }
  }

  // 默认选择第一个存活敌人
  return enemies.length > 0 ? [enemies[0]] : [];
}

/**
 * 解析单体友方目标
 */
function resolveSingleAlly(
  caster: BattleUnit,
  skill: BattleSkill,
  allies: BattleUnit[],
  selectedTargetIds?: string[]
): BattleUnit[] {
  const targetId = resolveSingleAllyTargetId(caster, skill, allies, selectedTargetIds);
  if (!targetId) return [];
  const target = allies.find((ally) => ally.id === targetId);
  return target ? [target] : [];
}

/**
 * 解析随机目标
 */
function resolveRandomTargets(
  state: BattleState,
  candidates: BattleUnit[],
  count: number = 1
): BattleUnit[] {
  if (candidates.length === 0) return [];
  if (candidates.length <= count) return [...candidates];
  
  const shuffled = shuffle(state, candidates);
  return shuffled.slice(0, count);
}

/**
 * 获取最低血量目标
 */
export function getLowestHpTarget(units: BattleUnit[]): BattleUnit | undefined {
  const alive = units.filter(u => u.isAlive);
  if (alive.length === 0) return undefined;
  
  return alive.reduce((lowest, current) => {
    const lowestPercent = lowest.qixue / lowest.currentAttrs.max_qixue;
    const currentPercent = current.qixue / current.currentAttrs.max_qixue;
    return currentPercent < lowestPercent ? current : lowest;
  });
}

/**
 * 获取最高威胁目标（按输出伤害排序）
 */
export function getHighestThreatTarget(units: BattleUnit[]): BattleUnit | undefined {
  const alive = units.filter(u => u.isAlive);
  if (alive.length === 0) return undefined;
  
  return alive.reduce((highest, current) => {
    return current.stats.damageDealt > highest.stats.damageDealt ? current : highest;
  });
}

/**
 * 获取需要治疗的友方目标
 */
export function getHealTargets(allies: BattleUnit[], threshold: number = 0.7): BattleUnit[] {
  return allies.filter(u => {
    if (!u.isAlive) return false;
    const hpPercent = u.qixue / u.currentAttrs.max_qixue;
    return hpPercent < threshold;
  }).sort((a, b) => {
    const aPercent = a.qixue / a.currentAttrs.max_qixue;
    const bPercent = b.qixue / b.currentAttrs.max_qixue;
    return aPercent - bPercent;
  });
}

