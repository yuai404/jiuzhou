import { describe, expect, it } from 'vitest';

import type { BattleSessionSnapshotDto } from '../../../../services/api/battleSession';
import {
  normalizeBattleSessionFromRealtime,
  shouldApplyTerminalRealtimeSessionToOwnedBattle,
} from '../battleSessionRealtime';

const createSession = (
  status: BattleSessionSnapshotDto['status'],
): BattleSessionSnapshotDto => ({
  sessionId: 'session-1',
  type: 'pve',
  ownerUserId: 1,
  participantUserIds: [1],
  currentBattleId: 'battle-1',
  status,
  nextAction: status === 'waiting_transition' ? 'advance' : 'none',
  canAdvance: status === 'waiting_transition',
  lastResult: status === 'waiting_transition' ? 'attacker_win' : null,
  context: { monsterIds: ['monster-wild-rabbit'] },
});

describe('normalizeBattleSessionFromRealtime', () => {
  it('battle_abandoned 到达时应清空当前会话，而不是保留 abandoned 快照', () => {
    expect(
      normalizeBattleSessionFromRealtime({
        kind: 'battle_abandoned',
        session: createSession('abandoned'),
      }),
    ).toBeNull();
  });

  it('其他 realtime 类型应继续透传服务端 session', () => {
    const session = createSession('waiting_transition');
    expect(
      normalizeBattleSessionFromRealtime({
        kind: 'battle_finished',
        session,
      }),
    ).toBe(session);
  });
});

describe('shouldApplyTerminalRealtimeSessionToOwnedBattle', () => {
  it('当前持有中的普通战斗收到 battle_finished 且带 session 时，父层也应同步 session', () => {
    expect(
      shouldApplyTerminalRealtimeSessionToOwnedBattle({
        kind: 'battle_finished',
        battleId: 'battle-1',
        currentSessionBattleId: 'battle-1',
        viewMode: 'battle',
        hasSessionPayload: true,
      }),
    ).toBe(true);
  });

  it('非当前持有战斗的 finished realtime 不应误写当前 session', () => {
    expect(
      shouldApplyTerminalRealtimeSessionToOwnedBattle({
        kind: 'battle_finished',
        battleId: 'battle-2',
        currentSessionBattleId: 'battle-1',
        viewMode: 'battle',
        hasSessionPayload: true,
      }),
    ).toBe(false);
  });

  it('battle_abandoned 即使没有 session 载荷，也应允许父层清空当前会话', () => {
    expect(
      shouldApplyTerminalRealtimeSessionToOwnedBattle({
        kind: 'battle_abandoned',
        battleId: 'battle-1',
        currentSessionBattleId: 'battle-1',
        viewMode: 'battle',
        hasSessionPayload: false,
      }),
    ).toBe(true);
  });

  it('不在战斗视图时，不应把终态 realtime 当成当前持有战斗来覆盖 session', () => {
    expect(
      shouldApplyTerminalRealtimeSessionToOwnedBattle({
        kind: 'battle_finished',
        battleId: 'battle-1',
        currentSessionBattleId: 'battle-1',
        viewMode: 'map',
        hasSessionPayload: true,
      }),
    ).toBe(false);
  });
});
