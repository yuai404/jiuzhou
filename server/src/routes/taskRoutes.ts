import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requireCharacter } from '../middleware/auth.js';
import {
  acceptTaskFromNpc,
  claimTaskReward,
  getTaskOverview,
  getTaskOverviewSummary,
  npcTalk,
  setTaskTracked,
  submitTask,
  type TaskCategory,
} from '../domains/task/index.js';
import { safePushCharacterUpdate } from '../middleware/pushUpdate.js';
import { getSingleQueryValue } from '../services/shared/httpParam.js';
import { sendSuccess, sendResult } from '../middleware/response.js';
import { notifyTaskOverviewUpdate } from '../services/taskOverviewPush.js';

const router = Router();


router.get('/overview', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const categoryValue = getSingleQueryValue(req.query.category);
    const category = categoryValue ? (categoryValue as TaskCategory) : undefined;
    const data = await getTaskOverview(characterId, category);
    return sendSuccess(res, data);
}));

router.get('/overview/summary', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const categoryValue = getSingleQueryValue(req.query.category);
    const category = categoryValue ? (categoryValue as TaskCategory) : undefined;
    const data = await getTaskOverviewSummary(characterId, category);
    return sendSuccess(res, data);
}));

router.post('/track', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const body = req.body as { taskId?: unknown; tracked?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const tracked = body?.tracked === true;

    const result = await setTaskTracked(characterId, taskId, tracked);
    return sendResult(res, result);
}));

router.post('/claim', requireCharacter, asyncHandler(async (req, res) => {
    const userId = req.userId!;
    const characterId = req.characterId!;

    const body = req.body as { taskId?: unknown };
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';

    const result = await claimTaskReward(userId, characterId, taskId);
    if (!result.success) return sendResult(res, result);
    await safePushCharacterUpdate(userId);
    await notifyTaskOverviewUpdate(characterId, ['task']);
    return sendResult(res, result);
}));

router.post('/npc/talk', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const body = req.body as { npcId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const result = await npcTalk(characterId, npcId);
    return sendResult(res, result);
}));

router.post('/npc/accept', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const body = req.body as { npcId?: unknown; taskId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await acceptTaskFromNpc(characterId, taskId, npcId);
    if (result.success) {
      await notifyTaskOverviewUpdate(characterId, ['task']);
    }
    return sendResult(res, result);
}));

router.post('/npc/submit', requireCharacter, asyncHandler(async (req, res) => {
    const characterId = req.characterId!;

    const body = req.body as { npcId?: unknown; taskId?: unknown };
    const npcId = typeof body?.npcId === 'string' ? body.npcId : '';
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const result = await submitTask(characterId, taskId, npcId);
    if (result.success) {
      await notifyTaskOverviewUpdate(characterId, ['task']);
    }
    return sendResult(res, result);
}));

export default router;
