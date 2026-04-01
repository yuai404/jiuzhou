import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildWanderAiUserPayload,
  buildWanderAiPromptRuleSet,
  buildWanderAiResponseSchema,
  buildWanderAiSystemMessage,
  validateWanderAiContent,
} from '../wander/ai.js';

test('buildWanderAiPromptRuleSet: 应显式包含 storyTheme 的长度与主题短词约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_continue');

  assert.equal(ruleSet.outputRules.storyThemeLengthRange, '2-24');
  assert.match(
    ruleSet.outputRules.storyThemeStyleRule,
    /必须是 24 字内主题短词/u,
  );
  assert.match(
    ruleSet.outputRules.storyThemeStyleRule,
    /禁止把剧情摘要直接写进 storyTheme/u,
  );
  assert.ok(ruleSet.outputRules.storyThemeExample.length >= 2);
  assert.ok(ruleSet.outputRules.storyThemeExample.length <= 24);
});

test('buildWanderAiPromptRuleSet: 应显式包含 storyPremise 的长度与故事引子约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_continue');

  assert.equal(ruleSet.outputRules.storyPremiseLengthRange, '8-120');
  assert.match(
    ruleSet.outputRules.storyPremiseStyleRule,
    /必须是 8 到 120 字的故事引子/u,
  );
  assert.match(
    ruleSet.outputRules.storyPremiseStyleRule,
    /禁止把整幕 opening 原样压缩/u,
  );
  assert.ok(ruleSet.outputRules.storyPremiseExample.length >= 8);
  assert.ok(ruleSet.outputRules.storyPremiseExample.length <= 120);
});

test('buildWanderAiPromptRuleSet: 应显式包含 episodeTitle 的长度与短标题约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_continue');

  assert.equal(ruleSet.outputRules.episodeTitleLengthRange, '2-24');
  assert.match(
    ruleSet.outputRules.episodeTitleStyleRule,
    /24字内中文短标题/u,
  );
  assert.match(
    ruleSet.outputRules.episodeTitleStyleRule,
    /禁止句子式长标题/u,
  );
});

test('buildWanderAiPromptRuleSet: 应显式包含 optionTexts 的固定数量与非空短句约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_continue');

  assert.equal(ruleSet.outputRules.optionCount, 3);
  assert.equal(ruleSet.outputRules.optionExample.length, 3);
  assert.match(
    ruleSet.outputRules.optionStyleRule,
    /必须是长度恰好为 3 的字符串数组/u,
  );
  assert.match(
    ruleSet.outputRules.optionStyleRule,
    /每个元素都必须是非空短句/u,
  );
  assert.match(
    ruleSet.outputRules.optionStyleRule,
    /禁止返回空字符串、null、对象/u,
  );
  for (const optionText of ruleSet.outputRules.optionExample) {
    assert.equal(typeof optionText, 'string');
    assert.ok(optionText.length > 0);
  }
});

test('buildWanderAiPromptRuleSet: 应显式包含 opening 的长度与正文风格约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_continue');

  assert.equal(ruleSet.outputRules.openingLengthRange, '80-420');
  assert.match(
    ruleSet.outputRules.openingStyleRule,
    /必须是一段 80 到 420 字的完整正文/u,
  );
  assert.match(
    ruleSet.outputRules.openingStyleRule,
    /禁止只写一句过短摘要/u,
  );
  assert.ok(ruleSet.outputRules.openingExample.length >= 80);
  assert.ok(ruleSet.outputRules.openingExample.length <= 420);
});

test('buildWanderAiPromptRuleSet: 应显式包含 summary 的长度与结果摘要约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_continue');

  assert.equal(ruleSet.outputRules.summaryLengthRange, '20-160');
  assert.match(
    ruleSet.outputRules.summaryStyleRule,
    /必须是 20 到 160 字的结果摘要/u,
  );
  assert.match(
    ruleSet.outputRules.summaryStyleRule,
    /禁止只写标题式短语/u,
  );
  assert.ok(ruleSet.outputRules.summaryExample.length >= 20);
  assert.ok(ruleSet.outputRules.summaryExample.length <= 160);
});

