/**
 * 角色排行榜快照凌晨刷新调度器回归测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定凌晨调度器必须复用统一的“全量刷新角色排行榜快照”入口，避免调度层再维护第二套快照刷新逻辑。
 * 2. 做什么：锁定调度时间锚点为每天北京时间（Asia/Shanghai）凌晨 4 点，并要求初始化/停止都集中管理单一定时器。
 * 3. 不做什么：不真正等待定时器触发，不连接数据库，也不执行真实排行榜刷新。
 *
 * 输入/输出：
 * - 输入：`rankSnapshotNightlyRefreshScheduler.ts` 源码文本。
 * - 输出：源码级策略断言结果。
 *
 * 数据流/状态流：
 * 读取源码 -> 断言调度器导入统一全量刷新入口 -> 断言下一次执行时间计算锚定北京时间凌晨 4 点
 * -> 断言初始化与停止都只管理单一定时器状态。
 *
 * 复用设计说明：
 * 1. 这里直接锁定统一刷新入口，避免后续脚本、调度器、启动补偿分别各写一套全量刷新逻辑。
 * 2. 源码级断言不依赖具体数据库数据，能稳定保护调度策略而不引入慢测试。
 *
 * 关键边界条件与坑点：
 * 1. 如果后续重命名调度模块或导出函数，需要同步更新这里的源码路径与正则，否则会误报。
 * 2. 这里只约束“北京时间凌晨 4 点”和“统一刷新入口”，不锁日志文案，避免无关改动造成测试脆弱。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = (relativePath: string): string => {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
};

test('凌晨调度器必须调用统一的角色排行榜快照全量刷新入口', () => {
  const source = readSource('../rankSnapshotNightlyRefreshScheduler.ts');

  assert.match(
    source,
    /import\s+\{\s*refreshAllCharacterRankSnapshots\s*\}\s+from\s+'\.\/characterComputedService\.js';/u,
  );
  assert.match(
    source,
    /await refreshAllCharacterRankSnapshots\(\);/u,
    '凌晨调度器必须复用统一的全量刷新入口',
  );
});

test('凌晨调度器必须按北京时间凌晨 4 点计算下一次执行时间并管理单一定时器', () => {
  const source = readSource('../rankSnapshotNightlyRefreshScheduler.ts');

  assert.match(
    source,
    /const SHANGHAI_TIME_ZONE = 'Asia\/Shanghai';/u,
    '调度器必须显式固定北京时间时区',
  );
  assert.match(
    source,
    /new Intl\.DateTimeFormat\('en-CA',\s*\{[\s\S]*?timeZone:\s*SHANGHAI_TIME_ZONE,[\s\S]*?hourCycle:\s*'h23',[\s\S]*?\}\);/u,
    '北京时间日期提取必须显式指定 Asia/Shanghai',
  );
  assert.match(
    source,
    /const NIGHTLY_REFRESH_HOUR = 4;/u,
    '下一次执行时间必须锚定北京时间凌晨 4 点',
  );
  assert.match(
    source,
    /Date\.UTC\([\s\S]*?hour - SHANGHAI_UTC_OFFSET_HOURS,[\s\S]*?\)/u,
    '北京时间凌晨 4 点必须转换成绝对触发时间',
  );
  assert.match(
    source,
    /return buildShanghaiDateAtHour\(shanghaiNow,\s*1,\s*NIGHTLY_REFRESH_HOUR\);/u,
    '若已超过当天北京时间凌晨 4 点，必须顺延到下一天',
  );
  assert.match(
    source,
    /timer\s*=\s*setTimeout\(/u,
    '初始化后必须只登记单一定时器',
  );
  assert.match(
    source,
    /clearTimeout\(timer\);[\s\S]*?timer\s*=\s*null;/u,
    '停止时必须清理定时器句柄',
  );
});
