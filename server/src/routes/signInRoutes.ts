import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import { doSignIn, getSignInOverview } from '../services/signInService.js';

const router = Router();

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

  (req as Request & { userId: number }).userId = decoded.id;
  next();
};

router.get('/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: number }).userId;
    const monthRaw = typeof req.query.month === 'string' ? req.query.month : '';
    const now = new Date();
    const fallbackMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = monthRaw || fallbackMonth;

    const result = await getSignInOverview(userId, month);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('获取签到信息接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/do', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: number }).userId;
    const result = await doSignIn(userId);
    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('签到接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
