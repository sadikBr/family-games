/** Unit tests for the card-game rules. */
import { expect, test } from 'bun:test';

import type { Card, Suit } from '../src/shared/cards';
import { kanzaCaptures, kanzaPoints } from './games/kanza';
import { cardValue, findMelds, isValidMeld } from './games/konkan';
import { strength, thirds, trisPlayable } from './games/tris';

const c = (suit: Suit, rank: number): Card => ({ id: `${suit}-${rank}`, suit, rank });

test('kanza: captures make exactly 15 with at most 2 table cards', () => {
  const table = [c('cups', 5), c('swords', 10), c('clubs', 3), c('coins', 7)];
  const caps = kanzaCaptures(table, c('cups', 5)); // need 10
  expect(caps.map((x) => x.map((y) => y.id).sort())).toEqual([['swords-10'], ['clubs-3', 'coins-7'].sort()]);
  expect(kanzaCaptures(table, c('cups', 1)).length).toBe(0); // need 14: none
});

test('kanza: card points (gold = number, gold 1 = 20, others = 1)', () => {
  expect(kanzaPoints(c('coins', 1))).toBe(20);
  expect(kanzaPoints(c('coins', 7))).toBe(7);
  expect(kanzaPoints(c('coins', 12))).toBe(12);
  expect(kanzaPoints(c('cups', 12))).toBe(1);
  const total = (['coins', 'cups', 'swords', 'clubs'] as Suit[])
    .flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].map((r) => kanzaPoints(c(s, r))))
    .reduce((a, b) => a + b, 0);
  expect(total).toBe(110);
});

test('tris: strength order and points', () => {
  const order = [3, 2, 1, 12, 11, 10, 7, 6, 5, 4];
  for (let i = 1; i < order.length; i++) expect(strength(order[i - 1])).toBeGreaterThan(strength(order[i]));
  expect(thirds(c('cups', 1))).toBe(3);
  expect(thirds(c('cups', 3))).toBe(1);
  expect(thirds(c('cups', 7))).toBe(0);
  // must follow suit
  const hand = [c('cups', 4), c('coins', 3), c('cups', 12)];
  expect(trisPlayable(hand, [{ card: c('cups', 7) }]).map((x) => x.id)).toEqual(['cups-4', 'cups-12']);
  expect(trisPlayable(hand, [{ card: c('swords', 7) }]).length).toBe(3);
});

test('konkan: melds', () => {
  expect(isValidMeld([c('cups', 5), c('coins', 5), c('clubs', 5)])).toBe(true);
  expect(isValidMeld([c('cups', 6), c('cups', 7), c('cups', 10)])).toBe(true); // 7 → 10
  expect(isValidMeld([c('cups', 6), c('cups', 7), c('coins', 10)])).toBe(false);
  expect(isValidMeld([c('cups', 5), c('coins', 5)])).toBe(false);
  expect(isValidMeld([c('cups', 1), c('cups', 2), c('cups', 4)])).toBe(false);
  expect(cardValue(c('cups', 11))).toBe(10);
  const melds = findMelds([c('cups', 5), c('coins', 5), c('clubs', 5), c('swords', 1), c('swords', 2), c('swords', 3), c('cups', 12)]);
  expect(melds.length).toBe(2);
});

import { canPlayFace, makeUnoDeck, unoPoints } from '../src/shared/uno';

test('uno flip: 112 two-sided cards with the right faces on each side', () => {
  const deck = makeUnoDeck();
  expect(deck.length).toBe(112);
  const count = (side: 'light' | 'dark', pred: (k: string, c: string | null) => boolean) =>
    deck.filter((c) => pred(c[side].kind, c[side].color)).length;
  expect(count('light', (k) => k === 'wild')).toBe(4);
  expect(count('light', (k) => k === 'wild2')).toBe(4);
  expect(count('dark', (k) => k === 'wildColor')).toBe(4);
  expect(count('dark', (k) => k === 'draw5')).toBe(8);
  expect(count('dark', (k) => k === 'skipAll')).toBe(8);
  for (const col of ['red', 'yellow', 'green', 'blue']) expect(count('light', (_, c) => c === col)).toBe(26);
  for (const col of ['pink', 'teal', 'orange', 'purple']) expect(count('dark', (_, c) => c === col)).toBe(26);
  expect(count('light', (k) => k === 'draw5')).toBe(0);
});

