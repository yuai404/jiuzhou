/**
 * 伙伴打书替换预览文案测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定伙伴功法替换预览标题与提示文案，确保“确认替换”和“放弃也消耗书”两条关键信息稳定输出。
 * 2. 做什么：把预览文案集中回归到共享函数，避免弹窗 JSX 与成功提示各写一套。
 * 3. 不做什么：不发请求、不渲染弹窗，也不验证服务端随机替换或物品扣除逻辑。
 *
 * 输入/输出：
 * - 输入：两门 `PartnerTechniqueDto` 形状的功法数据。
 * - 输出：预览标题字符串与提示文案数组。
 *
 * 数据流/状态流：
 * 伙伴打书预览接口 DTO -> `partnerShared` 纯函数 -> PartnerModal 预览弹窗。
 *
 * 关键边界条件与坑点：
 * 1. 预览标题必须同时点出“新学什么”和“替换谁”，否则玩家无法判断本次随机结果。
 * 2. 放弃学习的消耗提示必须显式出现，不能只放在按钮文案里，否则用户容易误判为无损取消。
 */

import { describe, expect, it } from 'vitest';
import type { PartnerTechniqueDto } from '../../../../services/api/partner';
import {
  buildPartnerLearnPreviewLines,
  formatPartnerLearnPreviewTitle,
} from '../PartnerModal/partnerShared';

const createTechnique = (
  techniqueId: string,
  name: string,
  quality: string,
): PartnerTechniqueDto => ({
  techniqueId,
  name,
  description: `${name}描述`,
  icon: `/assets/${techniqueId}.png`,
  quality,
  currentLayer: 1,
  maxLayer: 9,
  skillIds: [],
  skills: [],
  passiveAttrs: {},
  isInnate: false,
});

describe('partner technique learn preview copy', () => {
  it('预览标题应同时展示新功法与被替换功法', () => {
    const learnedTechnique = createTechnique('tech-qingmu', '青木诀', '玄');
    const replacedTechnique = createTechnique('tech-jingtao', '惊涛诀', '黄');

    expect(formatPartnerLearnPreviewTitle(learnedTechnique, replacedTechnique))
      .toBe('学习「青木诀」将替换「惊涛诀」');
  });

  it('预览提示文案应明确说明放弃也会消耗功法书', () => {
    const learnedTechnique = createTechnique('tech-qingmu', '青木诀', '玄');
    const replacedTechnique = createTechnique('tech-jingtao', '惊涛诀', '黄');

    expect(buildPartnerLearnPreviewLines(learnedTechnique, replacedTechnique)).toContain(
      '选择“放弃学习”后，本次功法书仍会被消耗，但不会习得新功法。',
    );
  });
});
