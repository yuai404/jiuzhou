/**
 * 更新日志共享派生层。
 *
 * 作用：
 * 1. 把静态更新日志数据整理为页面直接消费的视图模型，集中处理排序与统计规则。
 * 2. 让 `ChangeLogModal` 直接消费已经排好序的版本块，避免在渲染期重复整理数据。
 * 3. 不做什么：不承接弹窗状态，不负责 UI 事件与样式渲染。
 *
 * 输入 / 输出：
 * - 输入：`changeLogData.ts` 中的原始版本数据数组。
 * - 输出：版本视图列表与汇总统计。
 *
 * 数据流 / 状态流：
 * `CHANGE_LOG_ENTRIES` -> 本模块排序与聚合 -> `ChangeLogModal` 读取稳定视图模型 -> `Game/index.tsx` 只控制开关状态。
 *
 * 复用设计说明：
 * 1. 版本排序与条目统计都属于高频业务规则，集中到共享层后，页面只负责顺序渲染。
 * 2. 版本展示块统一由同一份视图模型驱动，后续追加日志时不需要再改页面结构。
 * 3. 后续若其他入口也要展示更新时间列表，可直接复用这里的排序结果。
 *
 * 关键边界条件与坑点：
 * 1. 版本列表必须按发布日期倒序稳定输出，不能依赖原始数组恰好已排好。
 * 2. 空条目必须在共享层提前过滤，避免页面出现空 bullet。
 */

import { CHANGE_LOG_ENTRIES, type ChangeLogEntrySource } from './changeLogData';

export interface ChangeLogVersionView {
  releasedAt: string;
  releaseDateLabel: string;
  title: string;
  sections: readonly string[];
  itemCount: number;
}

export interface ChangeLogViewModel {
  versions: readonly ChangeLogVersionView[];
  totalVersionCount: number;
  totalItemCount: number;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

const toReleaseDateLabel = (releasedAt: string): string => {
  const date = new Date(releasedAt);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    throw new Error(`更新日志发布日期非法：${releasedAt}`);
  }

  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const compareChangeLogVersion = (left: ChangeLogEntrySource, right: ChangeLogEntrySource): number =>
  new Date(right.releasedAt).getTime() - new Date(left.releasedAt).getTime();

const toVersionView = (entry: ChangeLogEntrySource): ChangeLogVersionView => {
  const sections = entry.sections.filter((item) => item.trim().length > 0);
  const releaseDateLabel = toReleaseDateLabel(entry.releasedAt);

  return {
    releasedAt: entry.releasedAt,
    releaseDateLabel,
    title: releaseDateLabel,
    sections,
    itemCount: sections.length,
  };
};

export const buildChangeLogViewModel = (entries: readonly ChangeLogEntrySource[]): ChangeLogViewModel => {
  const versions = [...entries]
    .sort(compareChangeLogVersion)
    .map(toVersionView);
  const totalItemCount = versions.reduce((sum, entry) => sum + entry.itemCount, 0);

  return {
    versions,
    totalVersionCount: versions.length,
    totalItemCount,
  };
};

export const CHANGE_LOG_VIEW_MODEL = buildChangeLogViewModel(CHANGE_LOG_ENTRIES);