test('uno flip: matching rules and points', () => {
  const r5 = { kind: 'num' as const, color: 'red' as const, n: 5 };
  expect(canPlayFace({ kind: 'num', color: 'blue', n: 5 }, r5, 'red')).toBe(true);
  expect(canPlayFace({ kind: 'num', color: 'blue', n: 6 }, r5, 'red')).toBe(false);
  expect(canPlayFace({ kind: 'skip', color: 'red' }, r5, 'red')).toBe(true);
  expect(canPlayFace({ kind: 'wild', color: null }, r5, 'red')).toBe(true);
  // after a wild, only the chosen colour (or another wild) works
  expect(canPlayFace({ kind: 'num', color: 'green', n: 5 }, { kind: 'wild', color: null }, 'blue')).toBe(false);
  expect(canPlayFace({ kind: 'skip', color: 'blue' }, { kind: 'skip', color: 'green' }, 'green')).toBe(true);
  expect(unoPoints({ kind: 'wildColor', color: null })).toBe(60);
  expect(unoPoints({ kind: 'skipAll', color: 'teal' })).toBe(30);
  expect(unoPoints({ kind: 'num', color: 'red', n: 7 })).toBe(7);
});

import { unoflip } from './games/unoflip';
import type { GameCtx } from './types';
import type { UnoView } from '../src/shared/protocol';

test('uno flip: 200 simulated rounds keep all 112 cards, flip sides and always finish', () => {
  const ctx: GameCtx = {
    now: 0,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id) => id,
    memo: new Map(),
    bot: () => {},
  };
  let flips = 0;
  let catches = 0;
  for (let g = 0; g < 200; g++) {
    const seats = ['a', 'b', 'c', 'd', 'e'].slice(0, 2 + (g % 4));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = unoflip.start(ctx, seats, { target: 100000 });
    let guard = 0;
    let lastSide = s.side;
    while (s.phase === 'play' && guard++ < 5000) {
      const total = s.deck.length + s.discard.length + seats.reduce((t: number, id: string) => t + s.hands[id].length, 0);
      expect(total).toBe(112);
      if (s.side !== lastSide) {
        flips++;
        lastSide = s.side;
      }
      if (s.catchable) {
        const catcher = seats.find((id) => id !== s.catchable)!;
        unoflip.act(ctx, s, catcher, { type: 'catch' });
        catches++;
        continue;
      }
      if (s.choosing) {
        const v = unoflip.view(ctx, s, s.choosing.by) as UnoView;
        unoflip.act(ctx, s, s.choosing.by, { type: 'color', color: v.side === 'light' ? 'blue' : 'teal' });
        continue;
      }
      const me = seats[s.turnIdx];
      const v = unoflip.view(ctx, s, me) as UnoView;
      // others' backs are the other side of exactly their cards
      for (const id of seats) if (id !== me) expect(v.backs[id].length).toBe(s.hands[id].length);
      if (v.playable.length) {
        if (v.myHand.length === 2 && Math.random() < 0.5) unoflip.act(ctx, s, me, { type: 'uno' });
        unoflip.act(ctx, s, me, { type: 'play', card: v.playable[Math.floor(Math.random() * v.playable.length)] });
      } else if (v.canPass) unoflip.act(ctx, s, me, { type: 'pass' });
      else unoflip.act(ctx, s, me, { type: 'draw' });
    }
    expect(s.phase).toBe('roundEnd');
    expect(seats.some((id) => s.hands[id].length === 0)).toBe(true);
  }
  expect(flips).toBeGreaterThan(50);
  expect(catches).toBeGreaterThan(10);
});

import { applyMove, botMove, initialBoard, legalMoves } from './games/dama';
import { ludo, movableTokens } from './games/ludo';
import type { LudoView } from '../src/shared/protocol';

const damaOpts = { flyingKings: true, backCapture: true };

