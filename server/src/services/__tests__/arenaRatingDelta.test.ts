import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateArenaRatingDelta } from '../shared/arenaRatingDelta.js';

test('同分对局保持基线：胜+10，负-5，平0', () => {
  const winDelta = calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'win' });
  const loseDelta = calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'lose' });
  const drawDelta = calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'draw' });

  assert.equal(winDelta, 10);
  assert.equal(loseDelta, -5);
  assert.equal(drawDelta, 0);
});

test('低分战胜高分时加分更多', () => {
  const baseline = calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'win' });
  const upsetWin = calculateArenaRatingDelta({ selfRating: 900, opponentRating: 1300, outcome: 'win' });

  assert.ok(upsetWin > baseline, `低分爆冷应比基线加分更多，baseline=${baseline}, upsetWin=${upsetWin}`);
});

test('高分战胜低分时加分更少但至少+1', () => {
  const baseline = calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'win' });
  const expectedWin = calculateArenaRatingDelta({ selfRating: 1300, opponentRating: 900, outcome: 'win' });

  assert.ok(expectedWin < baseline, `高分打低分应比基线加分更少，baseline=${baseline}, expectedWin=${expectedWin}`);
  assert.ok(expectedWin >= 1, `胜利至少应加1分，expectedWin=${expectedWin}`);
});

test('高分输给低分时扣分更多', () => {
  const baseline = Math.abs(calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'lose' }));
  const upsetLose = Math.abs(calculateArenaRatingDelta({ selfRating: 1300, opponentRating: 900, outcome: 'lose' }));

  assert.ok(upsetLose > baseline, `高分翻车应比基线扣分更多，baseline=${baseline}, upsetLose=${upsetLose}`);
});

test('低分输给高分时扣分更少但至少-1', () => {
  const baseline = Math.abs(calculateArenaRatingDelta({ selfRating: 1000, opponentRating: 1000, outcome: 'lose' }));
  const expectedLose = Math.abs(calculateArenaRatingDelta({ selfRating: 900, opponentRating: 1300, outcome: 'lose' }));

  assert.ok(expectedLose < baseline, `低分正常输给高分应比基线扣分更少，baseline=${baseline}, expectedLose=${expectedLose}`);
  assert.ok(expectedLose >= 1, `失败至少应扣1分，expectedLose=${expectedLose}`);
});
