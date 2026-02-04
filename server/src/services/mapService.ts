import { query } from '../config/database.js';

export type GridPosition = 'NW' | 'N' | 'NE' | 'W' | 'C' | 'E' | 'SW' | 'S' | 'SE';

export type WorldMapAreaDto = {
  id: GridPosition;
  name: string;
  description: string;
  level: string;
};

export type MapDefRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  background_image: string | null;
  map_type: string;
  parent_map_id: string | null;
  world_position: unknown;
  region: string | null;
  req_realm_min: string | null;
  req_level_min: number;
  req_quest_id: string | null;
  req_item_id: string | null;
  safe_zone: boolean;
  pk_mode: string | null;
  revive_map_id: string | null;
  revive_room_id: string | null;
  rooms: unknown;
  sort_weight: number;
  enabled: boolean;
};

export type MapRoom = {
  id: string;
  name: string;
  description?: string;
  position?: { x: number; y: number };
  room_type?: string;
  connections?: Array<{
    direction: string;
    target_room_id: string;
    target_map_id?: string;
    req_item_id?: string;
    req_realm_min?: string;
  }>;
  npcs?: string[];
  monsters?: Array<{ monster_def_id: string; count: number; respawn_sec?: number }>;
  resources?: Array<{ resource_id: string; count: number; respawn_sec?: number; collect_limit?: number }>;
  items?: Array<{ item_def_id: string; once?: boolean; chance?: number; req_quest_id?: string }>;
  portals?: Array<{ target_map_id: string; target_room_id: string; name: string; req_realm_min?: string }>;
  events?: Array<{ event_id: string; trigger: string; once?: boolean }>;
};

const parseRooms = (rooms: unknown): MapRoom[] => {
  if (Array.isArray(rooms)) return rooms as MapRoom[];
  if (typeof rooms === 'string') {
    try {
      const parsed = JSON.parse(rooms) as unknown;
      return Array.isArray(parsed) ? (parsed as MapRoom[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const getMapDefById = async (mapId: string): Promise<MapDefRow | null> => {
  const result = await query(
    `
      SELECT
        id, code, name, description, background_image, map_type, parent_map_id,
        world_position, region, req_realm_min, req_level_min, req_quest_id, req_item_id,
        safe_zone, pk_mode, revive_map_id, revive_room_id, rooms, sort_weight, enabled
      FROM map_def
      WHERE id = $1
      LIMIT 1
    `,
    [mapId]
  );
  return result.rows[0] ?? null;
};

export const getEnabledMaps = async (): Promise<
  Array<
    Pick<
      MapDefRow,
      'id' | 'code' | 'name' | 'description' | 'background_image' | 'map_type' | 'region' | 'sort_weight' | 'req_level_min' | 'req_realm_min'
    >
  >
> => {
  const result = await query(
    `
      SELECT id, code, name, description, background_image, map_type, region, sort_weight, req_level_min, req_realm_min
      FROM map_def
      WHERE enabled = true
      ORDER BY sort_weight DESC, id ASC
    `
  );
  return result.rows;
};

export const getRoomsInMap = async (mapId: string): Promise<MapRoom[]> => {
  const map = await getMapDefById(mapId);
  if (!map) return [];
  return parseRooms(map.rooms);
};

export const getRoomInMap = async (mapId: string, roomId: string): Promise<MapRoom | null> => {
  const rooms = await getRoomsInMap(mapId);
  return rooms.find((r) => r.id === roomId) ?? null;
};

const ALL_POSITIONS: GridPosition[] = ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'];

const POS_COORD: Record<GridPosition, { x: number; y: number }> = {
  NW: { x: -1, y: 1 },
  N: { x: 0, y: 1 },
  NE: { x: 1, y: 1 },
  W: { x: -1, y: 0 },
  C: { x: 0, y: 0 },
  E: { x: 1, y: 0 },
  SW: { x: -1, y: -1 },
  S: { x: 0, y: -1 },
  SE: { x: 1, y: -1 },
};

const coordKey = (x: number, y: number) => `${x},${y}`;

const POS_BY_COORD: Record<string, GridPosition> = Object.fromEntries(
  ALL_POSITIONS.map((p) => [coordKey(POS_COORD[p].x, POS_COORD[p].y), p])
) as Record<string, GridPosition>;

export const getWorldMap = async (): Promise<{
  mapName: string;
  areas: WorldMapAreaDto[];
  connections: Array<[GridPosition, GridPosition]>;
}> => {
  const areas: WorldMapAreaDto[] = ALL_POSITIONS.map((id) => ({
    id,
    name: id,
    description: '',
    level: 'Lv.1',
  }));

  const connections: Array<[GridPosition, GridPosition]> = [];
  const added = new Set<string>();
  for (const p of ALL_POSITIONS) {
    const { x, y } = POS_COORD[p];
    const neighbors = [
      { x: x, y: y + 1 },
      { x: x, y: y - 1 },
      { x: x - 1, y: y },
      { x: x + 1, y: y },
    ];
    for (const n of neighbors) {
      const other = POS_BY_COORD[coordKey(n.x, n.y)];
      if (!other) continue;
      const a = p < other ? p : other;
      const b = p < other ? other : p;
      const k = `${a}-${b}`;
      if (added.has(k)) continue;
      added.add(k);
      connections.push([a, b]);
    }
  }

  return { mapName: '九州大陆', areas, connections };
};

