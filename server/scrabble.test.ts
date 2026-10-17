/** «شبكة الكلمات»: tiles, board, move checks, scoring, dictionary, turns, end of game, bots, leaving. */
import { expect, test } from 'bun:test';

import type { ScrabbleTile, ScrabbleView } from '../src/shared/games/scrabble';
import { CELLS, CENTER, PREMIUM, SIZE, analyse, at, makeTiles, rackValue } from '../src/shared/scrabble-rules';
import { scrabble } from './games/scrabble';
import { findMoves } from './scrabble-bot';
import { botWord, isPrefix, isWord } from './scrabble-dict';

function fakeCtx() {
  const fx: { kind: string; target?: string }[] = [];
  const sched: { by: string; key: string; delay: number; a: any }[] = [];
  const ctx: any = {
    now: 1000,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, key, delay, a }),
  };
  return { ctx, fx, sched };
}

let nextId = 1000;
const tiles = (letters: string): ScrabbleTile[] =>
  [...letters].map((l) => ({ id: nextId++, l: l === '?' ? '' : l, v: l === '?' ? 0 : (makeTiles().find((t) => t.l === l)?.v ?? 0) }));

/** a game where `p` is on turn with exactly these tiles */
function setup(players = ['a', 'b'], seconds: 0 | 60 = 0) {
  const f = fakeCtx();
  const s: any = scrabble.start(f.ctx, players, { seconds, level: 2 });
  return { ...f, s, p: s.turn as string, q: s.order[1] as string };
}

const place = (s: any, id: string, word: string, r: number, c: number, down = false) => {
  s.racks[id] = tiles(word);
  return s.racks[id].map((t: ScrabbleTile, i: number) => ({ id: t.id, cell: down ? at(r + i, c) : at(r, c + i), l: t.l }));
};

/* ------------------------------------------------------------------ */

test('tile set: 100 tiles, 2 blanks, 29 letters; premium squares mirrored', () => {
  const all = makeTiles();
  expect(all.length).toBe(100);
  expect(all.filter((t) => !t.l).length).toBe(2);
  expect(new Set(all.map((t) => t.l).filter(Boolean)).size).toBe(29);
  expect(new Set(all.map((t) => t.id)).size).toBe(100);
  const count = (p: string) => PREMIUM.filter((x) => x === p).length;
  expect([count('tw'), count('dw'), count('tl'), count('dl'), count('star')]).toEqual([8, 16, 12, 24, 1]);
  expect(PREMIUM[CENTER]).toBe('star');
  for (let i = 0; i < CELLS; i++) {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    expect(PREMIUM[at(c, r)]).toBe(PREMIUM[i]);
    expect(PREMIUM[at(r, SIZE - 1 - c)]).toBe(PREMIUM[i]);
  }
});

test('dictionary: exact words, «ال», normalised spelling, grammar words, prefixes', () => {
  expect(isWord('كتاب')).toBe(true);
  expect(isWord('الكتاب')).toBe(true);
  expect(isWord('مدرسة')).toBe(true); // ة → ه
  expect(isWord('مدرسه')).toBe(true);
  expect(isWord('من')).toBe(true);
  expect(isWord('على')).toBe(true);
  expect(isWord('ززززز')).toBe(false);
  expect(isWord('ك')).toBe(false);
  expect(isWord('الزززز')).toBe(false);
  expect(isPrefix('كتا')).toBe(true);
  expect(isPrefix('الكتا')).toBe(true);
  expect(isPrefix('ظظظ')).toBe(false);
  // bots avoid bare two-letter stems players may still use
  expect(isWord('ثث')).toBe(true);
  expect(botWord('ثث')).toBe(false);
  expect(botWord('يد')).toBe(true);
});

