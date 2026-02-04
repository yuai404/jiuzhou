import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  createDungeonInstance,
  getDungeonCategories,
  getDungeonInstance,
  getDungeonList,
  getDungeonPreview,
  joinDungeonInstance,
  nextDungeonInstance,
  startDungeonInstance,
  type DungeonType,
} from '../services/dungeonService.js';

const router = Router();

type AuthedRequest = Request & { userId: number };

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

const getOptionalUserId = (req: Request): number | undefined => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return undefined;
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'jiuzhou-secret') as { id: number };
    return decoded?.id;
  } catch {
    return undefined;
  }
};

const toType = (v: unknown): DungeonType | undefined => {
  if (v === 'material' || v === 'equipment' || v === 'trial' || v === 'challenge' || v === 'event') return v;
  return undefined;
};

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const categories = await getDungeonCategories();
    res.json({ success: true, data: { categories } });
  } catch (error) {
    console.error('获取秘境分类失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/list', async (req: Request, res: Response) => {
  try {
    const type = toType(req.query.type);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const realm = typeof req.query.realm === 'string' ? req.query.realm : undefined;
    const dungeons = await getDungeonList({ type, q, realm });
    res.json({ success: true, data: { dungeons } });
  } catch (error) {
    console.error('获取秘境列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/preview/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    const rankRaw = typeof req.query.rank === 'string' ? req.query.rank : Array.isArray(req.query.rank) ? req.query.rank[0] : '';
    const rank = rankRaw ? Number(rankRaw) : 1;
    const userId = getOptionalUserId(req);
    const preview = await getDungeonPreview(id, Number.isFinite(rank) ? rank : 1, userId);
    if (!preview) {
      res.status(404).json({ success: false, message: '秘境不存在' });
      return;
    }
    res.json({ success: true, data: preview });
  } catch (error) {
    console.error('获取秘境详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/instance/create', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const dungeonId = typeof req.body?.dungeonId === 'string' ? req.body.dungeonId : '';
    const difficultyRankRaw = req.body?.difficultyRank;
    const difficultyRank = typeof difficultyRankRaw === 'number' ? difficultyRankRaw : Number(difficultyRankRaw ?? 1);
    if (!dungeonId) {
      res.status(400).json({ success: false, message: '缺少秘境ID' });
      return;
    }
    const result = await createDungeonInstance(userId, dungeonId, Number.isFinite(difficultyRank) ? difficultyRank : 1);
    res.json(result);
  } catch (error) {
    console.error('创建秘境实例失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/instance/join', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : '';
    if (!instanceId) {
      res.status(400).json({ success: false, message: '缺少实例ID' });
      return;
    }
    const result = await joinDungeonInstance(userId, instanceId);
    res.json(result);
  } catch (error) {
    console.error('加入秘境实例失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/instance/start', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : '';
    if (!instanceId) {
      res.status(400).json({ success: false, message: '缺少实例ID' });
      return;
    }
    const result = await startDungeonInstance(userId, instanceId);
    res.json(result);
  } catch (error) {
    console.error('开始秘境失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/instance/next', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const instanceId = typeof req.body?.instanceId === 'string' ? req.body.instanceId : '';
    if (!instanceId) {
      res.status(400).json({ success: false, message: '缺少实例ID' });
      return;
    }
    const result = await nextDungeonInstance(userId, instanceId);
    res.json(result);
  } catch (error) {
    console.error('推进秘境失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/instance/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? idParam[0] : idParam;
    if (!id) {
      res.status(400).json({ success: false, message: '缺少实例ID' });
      return;
    }
    const result = await getDungeonInstance(userId, id);
    res.json(result);
  } catch (error) {
    console.error('获取秘境实例失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
