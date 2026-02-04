import { Router, Request, Response } from 'express';
import { getEnabledMaps, getMapDefById, getRoomInMap, getRoomsInMap, getWorldMap } from '../services/mapService.js';
import { getAreaObjects, getRoomObjects, gatherRoomResource, pickupRoomItem } from '../services/roomObjectService.js';
import { verifyToken } from '../services/authService.js';
import { query } from '../config/database.js';
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

  (req as AuthedRequest).userId = decoded.id as number;
  next();
};

const getCharacterId = async (userId: number): Promise<number | null> => {
  const result = await query('SELECT id FROM characters WHERE user_id = $1 LIMIT 1', [userId]);
  if (result.rows.length === 0) return null;
  const id = Number(result.rows[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

router.get('/world', async (_req: Request, res: Response) => {
  try {
    const data = await getWorldMap();
    res.json({ success: true, data });
  } catch (error) {
    console.error('获取世界地图失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/area/:area/objects', async (req: Request, res: Response) => {
  try {
    const areaParam = req.params.area;
    const area = (Array.isArray(areaParam) ? areaParam[0] : areaParam) as Parameters<typeof getAreaObjects>[0];
    const objects = await getAreaObjects(area);
    res.json({ success: true, data: { area, objects } });
  } catch (error) {
    console.error('获取区域对象失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/maps', async (_req: Request, res: Response) => {
  try {
    const maps = await getEnabledMaps();
    res.json({ success: true, data: { maps } });
  } catch (error) {
    console.error('获取地图列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:mapId', async (req: Request, res: Response) => {
  try {
    const mapIdParam = req.params.mapId;
    const mapId = Array.isArray(mapIdParam) ? mapIdParam[0] : mapIdParam;
    const map = await getMapDefById(mapId);
    if (!map || map.enabled !== true) {
      res.status(404).json({ success: false, message: '地图不存在' });
      return;
    }
    const rooms = await getRoomsInMap(mapId);
    res.json({ success: true, data: { map, rooms } });
  } catch (error) {
    console.error('获取地图详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:mapId/rooms/:roomId', async (req: Request, res: Response) => {
  try {
    const mapIdParam = req.params.mapId;
    const roomIdParam = req.params.roomId;
    const mapId = Array.isArray(mapIdParam) ? mapIdParam[0] : mapIdParam;
    const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
    const room = await getRoomInMap(mapId, roomId);
    if (!room) {
      res.status(404).json({ success: false, message: '房间不存在' });
      return;
    }
    res.json({ success: true, data: { mapId, room } });
  } catch (error) {
    console.error('获取房间详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/:mapId/rooms/:roomId/objects', async (req: Request, res: Response) => {
  try {
    const mapIdParam = req.params.mapId;
    const roomIdParam = req.params.roomId;
    const mapId = Array.isArray(mapIdParam) ? mapIdParam[0] : mapIdParam;
    const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
    const authHeader = req.headers.authorization;
    let userId: number | undefined = undefined;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { valid, decoded } = verifyToken(token);
      const decodedId = decoded?.id;
      const parsedId =
        typeof decodedId === 'number' ? decodedId : typeof decodedId === 'string' ? Number(decodedId) : NaN;
      if (valid && Number.isFinite(parsedId)) {
        userId = parsedId;
      }
    }

    const objects = await getRoomObjects(mapId, roomId, userId);
    res.json({ success: true, data: { mapId, roomId, objects } });
  } catch (error) {
    console.error('获取房间对象失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:mapId/rooms/:roomId/resources/:resourceId/gather', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mapIdParam = req.params.mapId;
    const roomIdParam = req.params.roomId;
    const resourceIdParam = req.params.resourceId;
    const mapId = Array.isArray(mapIdParam) ? mapIdParam[0] : mapIdParam;
    const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
    const resourceId = Array.isArray(resourceIdParam) ? resourceIdParam[0] : resourceIdParam;
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const result = await gatherRoomResource({ mapId, roomId, resourceId, userId, characterId });

    const didGain = Boolean(result.success && result.data && typeof result.data.qty === 'number' && result.data.qty > 0);
    if (didGain) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {}
    }

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('采集资源接口失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/:mapId/rooms/:roomId/items/:itemDefId/pickup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const mapIdParam = req.params.mapId;
    const roomIdParam = req.params.roomId;
    const itemDefIdParam = req.params.itemDefId;
    const mapId = Array.isArray(mapIdParam) ? mapIdParam[0] : mapIdParam;
    const roomId = Array.isArray(roomIdParam) ? roomIdParam[0] : roomIdParam;
    const itemDefId = Array.isArray(itemDefIdParam) ? itemDefIdParam[0] : itemDefIdParam;
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const result = await pickupRoomItem({ mapId, roomId, itemDefId, userId, characterId });

    const didGain = Boolean(result.success && result.data && typeof result.data.qty === 'number' && result.data.qty > 0);
    if (didGain) {
      try {
        const gameServer = getGameServer();
        await gameServer.pushCharacterUpdate(userId);
      } catch {}
    }

    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('拾取房间物品接口失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
