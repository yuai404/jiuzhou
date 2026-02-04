import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import { breakthroughToNextRealm, breakthroughToTargetRealm, getRealmOverview } from '../services/realmService.js';
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

router.use(authMiddleware);

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const result = await getRealmOverview(userId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取境界信息接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/breakthrough', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const body = (req.body ?? {}) as { direction?: unknown; targetRealm?: unknown };
    const targetRealm = typeof body.targetRealm === 'string' ? body.targetRealm : '';
    const direction = typeof body.direction === 'string' ? body.direction : '';

    const result = targetRealm
      ? await breakthroughToTargetRealm(userId, targetRealm)
      : direction === 'next' || !direction
        ? await breakthroughToNextRealm(userId)
        : { success: false, message: '突破方向无效' };

    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {
        // 忽略
      }
    }

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('境界突破接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;