test('analyse: first move on the star, one line, no gaps, connected; words read with column 0 on the right', () => {
  const empty = new Array(CELLS).fill(null);
  const row = (word: string, r: number, c: number) => [...word].map((l, i) => ({ cell: at(r, c + i), l }));
  expect(analyse(empty, []).ok).toBe(false);
  const off = analyse(empty, row('باب', 0, 0));
  expect(off.ok).toBe(false);
  if (!off.ok) expect(off.error).toContain('النجمة');
  const one = analyse(empty, [{ cell: CENTER, l: 'ب' }]);
  expect(one.ok).toBe(false);
  expect(analyse(empty, [{ cell: CENTER, l: 'ب' }, { cell: CENTER + SIZE + 1, l: 'ا' }]).ok).toBe(false); // not one line
  const gap = analyse(empty, [{ cell: CENTER, l: 'ب' }, { cell: CENTER + 2, l: 'ا' }]);
  expect(gap.ok).toBe(false);
  if (!gap.ok) expect(gap.error).toContain('فراغ');

  // كتاب across from the star: columns 7..10, read in increasing column order (right to left on screen)
  const first = analyse(empty, row('كتاب', 7, 7));
  expect(first.ok).toBe(true);
  if (!first.ok) return;
  expect(first.words.map((w) => w.w)).toEqual(['كتاب']);
  expect(first.score).toBe((3 + 1 + 1 + 2) * 2); // star = word ×2

  const board = empty.slice();
  for (const p of row('كتاب', 7, 7)) board[p.cell] = { l: p.l, v: 1 };
  board[at(7, 7)] = { l: 'ك', v: 3 };
  board[at(7, 10)] = { l: 'ب', v: 2 };
  // not touching anything
  expect(analyse(board, row('باب', 0, 0)).ok).toBe(false);
  // «باب» down through the ب at (7,10): new ب at (6,10)? no — ا at (8,10), ب at (9,10)
  const down = analyse(board, [{ cell: at(8, 10), l: 'ا' }, { cell: at(9, 10), l: 'ب' }]);
  expect(down.ok).toBe(true);
  if (down.ok) {
    expect(down.words.map((w) => w.w)).toEqual(['باب']);
    expect(down.score).toBe(2 + 1 + 2);
  }
  // occupied square
  expect(analyse(board, [{ cell: at(7, 8), l: 'ا' }]).ok).toBe(false);
  // a single tile forms a word in the direction it touches; premiums count only for new tiles
  const hook = analyse(board, [{ cell: at(7, 11), l: 'ا' }]); // (7,11) is letter ×2
  expect(hook.ok).toBe(true);
  if (hook.ok) {
    expect(hook.words[0].w).toBe('كتابا');
    expect(hook.score).toBe(3 + 1 + 1 + 2 + 1 * 2);
  }
});

test('analyse: blanks score 0 and seven tiles earn the +50 bonus', () => {
  const empty = new Array(CELLS).fill(null);
  const word = 'مدرسات';
  const ps = [...word].map((l, i) => ({ cell: at(7, 4 + i), l }));
  ps.push({ cell: at(7, 4 + word.length), l: 'ي' });
  const withBlank = ps.map((p, i) => (i === 0 ? { ...p, blank: true } : p));
  const a = analyse(empty, ps), b = analyse(empty, withBlank);
  expect(a.ok && b.ok).toBe(true);
  if (a.ok && b.ok) {
    expect(a.bingo).toBe(true);
    expect(a.score - b.score).toBeGreaterThan(0);
    expect(a.score).toBeGreaterThanOrEqual(50);
  }
});

test('play: valid word scores and refills the rack; a word not in the dictionary is refused by name', () => {
  const { ctx, s, p, q } = setup();
  const bag = s.bag.length;
  expect(() => scrabble.act(ctx, s, q, { type: 'pass' })).toThrow('ليس دورك');
  const bad = place(s, p, 'ززز', 7, 6);
  expect(() => scrabble.act(ctx, s, p, { type: 'play', tiles: bad })).toThrow('«ززز» ليست في القاموس');
  expect(s.board.every((c: unknown) => c === null)).toBe(true);
  const good = place(s, p, 'كتاب', 7, 7);
  scrabble.act(ctx, s, p, { type: 'play', tiles: good });
  expect(s.scores[p]).toBe(14);
  expect(s.racks[p].length).toBe(7);
  expect(s.bag.length).toBe(bag - 7);
  expect(s.turn).toBe(q);
  expect(s.board[at(7, 7)]).toEqual({ l: 'ك', v: 3 });
  const v = scrabble.view(ctx, s, q) as ScrabbleView;
  expect(v.last?.words).toEqual([{ w: 'كتاب', score: 14 }]);
  expect(v.rack).toBe(s.racks[q]);
  expect(v.rackCounts[p]).toBe(7);
  // tiles that aren't yours
  expect(() => scrabble.act(ctx, s, q, { type: 'play', tiles: good })).toThrow();
});