test('buildWanderAiSystemMessage: 应在系统提示里强调短标题硬约束', () => {
  const systemMessage = buildWanderAiSystemMessage('must_continue');

  assert.match(systemMessage, /storyTheme 必须是 24 字内主题短词/u);
  assert.match(systemMessage, /storyTheme 示例/u);
  assert.match(systemMessage, /storyPremise 必须是 8 到 120 字的故事引子/u);
  assert.match(systemMessage, /storyPremise 示例/u);
  assert.match(systemMessage, /episodeTitle 必须是 24字内中文短标题/u);
  assert.match(systemMessage, /禁止句子式长标题/u);
  assert.match(systemMessage, /optionTexts 必须是长度恰好为 3 的字符串数组/u);
  assert.match(systemMessage, /禁止返回空字符串、null、对象/u);
  assert.match(systemMessage, /optionTexts 示例/u);
  assert.match(systemMessage, /opening 必须是一段 80 到 420 字的完整正文/u);
  assert.match(systemMessage, /opening 示例/u);
  assert.match(systemMessage, /summary 必须是 20 到 160 字的结果摘要/u);
  assert.match(systemMessage, /summary 示例/u);
  assert.match(systemMessage, /rewardTitleColor 必须是 7 位十六进制颜色字符串/u);
  assert.match(systemMessage, /rewardTitleEffects 必须是长度 1 到 5 的数组/u);
  assert.match(systemMessage, /rewardTitleEffects 可用属性/u);
  assert.match(systemMessage, /max_qixue\(气血上限<=240\)/u);
  assert.match(systemMessage, /wugong\(物攻<=60\)/u);
  assert.match(systemMessage, /0\.03 表示 3%/u);
  assert.match(systemMessage, /非结局幕必须返回 endingType=none/u);
  assert.match(systemMessage, /非结局幕字段示例/u);
});

test('buildWanderAiPromptRuleSet: 应显式暴露称号颜色与属性白名单约束', () => {
  const ruleSet = buildWanderAiPromptRuleSet('must_end');

  assert.equal(ruleSet.outputRules.rewardTitleColorPattern, '#RRGGBB');
  assert.equal(ruleSet.outputRules.rewardTitleEffectCountRange, '1-5');
  assert.ok(ruleSet.outputRules.rewardTitleEffectKeys.length > 0);
  assert.match(ruleSet.outputRules.rewardTitleEffectGuide, /max_qixue|wugong|fagong/u);
  assert.equal(ruleSet.outputRules.rewardTitleEffectValueMaxMap.max_qixue, 240);
  assert.equal(ruleSet.outputRules.rewardTitleEffectValueMaxMap.wugong, 60);
  assert.match(ruleSet.outputRules.rewardTitleEffectLimitGuide, /max_qixue\(气血上限<=240\)/u);
  assert.match(ruleSet.outputRules.rewardTitleEffectLimitGuide, /wugong\(物攻<=60\)/u);
});

test('buildWanderAiPromptRuleSet: 应显式暴露非结局幕称号字段清空示例', () => {
  const ruleSet = buildWanderAiPromptRuleSet('can_continue_or_end');

  assert.equal(ruleSet.outputRules.nonEndingTitleFieldExample.isEnding, false);
  assert.equal(ruleSet.outputRules.nonEndingTitleFieldExample.endingType, 'none');
  assert.equal(ruleSet.outputRules.nonEndingTitleFieldExample.rewardTitleName, '');
  assert.equal(ruleSet.outputRules.nonEndingTitleFieldExample.rewardTitleDesc, '');
  assert.equal(ruleSet.outputRules.nonEndingTitleFieldExample.rewardTitleColor, '');
  assert.deepEqual(ruleSet.outputRules.nonEndingTitleFieldExample.rewardTitleEffects, []);
});

