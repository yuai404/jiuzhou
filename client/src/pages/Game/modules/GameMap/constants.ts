export type GridPosition = 'NW' | 'N' | 'NE' | 'W' | 'C' | 'E' | 'SW' | 'S' | 'SE';

export interface MapArea {
  id: GridPosition;
  name: string;
  description: string;
  level: string;
}

export const mapAreas: MapArea[] = [
  { id: 'NW', name: '青云峰', description: '灵气充沛的修炼圣地', level: '炼精化炁' },
  { id: 'N', name: '天机阁', description: '藏有无数功法秘籍', level: '炼精化炁' },
  { id: 'NE', name: '药王谷', description: '盛产各类灵药', level: '炼炁化神' },
  { id: 'W', name: '落霞山', description: '妖兽出没之地', level: '炼精化炁' },
  { id: 'C', name: '九州城', description: '繁华的修仙者聚集地', level: '凡人' },
  { id: 'E', name: '幽冥谷', description: '阴气森森的险地', level: '炼炁化神' },
  { id: 'SW', name: '蛮荒林', description: '未开化的原始森林', level: '炼精化炁' },
  { id: 'S', name: '南海岸', description: '通往海外仙岛', level: '炼炁化神' },
  { id: 'SE', name: '火焰山', description: '炽热的火属性秘境', level: '炼神返虚' },
];

export const roomGrid = {
  cols: 5,
  rows: 3,
} as const;

export const roomLayout: Record<GridPosition, { col: number; row: number }> = {
  NW: { col: 2, row: 1 },
  N: { col: 3, row: 1 },
  NE: { col: 4, row: 1 },
  W: { col: 1, row: 2 },
  C: { col: 3, row: 2 },
  E: { col: 5, row: 2 },
  SW: { col: 2, row: 3 },
  S: { col: 3, row: 3 },
  SE: { col: 4, row: 3 },
};

export const roomConnections: Array<[GridPosition, GridPosition]> = [
  ['NW', 'N'],
  ['N', 'NE'],
  ['NW', 'W'],
  ['W', 'C'],
  ['C', 'E'],
  ['N', 'C'],
  ['C', 'S'],
  ['SW', 'S'],
  ['S', 'SE'],
];