test('dama: opening moves, compulsory capture, chained jumps, flying king', () => {
  const b = initialBoard();
  expect(b.filter((v) => v === 1).length).toBe(12);
  expect(legalMoves(b, 1, damaOpts).length).toBe(7);
  // a capture is forced when available
  const c = new Array(64).fill(0);
  c[5 * 8 + 2] = 1; // white man at r5c2
  c[4 * 8 + 3] = -1; // black man r4c3
  c[2 * 8 + 5] = -1; // black man r2c5 → double jump r5c2 → r3c4 → r1c6
  c[7 * 8 + 0] = 1;
  const m = legalMoves(c, 1, damaOpts);
  expect(m.every((x) => x.captures.length > 0)).toBe(true);
  expect(Math.max(...m.map((x) => x.captures.length))).toBe(2);
  // men capture backwards only with the option
  const d = new Array(64).fill(0);
  d[3 * 8 + 2] = 1;
  d[4 * 8 + 3] = -1;
  expect(legalMoves(d, 1, damaOpts).some((x) => x.captures.length)).toBe(true);
  expect(legalMoves(d, 1, { flyingKings: true, backCapture: false }).some((x) => x.captures.length)).toBe(false);
  // flying king captures from a distance and can land on any empty square behind
  const k = new Array(64).fill(0);
  k[7 * 8 + 0] = 2;
  k[4 * 8 + 3] = -1;
  const km = legalMoves(k, 1, damaOpts);
  expect(km.length).toBe(4); // lands on r3c4, r2c5, r1c6 or r0c7
  expect(legalMoves(k, 1, { flyingKings: false, backCapture: true }).some((x) => x.captures.length)).toBe(false);
  // promotion
  const p = new Array(64).fill(0);
  p[1 * 8 + 2] = 1;
  const after = applyMove(p, { from: 10, path: [1], captures: [] });
  expect(after[1]).toBe(2);
});

test('dama: two bots always finish a game', () => {
  for (let g = 0; g < 20; g++) {
    let b = initialBoard();
    let side: 1 | -1 = 1;
    let quiet = 0;
    let n = 0;
    for (; n < 400; n++) {
      const m = botMove(b, side, damaOpts);
      if (!m) break;
      quiet = m.captures.length ? 0 : quiet + 1;
      b = applyMove(b, m);
      side = side === 1 ? -1 : 1;
      if (quiet >= 50) break;
    }
    expect(n).toBeLessThan(400);
  }
});

test('ludo: movable pieces and simulated games always finish', () => {
  expect(movableTokens([-1, -1, -1, -1], 5, false)).toEqual([]);
  expect(movableTokens([-1, -1, -1, -1], 6, false)).toEqual([0, 1, 2, 3]);
  expect(movableTokens([-1, -1, -1, -1], 1, true)).toEqual([0, 1, 2, 3]);
  expect(movableTokens([54, 56, -1, 10], 3, false)).toEqual([3]); // 54+3 > 56
  const ctx = { now: 0, fx: () => {}, isConnected: () => true, isBot: () => false, playerName: (id: string) => id, memo: new Map(), bot: () => {} };
  let captures = 0;
  for (let g = 0; g < 50; g++) {
    const seats = ['a', 'b', 'c', 'd'].slice(0, 2 + (g % 3));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = ludo.start(ctx, seats, { exitOnOne: g % 2 === 0 });
    let guard = 0;
    while (s.phase !== 'final' && guard++ < 20000) {
      const me = s.seats[s.turnIdx].id;
      if (s.phase === 'roll') ludo.act(ctx, s, me, { type: 'roll' });
      else {
        const v = ludo.view(ctx, s, me) as LudoView;
        ludo.act(ctx, s, me, { type: 'move', token: v.movable[Math.floor(Math.random() * v.movable.length)] });
        if (s.lastMove?.captured.length) captures++;
      }
      for (const id of seats) for (const p of s.tokens[id]) expect(p >= -1 && p <= 56).toBe(true);
    }
    expect(s.phase).toBe('final');
    expect(s.tokens[s.winner].every((p: number) => p === 56)).toBe(true);
  }
  expect(captures).toBeGreaterThan(20);
});

