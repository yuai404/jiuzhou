/**
 * MainQuestService - 主线任务服务
 *
 * 作用：主线任务模块的统一入口类，负责协调各子模块完成读写操作。
 * 写方法使用 @Transactional 保证事务，读方法直接委托对应查询函数。
 *
 * 数据流：
 * 1. 角色首次查询 → 初始化进度记录（第一章第一节）
 * 2. 任务节流程：not_started → dialogue → objectives → turnin → completed
 * 3. 完成任务节 → 发放奖励 → 检查是否推进下一节/章
 *
 * 边界条件：
 * 1) 使用 @Transactional 确保进度更新与奖励发放的原子性。
 * 2) getProgress 仅做读取，章节补推进仅在写路径触发，避免读写锁冲突。
 */
import { query } from '../../config/database.js';
import { Transactional } from '../../decorators/transactional.js';
import {
  getMainQuestChapterById,
  getMainQuestSectionById,
} from '../staticConfigLoader.js';
import { asString, asNumber, asStringArray } from '../shared/typeCoercion.js';
import {
  getEnabledMainQuestSectionsSorted,
} from './shared/questConfig.js';
import { getMainQuestProgressLegacy } from './progress.js';
import { getChapterListLegacy, getSectionListLegacy } from './chapterList.js';
import { startDialogueLegacy, advanceDialogueLegacy, selectDialogueChoiceLegacy } from './dialogue.js';
import { completeCurrentSectionLegacy } from './sectionComplete.js';
import { updateSectionProgressByEvent } from './progressUpdater.js';
import type { DialogueState } from '../dialogueService.js';
import type {
  MainQuestProgressDto,
  MainQuestProgressEvent,
  SectionDto,
  SectionStatus,
  ChapterDto,
  RewardResult,
} from './types.js';

class MainQuestService {
  /**
   * 确保角色主线进度推进到新章节
   * 当角色完成当前章节后，自动推进到下一章第一节
   */
  @Transactional
  async ensureProgressForNewChapters(characterId: number): Promise<void> {
    const cid = Number(characterId);
    if (!Number.isFinite(cid) || cid <= 0) return;

    const progressRes = await query(
      `SELECT current_chapter_id, current_section_id, section_status, completed_chapters, completed_sections
       FROM character_main_quest_progress
       WHERE character_id = $1 FOR UPDATE`,
      [cid],
    );

    if (!progressRes.rows?.[0]) {
      return;
    }

    const progress = progressRes.rows[0] as {
      current_chapter_id?: unknown;
      current_section_id?: unknown;
      section_status?: unknown;
      completed_chapters?: unknown;
      completed_sections?: unknown;
    };

    if (asString(progress.section_status) !== 'completed') {
      return;
    }

    const completedChapters = asStringArray(progress.completed_chapters);
    const completedSections = asStringArray(progress.completed_sections);

    const chapterIdSet = new Set<string>();
    for (const chapterId of completedChapters) {
      chapterIdSet.add(chapterId);
    }

    const currentChapterId = asString(progress.current_chapter_id).trim();
    if (currentChapterId) {
      chapterIdSet.add(currentChapterId);
    }

    const currentSectionId = asString(progress.current_section_id).trim();
    if (currentSectionId) {
      const currentSection = getMainQuestSectionById(currentSectionId);
      const chapterIdFromCurrentSection = asString(currentSection?.chapter_id).trim();
      if (chapterIdFromCurrentSection) {
        chapterIdSet.add(chapterIdFromCurrentSection);
      }
    }

    for (const sectionId of completedSections) {
      const section = getMainQuestSectionById(sectionId);
      const chapterIdFromSection = asString(section?.chapter_id).trim();
      if (!chapterIdFromSection) continue;
      chapterIdSet.add(chapterIdFromSection);
    }

    let latestCompletedChapterNum = 0;
    for (const chapterId of chapterIdSet) {
      const chapterNum = asNumber(getMainQuestChapterById(chapterId)?.chapter_num, 0);
      if (chapterNum > latestCompletedChapterNum) latestCompletedChapterNum = chapterNum;
    }

    if (latestCompletedChapterNum <= 0) {
      return;
    }

    const nextSection = getEnabledMainQuestSectionsSorted().find((entry) => {
      const chapterNum = asNumber(getMainQuestChapterById(entry.chapter_id)?.chapter_num, 0);
      return chapterNum > latestCompletedChapterNum;
    });

    if (!nextSection) {
      return;
    }

    const nextChapterId = asString(nextSection.chapter_id).trim();
    const nextSectionId = asString(nextSection.id).trim();
    if (!nextChapterId || !nextSectionId) {
      return;
    }

    await query(
      `UPDATE character_main_quest_progress
       SET current_chapter_id = $2,
           current_section_id = $3,
           section_status = 'not_started',
           objectives_progress = '{}'::jsonb,
           dialogue_state = '{}'::jsonb,
           completed_chapters = $4::jsonb,
           completed_sections = $5::jsonb,
           updated_at = NOW()
       WHERE character_id = $1`,
      [cid, nextChapterId, nextSectionId, JSON.stringify(completedChapters), JSON.stringify(completedSections)],
    );
  }

