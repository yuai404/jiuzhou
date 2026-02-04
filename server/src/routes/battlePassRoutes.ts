import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import { getBattlePassTasksOverview } from '../services/battlePassService.js';

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

router.get('/tasks', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const seasonId = typeof req.query.seasonId === 'string' ? req.query.seasonId : undefined;
    const data = await getBattlePassTasksOverview(userId, seasonId);
    return res.json({ success: true, message: 'ok', data });
  } catch (error) {
    console.error('获取战令任务失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;

