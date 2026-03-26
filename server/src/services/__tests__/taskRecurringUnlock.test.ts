/**
 * 日常/周常任务境界解锁回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定日常/周常的统一境界解锁规则，确保未达门槛前既不会出现在任务列表，也不会被自动接取。
 * 2. 做什么：把“列表过滤”和“自动接取范围”两条高频易散落规则收敛到一组回归测试里，防止后续只改显示层漏掉服务端数据入口。
 * 3. 不做什么：不连接真实数据库，不验证任务领奖/提交流程，也不覆盖主线与支线任务的既有可见性规则。
 *
 * 输入/输出：
 * - 输入：共享解锁规则函数、`getTaskOverview`，以及针对数据库查询的 mock 响应。
 * - 输出：解锁态布尔结果、任务列表 ID，以及自动接取 SQL 收到的任务 ID 集合。
 *
 * 数据流/状态流：
 * 测试先 mock `database.query`
 * -> `getTaskOverview` 读取角色境界并执行自动接取
 * -> 测试断言返回任务列表与自动接取范围都只包含已解锁日常/周常。
 *
 * 关键边界条件与坑点：
 * 1. 自动接取与列表展示必须共用同一套门槛；如果只校验列表，很容易留下“看不到但后台已建进度行”的脏状态。
 * 2. `event` 在任务系统里承载的是周常，因此测试必须显式覆盖 `daily` 与 `event` 两类，避免只修一半入口。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import * as database from '../../config/database.js';
import { getTaskOverview } from '../taskService.js';
import { buildTaskRecurringUnlockState } from '../shared/taskRecurringUnlock.js';

test('buildTaskRecurringUnlockState: 仅日常/周常受境界门槛控制', () => {
  const lockedDaily = buildTaskRecurringUnlockState('daily', '炼精化炁·养气期', '凡人', null);
  const unlockedWeekly = buildTaskRecurringUnlockState('event', '炼精化炁·养气期', '炼精化炁', '养气期');
  const mainQuest = buildTaskRecurringUnlockState('main', '炼神返虚·养神期', '凡人', null);

  assert.deepEqual(lockedDaily, {
    gatedByRealm: true,
    requiredRealm: '炼精化炁·养气期',
    unlocked: false,
  });
  assert.deepEqual(unlockedWeekly, {
    gatedByRealm: true,
    requiredRealm: '炼精化炁·养气期',
    unlocked: true,
  });
  assert.deepEqual(mainQuest, {
    gatedByRealm: false,
    requiredRealm: null,
    unlocked: true,
  });
});

test('getTaskOverview: 凡人阶段不应返回未解锁周常，且自动接取只包含已开放任务', async (t) => {
  const autoAcceptedTaskIds: string[][] = [];

  t.mock.method(
    database,
    'query',
    async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes('SELECT realm, sub_realm FROM characters')) {
        return {
          rows: [{ realm: '凡人', sub_realm: null }],
        };
      }

      if (sql.includes('FROM unnest($2::varchar[]) AS daily_task(task_id)')) {
        const taskIds = Array.isArray(params?.[1]) ? [...(params[1] as string[])] : [];
        autoAcceptedTaskIds.push(taskIds);
        return { rows: [] };
      }

      if (sql.includes('SELECT task_id, status AS progress_status, tracked, progress')) {
        assert.deepEqual(params?.[1], []);
        return { rows: [] };
      }

      if (sql.includes('SELECT task_id') && sql.includes('FROM character_task_progress')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  );

  const result = await getTaskOverview(1001, 'event');

  assert.deepEqual(result.tasks.map((task) => task.id), []);
  assert.deepEqual(autoAcceptedTaskIds, [['task-daily-001']]);
});

test('getTaskOverview: 养气期应返回同阶及以下日常，且自动接取同步放开对应周常', async (t) => {
  const autoAcceptedTaskIds: string[][] = [];

  t.mock.method(
    database,
    'query',
    async (sql: string, params?: readonly unknown[]) => {
      if (sql.includes('SELECT realm, sub_realm FROM characters')) {
        return {
          rows: [{ realm: '炼精化炁', sub_realm: '养气期' }],
        };
      }

      if (sql.includes('FROM unnest($2::varchar[]) AS daily_task(task_id)')) {
        const taskIds = Array.isArray(params?.[1]) ? [...(params[1] as string[])] : [];
        autoAcceptedTaskIds.push(taskIds);
        return { rows: [] };
      }

      if (sql.includes('SELECT task_id, status AS progress_status, tracked, progress')) {
        assert.deepEqual(params?.[1], ['task-daily-001', 'task-daily-002']);
        return { rows: [] };
      }

      if (sql.includes('SELECT task_id') && sql.includes('FROM character_task_progress')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  );

  const result = await getTaskOverview(1002, 'daily');

  assert.deepEqual(result.tasks.map((task) => task.id), ['task-daily-001', 'task-daily-002']);
  assert.deepEqual(autoAcceptedTaskIds, [['task-daily-001', 'task-daily-002', 'task-event-002']]);
});

test('getTaskOverview: 炼己期心魔日修应展示真实副本名与目标文案', async (t) => {
  t.mock.method(
    database,
    'query',
    async (sql: string) => {
      if (sql.includes('SELECT realm, sub_realm FROM characters')) {
        return {
          rows: [{ realm: '炼炁化神', sub_realm: '炼己期' }],
        };
      }

      if (sql.includes('FROM unnest($2::varchar[]) AS daily_task(task_id)')) {
        return { rows: [] };
      }

      if (sql.includes('SELECT task_id, status AS progress_status, tracked, progress')) {
        return { rows: [] };
      }

      if (sql.includes('SELECT task_id') && sql.includes('FROM character_task_progress')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  );

  const result = await getTaskOverview(1003, 'daily');
  const task = result.tasks.find((entry) => entry.id === 'task-lianji-daily-004');

  assert.ok(task, '应返回心魔日修');
  assert.equal(task.description, '完成一次心魔幻境修行。');

  const objective = task.objectives[0];
  assert.ok(objective, '心魔日修应存在任务目标');
  assert.equal(objective.text, '通关心魔幻境 1 次');
  assert.equal(objective.mapName, '心魔幻境');
  assert.equal(objective.mapNameType, 'dungeon');
});