test('play: a blank needs a letter and the word with «ال» counts', () => {
  const { ctx, s, p } = setup();
  s.racks[p] = tiles('ال?اب');
  const ids = s.racks[p].map((t: ScrabbleTile) => t.id);
  const mk = (blankL?: string) => ids.map((id: number, i: number) => ({ id, cell: at(7, 5 + i), l: i === 2 ? blankL : undefined }));
  expect(() => scrabble.act(ctx, s, p, { type: 'play', tiles: mk() })).toThrow('اختر الحرف');
  scrabble.act(ctx, s, p, { type: 'play', tiles: mk('ب') }); // الباب
  expect(s.board[at(7, 7)]).toEqual({ l: 'ب', v: 0 });
  expect(s.last.words[0].w).toBe('الباب');
});

test('swap: only with 7+ tiles in the bag; same rack size, turn passes', () => {
  const { ctx, s, p, q } = setup();
  const before = s.racks[p].map((t: ScrabbleTile) => t.id);
  scrabble.act(ctx, s, p, { type: 'swap', ids: before.slice(0, 3) });
  expect(s.racks[p].length).toBe(7);
  expect(s.bag.length).toBe(100 - 14);
  expect(s.turn).toBe(q);
  expect(s.scoreless).toBe(1);
  s.bag = s.bag.slice(0, 6);
  expect(() => scrabble.act(ctx, s, q, { type: 'swap', ids: [s.racks[q][0].id] })).toThrow('أقل من 7');
});

test('passes: everyone passing twice ends the game, leftover tiles are subtracted', () => {
  const { ctx, s, p, q, fx } = setup();
  s.scores = { [p]: 30, [q]: 10 };
  s.racks[p] = tiles('كتب');
  s.racks[q] = tiles('ظ');
  for (let i = 0; i < 4; i++) scrabble.act(ctx, s, s.turn, { type: 'pass' });
  expect(s.phase).toBe('final');
  expect(s.final.adjust).toEqual({ [p]: -6, [q]: -10 });
  expect(s.scores).toEqual({ [p]: 24, [q]: 0 });
  expect(s.final.winner).toBe(p);
  expect(fx.at(-1)).toEqual({ kind: 'win', target: p });
  expect(scrabble.turnOf!(s)).toEqual([]);
});

test('going out with the bag empty: the finisher gains the others\' leftovers', () => {
  const { ctx, s, p, q } = setup(['a', 'b', 'c']);
  const r = s.order[2];
  s.board[at(7, 7)] = { l: 'ب', v: 2 };
  s.board[at(7, 8)] = { l: 'ا', v: 1 };
  s.bag = [];
  s.racks[q] = tiles('سس'); // 4
  s.racks[r] = tiles('ظ'); // 10
  s.racks[p] = tiles('ب');
  scrabble.act(ctx, s, p, { type: 'play', tiles: [{ id: s.racks[p][0].id, cell: at(7, 9) }] }); // باب
  expect(s.phase).toBe('final');
  expect(s.final.out).toBe(p);
  expect(s.final.adjust).toEqual({ [p]: 14, [q]: -4, [r]: -10 });
  expect(s.scores[p]).toBe(5 + 14);
});

test('time limit: the turn passes when the time runs out', () => {
  const { ctx, s, p, q } = setup(['a', 'b'], 60);
  expect(s.endsAt).toBe(ctx.now + 60000);
  expect(scrabble.tick!(ctx, s)).toBe(false);
  ctx.now += 60001;
  expect(scrabble.tick!(ctx, s)).toBe(true);
  expect(s.turn).toBe(q);
  expect(s.last.kind).toBe('timeout');
  expect(s.last.by).toBe(p);
  expect(s.endsAt).toBe(ctx.now + 60000);
});

test('bot actions: a stale one is dropped, a refused one becomes a pass', () => {
  const { ctx, s, p, q } = setup();
  scrabble.act(ctx, s, p, { type: 'pass', turn: s.turnNo - 1, auto: true });
  expect(s.turn).toBe(p);
  scrabble.act(ctx, s, p, { type: 'play', tiles: [{ id: s.racks[p][0].id, cell: 0 }], turn: s.turnNo, auto: true });
  expect(s.turn).toBe(q);
  expect(s.last.kind).toBe('pass');
});