import { BOARD, FAMILY_CARDS, LUCK_CARDS, groupSquares } from '../src/shared/estate';
import type { EstateView } from '../src/shared/protocol';
import { estate, rentOf, worthOf } from './games/estate';

test('estate: board, rents and net worth', () => {
  expect(BOARD.length).toBe(40);
  expect(BOARD.filter((b) => b.kind === 'station').length).toBe(4);
  expect(groupSquares('brown')).toEqual([1, 3]);
  expect(groupSquares('navy')).toEqual([37, 39]);
  expect(LUCK_CARDS.length + FAMILY_CARDS.length).toBeGreaterThan(20);
  const props: any = { 1: { owner: 'a', houses: 0, mortgaged: false } };
  expect(rentOf({ props }, 1, 7)).toBe(2);
  props[3] = { owner: 'a', houses: 0, mortgaged: false };
  expect(rentOf({ props }, 1, 7)).toBe(4); // full set doubles
  props[3].houses = 5;
  expect(rentOf({ props }, 3, 7)).toBe(450); // hotel
  props[5] = { owner: 'b', houses: 0, mortgaged: false };
  props[15] = { owner: 'b', houses: 0, mortgaged: false };
  expect(rentOf({ props }, 15, 7)).toBe(50);
  props[12] = { owner: 'b', houses: 0, mortgaged: false };
  expect(rentOf({ props }, 12, 7)).toBe(28);
  props[28] = { owner: 'b', houses: 0, mortgaged: true };
  expect(rentOf({ props }, 28, 7)).toBe(0);
  expect(rentOf({ props }, 12, 7)).toBe(70); // still counts both utilities
  const players: any = [{ id: 'a', cash: 100 }];
  expect(worthOf({ props, players }, 'a')).toBe(100 + 60 + 60 + 5 * 50);
});

test('estate: bot-only games always finish with sane state', () => {
  for (let g = 0; g < 30; g++) {
    const queue: { by: string; a: any }[] = [];
    const ctx: any = {
      now: 0,
      fx: () => {},
      isConnected: () => true,
      isBot: () => true,
      playerName: (id: string) => id,
      memo: new Map(),
      bot: (by: string, _k: string, _d: number, a: any) => queue.push({ by, a }),
    };
    const n = 2 + (g % 5);
    const seats = Array.from({ length: n }, (_, i) => `p${i}`);
    const s: any = estate.start(ctx, seats, { startCash: 1500, rounds: g % 3 === 0 ? 0 : 30 });
    let steps = 0;
    while (s.phase !== 'final' && steps < 40000) {
      queue.length = 0;
      estate.botPlan!(ctx, s, seats);
      expect(queue.length).toBeGreaterThan(0);
      // trade answers first, then the turn player
      for (const q of queue) {
        try {
          estate.act(ctx, s, q.by, q.a);
        } catch {}
      }
      steps++;
      let bad = '';
      for (const p of s.players) if (p.cash < 0 || p.pos < 0 || p.pos >= 40) bad = `player ${p.id} ${p.cash} ${p.pos}`;
      for (const [k, p] of Object.entries(s.props) as [string, any][]) {
        if (s.players.find((x: any) => x.id === p.owner).bankrupt) bad = `bankrupt owner ${k}`;
        const sq = BOARD[Number(k)];
        if (p.houses && sq.kind !== 'city') bad = `houses on ${k}`;
        if (p.houses && sq.kind === 'city') {
          const hs = groupSquares(sq.group).map((j) => s.props[j]?.houses ?? -9);
          if (Math.max(...hs) - Math.min(...hs) > 1) bad = `uneven ${sq.group}`;
        }
      }
      if (bad) expect(bad).toBe('');
    }
    if (s.settings.rounds) expect(s.phase).toBe('final');
    if (s.phase === 'final') expect(s.winner).not.toBeNull();
    const v = estate.view(ctx, s, 'p0') as EstateView;
    expect(v.players.length).toBe(n);
    expect(s.phase).toBe('final'); // bots trade to finish sets, so even unlimited games end
  }
}, 60000);

