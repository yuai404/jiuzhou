import test from 'node:test';
import assert from 'node:assert/strict';
import { isMapEnabled } from '../mapService.js';

test('isMapEnabled: enabled 缺省时视为可用', () => {
  assert.equal(isMapEnabled({}), true);
});

test('isMapEnabled: enabled 为 true 时可用', () => {
  assert.equal(isMapEnabled({ enabled: true }), true);
});

test('isMapEnabled: enabled 为 false 时不可用', () => {
  assert.equal(isMapEnabled({ enabled: false }), false);
});

test('isMapEnabled: map 为 null/undefined 时不可用', () => {
  assert.equal(isMapEnabled(null), false);
  assert.equal(isMapEnabled(undefined), false);
});
