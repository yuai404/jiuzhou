/**
 * 九州修仙录 - 背包路由
 */
import { Router, Request, Response } from 'express';
import inventoryService, { InventoryLocation } from '../services/inventoryService.js';
import itemService from '../services/itemService.js';
import { query } from '../config/database.js';
import { verifyToken } from '../services/authService.js';
import { getGameServer } from '../game/GameServer.js';

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

const allowedLocations = ['bag', 'warehouse', 'equipped'] as const;
const allowedSlottedLocations = ['bag', 'warehouse'] as const;

const isAllowedLocation = (value: unknown): value is InventoryLocation =>
  typeof value === 'string' && (allowedLocations as readonly string[]).includes(value);

const isAllowedSlottedLocation = (value: unknown): value is (typeof allowedSlottedLocations)[number] =>
  typeof value === 'string' && (allowedSlottedLocations as readonly string[]).includes(value);

const QUALITY_RANK: Record<string, number> = { 黄: 1, 玄: 2, 地: 3, 天: 4 };
const QUALITY_MULTIPLIER_BY_RANK: Record<number, number> = { 1: 1, 2: 1.2, 3: 1.45, 4: 1.75 };

const getQualityMultiplier = (rank: number): number => QUALITY_MULTIPLIER_BY_RANK[rank] ?? 1;

const clampInt = (value: number, min: number, max: number): number => {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
};

const getStrengthenMultiplier = (strengthenLevel: number): number => {
  const lv = clampInt(strengthenLevel, 0, 15);
  return 1 + lv * 0.03;
};

const scaleAttrs = (attrs: unknown, factor: number): Record<string, number> => {
  const src = attrs && typeof attrs === 'object' ? (attrs as Record<string, unknown>) : {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src)) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    out[k] = Number.isFinite(factor) && factor !== 1 ? Math.round(n * factor) : n;
  }
  return out;
};