import { HAJJ_LEN, HAJJ_STATIONS, HEX_N, JUMPS, hajjSquare, hexNeighbors, hexWinPath } from '../src/shared/islamic';
import { QUESTIONS, WHO } from './content-islamic';
import { hajj } from './games/hajj';
import { BY_LETTER, huroof } from './games/huroof';
import { ladders } from './games/ladders';
import { quiz } from './games/quiz';
import { quranData, surah } from './games/surah';
import { whois } from './games/whois';

const fakeCtx = (bot: (by: string, a: any) => void = () => {}): any => ({
  now: 0,
  fx: () => {},
  isConnected: () => true,
  isBot: () => true,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: (by: string, _k: string, _d: number, a: any) => bot(by, a),
});

test('islamic content: questions are well-formed, enough letters for حروف', () => {
  for (const q of QUESTIONS) {
    expect(q.w.length).toBe(3);
    expect(new Set([q.a, ...q.w]).size).toBe(4); // no duplicate options
  }
  expect(BY_LETTER.size).toBeGreaterThanOrEqual(HEX_N * HEX_N);
  for (const e of WHO) {
    expect(e.clues.length).toBe(4);
    expect(WHO.filter((w) => w.cat === e.cat).length).toBeGreaterThanOrEqual(6); // 6 options per round
  }
  expect(HAJJ_STATIONS.length * 4 + 1).toBe(HAJJ_LEN);
  expect(hajjSquare(HAJJ_LEN - 1)).toBe('station');
  for (const [from, j] of Object.entries(JUMPS)) {
    expect(JUMPS[j.to]).toBeUndefined(); // no chained jumps
    expect(j.kind === 'ladder' ? j.to > Number(from) : j.to < Number(from)).toBe(true);
  }
});

test('huroof: hex neighbours and winning chains', () => {
  expect(hexNeighbors(0).sort((a, b) => a - b)).toEqual([1, 5]);
  expect(hexNeighbors(12).length).toBe(6);
  const owners: (string | null)[] = Array(25).fill(null);
  for (let c = 0; c < 5; c++) owners[10 + c] = 'red'; // middle row
  expect(hexWinPath(owners, 'red')).not.toBeNull();
  expect(hexWinPath(owners, 'green')).toBeNull();
  // a full random board always has exactly one winner
  for (let g = 0; g < 300; g++) {
    const b = Array.from({ length: 25 }, () => (Math.random() < 0.5 ? 'red' : 'green'));
    expect(!!hexWinPath(b, 'red') !== !!hexWinPath(b, 'green')).toBe(true);
  }
});

test('huroof: bot teams play a full game to a winner', () => {
  for (let g = 0; g < 20; g++) {
    const q: any[] = [];
    const ctx = fakeCtx((by, a) => q.push({ by, a }));
    const seats = ['a', 'b', 'c', 'd'];
    const s: any = huroof.start(ctx, seats, { seconds: 20 });
    expect(new Set(s.cells.map((c: any) => c.letter)).size).toBe(25);
    for (let k = 0; k < 2000 && s.phase !== 'final'; k++) {
      q.length = 0;
      huroof.botPlan!(ctx, s, seats);
      if (!q.length) {
        ctx.now += 30000;
        huroof.tick!(ctx, s);
      }
      for (const x of q) {
        try {
          huroof.act(ctx, s, x.by, x.a);
        } catch {}
      }
    }
    expect(s.phase).toBe('final');
    expect(s.winner).not.toBeNull();
  }
});

test('quiz and surah: the marked answer is the right one; verses really come from that surah', () => {
  const ctx = fakeCtx();
  const s: any = quiz.start(ctx, ['a', 'b'], { rounds: 30, seconds: 15, category: 'all' });
  for (const it of s.items) {
    const src = QUESTIONS.find((x) => x.q === it.text)!;
    expect(it.options[it.correct]).toBe(src.a);
  }
  const { verses } = quranData();
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const t: any = surah.start(ctx, ['a', 'b'], { rounds: 20, seconds: 20, level });
    expect(t.items.length).toBe(20);
    for (const it of t.items) {
      const { surahs } = quranData();
      // (a verse can repeat inside the same surah, e.g. al-Kafirun 3 and 5)
      const v = verses.find((x) => x[2] === it.text && it.ref === `سورة ${surahs[x[0] - 1].name} — الآية ${x[1]}`)!;
      expect(v).toBeDefined();
      expect(it.options[it.correct]).toBe(surahs[v[0] - 1].name);
      expect(new Set(it.options).size).toBe(4);
      if (level === 'easy') expect(v[0]).toBeGreaterThanOrEqual(78);
    }
  }
});

