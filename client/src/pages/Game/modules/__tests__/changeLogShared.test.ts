/**
 * 更新日志共享派生规则测试。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定更新日志的版本排序与摘要统计规则，避免 UI 自己各算一套。
 * 2. 做什么：保证页面顺序流布局直接消费同一份共享视图模型。
 * 3. 不做什么：不渲染真实弹窗、不验证样式，也不覆盖菜单点击链路。
 *
 * 输入/输出：
 * - 输入：原始更新日志静态数据数组。
 * - 输出：共享层整理后的版本顺序与总条目数。
 *
 * 数据流/状态流：
 * 原始静态数据 -> `changeLogShared.ts` 纯函数 -> 测试断言共享视图模型。
 *
 * 关键边界条件与坑点：
 * 1. 原始数组顺序不可信，必须由共享层按发布日期统一排序。
 * 2. 空条目必须在共享层提前过滤，避免页面出现空 bullet。
 */

import { describe, expect, it } from 'vitest';
import { buildChangeLogViewModel } from '../ChangeLogModal/changeLogShared.js';

describe('changeLogShared', () => {
  it('应把最新发布日期的版本排在最前', () => {
    const viewModel = buildChangeLogViewModel([
      {
        releasedAt: '2026-03-20T12:00:00+08:00',
        sections: ['条目 A'],
      },
      {
        releasedAt: '2026-04-05T12:00:00+08:00',
        sections: ['条目 B', '条目 C'],
      },
    ]);

    expect(viewModel.versions.map((entry) => entry.releasedAt)).toEqual([
      '2026-04-05T12:00:00+08:00',
      '2026-03-20T12:00:00+08:00',
    ]);
  });

  it('应集中统计总条目数', () => {
    const viewModel = buildChangeLogViewModel([
      {
        releasedAt: '2026-04-05T12:00:00+08:00',
        sections: ['A', 'B', 'C'],
      },
      {
        releasedAt: '2026-03-20T12:00:00+08:00',
        sections: ['D'],
      },
    ]);

    expect(viewModel.totalVersionCount).toBe(2);
    expect(viewModel.totalItemCount).toBe(4);
  });

  it('应过滤空白更新条目', () => {
    const viewModel = buildChangeLogViewModel([
      {
        releasedAt: '2026-04-05T12:00:00+08:00',
        sections: ['A', ' ', '', 'B'],
      },
    ]);

    expect(viewModel.versions[0]?.sections).toEqual(['A', 'B']);
    expect(viewModel.totalItemCount).toBe(2);
  });
});