test('buildWanderAiResponseSchema: 可继续也可结局模式必须拆成非结局与结局两条互斥分支', () => {
  const schema = buildWanderAiResponseSchema('can_continue_or_end');

  assert.ok(Array.isArray(schema.oneOf));
  assert.equal(schema.oneOf.length, 2);
  assert.equal(schema.properties.rewardTitleColor.type, 'string');
  assert.equal(schema.properties.rewardTitleColor.maxLength, 7);

  const nonEndingSchema = schema.oneOf[0];
  const endingSchema = schema.oneOf[1];

  assert.equal(nonEndingSchema.type, 'object');
  assert.equal(endingSchema.type, 'object');
  if (nonEndingSchema.type !== 'object' || endingSchema.type !== 'object') {
    throw new Error('云游 schema 分支必须是对象');
  }

  const nonEndingTitleNameSchema = nonEndingSchema.properties.rewardTitleName;
  const nonEndingTitleDescSchema = nonEndingSchema.properties.rewardTitleDesc;
  const nonEndingTitleColorSchema = nonEndingSchema.properties.rewardTitleColor;
  const nonEndingTitleEffectsSchema = nonEndingSchema.properties.rewardTitleEffects;
  const endingTitleColorSchema = endingSchema.properties.rewardTitleColor;
  const endingTitleEffectsSchema = endingSchema.properties.rewardTitleEffects;

  assert.equal(nonEndingSchema.properties.isEnding.const, false);
  assert.equal(nonEndingSchema.properties.endingType.const, 'none');
  assert.equal(nonEndingTitleNameSchema.type, 'string');
  assert.equal(nonEndingTitleDescSchema.type, 'string');
  assert.equal(nonEndingTitleColorSchema.type, 'string');
  assert.equal(nonEndingTitleEffectsSchema.type, 'array');
  assert.equal(endingTitleColorSchema.type, 'string');
  assert.equal(endingTitleEffectsSchema.type, 'array');
  if (
    nonEndingTitleNameSchema.type !== 'string'
    || nonEndingTitleDescSchema.type !== 'string'
    || nonEndingTitleColorSchema.type !== 'string'
    || nonEndingTitleEffectsSchema.type !== 'array'
    || endingTitleColorSchema.type !== 'string'
    || endingTitleEffectsSchema.type !== 'array'
  ) {
    throw new Error('云游 schema 字段类型必须满足字符串/数组约束');
  }

  assert.equal(nonEndingTitleNameSchema.maxLength, 0);
  assert.equal(nonEndingTitleDescSchema.maxLength, 0);
  assert.equal(nonEndingTitleColorSchema.maxLength, 0);
  assert.equal(nonEndingTitleEffectsSchema.maxItems, 0);

  assert.equal(endingSchema.properties.isEnding.const, true);
  assert.equal(endingTitleColorSchema.pattern, '^#[0-9a-fA-F]{6}$');
  assert.equal(endingTitleEffectsSchema.minItems, 1);
  assert.equal(endingTitleEffectsSchema.maxItems, 5);
  assert.equal(endingTitleEffectsSchema.items.type, 'object');
  if (endingTitleEffectsSchema.items.type !== 'object') {
    throw new Error('云游称号属性项 schema 必须是对象');
  }
  const effectEntrySchemas = endingTitleEffectsSchema.items.oneOf;
  if (!Array.isArray(effectEntrySchemas) || effectEntrySchemas.length <= 0) {
    throw new Error('云游称号属性项 schema 必须包含属性分支');
  }
  const attackEntrySchema = effectEntrySchemas.find((item) => (
    item.type === 'object'
    && item.properties.key.type === 'string'
    && item.properties.key.const === 'wugong'
  ));
  if (!attackEntrySchema || attackEntrySchema.type !== 'object') {
    throw new Error('云游称号属性项 schema 必须包含物攻分支');
  }
  const maxHpEntrySchema = effectEntrySchemas.find((item) => (
    item.type === 'object'
    && item.properties.key.type === 'string'
    && item.properties.key.const === 'max_qixue'
  ));
  if (!maxHpEntrySchema || maxHpEntrySchema.type !== 'object') {
    throw new Error('云游称号属性项 schema 必须包含气血上限分支');
  }
  assert.equal(attackEntrySchema.properties.value.type, 'integer');
  assert.equal(attackEntrySchema.properties.value.maximum, 60);
  assert.equal(maxHpEntrySchema.properties.value.type, 'integer');
  assert.equal(maxHpEntrySchema.properties.value.maximum, 240);
});

