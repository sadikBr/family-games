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
import { answerMatches, similarAnswers, startsWithLetter } from '../src/shared/arabic';
import { NAMES_DICT } from './bot-content';
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

test('names: answers must start with the letter itself; similar spellings share the points', () => {
  expect(startsWithLetter('الرباط', 'ر')).toBe(false);
  expect(startsWithLetter('الرباط', 'ا')).toBe(false);
  expect(startsWithLetter('رباط', 'ر')).toBe(true);
  expect(startsWithLetter('ألمانيا', 'ا')).toBe(true);
  expect(startsWithLetter('إلياس', 'ا')).toBe(true);
  expect(startsWithLetter('أحمد', 'ا')).toBe(true);
  expect(similarAnswers('زيمبابوي', 'زمبابوي')).toBe(true);
  expect(similarAnswers('فرنسا', 'فرانسا')).toBe(true);
  expect(similarAnswers('سعد', 'سعيد')).toBe(false);
  expect(similarAnswers('سلمى', 'سلوى')).toBe(false);
  expect(similarAnswers('محمد', 'محمود')).toBe(false);
  // the bots' dictionary has no «ال» words, and every word fits its letter
  for (const [cat, byLetter] of Object.entries(NAMES_DICT))
    for (const [l, words] of Object.entries(byLetter)) for (const w of words) expect([cat, w, startsWithLetter(w, l)]).toEqual([cat, w, true]);
  expect(Object.keys(NAMES_DICT.job).length).toBeGreaterThan(18);
});

