import { Router, Request, Response } from 'express';
import { getGameTimeSnapshot } from '../services/gameTimeService.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const snap = getGameTimeSnapshot();
  if (!snap) {
    res.status(503).json({ success: false, message: '游戏时间未初始化' });
    return;
  }
  res.json({ success: true, message: 'ok', data: snap });
});

export default router;

