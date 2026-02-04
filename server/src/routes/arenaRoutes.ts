import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { verifyToken } from '../services/authService.js';
import { canChallengeToday, getArenaOpponents, getArenaRecords, getArenaStatus } from '../services/arenaService.js';
import { startPVPBattle } from '../services/battleService.js';

const router = Router();

type AuthedRequest = Request & { userId: number };

const authMiddleware = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const { valid, decoded } = verifyToken(token);

  if (!valid || !decoded) {
    res.status(401).json({ success: false, message: '登录已过期' });
    return;
  }

  (req as AuthedRequest).userId = decoded.id;
  next();
};

const getCharacterIdByUserId = async (userId: number): Promise<number | null> => {
  const uid = Number(userId);
  if (!Number.isFinite(uid) || uid <= 0) return null;
  const res = await query('SELECT id FROM characters WHERE user_id = $1 LIMIT 1', [uid]);
  const characterId = Number(res.rows?.[0]?.id);
  return Number.isFinite(characterId) && characterId > 0 ? characterId : null;
};

router.use(authMiddleware);

router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });
    const result = await getArenaStatus(characterId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取竞技场状态接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/opponents', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getArenaOpponents(characterId, Number.isFinite(limit as number) ? (limit as number) : 10);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取竞技场对手接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/records', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getArenaRecords(characterId, Number.isFinite(limit as number) ? (limit as number) : 50);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取竞技场战报接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/challenge', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const opponentCharacterId = Number((req.body as { opponentCharacterId?: unknown })?.opponentCharacterId);
    if (!Number.isFinite(opponentCharacterId) || opponentCharacterId <= 0) {
      return res.status(400).json({ success: false, message: '对手参数错误' });
    }
    if (opponentCharacterId === characterId) {
      return res.status(400).json({ success: false, message: '不能挑战自己' });
    }

    const limitResult = await canChallengeToday(characterId);
    if (!limitResult.allowed) {
      return res.status(400).json({ success: false, message: '今日挑战次数已用完' });
    }

    const existsRes = await query('SELECT id FROM characters WHERE id = $1 LIMIT 1', [opponentCharacterId]);
    if (existsRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: '对手不存在' });
    }

    const battleId = `arena-battle-${characterId}-${opponentCharacterId}-${Date.now()}`;
    const startRes = await startPVPBattle(userId, opponentCharacterId, battleId);
    if (!startRes.success || !startRes.data?.battleId) return res.status(400).json(startRes);

    await query(
      `
        INSERT INTO arena_battle(battle_id, challenger_character_id, opponent_character_id, status)
        VALUES ($1, $2, $3, 'running')
        ON CONFLICT (battle_id) DO NOTHING
      `,
      [battleId, characterId, opponentCharacterId]
    );

    return res.json({ success: true, message: 'ok', data: { battleId } });
  } catch (error) {
    console.error('发起竞技场挑战接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/match', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const limitResult = await canChallengeToday(characterId);
    if (!limitResult.allowed) {
      return res.status(400).json({ success: false, message: '今日挑战次数已用完' });
    }

    const oppRes = await getArenaOpponents(characterId, 20);
    if (!oppRes.success) return res.status(400).json(oppRes);
    const list = oppRes.data ?? [];
    if (list.length === 0) return res.status(400).json({ success: false, message: '暂无可匹配对手' });

    const pick = list[Math.floor(Math.random() * list.length)];
    const opponentCharacterId = Number(pick.id);
    if (!Number.isFinite(opponentCharacterId) || opponentCharacterId <= 0) {
      return res.status(400).json({ success: false, message: '匹配对手异常' });
    }

    const battleId = `arena-battle-${characterId}-${opponentCharacterId}-${Date.now()}`;
    const startRes = await startPVPBattle(userId, opponentCharacterId, battleId);
    if (!startRes.success || !startRes.data?.battleId) return res.status(400).json(startRes);

    await query(
      `
        INSERT INTO arena_battle(battle_id, challenger_character_id, opponent_character_id, status)
        VALUES ($1, $2, $3, 'running')
        ON CONFLICT (battle_id) DO NOTHING
      `,
      [battleId, characterId, opponentCharacterId]
    );

    return res.json({
      success: true,
      message: 'ok',
      data: { battleId, opponent: { id: pick.id, name: pick.name, realm: pick.realm, power: pick.power, score: pick.score } },
    });
  } catch (error) {
    console.error('竞技场匹配接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;

