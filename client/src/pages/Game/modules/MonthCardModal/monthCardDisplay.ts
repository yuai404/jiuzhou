/**
 * 月卡弹窗展示规则共享模块
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：集中维护月卡奖励图标、状态文案与按钮文案，避免这些高频变化点散落在弹窗组件里。
 * 2. 做什么：把“未激活 / 已到期 / 生效中”三类展示语义收敛到单一入口，减少同类判断重复书写。
 * 3. 不做什么：不请求接口、不持有 React 状态，也不负责具体 DOM 布局。
 *
 * 输入/输出：
 * - 输入：月卡每日灵石数量、是否激活、是否到期、剩余天数、到期时间。
 * - 输出：奖励展示数组，以及右侧状态面板要渲染的标题/文案/按钮文案。
 *
 * 数据流/状态流：
 * 月卡接口状态 -> 本模块纯函数 -> MonthCardModal 组件渲染。
 *
 * 关键边界条件与坑点：
 * 1. 灵石奖励图标必须始终走共享资源 `IMG_LINGSHI`，不能在业务组件里再次回退成金币图。
 * 2. 到期时间字符串可能为空或非法，此时只能回退到通用提示文案，不能渲染无意义的 `Invalid Date`。
 */

import { IMG_LINGSHI } from '../../shared/imageAssets';

const pad2 = (value: number) => String(value).padStart(2, '0');

const formatExpireAt = (expireAt: string | null): string => {
  if (!expireAt) return '';
  const date = new Date(expireAt);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

export type MonthCardDailyReward = {
  id: string;
  name: string;
  icon: string;
  amount: number;
  type: 'spiritStone';
};

export type MonthCardPanelStateInput = {
  active: boolean;
  isExpired: boolean;
  daysLeft: number;
  expireAt: string | null;
};

export type MonthCardPanelState = {
  title: string;
  statusValue: string;
  statusHint: string;
  actionLabel: '使用' | '使用续期';
};

export const buildMonthCardDailyRewards = (dailySpiritStones: number): MonthCardDailyReward[] => [
  {
    id: 'spirit-stones',
    name: '灵石',
    icon: IMG_LINGSHI,
    amount: dailySpiritStones,
    type: 'spiritStone',
  },
];

export const buildMonthCardPanelState = ({
  active,
  isExpired,
  daysLeft,
  expireAt,
}: MonthCardPanelStateInput): MonthCardPanelState => {
  if (active) {
    const expireText = formatExpireAt(expireAt);
    return {
      title: '月卡状态',
      statusValue: `剩余 ${Math.max(0, daysLeft)} 天`,
      statusHint: expireText ? `到期时间：${expireText}` : '月卡生效中，可每日领取一次奖励。',
      actionLabel: '使用续期',
    };
  }

  if (isExpired) {
    return {
      title: '月卡状态',
      statusValue: '已到期',
      statusHint: '背包有月卡道具时可点击“使用续期”叠加天数。',
      actionLabel: '使用续期',
    };
  }

  return {
    title: '月卡状态',
    statusValue: '未激活',
    statusHint: '背包有月卡道具时可点击“使用”激活。',
    actionLabel: '使用',
  };
};
