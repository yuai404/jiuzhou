import { Router, Request, Response } from 'express';
import { query } from '../config/database.js';
import { verifyToken } from '../services/authService.js';
import {
  buyMarketListing,
  cancelMarketListing,
  createMarketListing,
  getMarketListings,
  getMarketTradeRecords,
  getMyMarketListings,
  type MarketSort,
} from '../services/marketService.js';

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

const getCharacterId = async (userId: number): Promise<number | null> => {
  const result = await query('SELECT id FROM characters WHERE user_id = $1', [userId]);
  return result.rows.length > 0 ? Number(result.rows[0].id) : null;
};

const parseQueryNumber = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
};

router.use(authMiddleware);

router.get('/listings', async (req: Request, res: Response) => {
  try {
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const quality = typeof req.query.quality === 'string' ? req.query.quality : undefined;
    const queryText = typeof req.query.query === 'string' ? req.query.query : undefined;
    const sort = typeof req.query.sort === 'string' ? (req.query.sort as MarketSort) : undefined;
    const minPrice = parseQueryNumber(req.query.minPrice);
    const maxPrice = parseQueryNumber(req.query.maxPrice);
    const page = parseQueryNumber(req.query.page);
    const pageSize = parseQueryNumber(req.query.pageSize);

    const result = await getMarketListings({
      category,
      quality,
      query: queryText,
      sort,
      minPrice,
      maxPrice,
      page,
      pageSize,
    });

    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('获取坊市列表失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/my-listings', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const page = parseQueryNumber(req.query.page);
    const pageSize = parseQueryNumber(req.query.pageSize);

    const result = await getMyMarketListings({ characterId, status, page, pageSize });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('获取我的上架失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/records', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const page = parseQueryNumber(req.query.page);
    const pageSize = parseQueryNumber(req.query.pageSize);
    const result = await getMarketTradeRecords({ characterId, page, pageSize });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('获取交易记录失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/list', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const { itemInstanceId, qty, unitPriceSpiritStones } = req.body as {
      itemInstanceId?: unknown;
      qty?: unknown;
      unitPriceSpiritStones?: unknown;
    };

    const result = await createMarketListing({
      userId,
      characterId,
      itemInstanceId: Number(itemInstanceId),
      qty: Number(qty),
      unitPriceSpiritStones: Number(unitPriceSpiritStones),
    });

    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('物品上架失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const { listingId } = req.body as { listingId?: unknown };
    const result = await cancelMarketListing({ userId, characterId, listingId: Number(listingId) });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('下架失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/buy', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const { listingId } = req.body as { listingId?: unknown };
    const result = await buyMarketListing({ buyerUserId: userId, buyerCharacterId: characterId, listingId: Number(listingId) });
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('购买失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;

