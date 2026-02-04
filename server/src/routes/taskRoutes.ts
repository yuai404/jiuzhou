import { Router, Request, Response } from 'express';
import { verifyToken } from '../services/authService.js';
import {
  acceptTaskFromNpc,
  claimTaskReward,
  getCharacterIdByUserId,
  getBountyTaskOverview,
  getTaskOverview,
  npcTalk,
  setTaskTracked,
  submitTask,
  type TaskCategory,
} from '../services/taskService.js';
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

router.get('/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const category = typeof req.query.category === 'string' ? (req.query.category as TaskCategory) : undefined;
    const data = await getTaskOverview(characterId, category);
    return res.json({ success: true, message: 'ok', data });
  } catch (error) {
    console.error('获取任务概览失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/bounty/overview', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const data = await getBountyTaskOverview(characterId);
    return res.json({ success: true, message: 'ok', data });
  } catch (error) {
    console.error('获取悬赏任务概览失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/track', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { taskId?: unknown; tracked?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const tracked = body?.tracked === true;

    const result = await setTaskTracked(characterId, taskId, tracked);
    if (!result.success) return res.status(400).json(result);
    return res.json(result);
  } catch (error) {
    console.error('更新任务追踪失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/claim', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { taskId?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';

    const result = await claimTaskReward(userId, characterId, taskId);
    if (!result.success) return res.status(400).json(result);
    try {
      const gameServer = getGameServer();
      await gameServer.pushCharacterUpdate(userId);
    } catch {}
    return res.json(result);
  } catch (error) {
    console.error('领取任务奖励失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/npc/talk', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { npcId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const result = await npcTalk(characterId, npcId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('NPC对话失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/npc/accept', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { npcId?: unknown; taskId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await acceptTaskFromNpc(characterId, taskId, npcId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('NPC接取任务失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.post('/npc/submit', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterIdByUserId(userId);
    if (!characterId) return res.status(404).json({ success: false, message: '角色不存在' });

    const body = req.body as { npcId?: unknown; taskId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await submitTask(characterId, taskId, npcId);
    return res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error('NPC提交任务失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