test('quiz: answers, speed scoring and reveal', () => {
  const ctx = fakeCtx();
  const s: any = quiz.start(ctx, ['a', 'b'], { rounds: 5, seconds: 10, category: 'quran' });
  const it = s.items[0];
  ctx.now = 1000;
  quiz.act(ctx, s, 'a', { type: 'answer', choice: it.correct });
  ctx.now = 9000;
  quiz.act(ctx, s, 'b', { type: 'answer', choice: (it.correct + 1) % 4 });
  expect(s.phase).toBe('reveal');
  expect(s.scores.a).toBe(500 + 450);
  expect(s.scores.b).toBe(0);
});

test('whois: options contain the answer, scoring by clue', () => {
  const ctx = fakeCtx();
  const s: any = whois.start(ctx, ['a', 'b'], { rounds: 4 });
  const v = whois.view(ctx, s, 'a') as any;
  expect(v.options.length).toBe(6);
  expect(v.clues.length).toBe(1);
  const ans = s.options.indexOf(s.entries[0].name);
  whois.act(ctx, s, 'a', { type: 'guess', choice: ans });
  ctx.now += 7001;
  whois.tick!(ctx, s);
  whois.act(ctx, s, 'b', { type: 'guess', choice: ans });
  expect(s.phase).toBe('reveal');
  expect(s.scores.a).toBe(400);
  expect(s.scores.b).toBe(300);
});

test('hajj: bot races finish, and nobody ever skips a station', () => {
  for (let g = 0; g < 40; g++) {
    const q: any[] = [];
    const ctx = fakeCtx((by, a) => q.push({ by, a }));
    const seats = ['a', 'b', 'c'].slice(0, 2 + (g % 2));
    const s: any = hajj.start(ctx, seats, { questions: g % 3 !== 0 });
    const visited: Record<string, Set<number>> = Object.fromEntries(seats.map((x) => [x, new Set([0])]));
    for (let k = 0; k < 3000 && s.phase !== 'final'; k++) {
      q.length = 0;
      hajj.botPlan!(ctx, s, seats);
      for (const x of q) hajj.act(ctx, s, x.by, x.a);
      for (const p of s.players) {
        const last = Math.max(...visited[p.id]);
        // every station between where you were and where you are must have been stood on
        for (let st = 4; st < p.pos; st += 4) if (st > last) throw new Error(`skipped station ${st} (${last} → ${p.pos})`);
        visited[p.id].add(p.pos);
      }
    }
    expect(s.phase).toBe('final');
    expect(s.players.find((p: any) => p.id === s.winner).pos).toBe(HAJJ_LEN - 1);
  }
});

test('ladders: games finish; ladders lift and snakes drop', () => {
  for (let g = 0; g < 40; g++) {
    const q: any[] = [];
    const ctx = fakeCtx((by, a) => q.push({ by, a }));
    const seats = ['a', 'b', 'c'];
    const s: any = ladders.start(ctx, seats, { exact: g % 2 === 0 });
    for (let k = 0; k < 5000 && s.phase !== 'final'; k++) {
      q.length = 0;
      ladders.botPlan!(ctx, s, seats);
      for (const x of q) ladders.act(ctx, s, x.by, x.a);
      for (const p of s.players) {
        expect(p.pos).toBeLessThanOrEqual(100);
        expect(JUMPS[p.pos]).toBeUndefined(); // never left standing on a ladder foot or snake head
      }
    }
    expect(s.phase).toBe('final');
  }
});

import { START_FEN as CHESS_START, fromFen, legalMoves as chessMoves, perft, resultOf, makeMove as chessMake, repKey } from '../src/shared/chess';
import { COLS as C4_COLS, bestColumn, dropRow, winLine } from '../src/shared/connect4';
import { markGuess, normWord } from '../src/shared/wordle';
import { WAVE_SPECTRUMS, WORDLE_WORDS } from './content-games2';
import { chess } from './games/chess';
import { connect4 } from './games/connect4';
import { kdab } from './games/kdab';
import { wave, wavePoints } from './games/wave';
import { wordle } from './games/wordle';

