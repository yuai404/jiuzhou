/**
 * 角色排行榜快照凌晨刷新调度器
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：在服务进程内按北京时间（Asia/Shanghai）每天凌晨 4 点触发一次角色排行榜快照全量刷新，保证战力公式调整后榜单能自动重算。
 * 2. 做什么：统一管理初始化、定时器句柄、执行互斥与关闭逻辑，避免启动流程、脚本或属性服务各自维护定时任务。
 * 3. 不做什么：不参与排行榜查询缓存，也不替代业务写链路里的按角色即时刷新。
 *
 * 输入/输出：
 * - 输入：无，初始化后按北京时间自动计算下一次执行时刻。
 * - 输出：无；副作用是到点后调用 `refreshAllCharacterRankSnapshots`。
 *
 * 数据流/状态流：
 * startupPipeline -> initializeRankSnapshotNightlyRefreshScheduler -> 计算下一次北京时间凌晨 4 点 -> setTimeout
 * -> 到点执行全量刷新 -> 再次计算下一次北京时间凌晨 4 点。
 *
 * 复用设计说明：
 * 1. 调度器只依赖 `refreshAllCharacterRankSnapshots` 单一刷新入口，避免夜间任务再拼第二套角色查询、批处理与快照写入逻辑。
 * 2. 生命周期通过 initialize/stop 暴露给启动流水线，和其他后台协调器保持同一接入模式，便于统一维护。
 *
 * 关键边界条件与坑点：
 * 1. 不能使用固定 24 小时 `setInterval`；必须每次重新计算下一次北京时间凌晨 4 点，避免重启时刻和时钟漂移把执行时间越拉越偏。
 * 2. 停止服务后不能再次安排下一轮定时器，否则优雅关闭阶段会残留后台句柄，影响进程退出。
 */
import { refreshAllCharacterRankSnapshots } from './characterComputedService.js';

const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';
const SHANGHAI_UTC_OFFSET_HOURS = 8;
const NIGHTLY_REFRESH_HOUR = 4;

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SHANGHAI_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

let timer: NodeJS.Timeout | null = null;
let initialized = false;
let inFlight = false;

type ShanghaiDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

const extractShanghaiDateTimeParts = (now: Date): ShanghaiDateTimeParts => {
  const formattedParts = shanghaiDateTimeFormatter.formatToParts(now);
  const year = Number(formattedParts.find((part) => part.type === 'year')?.value);
  const month = Number(formattedParts.find((part) => part.type === 'month')?.value);
  const day = Number(formattedParts.find((part) => part.type === 'day')?.value);
  const hour = Number(formattedParts.find((part) => part.type === 'hour')?.value);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour)
  ) {
    throw new Error('无法计算角色排行榜快照夜间刷新时间');
  }

  return { year, month, day, hour };
};

const buildShanghaiDateAtHour = (
  parts: ShanghaiDateTimeParts,
  dayOffset: number,
  hour: number,
): Date => {
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + dayOffset,
      hour - SHANGHAI_UTC_OFFSET_HOURS,
      0,
      0,
      0,
    ),
  );
};

const getNextRunAt = (now: Date): Date => {
  const shanghaiNow = extractShanghaiDateTimeParts(now);
  const nextRunAt = buildShanghaiDateAtHour(shanghaiNow, 0, NIGHTLY_REFRESH_HOUR);
  if (shanghaiNow.hour >= NIGHTLY_REFRESH_HOUR && nextRunAt.getTime() <= now.getTime()) {
    return buildShanghaiDateAtHour(shanghaiNow, 1, NIGHTLY_REFRESH_HOUR);
  }
  return nextRunAt;
};

const clearScheduledTimer = (): void => {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
};

const scheduleNextRun = (now: Date): void => {
  clearScheduledTimer();
  const nextRunAt = getNextRunAt(now);
  const delayMs = Math.max(0, nextRunAt.getTime() - now.getTime());
  timer = setTimeout(() => {
    void runScheduledRefresh();
  }, delayMs);
};

const runScheduledRefresh = async (): Promise<void> => {
  if (!initialized || inFlight) return;

  inFlight = true;
  try {
    console.log('[RankSnapshotNightlyRefresh] 开始执行角色排行榜快照全量刷新');
    await refreshAllCharacterRankSnapshots();
    console.log('[RankSnapshotNightlyRefresh] 角色排行榜快照全量刷新完成');
  } catch (error) {
    console.error('[RankSnapshotNightlyRefresh] 角色排行榜快照全量刷新失败:', error);
  } finally {
    inFlight = false;
    if (initialized) {
      scheduleNextRun(new Date());
    }
  }
};

export const initializeRankSnapshotNightlyRefreshScheduler = async (): Promise<void> => {
  if (initialized) return;
  initialized = true;
  scheduleNextRun(new Date());
};

export const stopRankSnapshotNightlyRefreshScheduler = (): void => {
  initialized = false;
  inFlight = false;
  clearScheduledTimer();
};
