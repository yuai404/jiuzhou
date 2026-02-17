import { Router, Request, Response } from 'express';
import { withRouteError } from '../middleware/routeError.js';
import { getEnabledTechniqueDefs, getTechniqueDetailById } from '../services/techniqueService.js';
import { getSingleParam } from '../services/shared/httpParam.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const techniques = await getEnabledTechniqueDefs();
    res.json({ success: true, data: { techniques } });
  } catch (error) {
    return withRouteError(res, 'techniqueRoutes 路由异常', error);
  }
});

router.get('/:techniqueId', async (req: Request, res: Response) => {
  try {
    const techniqueId = getSingleParam(req.params.techniqueId);
    const detail = await getTechniqueDetailById(techniqueId);
    if (!detail) {
      res.status(404).json({ success: false, message: '未找到功法' });
      return;
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    return withRouteError(res, 'techniqueRoutes 路由异常', error);
  }
});

export default router;
