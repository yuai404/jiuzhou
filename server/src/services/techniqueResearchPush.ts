/**
 * 洞府研修状态 Socket 推送模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：把“按角色重新读取最新研修状态并推送给当前在线用户”收敛成单一入口，避免路由与 worker 各自重复写状态同步逻辑。
 * 2. 做什么：复用 `techniqueGenerationService.getResearchStatus`，保证首页红点与功法弹窗看到的是同一份状态源。
 * 3. 不做什么：不改研修任务状态、不处理 HTTP 请求参数，也不替代结果事件 `techniqueResearchResult`。
 *
 * 输入/输出：
 * - 输入：`characterId`，以及可选 `userId`。
 * - 输出：无返回值；副作用是向在线用户发送 `techniqueResearch:update`。
 *
 * 数据流/状态流：
 * route / worker 成功写入状态 -> notifyTechniqueResearchStatus -> 读取最新研修状态 -> emit `techniqueResearch:update`
 *
 * 关键边界条件与坑点：
 * 1. 路由和 worker 可能都在同一流程里触发推送，因此这里必须幂等，只负责“读最新状态并覆盖推送”，不能依赖调用顺序累加状态。
 * 2. Socket 推送只承担同步职责，用户离线或推送失败时不能影响已经提交成功的研修写操作。
 */
import { getGameServer } from '../game/gameServer.js';
import { getCharacterUserId } from './sect/db.js';
import { techniqueGenerationService } from './techniqueGenerationService.js';

export const notifyTechniqueResearchStatus = async (
  characterId: number,
  userId?: number,
): Promise<void> => {
  try {
    const resolvedUserId = userId ?? await getCharacterUserId(characterId);
    if (!resolvedUserId) return;

    const result = await techniqueGenerationService.getResearchStatus(characterId);
    if (!result.success || !result.data) return;

    getGameServer().emitToUser(resolvedUserId, 'techniqueResearch:update', {
      characterId,
      status: result.data,
    });
  } catch (error) {
    console.error(`[techniqueResearch] 推送研修状态失败: characterId=${characterId}`, error);
  }
};
