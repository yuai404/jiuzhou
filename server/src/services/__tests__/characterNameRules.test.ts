/**
 * 角色道号共享规则测试
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：锁定角色道号的统一裁剪与长度校验规则，避免创角、改名各自维护一套 2-12 字符判断。
 * 2. 做什么：为前后续服务层敏感词与重名校验提供稳定的格式前置入口。
 * 3. 不做什么：不触达数据库，不覆盖敏感词服务或重名查询。
 *
 * 输入/输出：
 * - 输入：原始道号字符串。
 * - 输出：归一化后的道号，以及长度错误文案。
 *
 * 数据流/状态流：
 * 原始输入 -> `normalizeCharacterNicknameInput` -> `getCharacterNicknameLengthError` -> 创角/改名服务消费。
 *
 * 关键边界条件与坑点：
 * 1. 首尾空白必须先裁剪，否则 `"  青玄  "` 会让前后端长度判断不一致。
 * 2. 长度错误文案必须共享，不能让创角和改名各弹一套不同提示。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARACTER_NICKNAME_LENGTH_MESSAGE,
  CHARACTER_NICKNAME_MAX_LENGTH,
  CHARACTER_NICKNAME_MIN_LENGTH,
  getCharacterNicknameLengthError,
  normalizeCharacterNicknameInput,
} from '../shared/characterNameRules.js';

test('normalizeCharacterNicknameInput: 应裁剪首尾空白', () => {
  assert.equal(normalizeCharacterNicknameInput('  青玄  '), '青玄');
});

test('getCharacterNicknameLengthError: 过短与过长时应返回统一错误文案', () => {
  assert.equal(CHARACTER_NICKNAME_MIN_LENGTH, 2);
  assert.equal(CHARACTER_NICKNAME_MAX_LENGTH, 12);
  assert.equal(getCharacterNicknameLengthError('玄'), CHARACTER_NICKNAME_LENGTH_MESSAGE);
  assert.equal(
    getCharacterNicknameLengthError('一二三四五六七八九十一二三'),
    CHARACTER_NICKNAME_LENGTH_MESSAGE,
  );
});

test('getCharacterNicknameLengthError: 合法长度应返回 null', () => {
  assert.equal(getCharacterNicknameLengthError('青玄子'), null);
});
