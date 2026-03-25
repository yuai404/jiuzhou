import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireAuth } from '../middleware/auth.js';
import { BusinessError } from '../middleware/BusinessError.js';
import { runWithDatabaseAccessForbidden } from '../config/database.js';
import { sendResult } from '../middleware/response.js';
import { getSingleParam } from '../services/shared/httpParam.js';
import {
  advanceBattleSession,
  getCurrentBattleSessionDetail,
  getBattleSessionDetail,
  getBattleSessionDetailByBattleId,
  startDungeonBattleSession,
  startPVEBattleSession,
  startPVPBattleSession,
} from '../services/battleSession/index.js';

const router = Router();

router.get('/current', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  return sendResult(res, await getCurrentBattleSessionDetail(userId));
}));

router.post('/start', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const type = typeof req.body?.type === 'string' ? req.body.type : '';

  if (type === 'pve') {
    const monsterIds = Array.isArray(req.body?.monsterIds) ? req.body.monsterIds : [];
    if (monsterIds.length <= 0) {
      throw new BusinessError('请指定战斗目标');
    }
    return sendResult(res, await startPVEBattleSession(userId, monsterIds));
  }

  if (type === 'dungeon') {
    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : '';
    if (!instanceId) {
      throw new BusinessError('缺少秘境实例ID');
    }
    return sendResult(res, await startDungeonBattleSession(userId, instanceId));
  }

  if (type === 'pvp') {
    const opponentCharacterId = Number(req.body?.opponentCharacterId);
    const mode = req.body?.mode === 'arena' ? 'arena' : 'challenge';
    const battleId = typeof req.body?.battleId === 'string' ? req.body.battleId : undefined;
    if (!Number.isFinite(opponentCharacterId) || opponentCharacterId <= 0) {
      throw new BusinessError('对手参数错误');
    }
    return sendResult(res, await startPVPBattleSession({
      userId,
      opponentCharacterId: Math.floor(opponentCharacterId),
      battleId,
      mode,
    }));
  }

  throw new BusinessError('不支持的战斗会话类型');
}));

router.post('/:sessionId/advance', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const sessionId = getSingleParam(req.params.sessionId);
  if (!sessionId) {
    throw new BusinessError('缺少战斗会话ID');
  }
  return sendResult(
    res,
    await runWithDatabaseAccessForbidden(
      'api/battle-session/advance',
      async () => await advanceBattleSession(userId, sessionId),
    ),
  );
}));

router.get('/by-battle/:battleId', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const battleId = getSingleParam(req.params.battleId);
  if (!battleId) {
    throw new BusinessError('缺少战斗ID');
  }
  return sendResult(res, await getBattleSessionDetailByBattleId(userId, battleId));
}));

router.get('/:sessionId', requireAuth, asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const sessionId = getSingleParam(req.params.sessionId);
  if (!sessionId) {
    throw new BusinessError('缺少战斗会话ID');
  }
  return sendResult(res, await getBattleSessionDetail(userId, sessionId));
}));

export default router;
