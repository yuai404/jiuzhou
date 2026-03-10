/**
 * 功法学习规则共享模块测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：验证洞府研修功法学习时不再校验境界，普通静态功法仍保留原有学习境界要求。
 * 2. 不做什么：不覆盖背包使用、接口路由或数据库事务，只验证共享纯函数的判定结果。
 *
 * 输入/输出：
 * - 输入：学习来源信息。
 * - 输出：是否需要校验学习境界的布尔值。
 *
 * 数据流/状态流：
 * 学习来源信息 -> shouldValidateTechniqueLearnRealm -> 学习入口是否执行学习境界拦截。
 *
 * 关键边界条件与坑点：
 * 1. 普通功法来源不能被误判成免门槛，否则会把整套功法学习规则一起放开。
 * 2. 洞府研修的背包学习与直学来源都必须统一识别为“免学习境界”，避免规则再次分叉。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldValidateTechniqueLearnRealm } from '../shared/techniqueLearnRule.js';

test('shouldValidateTechniqueLearnRealm: 普通功法来源仍需校验学习境界', () => {
  assert.equal(shouldValidateTechniqueLearnRealm({ effectType: 'learn_technique', obtainedFrom: 'item' }), true);
});

test('shouldValidateTechniqueLearnRealm: 洞府研修功法书不再校验学习境界', () => {
  assert.equal(
    shouldValidateTechniqueLearnRealm({ effectType: 'learn_generated_technique', itemDefId: 'book-generated-technique' }),
    false,
  );
});

test('shouldValidateTechniqueLearnRealm: 洞府研修直学来源不再校验学习境界', () => {
  assert.equal(
    shouldValidateTechniqueLearnRealm({ obtainedFrom: 'technique_generate:tg-001' }),
    false,
  );
});