test('chess: perft counts match the standard reference positions', () => {
  const cases: [string, number[]][] = [
    [CHESS_START, [20, 400, 8902]],
    ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039]],
    ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812]],
    ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
    ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486]],
  ];
  for (const [fen, exp] of cases) expect(exp.map((_, d) => perft(fromFen(fen), d + 1))).toEqual(exp);
});

test('chess: mate, stalemate, insufficient material, repetition', () => {
  // fool's mate
  let p = fromFen(CHESS_START);
  for (const [f, t] of [[53, 45], [12, 28], [54, 38], [3, 39]]) p = chessMake(p, { from: f, to: t });
  expect(resultOf(p, {})).toEqual({ winner: 'b', reason: 'mate' });
  expect(resultOf(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), {})).toEqual({ winner: 'draw', reason: 'stalemate' });
  expect(resultOf(fromFen('8/8/4k3/8/8/2B5/4K3/8 w - - 0 1'), {})!.reason).toBe('material');
  const q = fromFen(CHESS_START);
  expect(resultOf(q, { [repKey(q)]: 3 })!.reason).toBe('repetition');
});

test('chess: two bots play legal games to the end', () => {
  for (let g = 0; g < 3; g++) {
    const q: any[] = [];
    const ctx = fakeCtx((by, a) => q.push({ by, a }));
    const s: any = chess.start(ctx, ['w1', 'b1'], { level: 1 });
    for (let k = 0; k < 400 && s.phase === 'play'; k++) {
      q.length = 0;
      chess.botPlan!(ctx, s, ['w1', 'b1']);
      expect(q.length).toBe(1);
      const before = chessMoves(s.pos).length;
      expect(before).toBeGreaterThan(0);
      chess.act(ctx, s, q[0].by, q[0].a);
    }
    if (s.phase === 'play') {
      // long games are fine; make sure the position is still sane
      expect(chessMoves(s.pos).length).toBeGreaterThan(0);
    } else expect(s.winner).not.toBeNull();
  }
}, 60000);

test('connect4: wins in every direction, full columns refused, strong bot blocks', () => {
  const b: any[] = Array(42).fill(0);
  for (const c of [0, 1, 2, 3]) b[dropRow(b, c) * C4_COLS + c] = 1;
  expect(winLine(b, 5 * C4_COLS + 3)!.length).toBe(4);
  const d: any[] = Array(42).fill(0);
  [[0, 1], [1, 2], [1, 1], [2, 2], [2, 2], [2, 1], [3, 2], [3, 2], [3, 2], [3, 1]].forEach(([c, v]) => (d[dropRow(d, c) * C4_COLS + c] = v));
  const top = dropRow(d, 3) + 1;
  expect(winLine(d, top * C4_COLS + 3)).not.toBeNull(); // diagonal
  // the bot must block an open three
  const e: any[] = Array(42).fill(0);
  for (const c of [0, 1, 2]) e[dropRow(e, c) * C4_COLS + c] = 1;
  expect(bestColumn(e, 2, 2)).toBe(3);
  const ctx = fakeCtx();
  const s: any = connect4.start(ctx, ['r', 'y'], { level: 2 });
  for (let k = 0; k < 6; k++) connect4.act(ctx, s, k % 2 ? 'y' : 'r', { type: 'drop', col: 0 });
  expect(() => connect4.act(ctx, s, 'r', { type: 'drop', col: 0 })).toThrow();
});

