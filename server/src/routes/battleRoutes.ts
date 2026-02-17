import { Router, Request, Response } from 'express';
/**
 * 九州修仙录 - 战斗路由
 */

import { withRouteError } from '../middleware/routeError.js';
import { requireAuth } from '../middleware/auth.js';
import { battleService } from '../domains/battle/index.js';

const router = Router();

/**
 * POST /api/battle/start
 * 发起PVE战斗
 */
router.post('/start', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
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
    return withRouteError(res, 'battleRoutes 路由异常', error);
  }
});

/**
 * POST /api/battle/action
 * 玩家行动
 */
router.post('/action', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
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
    return withRouteError(res, 'battleRoutes 路由异常', error);
  }
});

/**
 * POST /api/battle/auto
 * 自动战斗（快速结算）
 */
router.post('/auto', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
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
    return withRouteError(res, 'battleRoutes 路由异常', error);
  }
});

/**
 * GET /api/battle/state/:battleId
 * 获取战斗状态
 */
router.get('/state/:battleId', requireAuth, async (req: Request, res: Response) => {
  try {
    const battleId = String(req.params.battleId || '');
    
    if (!battleId) {
      return res.status(400).json({ success: false, message: '缺少战斗ID' });
    }
    
    const result = await battleService.getBattleState(battleId);
    
    return res.json(result);
  } catch (error) {
    return withRouteError(res, 'battleRoutes 路由异常', error);
  }
});

/**
 * POST /api/battle/abandon
 * 放弃战斗
 */
router.post('/abandon', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { battleId } = req.body;
    
    if (!battleId) {
      return res.status(400).json({ success: false, message: '缺少战斗ID' });
    }
    
    const result = await battleService.abandonBattle(userId, battleId);
    
    return res.json(result);
  } catch (error) {
    return withRouteError(res, 'battleRoutes 路由异常', error);
  }
});

export default router;
