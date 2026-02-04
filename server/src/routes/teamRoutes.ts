/**
 * 九州修仙录 - 组队系统路由
 */
import { Router, Request, Response } from 'express';
import {
  getCharacterTeam,
  createTeam,
  disbandTeam,
  leaveTeam,
  applyToTeam,
  getTeamApplications,
  handleApplication,
  kickMember,
  transferLeader,
  updateTeamSettings,
  getNearbyTeams,
  getLobbyTeams,
  inviteToTeam,
  getReceivedInvitations,
  handleInvitation,
  getTeamById
} from '../services/teamService.js';

const router = Router();

// 获取角色当前队伍
router.get('/my', async (req: Request, res: Response) => {
  try {
    const characterId = parseInt(req.query.characterId as string);
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getCharacterTeam(characterId);
    res.json(result);
  } catch (error) {
    console.error('获取队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取队伍详情
router.get('/:teamId', async (req: Request, res: Response) => {
  try {
    const teamId = String(req.params.teamId);
    const result = await getTeamById(teamId);
    res.json(result);
  } catch (error) {
    console.error('获取队伍详情失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});


// 创建队伍
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { characterId, name, goal } = req.body;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await createTeam(characterId, name, goal);
    res.json(result);
  } catch (error) {
    console.error('创建队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 解散队伍
router.post('/disband', async (req: Request, res: Response) => {
  try {
    const { characterId, teamId } = req.body;
    if (!characterId || !teamId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await disbandTeam(characterId, teamId);
    res.json(result);
  } catch (error) {
    console.error('解散队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 离开队伍
router.post('/leave', async (req: Request, res: Response) => {
  try {
    const { characterId } = req.body;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await leaveTeam(characterId);
    res.json(result);
  } catch (error) {
    console.error('离开队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 申请加入队伍
router.post('/apply', async (req: Request, res: Response) => {
  try {
    const { characterId, teamId, message } = req.body;
    if (!characterId || !teamId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await applyToTeam(characterId, teamId, message);
    res.json(result);
  } catch (error) {
    console.error('申请加入队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取队伍申请列表
router.get('/applications/:teamId', async (req: Request, res: Response) => {
  try {
    const teamId = String(req.params.teamId);
    const characterId = parseInt(req.query.characterId as string);
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getTeamApplications(teamId, characterId);
    res.json(result);
  } catch (error) {
    console.error('获取申请列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 处理入队申请
router.post('/application/handle', async (req: Request, res: Response) => {
  try {
    const { characterId, applicationId, approve } = req.body;
    if (!characterId || !applicationId || approve === undefined) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await handleApplication(characterId, applicationId, approve);
    res.json(result);
  } catch (error) {
    console.error('处理申请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 踢出成员
router.post('/kick', async (req: Request, res: Response) => {
  try {
    const { leaderId, targetCharacterId } = req.body;
    if (!leaderId || !targetCharacterId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await kickMember(leaderId, targetCharacterId);
    res.json(result);
  } catch (error) {
    console.error('踢出成员失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 转让队长
router.post('/transfer', async (req: Request, res: Response) => {
  try {
    const { currentLeaderId, newLeaderId } = req.body;
    if (!currentLeaderId || !newLeaderId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await transferLeader(currentLeaderId, newLeaderId);
    res.json(result);
  } catch (error) {
    console.error('转让队长失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新队伍设置
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const { characterId, teamId, settings } = req.body;
    if (!characterId || !teamId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await updateTeamSettings(characterId, teamId, settings);
    res.json(result);
  } catch (error) {
    console.error('更新设置失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取附近队伍
router.get('/nearby/list', async (req: Request, res: Response) => {
  try {
    const characterId = parseInt(req.query.characterId as string);
    const mapId = req.query.mapId as string | undefined;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getNearbyTeams(characterId, mapId);
    res.json(result);
  } catch (error) {
    console.error('获取附近队伍失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取队伍大厅
router.get('/lobby/list', async (req: Request, res: Response) => {
  try {
    const characterId = parseInt(req.query.characterId as string);
    const search = req.query.search as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getLobbyTeams(characterId, search, limit);
    res.json(result);
  } catch (error) {
    console.error('获取队伍大厅失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 邀请玩家入队
router.post('/invite', async (req: Request, res: Response) => {
  try {
    const { inviterId, inviteeId, message } = req.body;
    if (!inviterId || !inviteeId) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await inviteToTeam(inviterId, inviteeId, message);
    res.json(result);
  } catch (error) {
    console.error('邀请入队失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取收到的邀请
router.get('/invitations/received', async (req: Request, res: Response) => {
  try {
    const characterId = parseInt(req.query.characterId as string);
    if (!characterId) {
      return res.status(400).json({ success: false, message: '缺少角色ID' });
    }
    const result = await getReceivedInvitations(characterId);
    res.json(result);
  } catch (error) {
    console.error('获取邀请列表失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 处理入队邀请
router.post('/invitation/handle', async (req: Request, res: Response) => {
  try {
    const { characterId, invitationId, accept } = req.body;
    if (!characterId || !invitationId || accept === undefined) {
      return res.status(400).json({ success: false, message: '缺少参数' });
    }
    const result = await handleInvitation(characterId, invitationId, accept);
    res.json(result);
  } catch (error) {
    console.error('处理邀请失败:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