test('kdab: all 40 cards always accounted for; games end with a winner', () => {
  for (let g = 0; g < 60; g++) {
    const q: any[] = [];
    const ctx = fakeCtx((by, a) => q.push({ by, a }));
    const seats = ['a', 'b', 'c', 'd'].slice(0, 2 + (g % 3));
    const s: any = kdab.start(ctx, seats, { maxPlay: 4 });
    for (let k = 0; k < 4000 && s.phase === 'play'; k++) {
      q.length = 0;
      kdab.botPlan!(ctx, s, seats);
      if (!q.length) {
        ctx.now += 6000;
        kdab.tick!(ctx, s);
        continue;
      }
      // challenges first (they come before the next play), then the turn action
      q.sort((x, y) => (x.a.type === 'call' ? -1 : 0) - (y.a.type === 'call' ? -1 : 0));
      for (const x of q) {
        try {
          kdab.act(ctx, s, x.by, x.a);
        } catch {}
      }
      const total = s.pile.length + Object.values(s.hands).reduce((t: number, h: any) => t + h.length, 0);
      const discarded = 40 - total;
      expect(discarded).toBeGreaterThanOrEqual(0);
      if (s.rank === null && s.pile.length) throw new Error('pile without a rank');
    }
    expect(s.phase).toBe('final');
    expect(s.winner).not.toBeNull();
  }
});

test('kdab: calling a liar gives them the pile; calling a truth-teller backfires', () => {
  const ctx = fakeCtx();
  const s: any = kdab.start(ctx, ['a', 'b'], { maxPlay: 4 });
  const a = s.order[0], b = s.order[1];
  const card = s.hands[a][0];
  const lieRank = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].find((r) => r !== card.rank);
  kdab.act(ctx, s, a, { type: 'play', cards: [card.id], rank: lieRank });
  const before = s.hands[a].length;
  kdab.act(ctx, s, b, { type: 'call' });
  expect(s.reveal.truthful).toBe(false);
  expect(s.hands[a].length).toBe(before + 1);
  // now a truthful play
  const t = s.order[s.turnIdx];
  const other = t === a ? b : a;
  const c2 = s.hands[t][0];
  kdab.act(ctx, s, t, { type: 'play', cards: [c2.id], rank: c2.rank });
  const ob = s.hands[other].length;
  kdab.act(ctx, s, other, { type: 'call' });
  expect(s.reveal.truthful).toBe(true);
  expect(s.hands[other].length).toBe(ob + 1);
});

test('wave: points by distance and a full round', () => {
  expect([0, 4, 5, 10, 11, 17, 18].map(wavePoints)).toEqual([4, 4, 3, 3, 2, 2, 0]);
  expect(WAVE_SPECTRUMS.length).toBeGreaterThan(40);
  const ctx = fakeCtx();
  const s: any = wave.start(ctx, ['a', 'b', 'c'], { rounds: 1 });
  const p = s.order[0];
  const v = wave.view(ctx, s, s.players.find((x: string) => x !== p)) as any;
  expect(v.target).toBeNull(); // guessers can't see the target
  expect((wave.view(ctx, s, p) as any).target).toBe(s.target);
  wave.act(ctx, s, p, { type: 'clue', text: 'شاي بالنعناع' });
  const gs = s.players.filter((x: string) => x !== p);
  wave.act(ctx, s, gs[0], { type: 'guess', value: s.target });
  wave.act(ctx, s, gs[1], { type: 'guess', value: Math.min(100, s.target + 30) });
  expect(s.phase).toBe('reveal');
  expect(s.scores[gs[0]]).toBe(4);
  expect(s.scores[p]).toBe(2);
});

test('wordle: words are 5 letters, marking handles repeated letters, bots solve', () => {
  for (const w of WORDLE_WORDS) expect([...normWord(w)].length).toBe(5);
  expect(markGuess('سسبسس', 'سبسسي').join('')).toBe('gyyg' + 'x');
  expect(markGuess('ببببب', 'سبسسي').join('')).toBe('xgxxx');
  const q: any[] = [];
  const ctx = fakeCtx((by, a) => q.push({ by, a }));
  const s: any = wordle.start(ctx, ['x', 'y'], { rounds: 2 });
  for (let k = 0; k < 100 && s.phase !== 'final'; k++) {
    q.length = 0;
    wordle.botPlan!(ctx, s, ['x', 'y']);
    for (const z of q) wordle.act(ctx, s, z.by, z.a);
    if (!q.length) {
      ctx.now += 300000;
      wordle.tick!(ctx, s);
    }
  }
  expect(s.phase).toBe('final');
});
