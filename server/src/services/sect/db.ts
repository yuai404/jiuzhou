import type { PoolClient } from 'pg';
import { query } from '../../config/database.js';
import type { SectPosition } from './types.js';

export const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
};

export const getCharacterUserId = async (characterId: number, client?: PoolClient): Promise<number | null> => {
  const executor = client ? client : { query };
  const result = await executor.query('SELECT user_id FROM characters WHERE id = $1', [characterId]);
  if (result.rows.length === 0) return null;
  return toNumber(result.rows[0].user_id);
};

export const getCharacterRealm = async (characterId: number, client?: PoolClient): Promise<string | null> => {
  const executor = client ? client : { query };
  const result = await executor.query('SELECT realm FROM characters WHERE id = $1', [characterId]);
  if (result.rows.length === 0) return null;
  return typeof result.rows[0].realm === 'string' ? result.rows[0].realm : null;
};

export const getCharacterSectId = async (characterId: number, client?: PoolClient): Promise<string | null> => {
  const executor = client ? client : { query };
  const result = await executor.query('SELECT sect_id FROM sect_member WHERE character_id = $1', [characterId]);
  if (result.rows.length === 0) return null;
  return typeof result.rows[0].sect_id === 'string' ? result.rows[0].sect_id : null;
};

export const getMemberPosition = async (
  characterId: number,
  client?: PoolClient
): Promise<{ sectId: string; position: SectPosition } | null> => {
  const executor = client ? client : { query };
  const result = await executor.query('SELECT sect_id, position FROM sect_member WHERE character_id = $1', [characterId]);
  if (result.rows.length === 0) return null;
  const sectId = typeof result.rows[0].sect_id === 'string' ? result.rows[0].sect_id : null;
  const position = typeof result.rows[0].position === 'string' ? (result.rows[0].position as SectPosition) : null;
  if (!sectId || !position) return null;
  return { sectId, position };
};

export const assertMember = async (
  characterId: number,
  client?: PoolClient
): Promise<{ sectId: string; position: SectPosition }> => {
  const member = await getMemberPosition(characterId, client);
  if (!member) throw new Error('未加入宗门');
  return member;
};

export const hasPermission = (position: SectPosition, action: string): boolean => {
  if (position === 'leader') return true;
  if (position === 'vice_leader') return action !== 'disband';
  if (position === 'elder') return ['approve', 'kick', 'quest', 'building', 'donate'].includes(action);
  if (position === 'elite') return ['quest', 'donate'].includes(action);
  return ['quest', 'donate'].includes(action);
};

export const positionRank = (p: SectPosition): number => {
  if (p === 'leader') return 5;
  if (p === 'vice_leader') return 4;
  if (p === 'elder') return 3;
  if (p === 'elite') return 2;
  return 1;
};

export const generateSectId = (): string => {
  const rand = Math.random().toString(36).slice(2, 10);
  return `sect-${Date.now()}-${rand}`;
};

export const compareRealmRank = (realmA: string, realmB: string): number => {
  const order = [
    '凡人',
    '练气',
    '筑基',
    '金丹',
    '元婴',
    '化神',
    '炼虚',
    '合体',
    '大乘',
    '渡劫',
    '真仙',
  ];
  const a = order.indexOf(realmA);
  const b = order.indexOf(realmB);
  const ra = a >= 0 ? a : 0;
  const rb = b >= 0 ? b : 0;
  return ra - rb;
};