test('buildWanderAiUserPayload: 不应再把 mainQuestName 透传给模型', () => {
  const payload = buildWanderAiUserPayload({
    nickname: '测试角色',
    realm: '炼气期',
    mapName: '林中空地',
    hasTeam: false,
    activeTheme: null,
    activePremise: null,
    storySummary: null,
    nextEpisodeIndex: 1,
    maxEpisodeIndex: 15,
    canEndThisEpisode: false,
    previousEpisodes: [],
  }, 123456);

  assert.equal(payload.player.nickname, '测试角色');
  assert.equal(payload.player.mapName, '林中空地');
  assert.equal('mainQuestName' in payload.player, false);
});

test('validateWanderAiContent: 非结局幕返回空称号字段与空属性数组时必须通过', () => {
  const validation = validateWanderAiContent(JSON.stringify({
    storyTheme: '雨夜借灯',
    storyPremise: '你循着残留血迹误入谷口深处，才觉今夜盘踞此地的异物并非寻常山兽。',
    episodeTitle: '桥下窥影',
    opening: '夜雨压桥，河雾顺着石栏缓缓爬起，你在破庙檐下收住衣角，见对岸灯影摇成一线。那人披旧蓑衣提灯不前不后，只隔雨幕望来，像在等谁认出他的来意。桥下水声忽然沉了一拍，像有什么东西正贴着桥墩缓缓游过。你屏住气息，才发觉这场相遇并非偶然，来客与暗潮都在试探你会先看向哪一边。',
    summary: '你暂且按住出手念头，在桥上桥下两股异动之间权衡去向，这一幕落在更深的试探前夜。',
    optionTexts: ['先借檐避雨，再试探来意', '绕到桥下暗查灵息', '收敛气机，静观其变'],
    isEnding: false,
    endingType: 'none',
    rewardTitleName: '',
    rewardTitleDesc: '',
    rewardTitleColor: '',
    rewardTitleEffects: [],
  }));

  if (validation.success) {
    assert.deepEqual(validation.data.rewardTitleEffects, {});
    return;
  }
  throw new Error(validation.reason);
});

test('validateWanderAiContent: 结局幕百分比称号属性必须使用小数比率口径', () => {
  const validation = validateWanderAiContent(JSON.stringify({
    storyTheme: '镇渊剑痕',
    storyPremise: '你循着地穴深处翻涌的古剑煞气一路下探，终在崩裂石壁后看见那道被锁链封住的旧日剑印。',
    episodeTitle: '锁渊断痕',
    opening: '地穴最深处寒意沉坠，碎石沿着裂缝不断滚落，你提剑踏入那片被旧血染黑的空场时，四周锁链正被地下气脉一寸寸撑开。断碑上残存的剑痕与脚下阵纹彼此呼应，像有人在许多年前就把一场未竟之战封进这里。你刚以神识探去，锁链尽头便传来沉闷回响，仿佛古老剑意隔着漫长岁月重新醒来，逼得护体灵光都在瞬间绷紧。',
    summary: '你闯入封锁古剑的地穴核心，旧阵与锁链同时异动，终幕前的最后一道剑压已正面逼来。',
    optionTexts: ['迎着剑压强开阵眼', '借锁链回震反探旧主残念', '先稳住气机再逼近断碑'],
    isEnding: true,
    endingType: 'good',
    rewardTitleName: '镇渊剑尊',
    rewardTitleDesc: '剑意镇渊，余威仍压地穴旧煞。',
    rewardTitleColor: '#faad14',
    rewardTitleEffects: [
      { key: 'wugong', value: 60 },
      { key: 'baoji', value: 0.03 },
      { key: 'kangbao', value: 0.02 },
    ],
  }));

  if (!validation.success) {
    throw new Error(validation.reason);
  }

  assert.deepEqual(validation.data.rewardTitleEffects, {
    wugong: 60,
    baoji: 0.03,
    kangbao: 0.02,
  });
});

