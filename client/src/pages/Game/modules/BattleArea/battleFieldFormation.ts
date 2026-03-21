/**
 * BattleArea 阵型排布规则
 *
 * 作用（做什么 / 不做什么）：
 * - 做什么：根据阵营朝向与单位类型，把伙伴固定到指定前后排，并在需要时补空槽位，保证“固定第一行/第二行”是稳定布局而不是简单排序。
 * - 做什么：把“下方阵营伙伴第一行、上方阵营伙伴第二行”的规则集中到单一纯函数，避免 BattleArea、面板组件、样式层各自猜测排布。
 * - 不做什么：不负责尺寸档位、不读 DOM、不做点击和动画逻辑。
 *
 * 输入/输出：
 * - 输入：阵营类型与 BattleUnit 列表。
 * - 输出：BattleFieldFormation，包含固定棋盘、实际渲染列数、已占列数和按网格顺序排好的 cells（含占位空槽）。
 *
 * 数据流/状态流：
 * - BattleArea 归一化单位 -> 本模块生成阵型
 * - BattleTeamPanel 读取 formation -> 设置网格列数并渲染单位/空槽
 *
 * 关键边界条件与坑点：
 * 1. “固定行”不等于“简单排前面/后面”，若不补空槽位，另一类单位会自动补满这一行，视觉上仍然不是前后排分离。
 * 2. 不足 5 人时必须向中间靠拢；如果仍按左对齐补空位，固定 2x5 棋盘会看起来像“贴边站位”。
 */

import type { BattleUnit } from './types';

type BattleTeamSide = 'enemy' | 'ally';

export type BattleFieldFormation = {
  columns: number;
  rows: number;
  occupiedColumnCount: number;
  cells: Array<BattleUnit | null>;
  renderColumns: number;
  renderCells: Array<BattleUnit | null>;
};

const BATTLE_FORMATION_MAX_COLUMNS = 5;
const BATTLE_FORMATION_FIXED_ROWS = 2;

const resolveCenteredSlots = (count: number): number[] => {
  if (count <= 0) return [];
  if (count === 1) return [2];
  if (count === 2) return [1, 3];
  if (count === 3) return [1, 2, 3];
  if (count === 4) return [0, 1, 3, 4];
  return [0, 1, 2, 3, 4];
};

const padRow = (row: BattleUnit[], columns: number): Array<BattleUnit | null> => {
  const padded: Array<BattleUnit | null> = Array.from({ length: columns }, () => null);
  const slots = resolveCenteredSlots(Math.min(row.length, columns));

  row.slice(0, columns).forEach((unit, index) => {
    const slotIndex = slots[index];
    padded[slotIndex] = unit;
  });

  return padded;
};

const splitBattleUnits = (units: BattleUnit[]): { partners: BattleUnit[]; others: BattleUnit[] } => {
  const partners: BattleUnit[] = [];
  const others: BattleUnit[] = [];

  for (const unit of units) {
    if (unit.unitType === 'partner') {
      partners.push(unit);
      continue;
    }
    others.push(unit);
  }

  return { partners, others };
};

export const resolveBattleFieldFormation = (
  team: BattleTeamSide,
  units: BattleUnit[],
): BattleFieldFormation => {
  const { partners, others } = splitBattleUnits(units);
  const preferredFirstRow = team === 'ally' ? partners : others;
  const preferredSecondRow = team === 'ally' ? others : partners;
  const firstRow = preferredFirstRow.slice(0, BATTLE_FORMATION_MAX_COLUMNS);
  const firstRowOverflow = preferredFirstRow.slice(BATTLE_FORMATION_MAX_COLUMNS);
  const secondRow = [...firstRowOverflow, ...preferredSecondRow].slice(0, BATTLE_FORMATION_MAX_COLUMNS);
  const firstRowCells = padRow(firstRow, BATTLE_FORMATION_MAX_COLUMNS);
  const secondRowCells = padRow(secondRow, BATTLE_FORMATION_MAX_COLUMNS);
  const occupiedColumnIndexes = Array.from({ length: BATTLE_FORMATION_MAX_COLUMNS }, (_, columnIndex) => columnIndex)
    .filter((columnIndex) => firstRowCells[columnIndex] || secondRowCells[columnIndex]);
  const occupiedColumnCount = occupiedColumnIndexes.length;
  const renderColumns = Math.max(1, occupiedColumnCount);
  const renderFirstRow = occupiedColumnIndexes.length > 0
    ? occupiedColumnIndexes.map((columnIndex) => firstRowCells[columnIndex])
    : [null];
  const renderSecondRow = occupiedColumnIndexes.length > 0
    ? occupiedColumnIndexes.map((columnIndex) => secondRowCells[columnIndex])
    : [null];

  return {
    columns: BATTLE_FORMATION_MAX_COLUMNS,
    rows: BATTLE_FORMATION_FIXED_ROWS,
    occupiedColumnCount,
    cells: [...firstRowCells, ...secondRowCells],
    renderColumns,
    renderCells: [...renderFirstRow, ...renderSecondRow],
  };
};
