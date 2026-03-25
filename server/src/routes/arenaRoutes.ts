import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import { canChallengeToday, getArenaOpponents, getArenaRecords, getArenaStatus } from '../services/arenaService.js';
import { startPVPBattleSession } from '../services/battleSession/index.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { BusinessError } from '../middleware/BusinessError.js';
import { getSingleQueryValue, parsePositiveInt } from '../services/shared/httpParam.js';
import { getOnlineBattleCharacterSnapshotByCharacterId } from '../services/onlineBattleProjectionService.js';

const router = Router();

router.use(requireCharacter);

router.get('/status', asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;
  const result = await getArenaStatus(characterId);
  return sendResult(res, result);
}));

router.get('/opponents', asyncHandler(async (req, res) => {
  const characterId = req.characterId!;
  const limit = parsePositiveInt(getSingleQueryValue(req.query.limit)) ?? 10;
  const result = await getArenaOpponents(characterId, limit);
  return sendResult(res, result);
}));

router.get('/records', asyncHandler(async (req, res) => {
  const characterId = req.characterId!;
  const limit = parsePositiveInt(getSingleQueryValue(req.query.limit)) ?? 50;
  const result = await getArenaRecords(characterId, limit);
  return sendResult(res, result);
}));

router.post('/challenge', asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const opponentCharacterId = parsePositiveInt((req.body as { opponentCharacterId?: unknown })?.opponentCharacterId);
  if (!opponentCharacterId) {
    throw new BusinessError('对手参数错误');
  }
  if (opponentCharacterId === characterId) {
    throw new BusinessError('不能挑战自己');
  }

  const limitResult = await canChallengeToday(characterId);
  if (!limitResult.allowed) {
    throw new BusinessError('今日挑战次数已用完');
  }

  const opponentSnapshot = await getOnlineBattleCharacterSnapshotByCharacterId(opponentCharacterId);
  if (!opponentSnapshot) {
    throw new BusinessError('对手不存在', 404);
  }

  const battleId = `arena-battle-${characterId}-${opponentCharacterId}-${Date.now()}`;
  const startRes = await startPVPBattleSession({
    userId,
    opponentCharacterId,
    battleId,
    mode: 'arena',
  });
  if (!startRes.success || !startRes.data?.session.currentBattleId) return sendResult(res, startRes);

  return sendSuccess(res, { battleId, session: startRes.data.session });
}));

router.post('/match', asyncHandler(async (req, res) => {
  const userId = req.userId!;
  const characterId = req.characterId!;

  const limitResult = await canChallengeToday(characterId);
  if (!limitResult.allowed) {
    throw new BusinessError('今日挑战次数已用完');
  }

  const oppRes = await getArenaOpponents(characterId, 20);
  if (!oppRes.success) return sendResult(res, oppRes);
  const list = oppRes.data ?? [];
  if (list.length === 0) throw new BusinessError('暂无可匹配对手');

  const pick = list[0];
  const opponentCharacterId = Number(pick.id);
  if (!Number.isFinite(opponentCharacterId) || opponentCharacterId <= 0) {
    throw new BusinessError('匹配对手异常');
  }

  const battleId = `arena-battle-${characterId}-${opponentCharacterId}-${Date.now()}`;
  const startRes = await startPVPBattleSession({
    userId,
    opponentCharacterId,
    battleId,
    mode: 'arena',
  });
  if (!startRes.success || !startRes.data?.session.currentBattleId) return sendResult(res, startRes);

  return sendSuccess(res, {
    battleId,
    session: startRes.data.session,
    opponent: { id: pick.id, name: pick.name, realm: pick.realm, power: pick.power, score: pick.score },
  });
}));

export default router;