  async getProgress(characterId: number): Promise<MainQuestProgressDto> {
    return getMainQuestProgressLegacy(characterId);
  }

  async startDialogue(characterId: number, dialogueId?: string): Promise<{ success: boolean; message: string; data?: { dialogueState: DialogueState } }> {
    return startDialogueLegacy(characterId, dialogueId);
  }

  @Transactional
  async advanceDialogue(userId: number, characterId: number): Promise<{ success: boolean; message: string; data?: { dialogueState: DialogueState; effectResults?: unknown[] } }> {
    return advanceDialogueLegacy(userId, characterId);
  }

  @Transactional
  async selectDialogueChoice(userId: number, characterId: number, choiceId: string): Promise<{ success: boolean; message: string; data?: { dialogueState: DialogueState; effectResults?: unknown[] } }> {
    return selectDialogueChoiceLegacy(userId, characterId, choiceId);
  }

  @Transactional
  async updateProgress(characterId: number, event: MainQuestProgressEvent): Promise<{ success: boolean; message: string; updated: boolean; completed: boolean }> {
    return updateSectionProgressByEvent(characterId, event);
  }

  @Transactional
  async completeCurrentSection(userId: number, characterId: number): Promise<{ success: boolean; message: string; data?: { rewards: RewardResult[]; nextSection?: SectionDto; chapterCompleted?: boolean } }> {
    return completeCurrentSectionLegacy(userId, characterId);
  }

  async getChapterList(characterId: number): Promise<{ chapters: ChapterDto[] }> {
    return getChapterListLegacy(characterId);
  }

  async getSectionList(characterId: number, chapterId: string): Promise<{ sections: SectionDto[] }> {
    return getSectionListLegacy(characterId, chapterId);
  }

  async setTracked(characterId: number, tracked: boolean): Promise<{ success: boolean; message: string; data?: { tracked: boolean } }> {
    return setMainQuestTrackedLegacy(characterId, tracked);
  }
}

/** 设置主线追踪状态 */
const setMainQuestTrackedLegacy = async (
  characterId: number,
  tracked: boolean,
): Promise<{ success: boolean; message: string; data?: { tracked: boolean } }> => {
  const cid = Number(characterId);
  if (!Number.isFinite(cid) || cid <= 0) return { success: false, message: '角色不存在' };

  const existsRes = await query(`SELECT 1 FROM character_main_quest_progress WHERE character_id = $1 LIMIT 1`, [cid]);
  if ((existsRes.rows ?? []).length === 0) {
    await getMainQuestProgressLegacy(cid);
  }

  const res = await query(
    `UPDATE character_main_quest_progress
     SET tracked = $2, updated_at = NOW()
     WHERE character_id = $1
     RETURNING tracked`,
    [cid, tracked === true],
  );
  const saved = res.rows?.[0]?.tracked !== false;
  return { success: true, message: 'ok', data: { tracked: saved } };
};

export const mainQuestService = new MainQuestService();

// 兼容性导出（供 dialogue.ts 等内部模块调用）
export const ensureMainQuestProgressForNewChapters = (characterId: number) =>
  mainQuestService.ensureProgressForNewChapters(characterId);
