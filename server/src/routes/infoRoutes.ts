import { Router, Request, Response } from 'express';
import { withRouteError } from '../middleware/routeError.js';
import { getInfoTargetDetail } from '../services/infoTargetService.js';

const router = Router();

const isAllowedType = (value: string): value is 'npc' | 'monster' | 'item' | 'player' => {
  return value === 'npc' || value === 'monster' || value === 'item' || value === 'player';
};

router.get('/:type/:id', async (req: Request, res: Response) => {
  try {
    const typeParam = req.params.type;
    const idParam = req.params.id;
    const type = Array.isArray(typeParam) ? typeParam[0] : typeParam;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;

    if (!type || !id || !isAllowedType(type)) {
      res.status(400).json({ success: false, message: '参数错误' });
      return;
    }

    const target = await getInfoTargetDetail(type, id);
    if (!target) {
      res.status(404).json({ success: false, message: '对象不存在' });
      return;
    }

    res.json({ success: true, data: { target } });
  } catch (error) {
    return withRouteError(res, 'infoRoutes 路由异常', error);
  }
});

export default router;

