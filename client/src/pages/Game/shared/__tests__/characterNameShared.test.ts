/**
 * 角色道号前端共享规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定前端对道号输入的裁剪与长度校验口径，避免创角弹窗和易名符改名弹窗各自维护一套规则。
 * 2. 做什么：确保表单层提示文案保持统一，减少前后端和不同入口之间的认知偏差。
 * 3. 不做什么：不渲染真实表单组件，不覆盖接口请求与弹窗交互。
 *
 * 输入/输出：
 * - 输入：原始道号字符串。
 * - 输出：归一化后的道号，以及统一长度错误文案。
 *
 * 数据流/状态流：
 * 原始输入 -> `normalizeCharacterNameInput` -> `getCharacterNameLengthError` -> 创角/改名表单复用。
 *
 * 关键边界条件与坑点：
 * 1. 前端长度判断必须基于裁剪后的值，否则 `"  青玄  "` 在 UI 和服务端会出现不同结论。
 * 2. 错误文案统一后，创角和改名才能共用同一组表单规则，而不是继续复制粘贴。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTER_NAME_LENGTH_MESSAGE,
  CHARACTER_NAME_MAX_LENGTH,
  CHARACTER_NAME_MIN_LENGTH,
  getCharacterNameLengthError,
  normalizeCharacterNameInput,
} from '../characterNameShared';

test('normalizeCharacterNameInput: 应裁剪首尾空白', () => {
  assert.equal(normalizeCharacterNameInput('  青玄  '), '青玄');
});

test('getCharacterNameLengthError: 非法长度应返回统一错误文案', () => {
  assert.equal(CHARACTER_NAME_MIN_LENGTH, 2);
  assert.equal(CHARACTER_NAME_MAX_LENGTH, 12);
  assert.equal(getCharacterNameLengthError('玄'), CHARACTER_NAME_LENGTH_MESSAGE);
  assert.equal(
    getCharacterNameLengthError('一二三四五六七八九十一二三'),
    CHARACTER_NAME_LENGTH_MESSAGE,
  );
});

test('getCharacterNameLengthError: 合法长度应返回 null', () => {
  assert.equal(getCharacterNameLengthError('青玄子'), null);
});
