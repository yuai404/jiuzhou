/**
 * 境界突破秘境要求任意难度回归测试
 *
 * 作用：
 * 1. 做什么：锁定所有境界突破里的副本通关前置都按“同副本任意难度”统计，避免后续重新写回困难难度限定。
 * 2. 不做什么：不校验具体数值奖励、不覆盖单条突破配置的业务细节，这些由各境界专属配置测试负责。
 *
 * 输入 / 输出：
 * - 输入：`realm_breakthrough.json` 中的所有突破配置。
 * - 输出：所有带 `dungeonId` 的 `dungeon_clear_min` 要求都不再声明 `difficultyId`。
 *
 * 数据流 / 状态流：
 * 突破静态配置 -> 提取秘境通关要求 -> 断言难度字段为空。
 *
 * 复用设计说明：
 * - 把“所有突破秘境要求统一为任意难度”的规则收敛到单一测试入口，避免在多个境界测试里重复枚举同一约束。
 * - 各境界配置测试继续负责自己的数值与章节前置，这里只守住跨境界共性规则。
 *
 * 关键边界条件与坑点：
 * 1. 只检查带 `dungeonId` 的突破要求，避免把“任意秘境”这一类本就不带副本 ID 的通用要求混进来。
 * 2. 配置文件存在双路径加载分支，测试需要按现有约定依次探测 `server/src` 与 `src`，否则在不同 cwd 下会误报。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Requirement = {
  id?: string;
  type?: string;
  dungeonId?: string;
  difficultyId?: string;
};

type Breakthrough = {
  from?: string;
  to?: string;
  requirements?: Requirement[];
};

type RealmBreakthroughSeed = {
  breakthroughs?: Breakthrough[];
};

const loadSeed = (): RealmBreakthroughSeed => {
  const candidatePaths = [
    resolve(process.cwd(), 'server/src/data/seeds/realm_breakthrough.json'),
    resolve(process.cwd(), 'src/data/seeds/realm_breakthrough.json'),
  ];
  const seedPath = candidatePaths.find((filePath) => existsSync(filePath));
  assert.ok(seedPath, '未找到 realm_breakthrough.json');
  return JSON.parse(readFileSync(seedPath, 'utf-8')) as RealmBreakthroughSeed;
};

test('所有境界突破里的指定秘境要求都应允许任意难度通关', () => {
  const seed = loadSeed();
  const dungeonRequirements = (seed.breakthroughs ?? []).flatMap((breakthrough) =>
    (breakthrough.requirements ?? [])
      .filter((requirement) => requirement.type === 'dungeon_clear_min' && typeof requirement.dungeonId === 'string')
      .map((requirement) => ({
        breakthrough: `${breakthrough.from ?? 'unknown'} -> ${breakthrough.to ?? 'unknown'}`,
        requirement,
      })),
  );

  assert.notEqual(dungeonRequirements.length, 0, '未找到需要校验的突破秘境要求');

  for (const { breakthrough, requirement } of dungeonRequirements) {
    assert.equal(
      requirement.difficultyId,
      undefined,
      `${breakthrough} 的 ${requirement.id ?? 'unknown'} 仍然限制了 difficultyId`,
    );
  }
});
