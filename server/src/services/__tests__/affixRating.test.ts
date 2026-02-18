import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPercentToRating,
  convertRatingToPercent,
  getEffectiveLevelByRealmRank,
  resolveRatingBaseAttrKey,
  toRatingAttrKey,
} from '../shared/affixRating.js';

test('同一rating在高等级下收益应更低', () => {
  const rating = 120;
  const lowLevelPercent = convertRatingToPercent('baoji', rating, 1);
  const highLevelPercent = convertRatingToPercent('baoji', rating, 85);
  assert.ok(lowLevelPercent > highLevelPercent);
});

test('同等级下百分比与rating应可近似互逆', () => {
  const effectiveLevel = getEffectiveLevelByRealmRank(6);
  const originPercent = 0.018;
  const rating = convertPercentToRating('baoji', originPercent, effectiveLevel);
  const projectedPercent = convertRatingToPercent('baoji', rating, effectiveLevel);
  assert.ok(Math.abs(projectedPercent - originPercent) < 0.003);
});

test('rating键解析应正确', () => {
  const ratingKey = toRatingAttrKey('zengshang');
  assert.equal(ratingKey, 'zengshang_rating');
  assert.equal(resolveRatingBaseAttrKey(ratingKey), 'zengshang');
  assert.equal(resolveRatingBaseAttrKey('zengshang'), null);
});
