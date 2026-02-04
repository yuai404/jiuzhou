import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { assertMember, toNumber } from './db.js';
import type { DonateResult } from './types.js';

const addLogTx = async (
  client: PoolClient,
  sectId: string,
  logType: string,
  operatorId: number | null,
  targetId: number | null,
  content: string
) => {
  await client.query(
    `INSERT INTO sect_log (sect_id, log_type, operator_id, target_id, content) VALUES ($1, $2, $3, $4, $5)`,
    [sectId, logType, operatorId, targetId, content]
  );
};

export const donate = async (characterId: number, silver?: number, spiritStones?: number): Promise<DonateResult> => {
  const s = Number.isFinite(Number(silver)) ? Math.max(0, Math.floor(Number(silver))) : 0;
  const ss = Number.isFinite(Number(spiritStones)) ? Math.max(0, Math.floor(Number(spiritStones))) : 0;
  if (s <= 0 && ss <= 0) return { success: false, message: '捐献数量不能为空' };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const member = await assertMember(characterId, client);

    const charRes = await client.query(
      `SELECT silver, spirit_stones FROM characters WHERE id = $1 FOR UPDATE`,
      [characterId]
    );
    if (charRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '角色不存在' };
    }
    const curSilver = toNumber(charRes.rows[0].silver);
    const curSS = toNumber(charRes.rows[0].spirit_stones);
    if (curSilver < s) {
      await client.query('ROLLBACK');
      return { success: false, message: '银两不足' };
    }
    if (curSS < ss) {
      await client.query('ROLLBACK');
      return { success: false, message: '灵石不足' };
    }

    await client.query(
      `UPDATE characters SET silver = silver - $2, spirit_stones = spirit_stones - $3, updated_at = NOW() WHERE id = $1`,
      [characterId, s, ss]
    );

    const addedFunds = s + ss * 100;
    const addedContribution = s + ss * 100;

    await client.query(
      `UPDATE sect_def SET funds = funds + $2, updated_at = NOW() WHERE id = $1`,
      [member.sectId, addedFunds]
    );
    await client.query(
      `UPDATE sect_member SET contribution = contribution + $2, weekly_contribution = weekly_contribution + $2 WHERE character_id = $1`,
      [characterId, addedContribution]
    );

    const content = `捐献：银两${s}、灵石${ss}（宗门资金+${addedFunds}，贡献+${addedContribution}）`;
    await addLogTx(client, member.sectId, 'donate', characterId, null, content);

    await client.query('COMMIT');
    return { success: true, message: '捐献成功', addedFunds, addedContribution };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('捐献失败:', error);
    return { success: false, message: '捐献失败' };
  } finally {
    client.release();
  }
};

