import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import { getArenaRanks, getRankOverview, getRealmRanks, getSectRanks, getWealthRanks } from '../services/rankService.js';

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
    const limitPlayers = typeof req.query.limitPlayers === 'string' ? Number(req.query.limitPlayers) : undefined;
    const limitSects = typeof req.query.limitSects === 'string' ? Number(req.query.limitSects) : undefined;
    const result = await getRankOverview(limitPlayers, limitSects);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取排行榜总览接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/realm', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getRealmRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取境界排行榜接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/sect', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getSectRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取宗门排行榜接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/wealth', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getWealthRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取财富排行榜接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/arena', async (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await getArenaRanks(limit);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取竞技场排行榜接口错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
