import { roomConnections, type GridPosition } from './constants';

export type MoveResult =
  | { ok: true; from: GridPosition; to: GridPosition }
  | { ok: false; from: GridPosition; to: GridPosition; reason: 'same' | 'not_connected' };

export const canMove = (from: GridPosition, to: GridPosition, connections = roomConnections): boolean => {
  if (from === to) return false;
  return connections.some(([a, b]) => (a === from && b === to) || (a === to && b === from));
};

export const simulateMove = async (
  from: GridPosition,
  to: GridPosition,
  connections = roomConnections,
  delayMs: number = 180,
): Promise<MoveResult> => {
  if (from === to) return { ok: false, from, to, reason: 'same' };
  if (!canMove(from, to, connections)) return { ok: false, from, to, reason: 'not_connected' };
  await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  return { ok: true, from, to };
};
