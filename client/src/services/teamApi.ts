import api from './api';

/**
 * 九州修仙录 - 组队系统 API
 */

// 队伍成员类型
export interface TeamMember {
  id: string;
  characterId: number;
  name: string;
  role: 'leader' | 'member';
  realm: string;
  online: boolean;
  avatar: string | null;
}

// 队伍信息类型
export interface TeamInfo {
  id: string;
  name: string;
  leader: string;
  leaderId: number;
  members: TeamMember[];
  memberCount: number;
  maxMembers: number;
  goal: string;
  joinMinRealm: string;
  autoJoinEnabled: boolean;
  autoJoinMinRealm: string;
  currentMapId: string | null;
  isPublic: boolean;
}

// 队伍申请类型
export interface TeamApplication {
  id: string;
  characterId: number;
  name: string;
  realm: string;
  avatar: string | null;
  message: string | null;
  time: number;
}

// 队伍大厅/附近队伍条目
export interface TeamEntry {
  id: string;
  name: string;
  leader: string;
  members: number;
  cap: number;
  goal: string;
  minRealm: string;
  distance?: string;
}

// 入队邀请类型
export interface TeamInvitation {
  id: string;
  teamId: string;
  teamName: string;
  goal: string;
  inviterName: string;
  message: string | null;
  time: number;
}

// 队伍设置类型
export interface TeamSettings {
  name?: string;
  goal?: string;
  joinMinRealm?: string;
  autoJoinEnabled?: boolean;
  autoJoinMinRealm?: string;
  isPublic?: boolean;
}

// 响应类型
interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
}

export type GetMyTeamResponse = ApiResponse<TeamInfo | null> & { role?: 'leader' | 'member' };

// 获取角色当前队伍
export const getMyTeam = (characterId: number): Promise<GetMyTeamResponse> => {
  return api.get('/team/my', { params: { characterId } });
};

// 获取队伍详情
export const getTeamById = (teamId: string): Promise<ApiResponse<TeamInfo>> => {
  return api.get(`/team/${teamId}`);
};

// 创建队伍
export const createTeam = (
  characterId: number,
  name?: string,
  goal?: string
): Promise<ApiResponse<{ teamId: string; name: string }>> => {
  return api.post('/team/create', { characterId, name, goal });
};

// 解散队伍
export const disbandTeam = (characterId: number, teamId: string): Promise<ApiResponse> => {
  return api.post('/team/disband', { characterId, teamId });
};

// 离开队伍
export const leaveTeam = (characterId: number): Promise<ApiResponse> => {
  return api.post('/team/leave', { characterId });
};

// 申请加入队伍
export type ApplyToTeamResponse = ApiResponse & { applicationId?: string; autoJoined?: boolean };

export const applyToTeam = (
  characterId: number,
  teamId: string,
  message?: string
): Promise<ApplyToTeamResponse> => {
  return api.post('/team/apply', { characterId, teamId, message });
};

// 获取队伍申请列表
export const getTeamApplications = (
  teamId: string,
  characterId: number
): Promise<ApiResponse<TeamApplication[]>> => {
  return api.get(`/team/applications/${teamId}`, { params: { characterId } });
};

// 处理入队申请
export const handleApplication = (
  characterId: number,
  applicationId: string,
  approve: boolean
): Promise<ApiResponse> => {
  return api.post('/team/application/handle', { characterId, applicationId, approve });
};

// 踢出成员
export const kickMember = (leaderId: number, targetCharacterId: number): Promise<ApiResponse> => {
  return api.post('/team/kick', { leaderId, targetCharacterId });
};

// 转让队长
export const transferLeader = (currentLeaderId: number, newLeaderId: number): Promise<ApiResponse> => {
  return api.post('/team/transfer', { currentLeaderId, newLeaderId });
};

// 更新队伍设置
export const updateTeamSettings = (
  characterId: number,
  teamId: string,
  settings: TeamSettings
): Promise<ApiResponse> => {
  return api.post('/team/settings', { characterId, teamId, settings });
};

// 获取附近队伍
export const getNearbyTeams = (
  characterId: number,
  mapId?: string
): Promise<ApiResponse<TeamEntry[]>> => {
  return api.get('/team/nearby/list', { params: { characterId, mapId } });
};

// 获取队伍大厅
export const getLobbyTeams = (
  characterId: number,
  search?: string,
  limit?: number
): Promise<ApiResponse<TeamEntry[]>> => {
  return api.get('/team/lobby/list', { params: { characterId, search, limit } });
};

// 邀请玩家入队
export const inviteToTeam = (
  inviterId: number,
  inviteeId: number,
  message?: string
): Promise<ApiResponse<{ invitationId: string }>> => {
  return api.post('/team/invite', { inviterId, inviteeId, message });
};

// 获取收到的邀请
export const getReceivedInvitations = (characterId: number): Promise<ApiResponse<TeamInvitation[]>> => {
  return api.get('/team/invitations/received', { params: { characterId } });
};

// 处理入队邀请
export const handleInvitation = (
  characterId: number,
  invitationId: string,
  accept: boolean
): Promise<ApiResponse> => {
  return api.post('/team/invitation/handle', { characterId, invitationId, accept });
};
