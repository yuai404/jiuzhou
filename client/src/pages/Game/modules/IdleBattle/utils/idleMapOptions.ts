/**
 * idleMapOptions — 挂机地图/房间/怪物选项构建工具
 *
 * 作用（做什么 / 不做什么）：
 * 1. 做什么：统一处理挂机配置面板的数据筛选（地图可选范围、含怪房间、怪物下拉项）。
 * 2. 不做什么：不发起网络请求，不持有组件状态，不包含 UI 渲染逻辑。
 *
 * 输入/输出：
 * - 输入：`MapDefLite[]`、`MapRoom[]`、`MapRoom | undefined`（来自 world API 响应）。
 * - 输出：筛选后的地图列表、房间列表、怪物 Select 选项数组。
 *
 * 数据流/状态流：
 * world API 原始响应 -> 本工具纯函数标准化/筛选 -> IdleConfigPanel 直接消费。
 *
 * 关键边界条件与坑点：
 * 1. `map_type` 缺失或大小写不一致时，统一小写后判定，避免新配置因大小写差异被漏筛。
 * 2. 同一房间若重复配置同 `monster_def_id`，仅保留一条选项，防止 Select 出现重复项。
 * 3. 怪物名称缺失时回退为 `monster_def_id`，避免下拉项出现空白文案。
 */

import type { MapDefLite, MapRoom } from '../../../../../services/api/world';

const IDLE_EXCLUDED_MAP_TYPES = new Set(['city']);

export interface IdleMonsterOption {
  value: string;
  label: string;
}

/** 过滤出可用于挂机的地图（当前仅排除城市类地图）。 */
export const filterIdleMaps = (maps: MapDefLite[]): MapDefLite[] => {
  return maps.filter((map) => {
    const mapType = String(map.map_type || '').trim().toLowerCase();
    return !IDLE_EXCLUDED_MAP_TYPES.has(mapType);
  });
};

/** 过滤出至少包含 1 个怪物配置的房间。 */
export const filterRoomsWithMonsters = (rooms: MapRoom[]): MapRoom[] => {
  return rooms.filter((room) => Array.isArray(room.monsters) && room.monsters.length > 0);
};

/** 将当前房间怪物配置转成 Select 选项（去重 + 名称兜底）。 */
export const buildMonsterOptions = (room: MapRoom | undefined): IdleMonsterOption[] => {
  if (!room || !Array.isArray(room.monsters)) return [];

  const seen = new Set<string>();
  const options: IdleMonsterOption[] = [];

  for (const monster of room.monsters) {
    const monsterDefId = String(monster.monster_def_id || '').trim();
    if (!monsterDefId || seen.has(monsterDefId)) continue;

    seen.add(monsterDefId);
    const monsterName = String(monster.name || '').trim();
    options.push({
      value: monsterDefId,
      label: monsterName || monsterDefId,
    });
  }

  return options;
};

