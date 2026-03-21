import { describe, expect, it } from 'vitest';
import type { PartnerRecruitStatusDto } from '../../../../services/api/partner';
import {
  resolvePartnerRecruitQualityRateItems,
  resolvePartnerRecruitActionState,
  resolvePartnerRecruitCooldownDisplay,
  resolvePartnerRecruitSubmitState,
} from '../PartnerModal/partnerRecruitShared';

const buildRecruitStatus = (
  overrides: Partial<PartnerRecruitStatusDto> = {},
): PartnerRecruitStatusDto => ({
  featureCode: 'partner_system',
  unlockRealm: '炼神返虚·养神期',
  unlocked: true,
  spiritStoneCost: 0,
  cooldownHours: 168,
  cooldownUntil: null,
  cooldownRemainingSeconds: 0,
  customBaseModelBypassesCooldown: true,
  customBaseModelMaxLength: 12,
  customBaseModelTokenCost: 1,
  customBaseModelTokenItemName: '高级招募令',
  customBaseModelTokenAvailableQty: 1,
  currentJob: null,
  hasUnreadResult: false,
  resultStatus: null,
  qualityRates: [
    { quality: '黄', weight: 4, rate: 40 },
    { quality: '玄', weight: 3, rate: 30 },
    { quality: '地', weight: 2, rate: 20 },
    { quality: '天', weight: 1, rate: 10 },
  ],
  ...overrides,
});

describe('partnerRecruitShared', () => {
  it('冷却中但启用高级招募令时应允许开始招募', () => {
    const actionState = resolvePartnerRecruitActionState(buildRecruitStatus({
      cooldownUntil: '2026-03-19T12:00:00.000Z',
      cooldownRemainingSeconds: 3_600,
    }), true);

    expect(actionState.canGenerate).toBe(true);
  });

  it('冷却中且未启用高级招募令时应继续禁止开始招募', () => {
    const actionState = resolvePartnerRecruitActionState(buildRecruitStatus({
      cooldownUntil: '2026-03-19T12:00:00.000Z',
      cooldownRemainingSeconds: 3_600,
    }), false);

    expect(actionState.canGenerate).toBe(false);
  });

  it('启用高级招募令时应展示“无视冷却且不重置冷却”的统一提示', () => {
    const cooldownDisplay = resolvePartnerRecruitCooldownDisplay(buildRecruitStatus({
      cooldownUntil: '2026-03-19T12:00:00.000Z',
      cooldownRemainingSeconds: 3_600,
    }), true);

    expect(cooldownDisplay.statusText).toContain('本次招募不受影响');
    expect(cooldownDisplay.ruleText).toContain('不会重置或新增招募冷却');
    expect(cooldownDisplay.bypassedByCustomBaseModel).toBe(true);
  });

  it('启用高级招募令模式后即使未填写底模也应允许提交', () => {
    const submitState = resolvePartnerRecruitSubmitState(buildRecruitStatus({
      cooldownUntil: '2026-03-19T12:00:00.000Z',
      cooldownRemainingSeconds: 3_600,
    }), true);

    expect(submitState.canSubmit).toBe(true);
    expect(submitState.disabledReason).toBeNull();
  });

  it('启用高级招募令模式但令牌不足时应继续禁止提交', () => {
    const submitState = resolvePartnerRecruitSubmitState(buildRecruitStatus({
      customBaseModelTokenAvailableQty: 0,
      cooldownUntil: '2026-03-19T12:00:00.000Z',
      cooldownRemainingSeconds: 3_600,
    }), true);

    expect(submitState.canSubmit).toBe(false);
    expect(submitState.disabledReason).toContain('高级招募令不足');
  });

  it('应把服务端下发的品质概率格式化为招募面板展示项', () => {
    expect(resolvePartnerRecruitQualityRateItems(buildRecruitStatus())).toEqual([
      { quality: '黄', rateText: '40%' },
      { quality: '玄', rateText: '30%' },
      { quality: '地', rateText: '20%' },
      { quality: '天', rateText: '10%' },
    ]);
  });
});
