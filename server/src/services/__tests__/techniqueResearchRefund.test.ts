/**
 * 洞府研修返还规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证洞府研修在不同返还比例下的残页返还数量计算，确保过期草稿与失败退款共用同一套口径。
 * 2. 不做什么：不覆盖数据库更新、不覆盖背包入包流程，只验证共享纯函数。
 *
 * 输入/输出：
 * - 输入：消耗残页数量与返还比例。
 * - 输出：最终返还的非负整数残页数量。
 *
 * 数据流/状态流：
 * technique_generation_job.cost_points -> techniqueResearchRefund -> techniqueGenerationService 退款流程。
 *
 * 关键边界条件与坑点：
 * 1. 过期草稿只返还一半，必须与默认全额返还明确区分，避免 service 内硬编码比例。
 * 2. 异常输入必须回退到非负整数，避免把小数或负数写回背包。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTechniqueResearchRefundRewardPayload,
  resolveTechniqueResearchRefundFragments,
  TECHNIQUE_RESEARCH_EXPIRED_DRAFT_REFUND_RATE,
  TECHNIQUE_RESEARCH_FULL_REFUND_RATE,
} from '../shared/techniqueResearchRefund.js';
import {
  TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_COST,
  TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_ITEM_DEF_ID,
} from '../shared/techniqueResearchCooldownBypass.js';
import { TECHNIQUE_RESEARCH_FRAGMENT_ITEM_DEF_ID } from '../shared/techniqueResearchCost.js';

test('resolveTechniqueResearchRefundFragments: 失败退款默认应全额返还', () => {
  assert.equal(
    resolveTechniqueResearchRefundFragments(5_000, TECHNIQUE_RESEARCH_FULL_REFUND_RATE),
    5_000,
  );
});

test('resolveTechniqueResearchRefundFragments: 草稿过期应只返还一半消耗', () => {
  assert.equal(
    resolveTechniqueResearchRefundFragments(5_000, TECHNIQUE_RESEARCH_EXPIRED_DRAFT_REFUND_RATE),
    2_500,
  );
});

test('resolveTechniqueResearchRefundFragments: 异常输入应保守回退到非负整数', () => {
  assert.equal(resolveTechniqueResearchRefundFragments(-100, 1), 0);
  assert.equal(resolveTechniqueResearchRefundFragments(101, 0.5), 50);
  assert.equal(resolveTechniqueResearchRefundFragments(100, -1), 0);
});

test('buildTechniqueResearchRefundRewardPayload: pending 失败且消耗过顿悟符时应同时返还残页与顿悟符', () => {
  assert.deepEqual(
    buildTechniqueResearchRefundRewardPayload({
      refundFragments: 2_500,
      refundCooldownBypassToken: true,
    }),
    {
      items: [
        {
          itemDefId: TECHNIQUE_RESEARCH_FRAGMENT_ITEM_DEF_ID,
          quantity: 2_500,
        },
        {
          itemDefId: TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_ITEM_DEF_ID,
          quantity: TECHNIQUE_RESEARCH_COOLDOWN_BYPASS_TOKEN_COST,
        },
      ],
    },
  );
});
