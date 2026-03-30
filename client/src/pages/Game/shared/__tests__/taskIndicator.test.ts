import { describe, expect, it } from 'vitest';

import type {
  TaskOverviewSummaryRowDto,
} from '../../../../services/api';
import {
  buildTaskCategoryIndicatorMap,
  countCompletableTaskOverviewRows,
  isTaskIndicatorListCategory,
} from '../taskIndicator';

describe('taskIndicator', () => {
  it('普通任务角标应只统计 side/daily/event 中可完成的任务', () => {
    const tasks = [
      { id: 'main-1', category: 'main', status: 'claimable' },
      { id: 'side-1', category: 'side', status: 'turnin' },
      { id: 'daily-1', category: 'daily', status: 'claimable' },
      { id: 'event-1', category: 'event', status: 'ongoing' },
    ] as TaskOverviewSummaryRowDto[];

    expect(countCompletableTaskOverviewRows(tasks)).toBe(2);
  });

  it('任务入口列表分类判断应排除主线', () => {
    expect(isTaskIndicatorListCategory('side')).toBe(true);
    expect(isTaskIndicatorListCategory('main')).toBe(false);
  });
  it('应按分类返回左侧任务红点状态', () => {
    const taskRows = [
      { id: 'main-1', category: 'main', status: 'claimable' },
      { id: 'side-1', category: 'side', status: 'turnin' },
      { id: 'daily-1', category: 'daily', status: 'ongoing' },
      { id: 'event-1', category: 'event', status: 'claimable' },
    ] as TaskOverviewSummaryRowDto[];

    expect(buildTaskCategoryIndicatorMap(taskRows)).toEqual({
      main: false,
      side: true,
      daily: false,
      event: true,
    });
  });
});
