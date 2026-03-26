/**
 * 最近成功生成功法参考提示词测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定最近成功描述 prompt context 的归一化、去重与数量截断，避免洞府研修服务与测试链路各自拼不同字段。
 * 2. 不做什么：不请求真实模型，不校验数据库查询，也不覆盖功法生成结果合法性。
 *
 * 输入/输出：
 * - 输入：模拟的最近成功生成功法参考数组。
 * - 输出：稳定的 extraContext 结构或 undefined。
 *
 * 数据流/状态流：
 * 最近成功记录 -> buildTechniqueRecentSuccessfulDescriptionPromptContext -> extraContext -> 功法生成请求测试复用。
 *
 * 关键边界条件与坑点：
 * 1. 空 description/longDesc 的记录不应进入 prompt，否则只会增加噪声而不会提升去重效果。
 * 2. 同一条参考若重复出现，必须在共享层去重，避免模型把重复素材误判为“特别强调”的主题。
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_DIVERSITY_RULES,
  TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT,
  buildTechniqueRecentSuccessfulDescriptionPromptContext,
} from '../shared/techniqueRecentSuccessfulDescriptionPrompt.js';

test('buildTechniqueRecentSuccessfulDescriptionPromptContext: 应过滤空描述并去重', () => {
  const context = buildTechniqueRecentSuccessfulDescriptionPromptContext([
    {
      name: '  焚潮诀  ',
      quality: '地',
      type: '法诀',
      description: '  以火潮叠势灼烧敌阵。  ',
      longDesc: '  借印记拖长节奏，待层数满后引爆。  ',
    },
    {
      name: '焚潮诀',
      quality: '地',
      type: '法诀',
      description: '以火潮叠势灼烧敌阵。',
      longDesc: '借印记拖长节奏，待层数满后引爆。',
    },
    {
      name: '空白录',
      quality: '黄',
      type: '辅修',
      description: '   ',
      longDesc: '   ',
    },
  ]);

  assert.deepEqual(context?.techniqueRecentSuccessfulDescriptions, [
    {
      name: '焚潮诀',
      quality: '地',
      type: '法诀',
      description: '以火潮叠势灼烧敌阵。',
      longDesc: '借印记拖长节奏，待层数满后引爆。',
    },
  ]);
  assert.deepEqual(
    context?.techniqueRecentSuccessfulDescriptionDiversityRules,
    [...TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_DIVERSITY_RULES],
  );
});

test('buildTechniqueRecentSuccessfulDescriptionPromptContext: 应最多保留最近限制条数', () => {
  const entries = Array.from({ length: TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT + 2 }, (_, index) => ({
    name: `功法${index + 1}`,
    quality: '玄' as const,
    type: '武技',
    description: `描述${index + 1}`,
    longDesc: `长描${index + 1}`,
  }));

  const context = buildTechniqueRecentSuccessfulDescriptionPromptContext(entries);

  assert.equal(
    context?.techniqueRecentSuccessfulDescriptions.length,
    TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT,
  );
  assert.equal(context?.techniqueRecentSuccessfulDescriptions[0]?.name, '功法1');
  assert.equal(
    context?.techniqueRecentSuccessfulDescriptions[TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT - 1]?.name,
    `功法${TECHNIQUE_RECENT_SUCCESSFUL_DESCRIPTION_LIMIT}`,
  );
});

test('buildTechniqueRecentSuccessfulDescriptionPromptContext: 无有效描述时应返回 undefined', () => {
  assert.equal(
    buildTechniqueRecentSuccessfulDescriptionPromptContext([
      {
        name: '空白录',
        quality: '黄',
        type: '辅修',
        description: '   ',
        longDesc: '   ',
      },
    ]),
    undefined,
  );
});
