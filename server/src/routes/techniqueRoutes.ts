import { Router, Request, Response } from 'express';
import { getEnabledTechniqueDefs, getTechniqueDetailById } from '../services/techniqueService.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const techniques = await getEnabledTechniqueDefs();
    res.json({ success: true, data: { techniques } });
  } catch (error) {
    console.error('获取功法列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:techniqueId', async (req: Request, res: Response) => {
  try {
    const techniqueIdParam = req.params.techniqueId;
    const techniqueId = Array.isArray(techniqueIdParam) ? techniqueIdParam[0] : techniqueIdParam;
    const detail = await getTechniqueDetailById(techniqueId);
    if (!detail) {
      res.status(404).json({ success: false, message: '未找到功法' });
      return;
    }
    res.json({ success: true, data: detail });
  } catch (error) {
    console.error('获取功法详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
