/**
 * 事务收尾辅助工具
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：统一封装“失败时回滚”“结束时释放连接”的收尾动作，避免业务层重复写 try/catch 模板。
 * - 不做什么：不负责开始事务、不负责提交事务、不吞掉业务主流程中的原始异常。
 *
 * 输入/输出：
 * - 输入：`PoolClient` 事务连接，以及可选的“回滚后直接返回值”。
 * - 输出：`safeRollback` 与 `safeRelease` 永远不抛错；`rollbackAndReturn` 返回调用方传入的原值。
 *
 * 数据流/状态流：
 * - 业务层在捕获异常后调用 `safeRollback(client)`，将连接状态尽力恢复到可释放状态。
 * - 业务层在 finally 中调用 `safeRelease(client)`，统一兜底处理重复释放等收尾异常。
 * - 业务层若需要“回滚并短路返回”，调用 `rollbackAndReturn(client, result)`。
 *
 * 关键边界条件与坑点：
 * 1) 当连接已断开或事务已结束时，`ROLLBACK`/`release` 可能再次报错；工具层必须吞掉这些收尾异常，避免覆盖主错误。
 * 2) 该工具不判断“当前是否处于事务中”；调用方仍需保证只在已开始事务的上下文调用回滚语义。
 */
import type { PoolClient } from 'pg';

export const safeRollback = async (client: PoolClient): Promise<void> => {
  try {
    await client.query('ROLLBACK');
  } catch {
    // 回滚失败不再上抛，避免掩盖主错误
  }
};

export const rollbackAndReturn = async <T>(client: PoolClient, result: T): Promise<T> => {
  await safeRollback(client);
  return result;
};

export const safeRelease = (client: PoolClient): void => {
  try {
    client.release();
  } catch {
    // 连接可能已被释放或被连接池回收，此处不再上抛，避免覆盖主流程异常。
  }
};
