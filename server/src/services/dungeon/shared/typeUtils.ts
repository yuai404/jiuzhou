/**
 * 秘境模块类型转换工具
 *
 * 作用：提供 dungeon 模块内部使用的类型安全转换函数。
 * - asObject / asArray / asNumber / asString 是 dungeon 特有版本，
 *   支持 JSON 字符串自动解析，与全局 typeCoercion 语义略有不同。
 * - toDungeonType / getRealmRank / isRealmSufficient / countPlayerDeaths
 *   为 dungeon 业务专属工具。
 *
 * 输入：unknown 值 + 可选 fallback。
 * 输出：类型安全的目标值。
 *
 * 复用点：dungeon 模块内部所有子文件（configLoader / entryCount / participants / rewards / combat 等）。
 *
 * 边界条件：
 * 1) asObject/asArray 会尝试 JSON.parse，解析失败返回 null/[]，不抛异常。
 * 2) getRealmRank 对未知境界返回 0，isRealmSufficient 在此基础上做 >= 比较。
 */

import { REALM_ORDER } from '../../shared/realmRules.js';
import type { DungeonType } from '../types.js';

/** unknown -> Record（支持 JSON 字符串解析，失败返回 null） */
export const asObject = (v: unknown): Record<string, unknown> | null => {
  if (!v) return null;
  if (typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
};

/** unknown -> unknown[]（支持 JSON 字符串解析，失败返回 []） */
export const asArray = (v: unknown): unknown[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

/** unknown -> number（支持字符串数值解析，失败返回 fallback） */
export const asNumber = (v: unknown, fallback: number): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
};

/** unknown -> string（支持 number 自动转字符串，失败返回 fallback） */
export const asString = (v: unknown, fallback: string = ''): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
};

/** 将 unknown 值转为 DungeonType 枚举，无效返回 null */
export const toDungeonType = (v: unknown): DungeonType | null => {
  if (v === 'material' || v === 'equipment' || v === 'trial' || v === 'challenge' || v === 'event') return v;
  return null;
};

/** 获取境界在 REALM_ORDER 中的序号（未知返回 0） */
export const getRealmRank = (realm: string): number => {
  const idx = (REALM_ORDER as readonly string[]).indexOf(realm);
  return idx >= 0 ? idx : 0;
};

/** 判断角色境界是否满足最低要求 */
export const isRealmSufficient = (characterRealm: string, minRealm: string): boolean => {
  return getRealmRank(characterRealm) >= getRealmRank(minRealm);
};

/** 统计战斗日志中玩家死亡次数（unitId 以 player- 开头视为玩家） */
export const countPlayerDeaths = (logs: unknown): number => {
  const list = asArray(logs);
  let count = 0;
  for (const it of list) {
    const obj = asObject(it);
    if (!obj) continue;
    if (obj.type !== 'death') continue;
    const unitId = obj.unitId;
    if (typeof unitId === 'string' && unitId.startsWith('player-')) count += 1;
  }
  return count;
};
