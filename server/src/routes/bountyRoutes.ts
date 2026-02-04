import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import { getCharacterIdByUserId } from '../services/taskService.js';
import { claimBounty, getBountyBoard, publishBounty, searchItemDefsForBounty, submitBountyMaterials } from '../services/bountyService.js';
import { getGameServer } from '../game/GameServer.js';

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

  (req as AuthedRequest).userId = decoded.id as number;
  next();
};

router.get('/board', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const pool = typeof req.query.pool === 'string' ? req.query.pool : 'daily';
    const resolvedPool = pool === 'all' || pool === 'player' || pool === 'daily' ? pool : 'daily';
    const result = await getBountyBoard(characterId, resolvedPool);
    if (!result.success) return res.status(400).json(result);
    return res.json({ success: true, message: 'ok', data: result.data });
  } catch (error) {
    console.error('获取悬赏榜单失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/claim', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { bountyInstanceId?: unknown };
    const bountyInstanceId = Number(body?.bountyInstanceId);
    const result = await claimBounty(characterId, bountyInstanceId);
    if (!result.success) return res.status(400).json(result);
    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {}
    return res.json(result);
  } catch (error) {
    console.error('接取悬赏失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/publish', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as {
      taskId?: unknown;
      title?: unknown;
      description?: unknown;
      claimPolicy?: unknown;
      maxClaims?: unknown;
      expiresAt?: unknown;
      spiritStonesReward?: unknown;
      silverReward?: unknown;
      requiredItems?: unknown;
    };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : undefined;
    const title = typeof body?.title === 'string' ? body.title : '';
    const description = typeof body?.description === 'string' ? body.description : undefined;
    const claimPolicy = typeof body?.claimPolicy === 'string' ? (body.claimPolicy as any) : undefined;
    const maxClaims = Number.isFinite(Number(body?.maxClaims)) ? Number(body.maxClaims) : undefined;
    const expiresAt = typeof body?.expiresAt === 'string' ? body.expiresAt : undefined;
    const spiritStonesReward = Number.isFinite(Number(body?.spiritStonesReward)) ? Number(body.spiritStonesReward) : undefined;
    const silverReward = Number.isFinite(Number(body?.silverReward)) ? Number(body.silverReward) : undefined;
    const requiredItems = Array.isArray(body?.requiredItems) ? (body.requiredItems as any[]) : undefined;

    const result = await publishBounty(characterId, {
      taskId,
      title,
      description,
      claimPolicy,
      maxClaims,
      expiresAt,
      spiritStonesReward,
      silverReward,
      requiredItems,
    });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('发布悬赏失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/items/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const keyword = typeof req.query.keyword === 'string' ? req.query.keyword : '';
    const limit = Number.isFinite(Number(req.query.limit)) ? Number(req.query.limit) : 20;
    const result = await searchItemDefsForBounty(keyword, limit);
    if (!result.success) return res.status(400).json(result);
    return res.json({ success: true, message: 'ok', data: result.data });
  } catch (error) {
    console.error('搜索物品失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/submit-materials', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { taskId?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await submitBountyMaterials(characterId, taskId);
    if (!result.success) return res.status(400).json(result);
    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {}
    return res.json(result);
  } catch (error) {
    console.error('提交悬赏材料失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
