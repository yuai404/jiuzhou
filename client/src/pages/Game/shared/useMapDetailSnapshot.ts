/**
 * 共享地图详情快照与名称解析缓存。
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：为地图面板、挂机状态条等多个 UI 提供同一份地图详情缓存，避免同一 mapId 重复请求。
 * 2. 做什么：把“mapId/roomId -> 中文名称”的解析集中到单一入口，防止组件在详情未返回时把英文 ID 直接渲染出来。
 * 3. 不做什么：不负责地图移动、不修改角色位置，也不处理房间对象列表。
 *
 * 输入/输出：
 * - 输入：`mapId`
 * - 输出：`snapshot`（地图名 + 房间详情）与 `loading`
 *
 * 数据流/状态流：
 * - 组件传入 mapId -> 先读模块级缓存 -> 缓存缺失时请求 `/map/:mapId` -> 快照写回缓存 -> 各组件复用同一份结果。
 *
 * 关键边界条件与坑点：
 * 1. 战斗页切回地图时组件会重新挂载；缓存必须保留在模块级，不能只放在组件 state 里，否则仍会闪出英文 ID。
 * 2. 相同 mapId 的并发请求必须合并成一条 pending promise，避免地图面板和挂机状态条同时挂载时重复打接口。
 */

import { useEffect, useState } from 'react';
import {
  getMapDetail,
  SILENT_API_REQUEST_CONFIG,
  type MapDetailResponse,
  type MapRoom,
} from '../../../services/api';

export type MapDetailSnapshot = {
  mapId: string;
  mapName: string;
  rooms: MapRoom[];
};

const mapDetailSnapshotCache = new Map<string, MapDetailSnapshot>();
const pendingMapDetailLoads = new Map<string, Promise<MapDetailSnapshot | null>>();

const normalizeMapId = (mapId: string): string => String(mapId || '').trim();

const pickMapName = (response: MapDetailResponse): string => {
  const rawMap = response.data?.map;
  if (!rawMap || typeof rawMap.name !== 'string') return '';
  return rawMap.name.trim();
};

const buildMapDetailSnapshot = (
  mapId: string,
  response: MapDetailResponse,
): MapDetailSnapshot | null => {
  if (!response.success || !response.data) return null;
  return {
    mapId,
    mapName: pickMapName(response),
    rooms: response.data.rooms ?? [],
  };
};

export const getCachedMapDetailSnapshot = (
  mapId: string,
): MapDetailSnapshot | null => {
  const normalizedMapId = normalizeMapId(mapId);
  if (!normalizedMapId) return null;
  return mapDetailSnapshotCache.get(normalizedMapId) ?? null;
};

export const loadMapDetailSnapshot = async (
  mapId: string,
): Promise<MapDetailSnapshot | null> => {
  const normalizedMapId = normalizeMapId(mapId);
  if (!normalizedMapId) return null;

  const cached = mapDetailSnapshotCache.get(normalizedMapId);
  if (cached) return cached;

  const pending = pendingMapDetailLoads.get(normalizedMapId);
  if (pending) return pending;

  const request = getMapDetail(normalizedMapId, SILENT_API_REQUEST_CONFIG)
    .then((response) => {
      const snapshot = buildMapDetailSnapshot(normalizedMapId, response);
      if (snapshot) {
        mapDetailSnapshotCache.set(normalizedMapId, snapshot);
      }
      return snapshot;
    })
    .catch(() => null)
    .finally(() => {
      pendingMapDetailLoads.delete(normalizedMapId);
    });

  pendingMapDetailLoads.set(normalizedMapId, request);
  return request;
};

/**
 * 共享地图详情订阅 Hook。
 *
 * 作用：
 * - 先同步回放缓存中的地图详情，保证重新挂载时标题立即有中文名称。
 * - 缓存不存在时再发起一次共享请求，供多个组件复用。
 *
 * 边界条件：
 * 1. mapId 为空时必须立刻清空状态，避免上一张地图的名字串到当前界面。
 * 2. 同一 mapId 如果缓存已命中，不再重新请求，减少切换战斗视图时的闪烁和网络噪音。
 */
export const useMapDetailSnapshot = (
  mapId: string,
): { snapshot: MapDetailSnapshot | null; loading: boolean } => {
  const normalizedMapId = normalizeMapId(mapId);
  const [snapshot, setSnapshot] = useState<MapDetailSnapshot | null>(
    () => getCachedMapDetailSnapshot(normalizedMapId),
  );
  const [loading, setLoading] = useState<boolean>(
    () => normalizedMapId.length > 0 && !getCachedMapDetailSnapshot(normalizedMapId),
  );

  useEffect(() => {
    if (!normalizedMapId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    const cached = getCachedMapDetailSnapshot(normalizedMapId);
    setSnapshot(cached);
    if (cached) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    void loadMapDetailSnapshot(normalizedMapId)
      .then((nextSnapshot) => {
        if (cancelled) return;
        setSnapshot(nextSnapshot);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedMapId]);

  return { snapshot, loading };
};
