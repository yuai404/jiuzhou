/**
 * 三魂归契 worker 执行前快照同步测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁住 worker 在处理三魂归契任务前，必须先同步动态伙伴定义快照。
 * 2. 做什么：验证素材里包含 AI 生成伙伴时，执行链不会跳过快照刷新直接进入业务服务。
 * 3. 不做什么：不启动真实 worker 线程，不访问数据库，也不覆盖消息监听或主线程推送。
 *
 * 输入/输出：
 * - 输入：固定的 fusion worker 载荷，以及注入的假快照刷新函数/假业务服务。
 * - 输出：标准化 worker `result` 响应。
 *
 * 数据流/状态流：
 * 测试载荷 -> executePartnerFusionWorkerTask -> 刷新动态伙伴快照 -> 调用归契 service -> worker 响应。
 *
 * 关键边界条件与坑点：
 * 1. 这里关注的是调用顺序，不是数据库结果；若先跑 service 再刷新快照，`partner-gen-*` 素材仍会在独立线程里报模板不存在。
 * 2. 断言要复用真实 worker 响应结构，避免测试通过但线程协议被改坏。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { executePartnerFusionWorkerTask } from '../../workers/partnerFusionWorkerExecution.js';

test('executePartnerFusionWorkerTask: 应先刷新动态伙伴快照再处理归契任务', async () => {
  const callOrder: string[] = [];

  const response = await executePartnerFusionWorkerTask(
    {
      characterId: 1001,
      fusionId: 'partner-fusion-test',
    },
    {
      refreshGeneratedPartnerSnapshots: async () => {
        callOrder.push('refresh-generated-partner-snapshots');
      },
      processPendingFusionJob: async (payload) => {
        callOrder.push(`process:${payload.fusionId}`);
        return {
          success: true,
          message: 'ok',
          data: {
            status: 'generated_preview',
            preview: null,
            errorMessage: null,
          },
        };
      },
    },
  );

  assert.deepEqual(callOrder, [
    'refresh-generated-partner-snapshots',
    'process:partner-fusion-test',
  ]);
  assert.deepEqual(response, {
    type: 'result',
    payload: {
      fusionId: 'partner-fusion-test',
      characterId: 1001,
      status: 'generated_preview',
      preview: null,
      errorMessage: 'ok',
    },
  });
});