test('bot search: finds legal dictionary words fast on an empty and a busy board', () => {
  const empty = new Array(CELLS).fill(null);
  const rack = tiles('كتابمرس');
  const t0 = performance.now();
  const moves = findMoves(empty, rack, 300);
  expect(performance.now() - t0).toBeLessThan(800);
  expect(moves.length).toBeGreaterThan(0);
  for (const m of moves.slice(0, 200)) {
    const a = analyse(empty, m.placements);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.score).toBe(m.score);
      for (const w of a.words) expect(isWord(w.w)).toBe(true);
    }
  }
  // a board with a word: moves must connect and every cross word must be a word
  const board = empty.slice();
  [...'كتاب'].forEach((l, i) => (board[at(7, 6 + i)] = { l, v: 1 }));
  const more = findMoves(board, tiles('ولدنمرا'), 300);
  expect(more.length).toBeGreaterThan(0);
  more.sort((x, y) => y.score - x.score);
  for (const m of more.slice(0, 300)) {
    const a = analyse(board, m.placements);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.score).toBe(m.score);
      for (const w of a.words) expect(isWord(w.w)).toBe(true);
    }
  }
});

function playOut(players: string[], level: 1 | 2) {
  const { ctx, sched } = fakeCtx();
  const st: any = scrabble.start(ctx, players, { seconds: 60, level });
  let guard = 0;
  while (st.phase === 'play' && guard++ < 600) {
    scrabble.botPlan!(ctx, st, players);
    const job = sched.shift();
    if (!job) {
      ctx.now += 1000;
      scrabble.tick!(ctx, st);
      continue;
    }
    ctx.now += job.delay;
    try {
      scrabble.act(ctx, st, job.by, job.a);
    } catch {
      // refused: plan again
    }
    scrabble.tick!(ctx, st);
    // the tiles on the board + in racks + in the bag are always the full set
    const onBoard = st.board.filter(Boolean).length;
    const inRacks = Object.values(st.racks as Record<string, ScrabbleTile[]>).reduce((t, r) => t + r.length, 0);
    expect(onBoard + inRacks + st.bag.length).toBe(100);
  }
  return st;
}

test('bots: full games reach the final screen (2 strong bots, 4 easy bots)', () => {
  for (const [players, level] of [[['a', 'b'], 2], [['a', 'b', 'c', 'd'], 1]] as const) {
    const st = playOut([...players], level);
    expect(st.phase).toBe('final');
    expect(st.log.some((m: any) => m.kind === 'play')).toBe(true);
    const total = Object.values(st.scores as Record<string, number>).reduce((t, v) => t + v, 0);
    expect(total).toBeGreaterThan(0);
  }
}, 120000);

test('leaving: tiles go back to the bag, the turn moves on, the last player left wins', () => {
  const { ctx, s, fx } = setup(['a', 'b', 'c']);
  const [x, y, z] = s.order;
  const bag = s.bag.length;
  scrabble.onLeave!(ctx, s, x);
  expect(s.bag.length).toBe(bag + 7);
  expect(s.order).toEqual([y, z]);
  expect(s.turn).toBe(y);
  scrabble.onLeave!(ctx, s, z);
  expect(s.phase).toBe('final');
  expect(s.final.winner).toBe(y);
  expect(fx.at(-1)).toEqual({ kind: 'win', target: y });
  const v = scrabble.view(ctx, s, y) as ScrabbleView;
  expect(v.final?.winner).toBe(y);
  expect(rackValue(v.rack)).toBeGreaterThanOrEqual(0);
});

test('settings: only known values are accepted', () => {
  const st: any = { seconds: 0, level: 1 };
  scrabble.patchSettings!(st, { seconds: 90, level: 2 });
  expect(st).toEqual({ seconds: 90, level: 2 });
  scrabble.patchSettings!(st, { seconds: 45, level: 3, other: 1 });
  expect(st).toEqual({ seconds: 90, level: 2 });
  scrabble.patchSettings!(st, { seconds: 0 });
  expect(st.seconds).toBe(0);
});
