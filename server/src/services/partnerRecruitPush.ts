/**
 * 伙伴招募状态 Socket 推送模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把“读取最新伙伴招募状态并推送给当前在线用户”集中到单一入口，避免路由与 worker 重复刷新同一份状态。
 * 2. 做什么：复用 `partnerRecruitService.getRecruitStatus`，确保首页/伙伴弹窗/结果提示共用同一状态源。
 * 3. 不做什么：不负责招募任务创建、确认、放弃等业务写入，也不替代结果提示事件 `partnerRecruitResult`。
 *
 * 输入/输出：
 * - 输入：`characterId`，以及可选 `userId`。
 * - 输出：无返回值；副作用是向在线用户发送 `partnerRecruit:update`。
 *
 * 数据流/状态流：
 * route / worker 成功写入状态 -> notifyPartnerRecruitStatus -> 读取最新招募状态 -> emit `partnerRecruit:update`
 *
 * 关键边界条件与坑点：
 * 1. 伙伴预览生成成功后，主线程需要先完成动态快照刷新，再推送状态；否则前端会先收到草稿状态却读不到完整预览。
 * 2. 推送失败时只能记日志，不能吞掉或回滚已经生效的招募结果。
 */
import { getGameServer } from '../game/gameServer.js';
import { getCharacterUserId } from './sect/db.js';
import { partnerRecruitService } from './partnerRecruitService.js';

export const notifyPartnerRecruitStatus = async (
  characterId: number,
  userId?: number,
): Promise<void> => {
  try {
    const resolvedUserId = userId ?? await getCharacterUserId(characterId);
    if (!resolvedUserId) return;

    const result = await partnerRecruitService.getRecruitStatus(characterId);
    if (!result.success || !result.data) return;

    getGameServer().emitToUser(resolvedUserId, 'partnerRecruit:update', {
      characterId,
      status: result.data,
    });
  } catch (error) {
    console.error(`[partnerRecruit] 推送招募状态失败: characterId=${characterId}`, error);
  }
};
