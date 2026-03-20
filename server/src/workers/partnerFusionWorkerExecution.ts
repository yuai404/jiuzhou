import {
  partnerFusionService,
  type PartnerFusionResult,
} from '../services/partnerFusionService.js';
import type { GeneratedPartnerPreviewDto } from '../services/shared/partnerGeneratedPreview.js';
import type { PartnerFusionJobStatus } from '../services/shared/partnerFusionJobShared.js';
import { refreshGeneratedPartnerSnapshots } from '../services/staticConfigLoader.js';
import type {
  PartnerFusionWorkerPayload,
  PartnerFusionWorkerResponse,
} from './partnerFusionWorkerShared.js';

type PartnerFusionWorkerExecutionResult = PartnerFusionResult<{
  status: Extract<PartnerFusionJobStatus, 'generated_preview' | 'failed'>;
  preview: GeneratedPartnerPreviewDto | null;
  errorMessage: string | null;
}>;

type PartnerFusionWorkerExecutionDeps = {
  refreshGeneratedPartnerSnapshots: () => Promise<void>;
  processPendingFusionJob: (
    payload: PartnerFusionWorkerPayload,
  ) => Promise<PartnerFusionWorkerExecutionResult>;
};

/**
 * 三魂归契 worker 单次执行入口
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：统一封装 worker 真正执行归契任务前的动态伙伴快照同步与结果映射。
 * 2) 做什么：让消息监听层只负责收发协议，避免“先刷新快照再执行业务”的关键顺序散落在事件回调里。
 * 3) 不做什么：不管理线程生命周期，不处理主线程推送，也不改数据库事务边界。
 *
 * 输入/输出：
 * - 输入：`fusionId`、`characterId`，以及可注入的快照刷新/业务处理依赖。
 * - 输出：标准化 `PartnerFusionWorkerResponse`。
 *
 * 数据流/状态流：
 * worker payload -> 刷新 generated_partner_def 快照 -> processPendingFusionJob -> worker result response。
 *
 * 关键边界条件与坑点：
 * 1) worker 是独立线程，不能假设主线程已经刷新的动态伙伴缓存会自动共享到这里；执行前必须主动同步。
 * 2) 这里只同步动态伙伴快照，不做兜底重试；若刷新或业务执行失败，应让异常继续抛给外层统一转成 worker error。
 */
export const executePartnerFusionWorkerTask = async (
  payload: PartnerFusionWorkerPayload,
  deps: PartnerFusionWorkerExecutionDeps = {
    refreshGeneratedPartnerSnapshots,
    processPendingFusionJob: (taskPayload) => partnerFusionService.processPendingFusionJob(taskPayload),
  },
): Promise<Extract<PartnerFusionWorkerResponse, { type: 'result' }>> => {
  await deps.refreshGeneratedPartnerSnapshots();

  const result = await deps.processPendingFusionJob(payload);

  return {
    type: 'result',
    payload: {
      fusionId: payload.fusionId,
      characterId: payload.characterId,
      status: result.data?.status ?? 'failed',
      preview: result.data?.preview ?? null,
      errorMessage: result.data?.errorMessage ?? result.message,
    },
  };
};
