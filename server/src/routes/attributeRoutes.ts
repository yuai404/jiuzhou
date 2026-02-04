/**
 * 属性加点路由
 */
import { Router, Request, Response } from 'express';
import { addAttributePoint, removeAttributePoint, batchAddPoints, resetAttributePoints } from '../services/attributeService.js';
import { verifyToken } from '../services/authService.js';
import { getGameServer } from '../game/GameServer.js';

const router = Router();

// 验证token中间件
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

// 单属性加点
router.post('/add', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: number }).userId;
    const { attribute, amount = 1 } = req.body;

    if (!attribute) {
      res.status(400).json({ success: false, message: '请指定属性类型' });
      return;
    }

    const result = await addAttributePoint(userId, attribute, amount);

    if (result.success) {
      // 推送角色更新
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {
        // 忽略
      }
    }

    res.json(result);
  } catch (error) {
    console.error('加点接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 单属性减点
router.post('/remove', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: number }).userId;
    const { attribute, amount = 1 } = req.body;

    if (!attribute) {
      res.status(400).json({ success: false, message: '请指定属性类型' });
      return;
    }

    const result = await removeAttributePoint(userId, attribute, amount);

    if (result.success) {
      // 推送角色更新
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {
        // 忽略
      }
    }

    res.json(result);
  } catch (error) {
    console.error('减点接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 批量加点
router.post('/batch', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: number }).userId;
    const { jing, qi, shen } = req.body;

    const result = await batchAddPoints(userId, { jing, qi, shen });

    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {
        // 忽略
      }
    }

    res.json(result);
  } catch (error) {
    console.error('批量加点接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 重置属性点
router.post('/reset', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { userId: number }).userId;
    const result = await resetAttributePoints(userId);

    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {
        // 忽略
      }
    }

    res.json(result);
  } catch (error) {
    console.error('重置属性点接口错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
