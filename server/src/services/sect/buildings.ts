import type { PoolClient } from 'pg';
import { pool } from '../../config/database.js';
import { assertMember, hasPermission, toNumber } from './db.js';
import type { Result, SectBuildingRow } from './types.js';

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

export const getBuildings = async (
  characterId: number
): Promise<{ success: boolean; message: string; data?: SectBuildingRow[] }> => {
  try {
    const member = await assertMember(characterId);
    const res = await pool.query('SELECT * FROM sect_building WHERE sect_id = $1 ORDER BY building_type', [member.sectId]);
    return { success: true, message: 'ok', data: res.rows as any };
  } catch (error) {
    console.error('获取建筑失败:', error);
    return { success: false, message: '获取建筑失败' };
  }
};

const buildingMaxLevel = 10;

const calcUpgradeCost = (buildingType: string, currentLevel: number): { funds: number; buildPoints: number } => {
  const baseFunds = 1000;
  const basePoints = 10;
  const typeFactor: Record<string, number> = {
    hall: 1.2,
    library: 1.0,
    training_hall: 1.0,
    alchemy_room: 1.0,
    forge_house: 1.0,
    spirit_array: 1.1,
    defense_array: 1.3,
  };
  const f = typeFactor[buildingType] ?? 1.0;
  const next = currentLevel + 1;
  return {
    funds: Math.floor(baseFunds * f * next * next),
    buildPoints: Math.floor(basePoints * next),
  };
};

const applyHallMemberCapTx = async (client: PoolClient, sectId: string): Promise<void> => {
  const hallRes = await client.query(
    `SELECT level FROM sect_building WHERE sect_id = $1 AND building_type = 'hall'`,
    [sectId]
  );
  const hallLevel = hallRes.rows.length > 0 ? toNumber(hallRes.rows[0].level) : 1;
  const cap = 20 + Math.max(0, hallLevel - 1) * 5;
  await client.query('UPDATE sect_def SET max_members = $2, updated_at = NOW() WHERE id = $1', [sectId, cap]);
};

export const upgradeBuilding = async (characterId: number, buildingType: string): Promise<Result> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const member = await assertMember(characterId, client);
    if (!hasPermission(member.position, 'building')) {
      await client.query('ROLLBACK');
      return { success: false, message: '无权限升级建筑' };
    }

    const buildingRes = await client.query(
      `SELECT * FROM sect_building WHERE sect_id = $1 AND building_type = $2 FOR UPDATE`,
      [member.sectId, buildingType]
    );
    if (buildingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '建筑不存在' };
    }

    const building = buildingRes.rows[0] as SectBuildingRow;
    if (building.level >= buildingMaxLevel) {
      await client.query('ROLLBACK');
      return { success: false, message: '建筑已满级' };
    }

    const cost = calcUpgradeCost(buildingType, building.level);
    const sectRes = await client.query(`SELECT funds, build_points FROM sect_def WHERE id = $1 FOR UPDATE`, [member.sectId]);
    if (sectRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: '宗门不存在' };
    }
    const funds = toNumber(sectRes.rows[0].funds);
    const buildPoints = toNumber(sectRes.rows[0].build_points);
    if (funds < cost.funds) {
      await client.query('ROLLBACK');
      return { success: false, message: '宗门资金不足' };
    }
    if (buildPoints < cost.buildPoints) {
      await client.query('ROLLBACK');
      return { success: false, message: '建设点不足' };
    }

    await client.query(
      `UPDATE sect_def SET funds = funds - $2, build_points = build_points - $3, updated_at = NOW() WHERE id = $1`,
      [member.sectId, cost.funds, cost.buildPoints]
    );
    await client.query(
      `UPDATE sect_building SET level = level + 1, updated_at = NOW() WHERE id = $1`,
      [building.id]
    );

    if (buildingType === 'hall') {
      await applyHallMemberCapTx(client, member.sectId);
    }

    await addLogTx(client, member.sectId, 'upgrade_building', characterId, null, `升级建筑：${buildingType}`);
    await client.query('COMMIT');
    return { success: true, message: '升级成功' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('升级建筑失败:', error);
    return { success: false, message: '升级建筑失败' };
  } finally {
    client.release();
  }
};

