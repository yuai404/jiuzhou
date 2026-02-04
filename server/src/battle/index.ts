/**
 * 九州修仙录 - 战斗系统模块导出
 */

// 类型
export * from './types.js';

// 工具
export { 
  seededRandom,
  getNextRandom,
  getRandomInt,
  getRandomRange,
  rollChance,
  generateBattleSeed,
  randomPick,
  shuffle
} from './utils/random.js';

export {
  validateBattleState,
  validateBattleUnit,
  validateBattleAttrs,
  validateSkillUse,
  validateTargets,
  validateSkillConditions,
  validatePlayerAction,
  validateBattleResult
} from './utils/validation.js';

// 模块
export {
  calculateDamage,
  applyDamage,
  getDefenseConstant,
  isElementCounter,
  getElementResistance
} from './modules/damage.js';

export {
  calculateHealing,
  applyHealing,
  calculateLifesteal,
  applyLifesteal
} from './modules/healing.js';

export {
  addBuff,
  removeBuff,
  removeBuffByType,
  addShield,
  processRoundStartEffects,
  processRoundEndBuffs,
  calculateDotDamage,
  calculateHotHeal,
  recalculateUnitAttrs,
  hasHardControl
} from './modules/buff.js';

export {
  tryApplyControl,
  isStunned,
  isSilenced,
  isDisarmed,
  getTauntSource,
  isFeared,
  canUseSkill
} from './modules/control.js';

export {
  executeSkill,
  getNormalAttack,
  getAvailableSkills
} from './modules/skill.js';

export {
  resolveTargets,
  getLowestHpTarget,
  getHighestHpTarget,
  getHighestThreatTarget,
  getHealTargets,
  isValidTarget
} from './modules/target.js';

export {
  makeAIDecision,
  calculateSkillWeight
} from './modules/ai.js';

// 核心
export { BattleEngine } from './BattleEngine.js';

export {
  createPVEBattle,
  createPVPBattle,
  calculateRewards
} from './BattleFactory.js';

export type {
  CharacterData,
  MonsterData,
  SkillData
} from './BattleFactory.js';