test('huroof: typed answers forgive spelling; buzz, wrong answer and timeout pass the turn', () => {
  expect(answerMatches('عمر', 'عمر بن الخطاب')).toBe(true);
  expect(answerMatches('ابو بكر', 'أبو بكر الصديق')).toBe(true);
  expect(answerMatches('البقره', 'البقرة')).toBe(true);
  expect(answerMatches('المسجد', 'المسجد الأقصى')).toBe(false);
  expect(answerMatches('يوسف', 'يونس')).toBe(false);
  expect(answerMatches('عبدالله', 'عبد الله')).toBe(true);
  const ctx = fakeCtx();
  const s: any = huroof.start(ctx, ['r1', 'g1'], { seconds: 15 });
  s.teams = { red: ['r1'], green: ['g1'] };
  s.turn = 'red';
  huroof.act(ctx, s, 'r1', { type: 'pick', cell: 0 });
  expect(s.phase).toBe('question');
  expect((huroof.view(ctx, s, 'g1') as any).question).toEqual({ text: s.question.text }); // the answer stays on the server
  huroof.act(ctx, s, 'g1', { type: 'buzz' });
  expect(s.phase).toBe('answer');
  huroof.act(ctx, s, 'r1', { type: 'answer', text: s.question.answer }); // not the one who buzzed
  expect(s.phase).toBe('answer');
  huroof.act(ctx, s, 'g1', { type: 'answer', text: 'كلام فارغ تماما' });
  expect(s.canAnswer).toEqual(['red']);
  expect(s.phase).toBe('question');
  expect(() => huroof.act(ctx, s, 'g1', { type: 'buzz' })).toThrow();
  huroof.act(ctx, s, 'r1', { type: 'buzz' });
  ctx.now += 21000;
  huroof.tick!(ctx, s); // r1 ran out of time
  expect(s.phase).toBe('pick');
  expect(s.cells[0].owner).toBeNull();
  huroof.act(ctx, s, s.turn === 'red' ? 'r1' : 'g1', { type: 'pick', cell: 1 });
  huroof.act(ctx, s, 'r1', { type: 'buzz' });
  huroof.act(ctx, s, 'r1', { type: 'answer', text: s.question.answer });
  expect(s.cells[1].owner).toBe('red');
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
      const v = verses.find((x) => forFont(x[2]) === it.text && it.ref === `سورة ${surahs[x[0] - 1].name} — الآية ${x[1]}`)!;
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

test('hajj: bot races finish; only «الدليل» lets you pass a station; cards and station quizzes work', () => {
  let quizzes = 0, plays = 0;
  for (let g = 0; g < 40; g++) {
    const q: any[] = [];
    const ctx = fakeCtx((by, a) => q.push({ by, a }));
    const seats = ['a', 'b', 'c'].slice(0, 2 + (g % 2));
    const s: any = hajj.start(ctx, seats, { questions: g % 3 !== 0 });
    expect(s.players.every((p: any) => p.hand.length === 1)).toBe(true);
    const visited: Record<string, Set<number>> = Object.fromEntries(seats.map((x) => [x, new Set([0])]));
    for (let k = 0; k < 4000 && s.phase !== 'final'; k++) {
      q.length = 0;
      hajj.botPlan!(ctx, s, seats);
      const passer = s.mods.pass ? s.players[s.turnIdx].id : null;
      const batch = q.splice(0);
      for (const x of batch) {
        if (x.a.type === 'play') plays++;
        hajj.act(ctx, s, x.by, x.a);
      }
      if (s.phase === 'quiz' && s.quiz?.revealed && batch.some((x) => x.a.type === 'quiz')) quizzes++;
      for (const p of s.players) {
        const last = Math.max(...visited[p.id]);
        // every station between where you were and where you are must have been stood on (one may be passed with الدليل)
        const skipped = [];
        for (let st = 4; st < p.pos; st += 4) if (st > last) skipped.push(st);
        if (skipped.length > (p.id === passer ? 1 : 0)) throw new Error(`skipped station ${skipped} (${last} → ${p.pos})`);
        expect(p.hand.length).toBeLessThanOrEqual(3);
        visited[p.id].add(p.pos);
      }
      if (!batch.length) {
        ctx.now += 4000;
        hajj.tick!(ctx, s);
      }
    }
    expect(s.phase).toBe('final');
    expect(s.players.find((p: any) => p.id === s.winner).pos).toBe(HAJJ_LEN - 1);
  }
  expect(quizzes).toBeGreaterThan(50);
  expect(plays).toBeGreaterThan(50);
});

test('hajj: the station quiz rewards right answers, sabr cancels a delay', () => {
  const ctx = fakeCtx();
  const s: any = hajj.start(ctx, ['a', 'b'], { questions: true });
  const [a, b] = s.players;
  a.hand = [];
  b.hand = [];
  s.turnIdx = s.players.indexOf(a);
  a.pos = 3;
  const roll = Math.random;
  Math.random = () => 0; // the die shows 1
  hajj.act(ctx, s, a.id, { type: 'roll' });
  Math.random = roll;
  expect(a.pos).toBe(4);
  expect(s.phase).toBe('quiz');
  ctx.now += 100;
  hajj.act(ctx, s, b.id, { type: 'quiz', choice: s.quiz.correct });
  ctx.now += 100;
  hajj.act(ctx, s, a.id, { type: 'quiz', choice: (s.quiz.correct + 1) % 4 });
  expect(s.quiz.revealed).toBe(true);
  expect(b.hand.length).toBe(1);
  expect(a.hand.length).toBe(0);
  expect(b.pos).toBe(1); // the fastest right answer steps forward
  ctx.now += 4000;
  hajj.tick!(ctx, s);
  expect(s.phase).toBe('roll');
  // الصبر is used up by the next delay instead of moving back
  b.hand = [{ id: 99, kind: 'sabr' }];
  s.events = [{ text: 'زحام شديد في الطريق — اصبر واحتسب. ارجع خانة.', move: -1 }];
  s.turnIdx = s.players.indexOf(b);
  b.pos = 4;
  expect(hajjSquare(5)).toBe('event');
  Math.random = () => 0; // a 1: from station 1 (square 4) onto the event square 5
  hajj.act(ctx, s, b.id, { type: 'roll' });
  Math.random = roll;
  expect(s.card.kind).toBe('zad');
  expect(b.pos).toBe(5);
  expect(b.hand.length).toBe(0);
  expect(() => hajj.act(ctx, s, s.players[s.turnIdx].id, { type: 'play', card: 12345 })).not.toThrow();
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
import { VALID_GUESSES, wordle } from './games/wordle';

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
  for (let k = 0; k < 6; k++) connect4.act(ctx, s, k % 2 ? s.yellow : s.red, { type: 'drop', col: 0 });
  expect(s.board.filter(Boolean).length).toBe(6);
  expect(() => connect4.act(ctx, s, s.red, { type: 'drop', col: 0 })).toThrow(); // full column
  expect(() => connect4.act(ctx, s, s.yellow, { type: 'drop', col: 1 })).toThrow(); // not their turn
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
  wave.act(ctx, s, gs[1], { type: 'guess', value: s.target > 50 ? s.target - 30 : s.target + 30 });
  expect(s.phase).toBe('reveal');
  expect(s.scores[gs[0]]).toBe(4);
  expect(s.scores[p]).toBe(2);
});

test('wordle: words are 5 letters, marking handles repeated letters, bots solve', () => {
  for (const w of WORDLE_WORDS) expect([...normWord(w)].length).toBe(5);
  expect(VALID_GUESSES.size).toBeGreaterThan(50000);
  for (const w of ['مكتوب', 'حريرة', 'جميلة', 'العام']) expect(VALID_GUESSES.has(normWord(w))).toBe(true);
  for (const w of ['سجتحخ', 'ظظظظظ', 'ضصثقف']) expect(VALID_GUESSES.has(w)).toBe(false);
  for (const w of VALID_GUESSES) expect([...w].length).toBe(5);
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

import { BN, FLEET, botShot, randomFleet } from '../src/shared/battleship';
import { CENTER as K_CENTER, applyMove as kApply, capturesAt, movesFor as kMoves } from '../src/shared/kharbga';
import { MEMORY_FACES, MEMORY_SIZES } from '../src/shared/memory';
import { conflicts, countSolutions, generateSudoku } from '../src/shared/sudoku';
import { xoBest, xoWinner, type Mark } from '../src/shared/xo';
import { TRIVIA } from './content-trivia';
import { battleship } from './games/battleship';
import { kharbga } from './games/kharbga';
import { memory } from './games/memory';
import { sudoku } from './games/sudoku';
import { trivia } from './games/trivia';
import { xo } from './games/xo';
import { forFont } from './games/tajweed';

/** Run a module with bots only until it ends (bots act instantly; ticks advance the clock). */
function botRun(mod: any, players: string[], settings: any, steps = 5000) {
  const q: any[] = [];
  const ctx = fakeCtx((by, a) => q.push({ by, a }));
  ctx.memo = new Map();
  const s: any = mod.start(ctx, players, settings);
  for (let k = 0; k < steps && s.phase !== 'final'; k++) {
    q.length = 0;
    mod.botPlan?.(ctx, s, players);
    const batch = q.splice(0);
    for (const z of batch) mod.act(ctx, s, z.by, z.a);
    if (!batch.length) {
      ctx.now += 2000;
      mod.tick?.(ctx, s);
    }
  }
  return { s, ctx };
}

test('kharbga: sandwich captures, safe between two, chains, bots finish', () => {
  const b = Array(49).fill(0);
  // a vertical line: 10 attacker, 17 defender, 24 empty
  b[10] = 1;
  b[17] = 2;
  b[31] = 1; // attacker moves 31→24 and sandwiches 17
  const r = kApply(b, { from: 31, to: 24 }, 1);
  expect(r.captured).toEqual([17]);
  expect(capturesAt(r.board, 24, 1)).toEqual([]);
  // moving between two enemies is safe
  const s2 = Array(49).fill(0);
  s2[23] = 2;
  s2[25] = 2;
  s2[31] = 1;
  expect(kApply(s2, { from: 31, to: 24 }, 1).captured).toEqual([]);
  // first move must enter the centre
  const full = Array(49).fill(0).map((_, i) => (i === K_CENTER ? 0 : i % 2 ? 1 : 2));
  expect(kMoves(full, 1, null, true).every((m) => m.to === K_CENTER)).toBe(true);
  // chain: only the chain piece may move, and only to capture
  const c = Array(49).fill(0);
  c[24] = 1;
  c[25] = 0;
  c[26] = 2;
  c[27] = 1;
  c[18] = 2;
  c[11] = 1;
  const chain = kMoves(c, 1, 24);
  expect(chain.every((m) => m.from === 24)).toBe(true);
  expect(chain.map((m) => m.to)).toEqual([25]);
  for (let g = 0; g < 6; g++) {
    const { s } = botRun(kharbga, ['a', 'b'], { level: (1 + (g % 2)) as 1 | 2 }, 4000);
    expect(s.phase).toBe('final');
    expect(s.winner).not.toBeNull();
  }
});

test('battleship: fleets never touch, bots sink everything', () => {
  for (let k = 0; k < 200; k++) {
    const f = randomFleet();
    expect(f.map((x) => x.length)).toEqual(FLEET);
    const cells = new Set(f.flat());
    expect(cells.size).toBe(17);
    for (let i = 0; i < f.length; i++)
      for (const c of f[i])
        for (const d of [-BN - 1, -BN, -BN + 1, -1, 1, BN - 1, BN, BN + 1]) {
          const n = c + d;
          if (n < 0 || n >= BN * BN || Math.abs((n % BN) - (c % BN)) > 1) continue;
          if (cells.has(n)) expect(f[i].includes(n)).toBe(true);
        }
  }
  // the hunting bot never shoots the same cell twice and finishes in < 100 shots
  for (const level of [1, 2] as const) {
    let total = 0;
    for (let g = 0; g < 30; g++) {
      const fleet = randomFleet();
      const shots: Record<number, 'hit' | 'miss'> = {};
      let n = 0;
      while (!fleet.every((sh) => sh.every((c) => shots[c] === 'hit'))) {
        const c = botShot(shots, fleet.filter((sh) => sh.every((x) => shots[x] === 'hit')), level);
        expect(shots[c]).toBeUndefined();
        shots[c] = fleet.some((sh) => sh.includes(c)) ? 'hit' : 'miss';
        n++;
      }
      expect(n).toBeLessThanOrEqual(100);
      total += n;
    }
    if (level === 2) expect(total / 30).toBeLessThan(65);
  }
  const { s } = botRun(battleship, ['a', 'b'], { level: 2 });
  expect(s.phase).toBe('final');
  const v = battleship.view(fakeCtx(), s, s.winner) as any;
  expect(v.enemyFleet).not.toBeNull();
  expect(v.enemyFleetLeft).toBe(0);
});

test('xo: winner lines, the strong bot never loses', () => {
  expect(xoWinner(['x', 'x', 'x', '', 'o', 'o', '', '', ''] as Mark[])?.mark).toBe('x');
  for (let g = 0; g < 60; g++) {
    const b: Mark[] = Array(9).fill('');
    let turn: 'x' | 'o' = g % 2 ? 'x' : 'o';
    const strong = 'x';
    while (!xoWinner(b) && b.some((c) => !c)) {
      const cell = turn === strong ? xoBest(b, turn, 2) : (() => { const free = b.map((c, i) => (c ? -1 : i)).filter((i) => i >= 0); return free[Math.floor(Math.random() * free.length)]; })();
      b[cell] = turn;
      turn = turn === 'x' ? 'o' : 'x';
    }
    expect(xoWinner(b)?.mark).not.toBe('o');
  }
  const { s } = botRun(xo, ['a', 'b'], { level: 2 });
  expect(s.phase).toBe('final');
});

test('sudoku: unique puzzles, conflicts detected, a race finishes with scores', () => {
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const { puzzle, solution } = generateSudoku(level);
    expect(countSolutions(puzzle.slice(), 2)).toBe(1);
    expect(conflicts(solution).size).toBe(0);
    puzzle.forEach((v, i) => v && expect(v).toBe(solution[i]));
  }
  const g = Array(81).fill(0);
  g[0] = 5;
  g[8] = 5;
  expect([...conflicts(g)].sort()).toEqual([0, 8]);
  const ctx = fakeCtx();
  const s: any = sudoku.start(ctx, ['a', 'b'], { level: 'easy' });
  const empty = s.puzzle.map((v: number, i: number) => (v ? -1 : i)).filter((i: number) => i >= 0);
  sudoku.act(ctx, s, 'a', { type: 'set', cell: empty[0], value: (s.solution[empty[0]] % 9) + 1 });
  expect(s.mistakes.a).toBe(1);
  expect(s.grids.a[empty[0]]).toBe(0);
  for (const c of empty) sudoku.act(ctx, s, 'a', { type: 'set', cell: c, value: s.solution[c] });
  expect(s.finished[0].id).toBe('a');
  expect(s.scores.a).toBe(280);
  expect(s.phase).toBe('play');
  sudoku.act(ctx, s, 'b', { type: 'giveup' });
  expect(s.phase).toBe('final');
  const r = botRun(sudoku, ['x', 'y', 'z'], { level: 'easy' });
  expect(r.s.phase).toBe('final');
  expect(r.s.finished.length).toBe(3);
});

test('memory: every size has enough faces, pairs keep the turn, games finish', () => {
  expect(new Set(MEMORY_FACES).size).toBe(MEMORY_FACES.length);
  expect(Math.max(...MEMORY_SIZES)).toBeLessThanOrEqual(MEMORY_FACES.length);
  const ctx = fakeCtx();
  const s: any = memory.start(ctx, ['a', 'b'], { pairs: 8 });
  const first = s.order[0];
  const i = 0, j = s.deck.indexOf(s.deck[0], 1);
  memory.act(ctx, s, first, { type: 'flip', card: i });
  memory.act(ctx, s, first, { type: 'flip', card: j });
  expect(s.pairs[first]).toBe(1);
  expect(s.order[s.turnIdx]).toBe(first);
  const k = s.deck.findIndex((f: string, x: number) => !s.owners[x]);
  const miss = s.deck.findIndex((f: string, x: number) => !s.owners[x] && f !== s.deck[k]);
  memory.act(ctx, s, first, { type: 'flip', card: k });
  memory.act(ctx, s, first, { type: 'flip', card: miss });
  expect((memory.view(ctx, s, 'a') as any).peek).toBe(true);
  ctx.now += 3000;
  memory.tick!(ctx, s);
  expect(s.order[s.turnIdx]).not.toBe(first);
  for (const pairs of MEMORY_SIZES) {
    const r = botRun(memory, ['a', 'b', 'c'], { pairs });
    expect(r.s.phase).toBe('final');
    expect(Object.values(r.s.pairs as Record<string, number>).reduce((x, y) => x + y, 0)).toBe(pairs);
  }
});

test('trivia: questions well-formed, every category big enough, a game plays out', () => {
  for (const q of TRIVIA) {
    expect(q.w.length).toBe(3);
    expect(new Set([q.a, ...q.w]).size).toBe(4);
  }
  expect(new Set(TRIVIA.map((q) => q.q)).size).toBe(TRIVIA.length);
  for (const cat of ['morocco', 'geography', 'science', 'sport', 'animals', 'mixed'] as const) expect(TRIVIA.filter((q) => q.cat === cat).length).toBeGreaterThanOrEqual(15);
  const r = botRun(trivia, ['a', 'b'], { rounds: 5, seconds: 15, category: 'science' });
  expect(r.s.phase).toBe('final');
  expect(r.s.items.length).toBe(5);
});

import { werewolf } from './games/werewolf';

const ALL_ROLES = { narratorId: 'n', wolves: 3, seer: true, doctor: true, hunter: true, witch: true, guard: true, mayor: true, tanner: true, whitewolf: true, bigwolf: true };

test('werewolf: every role is dealt; witch, guard, big wolf, hunter, mayor and tanner work', () => {
  const ctx = fakeCtx();
  ctx.isBot = (id: string) => id === 'none';
  const players = ['n', ...Array.from({ length: 10 }, (_, i) => `p${i}`)];
  const s: any = werewolf.start(ctx, players, ALL_ROLES);
  const who = (r: string) => Object.keys(s.roles).find((id) => s.roles[id] === r)!;
  expect(Object.values(s.roles).sort()).toEqual(['bigwolf', 'doctor', 'guard', 'hunter', 'seer', 'tanner', 'villager', 'whitewolf', 'witch', 'wolf'].sort());
  const N = (a: any) => werewolf.act(ctx, s, 'n', a);
  const goTo = (step: string) => {
    for (let k = 0; k < 20 && s.step !== step; k++) N({ type: 'next' });
    expect(s.step).toBe(step);
  };
  expect(s.steps).toEqual(['sleep', 'wolves', 'bigwolf', 'guard', 'doctor', 'seer', 'witch', 'wake']); // no white wolf on odd nights
  goTo('wolves');
  N({ type: 'pick', target: who('wolf') }); // wolves can't eat a wolf
  expect(s.wolvesTarget).toBeNull();
  N({ type: 'pick', target: who('villager') });
  goTo('bigwolf');
  N({ type: 'pick', target: who('villager') }); // must be a second victim
  expect(s.bigwolfTarget).toBeNull();
  N({ type: 'pick', target: who('hunter') });
  goTo('guard');
  N({ type: 'pick', target: who('seer') });
  goTo('witch');
  N({ type: 'heal', target: who('doctor') }); // not a victim
  expect(s.witchHeal).toBeNull();
  N({ type: 'heal', target: who('villager') });
  goTo('wake');
  N({ type: 'next' });
  expect(s.phase).toBe('day');
  expect(s.lastDeaths).toEqual([who('hunter')]);
  expect(s.healUsed).toBe(true);
  expect(s.steps).toEqual(['announce', 'hunter', 'mayor', 'vote']);
  goTo('hunter');
  N({ type: 'pick', target: who('wolf') });
  N({ type: 'next' });
  expect(s.alive[who('wolf')]).toBe(false);
  expect(s.wolfDied).toBe(true);
  expect(s.step).toBe('mayor');
  N({ type: 'pick', target: who('seer') });
  N({ type: 'next' });
  expect(s.mayorId).toBe(who('seer'));
  expect(s.step).toBe('vote');
  N({ type: 'eliminate', target: who('seer') }); // the mayor is voted out → successor
  expect(s.step).toBe('mayor');
  N({ type: 'pick', target: who('doctor') });
  N({ type: 'next' });
  expect(s.mayorId).toBe(who('doctor'));
  // night 2: no big wolf any more (a wolf died), the white wolf wakes up, guard can't repeat
  expect(s.phase).toBe('night');
  expect(s.steps).toContain('whitewolf');
  expect(s.steps).not.toContain('bigwolf');
  goTo('whitewolf');
  N({ type: 'pick', target: who('villager') }); // must be a wolf
  expect(s.whitewolfTarget).toBeNull();
  N({ type: 'pick', target: who('bigwolf') });
  goTo('guard');
  N({ type: 'pick', target: who('seer') }); // dead anyway, and guarded last night
  expect(s.guardSave).toBeNull();
  goTo('witch');
  N({ type: 'heal', target: s.wolvesTarget ?? 'x' });
  expect(s.witchHeal).toBeNull(); // potion already used
  N({ type: 'pick', target: who('villager') }); // poison
  goTo('wake');
  N({ type: 'next' });
  expect(s.alive[who('bigwolf')]).toBe(false);
  expect(s.alive[who('villager')]).toBe(false);
  expect(s.poisonUsed).toBe(true);
  goTo('vote');
  N({ type: 'eliminate', target: who('tanner') });
  expect(s.phase).toBe('over');
  expect(s.winner).toBe('tanner');
});

test('werewolf: the white wolf wins alone; bot-only games always end', () => {
  const ctx = fakeCtx();
  const s: any = werewolf.start(ctx, ['n', 'a', 'b', 'c', 'd', 'e'], { ...ALL_ROLES, wolves: 2, bigwolf: false, tanner: false });
  const ww = Object.keys(s.roles).find((id) => s.roles[id] === 'whitewolf')!;
  for (const id of s.participants) if (id !== ww) s.alive[id] = false;
  const last = s.participants.find((id: string) => id !== ww && s.roles[id] !== 'wolf')!;
  s.alive[last] = true;
  werewolf.act(ctx, s, 'n', { type: 'toggleAlive', target: last });
  expect(s.winner).toBe('whitewolf');

  for (let g = 0; g < 60; g++) {
    const n = 5 + (g % 8);
    const players = ['n', ...Array.from({ length: n }, (_, i) => `b${i}`)];
    const settings = { ...ALL_ROLES, wolves: 0, witch: g % 2 === 0, guard: g % 3 === 0, tanner: g % 4 === 0, whitewolf: g % 5 < 2, bigwolf: g % 3 === 1, mayor: g % 2 === 1 };
    const t: any = werewolf.start(ctx, players, settings);
    for (let k = 0; k < 500 && t.phase !== 'over'; k++) {
      werewolf.botPlan!(ctx, t, players.slice(1));
      const alive = t.participants.filter((id: string) => t.alive[id]);
      if (t.step === 'vote') werewolf.act(ctx, t, 'n', { type: 'eliminate', target: Math.random() < 0.8 ? alive[Math.floor(Math.random() * alive.length)] : null });
      else {
        if (t.step === 'mayor' && !t.mayorPick && alive.length) werewolf.act(ctx, t, 'n', { type: 'pick', target: alive[0] });
        werewolf.act(ctx, t, 'n', { type: 'next' });
      }
    }
    expect(t.phase).toBe('over');
    expect(t.winner).not.toBeNull();
  }
});
