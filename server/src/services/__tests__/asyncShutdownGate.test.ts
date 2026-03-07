/**
 * 异步关闭门闩测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证关停门闩能等待在途任务结束，并在进入关闭态后拒绝新任务。
 * 2. 不做什么：不覆盖 Socket.io、数据库或 HTTP server，只验证纯生命周期控制逻辑。
 *
 * 输入/输出：
 * - 输入：`AsyncShutdownGate.run / beginShutdown / waitForIdle`。
 * - 输出：断言任务执行次数、关闭后的返回值以及 `waitForIdle` 的完成时机。
 *
 * 数据流/状态流：
 * 测试任务 -> AsyncShutdownGate -> 关闭态切换 -> 等待在途任务结束。
 *
 * 关键边界条件与坑点：
 * 1. 若任务未通过 `run` 注册，`waitForIdle` 不会感知它，因此测试必须只覆盖门闩负责的职责范围。
 * 2. 关闭后返回 `undefined` 是刻意设计，调用方要自己决定如何把“拒绝执行”映射成业务行为。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { AsyncShutdownGate } from '../../utils/asyncShutdownGate.js';

test('beginShutdown 后应等待已进入的任务完成', async () => {
  const gate = new AsyncShutdownGate();
  let releaseTask: (() => void) | null = null;
  let finished = false;

  const runningTask = gate.run(async () => {
    await new Promise<void>((resolve) => {
      releaseTask = resolve;
    });
    finished = true;
    return 'done';
  });

  gate.beginShutdown();

  let idleResolved = false;
  const idlePromise = gate.waitForIdle().then(() => {
    idleResolved = true;
  });

  await Promise.resolve();
  assert.equal(idleResolved, false);

  assert.notEqual(releaseTask, null);
  const resolveTask = releaseTask!;
  resolveTask();

  await idlePromise;
  assert.equal(idleResolved, true);
  assert.equal(await runningTask, 'done');
  assert.equal(finished, true);
});

test('关闭后不应再接收新任务', async () => {
  const gate = new AsyncShutdownGate();
  let runCount = 0;

  gate.beginShutdown();
  const result = await gate.run(async () => {
    runCount += 1;
    return 'should-not-run';
  });

  assert.equal(runCount, 0);
  assert.equal(result, undefined);
});
