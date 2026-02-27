import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type SeedAffixTier = {
  tier: number;
  min: number;
  max: number;
  realm_rank_min: number;
  description?: string;
};

type SeedAffix = {
  key: string;
  apply_type: 'flat' | 'percent' | 'special';
  tiers: SeedAffixTier[];
};

type SeedPool = {
  id: string;
  affixes: SeedAffix[];
};

type AffixPoolSeedFile = {
  pools: SeedPool[];
};

const COMMON_POOL_IDS = [
  'ap-weapon-common',
  'ap-armor-common',
  'ap-accessory-common',
  'ap-artifact-common',
] as const;

const EXPECTED_TOTAL_TIER_ROWS = 1073;

const trimNumber = (value: number, maxDp = 6): string => {
  return Number(value)
    .toFixed(maxDp)
    .replace(/\.0+$/, '')
    .replace(/(\.\d*?[1-9])0+$/, '$1');
};

type SpecialDescriptionRule = {
  buildDescription: (min: number, max: number) => string;
  requiredTiers: number[];
};

const specialDescriptionRules: Record<string, SpecialDescriptionRule> = {
  proc_zhuihun: {
    buildDescription: (min, max) => `命中时22%概率触发追魂斩，追加${trimNumber(min)}~${trimNumber(max)}点真伤并附加60%物攻加成`,
    requiredTiers: [7, 8],
  },
  proc_tianlei: {
    buildDescription: (min, max) => `命中时22%概率引动天雷，追加${trimNumber(min)}~${trimNumber(max)}点法伤并附加65%法攻加成`,
    requiredTiers: [7, 8],
  },
  proc_baonu: {
    buildDescription: (min, max) => `暴击时28%概率激发暴怒意，2回合内增伤提高${trimNumber(min * 100)}%~${trimNumber(max * 100)}%`,
    requiredTiers: [7, 8],
  },
  proc_hushen: {
    buildDescription: (min, max) => `受击时26%概率触发护心诀，回复${trimNumber(min)}~${trimNumber(max)}点气血并附加9%生命加成`,
    requiredTiers: [7, 8],
  },
  proc_fansha: {
    buildDescription: (min, max) => `受击时22%概率反煞，反弹${trimNumber(min * 100)}%~${trimNumber(max * 100)}%本次伤害`,
    requiredTiers: [7, 8],
  },
  proc_lingchao: {
    buildDescription: (min, max) => `回合开始时30%概率引动灵潮，恢复${trimNumber(min)}~${trimNumber(max)}点灵气`,
    requiredTiers: [7, 8],
  },
  proc_duanxing: {
    buildDescription: (min, max) => `命中时20%概率引爆断星芒，造成${trimNumber(min)}~${trimNumber(max)}点真伤并附加42%最大灵气加成`,
    requiredTiers: [8],
  },
  proc_huixiang: {
    buildDescription: (min, max) => `命中时22%概率引动太虚回锋，追加本次命中伤害${trimNumber(min * 100)}%~${trimNumber(max * 100)}%的真伤`,
    requiredTiers: [8],
  },
  proc_xuangang: {
    buildDescription: (min, max) => `受击时27%概率凝成玄罡回璧，获得相当于本次受击伤害${trimNumber(min * 100)}%~${trimNumber(max * 100)}%的护盾，持续2回合`,
    requiredTiers: [8],
  },
};

const loadSeed = (): AffixPoolSeedFile => {
  const candidatePaths = [
    resolve(process.cwd(), 'server/src/data/seeds/affix_pool.json'),
    resolve(process.cwd(), 'src/data/seeds/affix_pool.json'),
  ];
  const seedPath = candidatePaths.find((filePath) => existsSync(filePath));
  assert.ok(seedPath, '未找到 affix_pool.json 种子文件');
  return JSON.parse(readFileSync(seedPath, 'utf-8')) as AffixPoolSeedFile;
};

test('词缀池应全量扩展到T8且tier门槛一致', () => {
  const seed = loadSeed();
  let tierRowCount = 0;

  for (const pool of seed.pools) {
    for (const affix of pool.affixes) {
      const tiers = [...affix.tiers].sort((a, b) => a.tier - b.tier);
      assert.ok(tiers.length > 0, `${pool.id}:${affix.key} tiers 不能为空`);
      assert.equal(
        tiers[tiers.length - 1]?.tier,
        8,
        `${pool.id}:${affix.key} maxTier 应为 T8`
      );

      for (const tier of tiers) {
        assert.equal(
          tier.realm_rank_min,
          tier.tier,
          `${pool.id}:${affix.key}:T${tier.tier} realm_rank_min 应与 tier 一致`
        );
        tierRowCount += 1;
      }
    }
  }

  assert.equal(tierRowCount, EXPECTED_TOTAL_TIER_ROWS, 'tier 总行数不符合预期');
});

test('common池词缀应连续到T8且区间单调', () => {
  const seed = loadSeed();

  for (const poolId of COMMON_POOL_IDS) {
    const pool = seed.pools.find((row) => row.id === poolId);
    assert.ok(pool, `缺少词缀池: ${poolId}`);

    for (const affix of pool.affixes) {
      const tiers = [...affix.tiers].sort((a, b) => a.tier - b.tier);
      const tierValues = tiers.map((tier) => tier.tier);
      assert.deepEqual(
        tierValues,
        [1, 2, 3, 4, 5, 6, 7, 8],
        `${poolId}:${affix.key} 档位应连续为 T1..T8`
      );

      let prevMin = Number.NEGATIVE_INFINITY;
      let prevMax = Number.NEGATIVE_INFINITY;
      for (const tier of tiers) {
        const min = Number(tier.min);
        const max = Number(tier.max);
        assert.ok(Number.isFinite(min) && Number.isFinite(max), `${poolId}:${affix.key}:T${tier.tier} 数值非法`);
        assert.ok(max > min, `${poolId}:${affix.key}:T${tier.tier} 应满足 max > min`);
        assert.ok(min >= prevMin, `${poolId}:${affix.key}:T${tier.tier} min 不应回退`);
        assert.ok(max >= prevMax, `${poolId}:${affix.key}:T${tier.tier} max 不应回退`);
        prevMin = min;
        prevMax = max;
      }
    }
  }
});

test('special词缀关键档位描述应与数值一致', () => {
  const seed = loadSeed();

  for (const pool of seed.pools) {
    for (const affix of pool.affixes) {
      if (affix.apply_type !== 'special') continue;

      const descriptionRule = specialDescriptionRules[affix.key];
      assert.ok(descriptionRule, `${pool.id}:${affix.key} 缺少描述模板`);

      for (const targetTier of descriptionRule.requiredTiers) {
        const tier = affix.tiers.find((row) => row.tier === targetTier);
        assert.ok(tier, `${pool.id}:${affix.key} 缺少 T${targetTier}`);
        const expected = descriptionRule.buildDescription(Number(tier.min), Number(tier.max));
        assert.equal(
          (tier.description ?? '').trim(),
          expected,
          `${pool.id}:${affix.key}:T${targetTier} 描述应与数值一致`
        );
      }
    }
  }
});
