/**
 * 九州修仙录 - 战斗路由
 */

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import battleService from '../services/battleService.js';

const router = Router();

type AuthedRequest = Request & { userId: number };

// 认证中间件
const authMiddleware = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: '未提供认证令牌' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jiuzhou-secret') as { id: number };
    (req as AuthedRequest).userId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ success: false, message: '无效的认证令牌' });
  }
};

/**
 * POST /api/battle/start
 * 发起PVE战斗
 */
router.post('/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { monsterIds } = req.body;
    
    if (!monsterIds || !Array.isArray(monsterIds) || monsterIds.length === 0) {
      return res.status(400).json({ success: false, message: '请指定战斗目标' });
    }
    
    if (monsterIds.length > 5) {
      return res.status(400).json({ success: false, message: '战斗目标数量超限' });
    }
    
    const result = await battleService.startPVEBattle(userId, monsterIds);
    
    return res.json(result);
  } catch (error) {
    console.error('发起战斗失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * POST /api/battle/action
 * 玩家行动
 */
router.post('/action', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { battleId, skillId, targetIds } = req.body;
    
    if (!battleId) {
      return res.status(400).json({ success: false, message: '缺少战斗ID' });
    }
    
    if (!skillId) {
      return res.status(400).json({ success: false, message: '缺少技能ID' });
    }
    
    const result = await battleService.playerAction(
      userId,
      battleId,
      skillId,
      targetIds || []
    );
    
    return res.json(result);
  } catch (error) {
    console.error('玩家行动失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * POST /api/battle/auto
 * 自动战斗（快速结算）
 */
router.post('/auto', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { monsterIds } = req.body;
    
    if (!monsterIds || !Array.isArray(monsterIds) || monsterIds.length === 0) {
      return res.status(400).json({ success: false, message: '请指定战斗目标' });
    }
    
    if (monsterIds.length > 5) {
      return res.status(400).json({ success: false, message: '战斗目标数量超限' });
    }
    
    const result = await battleService.autoBattle(userId, monsterIds);
    
    return res.json(result);
  } catch (error) {
    console.error('自动战斗失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * GET /api/battle/state/:battleId
 * 获取战斗状态
 */
router.get('/state/:battleId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const battleId = String(req.params.battleId || '');
    
    if (!battleId) {
      return res.status(400).json({ success: false, message: '缺少战斗ID' });
    }
    
    const result = await battleService.getBattleState(battleId);
    
    return res.json(result);
  } catch (error) {
    console.error('获取战斗状态失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * POST /api/battle/abandon
 * 放弃战斗
 */
router.post('/abandon', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const { battleId } = req.body;
    
    if (!battleId) {
      return res.status(400).json({ success: false, message: '缺少战斗ID' });
    }
    
    const result = await battleService.abandonBattle(userId, battleId);
    
    return res.json(result);
  } catch (error) {
    console.error('放弃战斗失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
