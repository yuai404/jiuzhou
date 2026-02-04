import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import { buyMonthCard, claimMonthCardReward, getMonthCardStatus, useMonthCardItem } from '../services/monthCardService.js';
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

  (req as AuthedRequest).userId = decoded.id;
  next();
};

const defaultMonthCardId = 'monthcard-001';

router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const monthCardId = typeof req.query.monthCardId === 'string' ? req.query.monthCardId : defaultMonthCardId;
    const result = await getMonthCardStatus(userId, monthCardId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取月卡状态接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/buy', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const body = req.body as { monthCardId?: unknown };
    const monthCardId = typeof body?.monthCardId === 'string' ? body.monthCardId : defaultMonthCardId;
    const result = await buyMonthCard(userId, monthCardId);
    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {}
    }
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('购买月卡接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/use-item', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const body = req.body as { monthCardId?: unknown; itemInstanceId?: unknown };
    const monthCardId = typeof body?.monthCardId === 'string' ? body.monthCardId : defaultMonthCardId;
    const itemInstanceId =
      typeof body?.itemInstanceId === 'number'
        ? body.itemInstanceId
        : typeof body?.itemInstanceId === 'string'
          ? Number(body.itemInstanceId)
          : undefined;
    const result = await useMonthCardItem(userId, monthCardId, { itemInstanceId });
    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {}
    }
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('使用月卡道具接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/claim', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const body = req.body as { monthCardId?: unknown };
    const monthCardId = typeof body?.monthCardId === 'string' ? body.monthCardId : defaultMonthCardId;
    const result = await claimMonthCardReward(userId, monthCardId);
    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {}
    }
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('领取月卡奖励接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
