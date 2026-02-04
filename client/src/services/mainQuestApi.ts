import axios from 'axios';
import { API_BASE } from './api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.message || '网络错误';
    return Promise.reject({ success: false, message });
  }
);

// 对话节点类型
export type DialogueNodeType = 'narration' | 'npc' | 'player' | 'choice' | 'system' | 'action';

// 对话效果
export interface DialogueEffect {
  type: string;
  params: Record<string, unknown>;
}

// 对话选项
export interface DialogueChoice {
  id: string;
  text: string;
  next: string;
  condition?: Record<string, unknown>;
  effects?: DialogueEffect[];
}

// 对话节点
export interface DialogueNode {
  id: string;
  type: DialogueNodeType;
  speaker?: string;
  text?: string;
  emotion?: string;
  choices?: DialogueChoice[];
  next?: string;
  effects?: DialogueEffect[];
}

// 对话状态
export interface DialogueState {
  dialogueId: string;
  currentNodeId: string;
  currentNode: DialogueNode | null;
  selectedChoices: string[];
  isComplete: boolean;
  pendingEffects: DialogueEffect[];
}

// 任务节状态
export type SectionStatus = 'not_started' | 'dialogue' | 'objectives' | 'turnin' | 'completed';

// 任务目标
export interface SectionObjective {
  id: string;
  type: string;
  text: string;
  target: number;
  done: number;
  params?: Record<string, unknown>;
}

// 任务奖励
export interface SectionRewardItemDetail {
  item_def_id: string;
  quantity: number;
  name?: string;
  icon?: string | null;
}

export interface SectionRewardTechniqueDetail {
  id: string;
  name?: string;
  icon?: string | null;
}

export interface SectionReward {
  exp?: number;
  silver?: number;
  spirit_stones?: number;
  items?: Array<{ item_def_id: string; quantity: number }>;
  items_detail?: SectionRewardItemDetail[];
  techniques?: string[];
  techniques_detail?: SectionRewardTechniqueDetail[];
  titles?: string[];
  unlock_features?: string[];
}

// 章节信息
export interface ChapterDto {
  id: string;
  chapterNum: number;
  name: string;
  description: string;
  background: string;
  minRealm: string;
  isCompleted: boolean;
}

// 任务节信息
export interface SectionDto {
  id: string;
  chapterId: string;
  sectionNum: number;
  name: string;
  description: string;
  brief: string;
  npcId: string | null;
  mapId: string | null;
  roomId: string | null;
  status: SectionStatus;
  objectives: SectionObjective[];
  rewards: SectionReward;
  isChapterFinal: boolean;
}

// 主线进度
export interface MainQuestProgressDto {
  currentChapter: ChapterDto | null;
  currentSection: SectionDto | null;
  completedChapters: string[];
  completedSections: string[];
  dialogueState: DialogueState | null;
  tracked: boolean;
}

// 获取主线进度
export const getMainQuestProgress = () => {
  return api.get<unknown, { success: boolean; message: string; data: MainQuestProgressDto }>('/main-quest/progress');
};

// 获取章节列表
export const getChapterList = () => {
  return api.get<unknown, { success: boolean; message: string; data: { chapters: ChapterDto[] } }>('/main-quest/chapters');
};

// 获取章节下的任务节列表
export const getSectionList = (chapterId: string) => {
  return api.get<unknown, { success: boolean; message: string; data: { sections: SectionDto[] } }>(`/main-quest/chapters/${chapterId}/sections`);
};

// 开始对话
export const startDialogue = (dialogueId?: string) => {
  return api.post<unknown, { success: boolean; message: string; data: { dialogueState: DialogueState } }>('/main-quest/dialogue/start', { dialogueId });
};

// 推进对话
export const advanceDialogue = () => {
  return api.post<unknown, { success: boolean; message: string; data: { dialogueState: DialogueState; effectResults?: unknown[] } }>(
    '/main-quest/dialogue/advance',
    {},
  );
};

// 选择对话选项
export const selectDialogueChoice = (choiceId: string) => {
  return api.post<unknown, { success: boolean; message: string; data: { dialogueState: DialogueState; effectResults?: unknown[] } }>('/main-quest/dialogue/choice', { choiceId });
};

// 完成任务节并领取奖励
export const completeSection = () => {
  return api.post<unknown, { success: boolean; message: string; data: { rewards: unknown[]; nextSection?: SectionDto; chapterCompleted?: boolean } }>('/main-quest/section/complete');
};

// 设置主线任务追踪状态
export const setMainQuestTracked = (tracked: boolean) => {
  return api.post<unknown, { success: boolean; message: string; data: { tracked: boolean } }>('/main-quest/track', { tracked });
};

export default {
  getMainQuestProgress,
  getChapterList,
  getSectionList,
  startDialogue,
  advanceDialogue,
  selectDialogueChoice,
  completeSection,
  setMainQuestTracked
};
