/**
 * 伙伴招募 worker 通讯协议
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：集中定义主线程与伙伴招募 worker 之间的消息类型，避免 runner 与 worker 各自维护字符串协议。
 * 2) 不做什么：不执行业务、不读写数据库、不直接推送给前端。
 *
 * 输入/输出：
 * - 输入：主线程投递的执行消息。
 * - 输出：worker 返回的 ready / result / error 消息。
 *
 * 数据流/状态流：
 * runner -> partnerRecruitWorkerMessage -> worker
 * worker -> partnerRecruitWorkerResponse -> runner
 *
 * 关键边界条件与坑点：
 * 1) 返回载荷必须复用业务侧状态类型，避免 worker 与 service 的状态字符串漂移。
 * 2) 该协议只覆盖单次招募任务，不混入其他 worker 任务，防止线程消息结构耦合。
 */
import type {
  PartnerRecruitJobStatus,
  PartnerRecruitPreviewDto,
} from '../services/shared/partnerRecruitJobShared.js';
import type { PartnerRecruitQuality } from '../services/shared/partnerRecruitRules.js';

export type PartnerRecruitWorkerPayload = {
  characterId: number;
  generationId: string;
  quality: PartnerRecruitQuality;
};

export type PartnerRecruitWorkerMessage =
  | { type: 'executePartnerRecruit'; payload: PartnerRecruitWorkerPayload }
  | { type: 'shutdown' };

export type PartnerRecruitWorkerResult = {
  generationId: string;
  characterId: number;
  status: Extract<PartnerRecruitJobStatus, 'generated_draft' | 'failed' | 'refunded'>;
  preview: PartnerRecruitPreviewDto | null;
  errorMessage: string | null;
};

export type PartnerRecruitWorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; payload: PartnerRecruitWorkerResult }
  | { type: 'error'; payload: { generationId: string; characterId: number; error: string; stack?: string } };