// 获取角色ID的辅助函数
const getCharacterId = async (userId: number): Promise<number | null> => {
  const result = await query(
    'SELECT id FROM characters WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
};

router.use(authMiddleware);

// ============================================
// 获取背包信息
// GET /api/inventory/info
// ============================================
router.get('/info', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const info = await inventoryService.getInventoryInfo(characterId);
    res.json({ success: true, data: info });
  } catch (error) {
    console.error('获取背包信息失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 获取背包物品列表
// GET /api/inventory/items?location=bag&page=1&pageSize=100
// ============================================
router.get('/items', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const locationQuery = req.query.location;
    const location = locationQuery === undefined ? 'bag' : locationQuery;
    if (!isAllowedLocation(location)) {
      return res.status(400).json({ success: false, message: 'location参数错误' });
    }
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 100, 200);
    
    const result = await inventoryService.getInventoryItems(characterId, location, page, pageSize);
    
    // 获取物品定义信息
    if (result.items.length > 0) {
      const itemDefIds = [...new Set(result.items.map(i => i.item_def_id))];
      const defResult = await query(
        `SELECT 
           id, name, icon, quality, quality_rank, category, sub_category, stack_max,
           description, long_desc, tags, effect_defs, base_attrs, equip_slot, use_type
         FROM item_def WHERE id = ANY($1)`,
        [itemDefIds]
      );
      
      const defMap = new Map(defResult.rows.map(d => [d.id, d]));
      const itemsWithDef = result.items.map((item: any) => {
        const def = defMap.get(item.item_def_id) as any;
        if (!def) return { ...item, def: undefined };

        if (def.category !== 'equipment') return { ...item, def };

        const resolvedQuality = typeof item.quality === 'string' && item.quality ? item.quality : def.quality;
        const resolvedRank =
          Number(item.quality_rank) ||
          QUALITY_RANK[resolvedQuality] ||
          Number(def.quality_rank) ||
          1;
        const defRank = Number(def.quality_rank) || QUALITY_RANK[def.quality] || 1;
        const attrFactor = getQualityMultiplier(resolvedRank) / getQualityMultiplier(defRank);
        const strengthenFactor = getStrengthenMultiplier(Number(item.strengthen_level) || 0);

        const mergedDef = {
          ...def,
          quality: resolvedQuality,
          quality_rank: resolvedRank,
          base_attrs: scaleAttrs(def.base_attrs, attrFactor * strengthenFactor),
        };

        return { ...item, def: mergedDef };
      });
      
      res.json({ 
        success: true, 
        data: { 
          items: itemsWithDef, 
          total: result.total,
          page,
          pageSize
        } 
      });
    } else {
      res.json({ 
        success: true, 
        data: { items: [], total: 0, page, pageSize } 
      });
    }
  } catch (error) {
    console.error('获取背包物品失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 移动物品
// POST /api/inventory/move
// ============================================
router.post('/move', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const { itemId, targetLocation, targetSlot } = req.body;
    
    if (itemId === undefined || targetLocation === undefined) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    if (!isAllowedSlottedLocation(targetLocation)) {
      return res.status(400).json({ success: false, message: 'targetLocation参数错误' });
    }

    const parsedTargetSlot =
      targetSlot === undefined || targetSlot === null ? undefined : Number(targetSlot);
    if (
      parsedTargetSlot !== undefined &&
      (!Number.isInteger(parsedTargetSlot) || parsedTargetSlot < 0)
    ) {
      return res.status(400).json({ success: false, message: 'targetSlot参数错误' });
    }
    
    const result = await inventoryService.moveItem(
      characterId,
      parsedItemId,
      targetLocation,
      parsedTargetSlot
    );
    
    res.json(result);
  } catch (error) {
    console.error('移动物品失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/use', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemId, itemInstanceId, instanceId, qty } = req.body as {
      itemId?: unknown;
      itemInstanceId?: unknown;
      instanceId?: unknown;
      qty?: unknown;
    };
    const rawInstanceId = itemInstanceId ?? instanceId ?? itemId;
    if (rawInstanceId === undefined || rawInstanceId === null) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(rawInstanceId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    const parsedQty = qty === undefined || qty === null ? 1 : Number(qty);
    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ success: false, message: 'qty参数错误' });
    }

    const result = await itemService.useItem(userId, characterId, parsedItemId, parsedQty);
    if (!result.success) {
      return res.json(result);
    }

    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {
    }

    return res.json({ ...result, data: { character: result.character } });
  } catch (error) {
    console.error('使用物品失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 穿戴装备
// POST /api/inventory/equip
// Body: { itemId: number }
// ============================================
router.post('/equip', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemId } = req.body;
    if (itemId === undefined || itemId === null) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    const result = await inventoryService.equipItem(characterId, userId, parsedItemId);
    if (!result.success) {
      return res.json(result);
    }

    const characterResult = await query('SELECT * FROM characters WHERE id = $1', [characterId]);
    const character = characterResult.rows.length > 0 ? characterResult.rows[0] : null;

    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {
    }

    return res.json({ ...result, data: { character } });
  } catch (error) {
    console.error('穿戴装备失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 卸下装备
// POST /api/inventory/unequip
// Body: { itemId: number, targetLocation?: 'bag' | 'warehouse' }
// ============================================
router.post('/unequip', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemId, targetLocation } = req.body;
    if (itemId === undefined || itemId === null) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    if (targetLocation !== undefined && !isAllowedSlottedLocation(targetLocation)) {
      return res.status(400).json({ success: false, message: 'targetLocation参数错误' });
    }

    const result = await inventoryService.unequipItem(characterId, parsedItemId, {
      targetLocation: targetLocation || 'bag',
    });
    if (!result.success) {
      return res.json(result);
    }

    const characterResult = await query('SELECT * FROM characters WHERE id = $1', [characterId]);
    const character = characterResult.rows.length > 0 ? characterResult.rows[0] : null;

    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {
    }

    return res.json({ ...result, data: { character } });
  } catch (error) {
    console.error('卸下装备失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 强化装备
// POST /api/inventory/enhance
// Body: { itemId: number }
// ============================================
router.post('/enhance', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemId } = req.body;
    if (itemId === undefined || itemId === null) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    const result = await inventoryService.enhanceEquipment(characterId, userId, parsedItemId);

    if (result.success) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {
      }
    }

    return res.json({
      success: result.success,
      message: result.message,
      data: {
        strengthenLevel: result.data?.strengthenLevel ?? 0,
        character: result.data?.character ?? null,
      },
    });
  } catch (error) {
    console.error('强化装备失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 分解装备
// POST /api/inventory/disassemble
// Body: { itemId: number }
// ============================================
router.post('/disassemble', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemId } = req.body;
    if (itemId === undefined || itemId === null) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    const result = await inventoryService.disassembleEquipment(characterId, userId, parsedItemId);
    return res.json(result);
  } catch (error) {
    console.error('分解装备失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 批量分解装备
// POST /api/inventory/disassemble/batch
// Body: { itemIds: number[] }
// ============================================
router.post('/disassemble/batch', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemIds } = req.body as { itemIds?: unknown };
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds参数错误' });
    }

    const parsedIds = itemIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    if (parsedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds参数错误' });
    }

    const result = await inventoryService.disassembleEquipmentBatch(characterId, userId, parsedIds);
    return res.json(result);
  } catch (error) {
    console.error('批量分解装备失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 丢弃/删除物品
// POST /api/inventory/remove
// ============================================
router.post('/remove', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const { itemId, qty } = req.body;
    
    if (itemId === undefined) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    const parsedQty = qty === undefined || qty === null ? 1 : Number(qty);
    if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
      return res.status(400).json({ success: false, message: 'qty参数错误' });
    }
    
    const result = await inventoryService.removeItemFromInventory(
      characterId,
      parsedItemId,
      parsedQty
    );
    
    res.json(result);
  } catch (error) {
    console.error('删除物品失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 批量丢弃/删除物品
// POST /api/inventory/remove/batch
// Body: { itemIds: number[] }
// ============================================
router.post('/remove/batch', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { itemIds } = req.body as { itemIds?: unknown };
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds参数错误' });
    }

    const parsedIds = itemIds.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    if (parsedIds.length === 0) {
      return res.status(400).json({ success: false, message: 'itemIds参数错误' });
    }

    const result = await inventoryService.removeItemsBatch(characterId, parsedIds);
    return res.json(result);
  } catch (error) {
    console.error('批量丢弃物品失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 整理背包
// POST /api/inventory/sort
// ============================================
router.post('/sort', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const { location } = req.body;
    const resolvedLocation = location === undefined || location === null ? 'bag' : location;
    if (!isAllowedSlottedLocation(resolvedLocation)) {
      return res.status(400).json({ success: false, message: 'location参数错误' });
    }
    const result = await inventoryService.sortInventory(characterId, resolvedLocation);
    
    res.json(result);
  } catch (error) {
    console.error('整理背包失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 扩容背包
// POST /api/inventory/expand
// ============================================
router.post('/expand', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const { location, expandSize } = req.body;

    const resolvedLocation = location === undefined || location === null ? 'bag' : location;
    if (!isAllowedSlottedLocation(resolvedLocation)) {
      return res.status(400).json({ success: false, message: 'location参数错误' });
    }

    const parsedExpandSize = expandSize === undefined || expandSize === null ? 10 : Number(expandSize);
    if (!Number.isInteger(parsedExpandSize) || parsedExpandSize <= 0 || parsedExpandSize > 1000) {
      return res.status(400).json({ success: false, message: 'expandSize参数错误' });
    }
    
    // TODO: 这里应该检查并消耗扩容道具
    const result = await inventoryService.expandInventory(
      characterId,
      resolvedLocation,
      parsedExpandSize
    );
    
    res.json(result);
  } catch (error) {
    console.error('扩容背包失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 锁定/解锁物品
// POST /api/inventory/lock
// ============================================
router.post('/lock', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    
    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }
    
    const { itemId, locked } = req.body;
    
    if (itemId === undefined || locked === undefined) {
      return res.status(400).json({ success: false, message: '参数不完整' });
    }

    const parsedItemId = Number(itemId);
    if (!Number.isInteger(parsedItemId) || parsedItemId <= 0) {
      return res.status(400).json({ success: false, message: 'itemId参数错误' });
    }

    if (typeof locked !== 'boolean') {
      return res.status(400).json({ success: false, message: 'locked参数错误' });
    }
    
    const result = await query(`
      UPDATE item_instance 
      SET locked = $1, updated_at = NOW()
      WHERE id = $2 AND owner_character_id = $3
      RETURNING id
    `, [locked, parsedItemId, characterId]);
    
    if (result.rows.length === 0) {
      return res.json({ success: false, message: '物品不存在' });
    }
    
    res.json({ success: true, message: locked ? '已锁定' : '已解锁' });
  } catch (error) {
    console.error('锁定物品失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
