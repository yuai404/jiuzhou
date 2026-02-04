import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// 是否启用查询日志（生产环境关闭）
const ENABLE_QUERY_LOG = process.env.DB_LOG === 'true';

// 数据库连接池
export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '6060'),
  database: process.env.DB_NAME || 'jiuzshou_s',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'zlf981216',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// 测试数据库连接
export const testConnection = async (): Promise<boolean> => {
  try {
    const client = await pool.connect();
    console.log('✓ 数据库连接成功');
    client.release();
    return true;
  } catch (error) {
    console.error('✗ 数据库连接失败:', error);
    return false;
  }
};

// 执行SQL查询（默认不输出日志）
export const query = async (text: string, params?: unknown[]) => {
  const result = await pool.query(text, params);
  if (ENABLE_QUERY_LOG) {
    console.log('执行查询:', { text: text.substring(0, 50), rows: result.rowCount });
  }
  return result;
};

export default pool;