test('validateWanderAiContent: 结局幕百分比称号属性若写成整数百分数必须拒绝', () => {
  const validation = validateWanderAiContent(JSON.stringify({
    storyTheme: '镇渊剑痕',
    storyPremise: '你循着地穴深处翻涌的古剑煞气一路下探，终在崩裂石壁后看见那道被锁链封住的旧日剑印。',
    episodeTitle: '锁渊断痕',
    opening: '地穴最深处寒意沉坠，碎石沿着裂缝不断滚落，你提剑踏入那片被旧血染黑的空场时，四周锁链正被地下气脉一寸寸撑开。断碑上残存的剑痕与脚下阵纹彼此呼应，像有人在许多年前就把一场未竟之战封进这里。你刚以神识探去，锁链尽头便传来沉闷回响，仿佛古老剑意隔着漫长岁月重新醒来，逼得护体灵光都在瞬间绷紧。',
    summary: '你闯入封锁古剑的地穴核心，旧阵与锁链同时异动，终幕前的最后一道剑压已正面逼来。',
    optionTexts: ['迎着剑压强开阵眼', '借锁链回震反探旧主残念', '先稳住气机再逼近断碑'],
    isEnding: true,
    endingType: 'good',
    rewardTitleName: '镇渊剑尊',
    rewardTitleDesc: '剑意镇渊，余威仍压地穴旧煞。',
    rewardTitleColor: '#faad14',
    rewardTitleEffects: [
      { key: 'wugong', value: 60 },
      { key: 'baoji', value: 15 },
    ],
  }));

  assert.equal(validation.success, false);
  if (validation.success) {
    throw new Error('整数百分数字段不应通过云游称号校验');
  }
});

test('validateWanderAiContent: 高价值固定值属性必须命中更严格的专属上限', () => {
  const validation = validateWanderAiContent(JSON.stringify({
    storyTheme: '荒台问锋',
    storyPremise: '你沿断崖石阶深入旧宗荒台，最终在裂开的祭坛中央看见那柄迟迟不肯熄灭剑芒的残兵。',
    episodeTitle: '荒台定锋',
    opening: '旧宗荒台早被风沙掩去半边阶痕，你踏上最后一级残阶时，祭坛中央那柄残兵仍在夜色里缓缓吐出冷芒。四周断柱尽是旧战留下的崩纹，地面却有一道道新近裂开的焦痕，像有人刚在此与某种不可见的意志僵持过。你才靠近半步，残兵上凝住的剑意便顺着风声压来，迫得护体气机一阵发紧，仿佛只要你做出抉择，这座荒台便会立刻给出最后的回应。',
    summary: '你逼近旧宗荒台中央的残兵，压在夜风里的剑意已经认准来者，结局就在抉择落定的一瞬。',
    optionTexts: ['正面握住残兵承受剑压', '借祭坛裂纹反推旧战真相', '先布护阵再试探兵魂回应'],
    isEnding: true,
    endingType: 'good',
    rewardTitleName: '荒台定锋',
    rewardTitleDesc: '荒台旧锋未灭，余势仍可镇敌。',
    rewardTitleColor: '#faad14',
    rewardTitleEffects: [
      { key: 'wugong', value: 61 },
      { key: 'max_qixue', value: 240 },
    ],
  }));

  assert.equal(validation.success, false);
  if (validation.success) {
    throw new Error('物攻超出专属上限时不应通过云游称号校验');
  }
});
