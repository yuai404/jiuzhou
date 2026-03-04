import { describe, expect, it } from 'vitest';
import type { MapDefLite, MapRoom } from '../../../../../services/api/world';
import { buildMonsterOptions, filterIdleMaps, filterRoomsWithMonsters } from '../utils/idleMapOptions';

describe('idleMapOptions', () => {
  it('filterIdleMaps: 排除 city 地图并保留其他类型', () => {
    const maps: MapDefLite[] = [
      {
        id: 'map-city',
        code: 'city',
        name: '主城',
        description: null,
        background_image: null,
        map_type: 'city',
        region: null,
        req_level_min: 1,
        req_realm_min: null,
        sort_weight: 1000,
      },
      {
        id: 'map-field',
        code: 'field',
        name: '野外地图',
        description: null,
        background_image: null,
        map_type: 'field',
        region: null,
        req_level_min: 1,
        req_realm_min: null,
        sort_weight: 900,
      },
      {
        id: 'map-dungeon',
        code: 'dungeon',
        name: '秘境',
        description: null,
        background_image: null,
        map_type: 'dungeon',
        region: null,
        req_level_min: 1,
        req_realm_min: null,
        sort_weight: 800,
      },
    ];

    expect(filterIdleMaps(maps).map((entry) => entry.id)).toStrictEqual(['map-field', 'map-dungeon']);
  });

  it('filterRoomsWithMonsters: 仅保留有怪物配置的房间', () => {
    const rooms: MapRoom[] = [
      { id: 'room-empty', name: '空房间', monsters: [] },
      { id: 'room-normal', name: '怪物房', monsters: [{ monster_def_id: 'monster-a', count: 2 }] },
      { id: 'room-null', name: '无怪配置' },
    ];

    expect(filterRoomsWithMonsters(rooms).map((entry) => entry.id)).toStrictEqual(['room-normal']);
  });

  it('buildMonsterOptions: 去重并在缺少 name 时回退 monster_def_id', () => {
    const room: MapRoom = {
      id: 'room-monsters',
      name: '测试房间',
      monsters: [
        { monster_def_id: 'monster-a', count: 1, name: '甲怪' },
        { monster_def_id: 'monster-a', count: 3, name: '甲怪重复' },
        { monster_def_id: 'monster-b', count: 2 },
      ],
    };

    expect(buildMonsterOptions(room)).toStrictEqual([
      { value: 'monster-a', label: '甲怪' },
      { value: 'monster-b', label: 'monster-b' },
    ]);
  });

  it('buildMonsterOptions: room 未定义时返回空数组', () => {
    expect(buildMonsterOptions(undefined)).toStrictEqual([]);
  });
});

