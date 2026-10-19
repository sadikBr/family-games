/** «المربعات» — rules, bots and leaving. */
import { expect, test } from 'bun:test';

import { dotsBoxLines, dotsLineBoxes, dotsLineCount, type DotsLevel } from '../src/shared/games/dots';
import { captureLines, dotsBotLine, emptyLines, safeLines } from './dots-ai';
import { dots } from './games/dots';

const fakeCtx = (bot: (by: string, a: any) => void = () => {}, fx: string[] = []): any => ({
  now: 0,
  fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: (by: string, _k: string, _d: number, a: any) => bot(by, a),
});

test('dots geometry: every box has 4 lines, every line 1–2 boxes', () => {
  for (const n of [3, 4, 5, 6]) {
    const seen = new Map<number, number>();
    for (let b = 0; b < n * n; b++) {
      const ls = dotsBoxLines(n, b);
      expect(new Set(ls).size).toBe(4);
      for (const e of ls) {
        expect(dotsLineBoxes(n, e)).toContain(b);
        seen.set(e, (seen.get(e) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(dotsLineCount(n));
    const border = [...seen.values()].filter((k) => k === 1).length;
    expect(border).toBe(4 * n);
  }
});

test('dots: closing a box scores it and gives another turn; otherwise the turn passes', () => {
  const ctx = fakeCtx();
  const s = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' });
  const [p, q] = s.seats;
  const [top, bottom, left, right] = dotsBoxLines(3, 0);
  dots.act(ctx, s, p, { type: 'line', line: top });
  expect(dots.turnOf!(s)).toEqual([q]);
  expect(() => dots.act(ctx, s, p, { type: 'line', line: left })).toThrow(); // not p's turn
  dots.act(ctx, s, q, { type: 'line', line: left });
  dots.act(ctx, s, p, { type: 'line', line: bottom });
  expect(() => dots.act(ctx, s, q, { type: 'line', line: bottom })).toThrow(); // already drawn
  dots.act(ctx, s, q, { type: 'line', line: right }); // closes box 0
  expect(s.boxes[0]).toBe(1);
  expect(s.points[q]).toBe(1);
  expect(s.lastBoxes).toEqual([0]);
  expect(dots.turnOf!(s)).toEqual([q]); // plays again
  const v = dots.view(ctx, s, p) as ReturnType<typeof dots.view> & { last: number; me: number };
  expect(v.last).toBe(right);
  expect(v.me).toBe(0);
});

test('dots: one line can close two boxes at once', () => {
  const ctx = fakeCtx();
  const s = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' });
  const shared = dotsBoxLines(3, 0)[3]; // right of box 0 = left of box 1
  const others = [...dotsBoxLines(3, 0), ...dotsBoxLines(3, 1)].filter((e) => e !== shared);
  for (const e of others) s.lines[e] = 0;
  const who = dots.turnOf!(s)[0];
  dots.act(ctx, s, who, { type: 'line', line: shared });
  expect(s.points[who]).toBe(2);
  expect(s.lastBoxes.sort()).toEqual([0, 1]);
});

test('dots: the game ends when every box is taken; most boxes wins and counts in the series', () => {
  const fx: string[] = [];
  const ctx = fakeCtx(() => {}, fx);
  const s = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' });
  const [p] = s.seats;
  // give p every box but the last one, which p closes
  const total = dotsLineCount(3);
  for (let e = 0; e < total; e++) s.lines[e] = 0;
  const lastLine = dotsBoxLines(3, 8)[1];
  s.lines[lastLine] = -1;
  for (let b = 0; b < 8; b++) s.boxes[b] = 0;
  s.points[p] = 8;
  dots.act(ctx, s, p, { type: 'line', line: lastLine });
  expect(s.phase).toBe('final');
  expect(s.winners).toEqual([p]);
  expect(s.score[p]).toBe(1);
  expect(fx).toContain(`win:${p}`);
  expect(dots.turnOf!(s)).toEqual([]);
});

test('dots: the starting player alternates between games of the same pair', () => {
  const ctx = fakeCtx();
  const first = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' }).seats[0];
  const second = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' }).seats[0];
  const third = dots.start(ctx, ['a', 'b'], { size: 3, level: 'easy' }).seats[0];
  expect(second).not.toBe(first);
  expect(third).toBe(first);
  // 3+ players: the first move passes along
  const g1 = dots.start(ctx, ['a', 'b', 'c'], { size: 3, level: 'easy' }).seats;
  const g2 = dots.start(ctx, ['a', 'b', 'c'], { size: 3, level: 'easy' }).seats;
  expect(g2[0]).toBe(g1[1]);
});

test('dots: leaving with 3–4 players removes the player; the last one standing wins', () => {
  const ctx = fakeCtx();
  const s = dots.start(ctx, ['a', 'b', 'c'], { size: 4, level: 'easy' });
  const [p, q, r] = s.seats;
  dots.onLeave!(ctx, s, p); // it was p's turn
  expect(s.phase).toBe('play');
  expect(dots.turnOf!(s)).toEqual([q]);
  dots.act(ctx, s, q, { type: 'line', line: 0 });
  expect(dots.turnOf!(s)).toEqual([r]);
  dots.act(ctx, s, r, { type: 'resign' });
  expect(s.phase).toBe('final');
  expect(s.winners).toEqual([q]);
  expect(s.reason).toBe('forfeit');
});

test('dots: 2 players — resigning hands the win to the opponent', () => {
  const ctx = fakeCtx();
  const s = dots.start(ctx, ['a', 'b'], { size: 4, level: 'easy' });
  dots.act(ctx, s, s.seats[1], { type: 'resign' });
  expect(s.winners).toEqual([s.seats[0]]);
  expect(s.score[s.seats[0]]).toBe(1);
});

test('dots: patchSettings only accepts known sizes and levels', () => {
  const st = { size: 4, level: 'medium' as DotsLevel };
  dots.patchSettings!(st, { size: 7, level: 'super' });
  expect(st).toEqual({ size: 4, level: 'medium' });
  dots.patchSettings!(st, { size: 6, level: 'hard' });
  expect(st).toEqual({ size: 6, level: 'hard' });
});

/** Draw the given lines on a fresh n×n grid. */
const drawn = (n: number, ls: number[]) => {
  const lines = emptyLines(n);
  for (const e of ls) lines[e] = true;
  return lines;
};

test('dots bots: everyone takes a free box; medium avoids third sides', () => {
  const n = 3;
  const [t, b, l] = dotsBoxLines(n, 4);
  const lines = drawn(n, [t, b, l]);
  for (const level of ['easy', 'medium', 'hard'] as DotsLevel[]) {
    expect(captureLines(n, lines)).toContain(dotsBotLine(n, lines, level));
  }
  const two = drawn(n, [t, b]);
  for (let k = 0; k < 30; k++) expect(safeLines(n, two)).toContain(dotsBotLine(n, two, 'medium'));
});

test('dots hard bot: declines the last two boxes of a chain to keep control (double-cross)', () => {
  const n = 3;
  const H = n * (n + 1);
  const h = (r: number, c: number) => r * n + c;
  const v = (r: number, c: number) => H + r * (n + 1) + c;
  // row 0: box (0,0) taken; (0,1) has 3 sides, (0,2) has 2: the last two boxes of a chain
  // rows 1–2: one snake of 6 boxes (1,0)(1,1)(1,2)(2,2)(2,1)(2,0), both ends open to the border
  const lines = drawn(n, [
    h(0, 0), h(0, 1), h(0, 2), h(1, 0), h(1, 1), h(1, 2), h(2, 0), h(2, 1), h(3, 0), h(3, 1), h(3, 2),
    v(0, 0), v(0, 1), v(1, 3), v(2, 3),
  ]);
  expect(safeLines(n, lines)).toEqual([]);
  expect(captureLines(n, lines)).toEqual([v(0, 2)]);
  // hard hands the two boxes over (draws the border side of (0,2)) so the opponent must open the 6-chain
  expect(dotsBotLine(n, lines, 'hard')).toBe(v(0, 3));
  // medium just eats
  expect(dotsBotLine(n, lines, 'medium')).toBe(v(0, 2));
  // nothing left after these two boxes: hard eats them
  const end = lines.map((d, e) => d || (e !== v(0, 2) && e !== v(0, 3)));
  expect(dotsBotLine(n, end, 'hard')).toBe(v(0, 2));
  // only a 2-chain left: handing over 2 to keep control doesn't pay
  const open = [v(0, 2), v(0, 3), v(2, 0), v(2, 1), h(3, 1)]; // the pair, plus a 2-chain (2,0)(2,1)
  const short = lines.map((_, e) => !open.includes(e));
  expect(safeLines(n, short)).toEqual([]);
  expect(dotsBotLine(n, short, 'hard')).toBe(v(0, 2));
});

/** The room-wide bot level that plays like each of the old per-game levels. */
const ROOM_LEVEL = { easy: 'easy', medium: 'smart', hard: 'expert' } as const;

/** Play a whole game with bots only; every bot move must be legal. */
function botGame(seats: string[], size: number, level: DotsLevel | Record<string, DotsLevel>) {
  const q: { by: string; a: { type: string; line: number } }[] = [];
  const ctx = fakeCtx((by, a) => q.push({ by, a }));
  let who = '';
  ctx.botLevel = () => ROOM_LEVEL[typeof level === 'string' ? level : level[who]];
  const s = dots.start(ctx, seats, { size, level: 'easy' });
  for (let k = 0; k < 1000 && s.phase === 'play'; k++) {
    q.length = 0;
    who = dots.turnOf!(s)[0];
    dots.botPlan!(ctx, s, seats);
    expect(q.length).toBe(1);
    expect(q[0].by).toBe(who);
    expect(s.lines[q[0].a.line]).toBe(-1); // never an illegal line
    dots.act(ctx, s, q[0].by, q[0].a);
    ctx.now += 1000;
  }
  return s;
}

test('dots: bot-only games finish with every box taken (all sizes, 2–4 players, every level)', () => {
  for (const size of [3, 4, 5, 6]) {
    for (const level of ['easy', 'medium', 'hard'] as DotsLevel[]) {
      const seats = ['a', 'b', 'c', 'd'].slice(0, 2 + ((size + level.length) % 3));
      const s = botGame(seats, size, level);
      expect(s.phase).toBe('final');
      expect(s.boxes.every((o) => o >= 0)).toBe(true);
      expect(Object.values(s.points).reduce((x, y) => x + y, 0)).toBe(size * size);
      expect(s.winners!.length).toBeGreaterThan(0);
    }
  }
}, 60000);

test('dots: the expert bot beats the easy one most of the time on 5×5', () => {
  let hardWins = 0;
  for (let g = 0; g < 10; g++) {
    const s = botGame(['h', 'e'], 5, { h: 'hard', e: 'easy' });
    if (s.winners!.length === 1 && s.winners![0] === 'h') hardWins += 1;
  }
  expect(hardWins).toBeGreaterThanOrEqual(8);
}, 60000);

test('dots: bot move takes little time even on 6×6', () => {
  const n = 6;
  const lines = emptyLines(n);
  const t0 = performance.now();
  let moves = 0;
  // fill to a crowded mid/endgame and time each hard decision
  while (lines.some((d) => !d)) {
    const e = dotsBotLine(n, lines, 'hard');
    expect(lines[e]).toBe(false);
    lines[e] = true;
    moves += 1;
  }
  expect(moves).toBe(dotsLineCount(n));
  expect((performance.now() - t0) / moves).toBeLessThan(30);
});
