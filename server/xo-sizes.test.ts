/** «إكس أو» on bigger boards. */
import { expect, test } from 'bun:test';

import { XO_SIZES, inRow, xoBest, xoWinner, type Mark } from '../src/shared/xo';
import { xo } from './games/xo';

const ctx = (): any => ({ now: 0, fx() {}, isConnected: () => true, isBot: () => true, playerName: (i: string) => i, memo: new Map(), bot() {} });
const board = (n: number, cells: Record<number, Mark>) => Array.from({ length: n * n }, (_, i) => cells[i] ?? '') as Mark[];

test('win length grows with the board', () => {
  expect(XO_SIZES.map(inRow)).toEqual([3, 4, 4, 5, 5, 5]);
  // 5×5: four across wins, three doesn't
  expect(xoWinner(board(5, { 6: 'x', 7: 'x', 8: 'x' }), 5, 4)).toBeNull();
  expect(xoWinner(board(5, { 5: 'x', 6: 'x', 7: 'x', 8: 'x' }), 5, 4)).toEqual({ mark: 'x', line: [5, 6, 7, 8] });
  // 9×9: five on the anti-diagonal
  const d = [8, 16, 24, 32, 40];
  expect(xoWinner(board(9, Object.fromEntries(d.map((i) => [i, 'o']))), 9, 5)?.mark).toBe('o');
  // a line doesn't wrap around the edge
  expect(xoWinner(board(5, { 3: 'x', 4: 'x', 5: 'x', 6: 'x' }), 5, 4)).toBeNull();
});

test('big-board bot takes a win, blocks a win, opens in the middle', () => {
  expect(xoBest(board(7, {}), 'x', 2)).toBe(24);
  // o has three of four… on 5×5 x must block at 4 or 0
  const b = board(5, { 1: 'o', 2: 'o', 3: 'o', 12: 'x', 18: 'x' });
  for (let i = 0; i < 20; i++) expect([0, 4]).toContain(xoBest(b, 'x', 2));
  // and wins when it can
  const w = board(5, { 6: 'x', 12: 'x', 18: 'x', 1: 'o', 2: 'o', 3: 'o' });
  expect([0, 24]).toContain(xoBest(w, 'x', 2));
  for (let i = 0; i < 20; i++) expect([0, 24]).toContain(xoBest(w, 'x', 1));
});

test('bot-only games finish on every board size, quickly', () => {
  for (const size of XO_SIZES) {
    const c = ctx();
    const s: any = xo.start(c, ['a', 'b'], { level: 2, size });
    expect(s.board.length).toBe(size * size);
    const t = performance.now();
    for (let k = 0; k < size * size && s.phase === 'play'; k++) {
      const id = s.turn === 'x' ? s.x : s.o;
      xo.act(c, s, id, { type: 'mark', cell: xoBest(s.board, s.turn, 2) });
    }
    expect(s.phase).toBe('final');
    expect(performance.now() - t).toBeLessThan(1500);
    const v: any = xo.view(c, s, s.x);
    expect(v.size).toBe(size);
    expect(v.inRow).toBe(inRow(size));
  }
});

test('the strong bot beats the easy one most of the time on 7×7', () => {
  let strong = 0;
  for (let g = 0; g < 30; g++) {
    const c = ctx();
    const s: any = xo.start(c, ['a', 'b'], { level: 2, size: 7 });
    const lvl = (id: string) => (id === 'a' ? 2 : 1);
    while (s.phase === 'play') {
      const id = s.turn === 'x' ? s.x : s.o;
      xo.act(c, s, id, { type: 'mark', cell: xoBest(s.board, s.turn, lvl(id) as 1 | 2) });
    }
    if (s.winner !== 'draw' && (s.winner === 'x' ? s.x : s.o) === 'a') strong++;
  }
  expect(strong).toBeGreaterThanOrEqual(20);
});
