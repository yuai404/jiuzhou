/**
 * 周常副本任务去重规则测试
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：直接校验周常任务种子里，同一境界最多只存在 1 条包含副本目标的周常。
 * - 做什么：校验同一境界下不会针对同一副本配置两条周常，防止“换个标题继续重复”的隐性回归。
 * - 不做什么：不验证非副本周常的数量、不执行任务服务逻辑，也不关心奖励内容。
 *
 * 输入/输出：
 * - 输入：`task_def.json` 中标题以“周常：”开头的任务配置。
 * - 输出：按境界分组的副本周常列表与副本 ID 集合校验结果。
 *
 * 数据流/状态流：
 * - 先读取任务种子并筛出周常任务；
 * - 再提取包含 `dungeon_clear` 目标的副本周常；
 * - 最后按境界聚合，断言每组最多 1 条，并校验副本 ID 不会在同境界重复出现。
 *
 * 关键边界条件与坑点：
 * 1) 一条周常里允许包含多个 `dungeon_clear` 目标，因此测试要先在“单任务内”去重，再做“跨任务”比较。
 * 2) `dungeon_clear` 可能只有难度差异但指向同一 `dungeon_id`，这也属于同副本重复，不能按完整 `params` 文本误判为不同任务。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asArray,
  asObject,
  asText,
  loadSeed,
} from './seedTestUtils.js';

type WeeklyDungeonTask = {
  id: string;
  realm: string;
  dungeonIds: string[];
};

const collectWeeklyDungeonTasks = (): Map<string, WeeklyDungeonTask[]> => {
  const taskSeed = loadSeed('task_def.json');
  const groupedTasks = new Map<string, WeeklyDungeonTask[]>();

  for (const entry of asArray(taskSeed.tasks)) {
    const task = asObject(entry);
    const title = asText(task?.title);
    const taskId = asText(task?.id);
    const realm = asText(task?.realm);
    if (!title.startsWith('周常：') || !taskId || !realm) continue;

    const dungeonIds = Array.from(
      new Set(
        asArray(task?.objectives)
          .map((objective) => asObject(objective))
          .filter((objective) => asText(objective?.type) === 'dungeon_clear')
          .map((objective) => asText(asObject(objective?.params)?.dungeon_id))
          .filter((dungeonId) => dungeonId.length > 0),
      ),
    );

    if (dungeonIds.length === 0) continue;

    const realmTasks = groupedTasks.get(realm) ?? [];
    realmTasks.push({ id: taskId, realm, dungeonIds });
    groupedTasks.set(realm, realmTasks);
  }

  return groupedTasks;
};

test('每个境界最多保留一条副本周常', () => {
  const weeklyDungeonTasksByRealm = collectWeeklyDungeonTasks();

  for (const [realm, tasks] of weeklyDungeonTasksByRealm.entries()) {
    assert.ok(
      tasks.length <= 1,
      `${realm} 存在重复副本周常: ${tasks.map((task) => task.id).join(', ')}`,
    );
  }
});

test('同一境界内不应为同一副本配置两条周常', () => {
  const weeklyDungeonTasksByRealm = collectWeeklyDungeonTasks();

  for (const [realm, tasks] of weeklyDungeonTasksByRealm.entries()) {
    const ownerByDungeonId = new Map<string, string>();
    for (const task of tasks) {
      for (const dungeonId of task.dungeonIds) {
        const existingTaskId = ownerByDungeonId.get(dungeonId);
        assert.equal(
          existingTaskId,
          undefined,
          `${realm} 的副本 ${dungeonId} 同时出现在 ${existingTaskId} 与 ${task.id}`,
        );
        ownerByDungeonId.set(dungeonId, task.id);
      }
    }
  }
});
