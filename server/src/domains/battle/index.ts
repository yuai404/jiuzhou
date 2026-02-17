/**
 * 战斗领域门面
 * 作用：为路由层提供稳定导入入口，内部实现仍由 services 承载。
 */
import {
  abandonBattle,
  autoBattle,
  getBattleState,
  recoverBattlesFromRedis,
  startDungeonPVEBattle,
  startPVEBattle,
  startPVPBattle,
  playerAction,
  isCharacterInBattle,
} from '../../services/battle/index.js';

export const battleService = {
  startPVEBattle,
  startDungeonPVEBattle,
  startPVPBattle,
  playerAction,
  autoBattle,
  getBattleState,
  abandonBattle,
  isCharacterInBattle,
  recoverBattlesFromRedis,
};

export * from '../../services/battle/index.js';
