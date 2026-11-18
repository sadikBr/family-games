/**
 * «الروابط» — the content (16 unique words in 4×4, four colours, tile-sized words, no puzzle twice), grouping
 * and the wrong fours (one away, the same four again, the mistakes limit), points, race isolation (no other
 * player's selection, board or the solution before the end), the co-op shared board, the time limit, bots
 * (they finish puzzles, the expert beats the easy one, they don't play in co-op), leaving, settings.
 */
import { expect, test } from 'bun:test';

import { norm } from '../src/shared/arabic';
import {
  RAWABIT_CLEAN_BONUS,
  RAWABIT_COLORS,
  RAWABIT_DEFAULTS,
  RAWABIT_MISTAKES,
  RAWABIT_ORDER_BONUS,
  RAWABIT_POINTS,
  type RawabitSettings,
  type RawabitView,
} from '../src/shared/games/rawabit';
import type { BotLevel } from '../src/shared/protocol';
import { RAWABIT_REVEAL_MS, rawabit, sanitizeRawabit, startRawabit, type RawabitState } from './games/rawabit';
import { RAWABIT_BOT, botGuess, guessKey, seeChance, wrongFour, type BotGroup } from './rawabit-bots';
import { RAWABIT_PUZZLE_LIST } from './rawabit-puzzles';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; said: string[]; offline: Set<string> };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: () => {},
    say: (text) => ctx.said.push(text),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    said: [],
    offline,
  };
  return ctx;
}

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const settings = (o: Partial<RawabitSettings> = {}): RawabitSettings => ({ ...RAWABIT_DEFAULTS, puzzles: 1, ...o });
const act = (ctx: Ctx, s: RawabitState, by: string, a: Record<string, unknown>) => rawabit.act(ctx, s, by, { round: s.round + 1, ...a } as never);
const view = (ctx: Ctx, s: RawabitState, me: string) => rawabit.view(ctx, s, me) as RawabitView;
/** Tile ids of group g (0 = yellow … 3 = purple). */
const idsOf = (s: RawabitState, g: number) => s.deal.tiles.map((t, id) => (t.group === g ? id : -1)).filter((x) => x >= 0);
const guess = (ctx: Ctx, s: RawabitState, by: string, ids: number[]) => act(ctx, s, by, { type: 'guess', ids });
/** Three of group a and one of group b. */
const away = (s: RawabitState, a: number, b: number, k = 0) => [...idsOf(s, a).slice(0, 3), idsOf(s, b)[k]];
const start = (players: string[], o: Partial<RawabitSettings> = {}, ctx = fakeCtx(), seed = 1) => ({ s: startRawabit(ctx, players, settings(o), seeded(seed)), ctx });

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

/** How words are compared: the hamza shapes, ة/ه, ى/ي, no spaces. */
const wordKey = (w: string) => norm(w).replace(/ /g, '');
/** Longest tile word allowed (letters in one word / in the whole tile). */
const MAX_WORD = 10;
const MAX_TILE = 13;

test('content: 40+ puzzles, each 4 groups of 4 in the four colours, 16 unique words', () => {
  expect(RAWABIT_PUZZLE_LIST.length).toBeGreaterThanOrEqual(40);
  const ids = new Set<string>();
  for (const p of RAWABIT_PUZZLE_LIST) {
    expect(ids.has(p.id)).toBe(false);
    ids.add(p.id);
    expect(p.groups.map((g) => g.color)).toEqual(RAWABIT_COLORS);
    for (const g of p.groups) {
      expect(g.words).toHaveLength(4);
      expect(g.theme.length).toBeGreaterThan(2);
      expect(g.theme.length).toBeLessThanOrEqual(48);
    }
    const words = p.groups.flatMap((g) => g.words);
    const keys = new Set(words.map(wordKey));
    if (keys.size !== 16) throw new Error(`${p.id}: a word twice (${words.join('، ')})`);
    // a word and the same word with «ال» would be confusing too
    const bare = new Set(words.map((w) => wordKey(w).replace(/^ال(?=..)/, '')));
    if (bare.size !== 16) throw new Error(`${p.id}: two words differ only by «ال»`);
  }
});

test('content: every word fits a tile (one or two words, short), Arabic only', () => {
  let longest = '';
  for (const p of RAWABIT_PUZZLE_LIST)
    for (const w of p.groups.flatMap((g) => g.words)) {
      const parts = w.split(' ');
      if (parts.length > 2) throw new Error(`${p.id}: «${w}» has more than two words`);
      for (const part of parts) if ([...part].length > MAX_WORD) throw new Error(`${p.id}: «${part}» is too long for a tile`);
      if ([...w].length > MAX_TILE) throw new Error(`${p.id}: «${w}» is too long for a tile`);
      if (!/^[ء-يٰ ]+$/.test(w)) throw new Error(`${p.id}: «${w}» has a stray character`);
      if ([...w.replace(/ /g, '')].length > [...longest.replace(/ /g, '')].length) longest = w;
    }
  expect([...longest.replace(/ /g, '')].length).toBeLessThanOrEqual(MAX_TILE);
});

test('content: no puzzle repeated (no two puzzles share a group, nor most of their words)', () => {
  const groupKeys = new Map<string, string>();
  const sets = RAWABIT_PUZZLE_LIST.map((p) => new Set(p.groups.flatMap((g) => g.words.map(wordKey))));
  RAWABIT_PUZZLE_LIST.forEach((p, i) => {
    for (const g of p.groups) {
      const k = g.words.map(wordKey).sort().join('|');
      if (groupKeys.has(k)) throw new Error(`${p.id}: the same group as ${groupKeys.get(k)}`);
      groupKeys.set(k, p.id);
    }
    for (let j = 0; j < i; j++) {
      const shared = [...sets[i]].filter((w) => sets[j].has(w)).length;
      if (shared > 4) throw new Error(`${p.id} and ${RAWABIT_PUZZLE_LIST[j].id} share ${shared} words`);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

test('a deal: 16 tiles in a shuffled order, the ids tell nothing of the groups', () => {
  const { s, ctx } = start(['a', 'b']);
  expect(s.deal.tiles).toHaveLength(16);
  const v = view(ctx, s, 'a');
  expect(v.board!.tiles.map((t) => t.id)).toEqual([...Array(16).keys()]);
  // not simply grouped in order
  const firstFour = new Set(s.deal.tiles.slice(0, 4).map((t) => t.group));
  const groupsInOrder = s.deal.tiles.every((t, i) => t.group === Math.floor(i / 4));
  expect(groupsInOrder && firstFour.size === 1).toBe(false);
  expect(v.phase).toBe('play');
  expect(v.reveal).toBeNull();
});

test('a right four locks in as a group with its theme and colour', () => {
  const { s, ctx } = start(['a', 'b']);
  guess(ctx, s, 'a', idsOf(s, 2));
  const b = view(ctx, s, 'a').board!;
  expect(b.found).toHaveLength(1);
  expect(b.found[0]).toMatchObject({ color: 'blue', theme: s.deal.puzzle.groups[2].theme });
  expect(new Set(b.found[0].words)).toEqual(new Set(s.deal.puzzle.groups[2].words));
  expect(b.tiles).toHaveLength(12);
  expect(b.flash).toMatchObject({ kind: 'right', color: 'blue' });
  expect(b.mistakes).toBe(0);
});

test('one away («ينقص واحد!»), a plain wrong four, the same four again costs nothing', () => {
  const { s, ctx } = start(['a', 'b']);
  guess(ctx, s, 'a', away(s, 0, 1));
  expect(view(ctx, s, 'a').board!.flash!.kind).toBe('away');
  expect(s.boards.a.mistakes).toBe(1);
  const twoTwo = [...idsOf(s, 0).slice(0, 2), ...idsOf(s, 1).slice(0, 2)];
  guess(ctx, s, 'a', twoTwo);
  expect(view(ctx, s, 'a').board!.flash!.kind).toBe('wrong');
  expect(s.boards.a.mistakes).toBe(2);
  expect(() => guess(ctx, s, 'a', [...twoTwo].reverse())).toThrow('مجرَّبة');
  expect(s.boards.a.mistakes).toBe(2);
  // not four different tiles of the board
  expect(() => guess(ctx, s, 'a', [0, 0, 1, 2])).toThrow(GameError);
  expect(() => guess(ctx, s, 'a', [0, 1, 2])).toThrow(GameError);
  guess(ctx, s, 'a', idsOf(s, 0));
  expect(() => guess(ctx, s, 'a', [idsOf(s, 0)[0], ...idsOf(s, 1).slice(0, 3)])).toThrow(GameError);
});

test('four mistakes: the board is out, the others go on, nothing of the solution shows yet', () => {
  const { s, ctx } = start(['a', 'b']);
  guess(ctx, s, 'a', idsOf(s, 3));
  for (let k = 0; k < RAWABIT_MISTAKES; k++) guess(ctx, s, 'a', away(s, 0, 1, k));
  expect(s.boards.a.done).toBe('out');
  expect(() => guess(ctx, s, 'a', idsOf(s, 0))).not.toThrow();
  expect(s.boards.a.found).toHaveLength(1);
  expect(s.phase).toBe('play');
  const v = view(ctx, s, 'a');
  expect(v.board!.done).toBe('out');
  expect(v.board!.found).toHaveLength(1);
  expect(v.board!.tiles).toHaveLength(12);
  expect(v.reveal).toBeNull();
  expect(v.progress.b).toEqual({ found: 0, mistakes: 0, done: null, rank: null });
});

test('the selection: toggle up to four, clear', () => {
  const { s, ctx } = start(['a', 'b']);
  for (const id of [0, 1, 2, 3]) act(ctx, s, 'a', { type: 'toggle', id });
  expect(() => act(ctx, s, 'a', { type: 'toggle', id: 4 })).toThrow('أربع');
  act(ctx, s, 'a', { type: 'toggle', id: 2 });
  expect(view(ctx, s, 'a').board!.sel).toEqual([0, 1, 3]);
  act(ctx, s, 'a', { type: 'toggle', id: 99 });
  expect(view(ctx, s, 'a').board!.sel).toEqual([0, 1, 3]);
  act(ctx, s, 'a', { type: 'clear' });
  expect(view(ctx, s, 'a').board!.sel).toEqual([]);
});

test('points: colours, mistakes left and the finishing order (race)', () => {
  const { s, ctx } = start(['a', 'b', 'c']);
  // a: all four, no mistake, first
  for (const g of [0, 1, 2, 3]) guess(ctx, s, 'a', idsOf(s, g));
  // b: one mistake, all four, second
  guess(ctx, s, 'b', away(s, 1, 2));
  for (const g of [3, 2, 1, 0]) guess(ctx, s, 'b', idsOf(s, g));
  expect(s.boards.b.rank).toBe(2);
  // c: yellow and purple, then out
  guess(ctx, s, 'c', idsOf(s, 0));
  guess(ctx, s, 'c', idsOf(s, 3));
  for (let k = 0; k < 4; k++) guess(ctx, s, 'c', away(s, 1, 2, k));
  expect(s.phase).toBe('reveal');
  const all = RAWABIT_POINTS.yellow + RAWABIT_POINTS.green + RAWABIT_POINTS.blue + RAWABIT_POINTS.purple;
  expect(all).toBe(70);
  expect(s.scores.a).toBe(all + 4 * RAWABIT_CLEAN_BONUS + RAWABIT_ORDER_BONUS[0]);
  expect(s.scores.b).toBe(all + 3 * RAWABIT_CLEAN_BONUS + RAWABIT_ORDER_BONUS[1]);
  expect(s.scores.c).toBe(RAWABIT_POINTS.yellow + RAWABIT_POINTS.purple);
  const r = view(ctx, s, 'c').reveal!;
  expect(r.results.find((x) => x.id === 'a')).toMatchObject({ groups: 70, clean: 20, order: 10, gain: 100, rank: 1, done: 'solved' });
  expect(r.results.find((x) => x.id === 'c')).toMatchObject({ found: ['yellow', 'purple'], done: 'out', clean: 0, order: 0 });
  expect(ctx.said.some((t) => t.includes('اللوحة كاملة') && t.includes('اسم-a'))).toBe(true);
});

test('race isolation: no one sees another board, selection or the solution before the end', () => {
  const { s, ctx } = start(['a', 'b']);
  act(ctx, s, 'a', { type: 'toggle', id: idsOf(s, 0)[0] });
  guess(ctx, s, 'a', idsOf(s, 1));
  guess(ctx, s, 'a', away(s, 2, 3));
  const vb = view(ctx, s, 'b');
  expect(vb.board!.sel).toEqual([]);
  expect(vb.board!.found).toEqual([]);
  expect(vb.board!.tiles).toHaveLength(16);
  expect(vb.board!.flash).toBeNull();
  expect(vb.progress.a).toEqual({ found: 1, mistakes: 1, done: null, rank: null });
  expect(vb.reveal).toBeNull();
  // nothing in b's view names a's group, theme or words of a group
  const json = JSON.stringify(vb);
  for (const g of s.deal.puzzle.groups) expect(json).not.toContain(g.theme);
  expect(json).not.toContain('"group"');
  // a spectator sees no board at all
  const vx = view(ctx, s, 'x');
  expect(vx.board).toBeNull();
  for (const g of s.deal.puzzle.groups) expect(JSON.stringify(vx)).not.toContain(g.theme);
  // the say lines tell no group either
  for (const line of ctx.said) for (const g of s.deal.puzzle.groups) expect(line).not.toContain(g.theme);
  // a's own view shows a's group
  expect(view(ctx, s, 'a').board!.found[0].theme).toBe(s.deal.puzzle.groups[1].theme);
});

test('the end of a race puzzle: everyone done → every group for everyone; people away don\'t hold it up', () => {
  const { s, ctx } = start(['a', 'b', 'c']);
  for (const g of [0, 1, 2, 3]) guess(ctx, s, 'a', idsOf(s, g));
  for (let k = 0; k < 4; k++) guess(ctx, s, 'b', away(s, 0, 1, k));
  expect(s.phase).toBe('play');
  ctx.offline.add('c');
  rawabit.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'b');
  expect(v.reveal!.groups.map((g) => g.color)).toEqual(RAWABIT_COLORS);
  expect(v.reveal!.groups[0].theme).toBe(s.deal.puzzle.groups[0].theme);
  expect(v.reveal!.results.find((r) => r.id === 'c')!.done).toBeNull();
  // the reveal moves on by itself, or with the host
  ctx.now += RAWABIT_REVEAL_MS;
  rawabit.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(rawabit.result!(s)!.places[0]).toEqual(['a']);
});

test('several puzzles: different ones, a reveal between them, the host goes on', () => {
  const ctx = fakeCtx();
  const s = startRawabit(ctx, ['a'], settings({ puzzles: 3 }), seeded(4));
  expect(new Set(s.queue).size).toBe(3);
  const seen: string[] = [];
  for (let p = 1; p <= 3; p++) {
    expect(view(ctx, s, 'a').puzzle).toBe(p);
    seen.push(s.deal.puzzle.id);
    for (const g of [0, 1, 2, 3]) guess(ctx, s, 'a', idsOf(s, g));
    expect(s.phase).toBe('reveal');
    act(ctx, s, 'a', { type: 'next' });
  }
  expect(new Set(seen).size).toBe(3);
  expect(s.phase).toBe('final');
  expect(s.scores.a).toBe(3 * 100);
  // the next game in this room starts with puzzles not played yet
  const s2 = startRawabit(ctx, ['a'], settings({ puzzles: 5 }), seeded(5));
  for (const id of s2.queue) expect(seen).not.toContain(id);
});

test('the time limit ends the puzzle; unfinished boards keep their groups', () => {
  const { s, ctx } = start(['a', 'b'], { minutes: 3 });
  expect(s.endsAt).toBe(ctx.now + 3 * 60_000);
  expect(view(ctx, s, 'a').timerTotal).toBe(3 * 60_000);
  guess(ctx, s, 'a', idsOf(s, 0));
  ctx.now += 3 * 60_000 - 1;
  rawabit.tick!(ctx, s);
  expect(s.phase).toBe('play');
  ctx.now += 1;
  rawabit.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.boards.a.done).toBe('time');
  expect(s.scores.a).toBe(RAWABIT_POINTS.yellow);
  expect(s.scores.b).toBe(0);
  // no limit: the clock never ends it
  const t = start(['a'], { minutes: 0 });
  expect(t.s.endsAt).toBeNull();
  t.ctx.now += 3_600_000;
  rawabit.tick!(t.ctx, t.s);
  expect(t.s.phase).toBe('play');
});

/* ------------------------------------------------------------------ */
/* Co-op                                                               */
/* ------------------------------------------------------------------ */

test('co-op: one shared board and selection; anyone checks; shared mistakes; a family result', () => {
  const { s, ctx } = start(['a', 'b', 'c'], { mode: 'coop', puzzles: 1 });
  const [g0, g1] = [idsOf(s, 0), idsOf(s, 1)];
  act(ctx, s, 'a', { type: 'toggle', id: g0[0] });
  act(ctx, s, 'b', { type: 'toggle', id: g0[1] });
  act(ctx, s, 'c', { type: 'toggle', id: g0[2] });
  expect(view(ctx, s, 'a').board!.sel).toEqual(g0.slice(0, 3));
  expect(view(ctx, s, 'c').board!.sel).toEqual(g0.slice(0, 3));
  // a check must be of the selection everyone sees
  expect(() => guess(ctx, s, 'b', g0)).toThrow('التحديد');
  act(ctx, s, 'b', { type: 'toggle', id: g0[3] });
  guess(ctx, s, 'b', g0);
  const v = view(ctx, s, 'c');
  expect(v.board!.found[0]).toMatchObject({ color: 'yellow', by: 'b' });
  expect(v.board!.sel).toEqual([]);
  expect(v.progress).toEqual({});
  expect(ctx.said.some((t) => t.includes('اسم-b') && t.includes(s.deal.puzzle.groups[0].theme))).toBe(true);
  // a wrong four from anyone is the family's mistake
  const w = away(s, 1, 2);
  for (const id of w) act(ctx, s, 'a', { type: 'toggle', id });
  guess(ctx, s, 'c', w);
  expect(view(ctx, s, 'b').board!.mistakes).toBe(1);
  expect(view(ctx, s, 'b').board!.flash).toMatchObject({ kind: 'away', by: 'c' });
  // (a wrong selection stays for the family to change)
  expect(view(ctx, s, 'a').board!.sel).toEqual(w);
  act(ctx, s, 'a', { type: 'clear' });
  for (const g of [1, 2, 3]) {
    for (const id of idsOf(s, g)) act(ctx, s, 'a', { type: 'toggle', id });
    guess(ctx, s, 'a', idsOf(s, g));
  }
  expect(g1).toHaveLength(4);
  expect(s.phase).toBe('reveal');
  expect(view(ctx, s, 'a').reveal!.team).toMatchObject({ done: 'solved', mistakes: 1 });
  expect(s.scores).toEqual({ a: 3, b: 1, c: 0 });
  act(ctx, s, 'a', { type: 'next' });
  expect(rawabit.result!(s)).toEqual({ places: [['a', 'b', 'c']], coop: { won: true } });
});

test('co-op: four mistakes end the puzzle for the family; won = more than half the puzzles', () => {
  const { s, ctx } = start(['a', 'b'], { mode: 'coop', puzzles: 3 });
  for (let k = 0; k < 4; k++) {
    const w = away(s, 0, 1, k);
    act(ctx, s, 'a', { type: 'clear' });
    for (const id of w) act(ctx, s, 'a', { type: 'toggle', id });
    guess(ctx, s, k % 2 ? 'a' : 'b', w);
  }
  expect(s.phase).toBe('reveal');
  expect(s.solved).toBe(0);
  act(ctx, s, 'a', { type: 'next' });
  // second puzzle solved, third not
  for (const g of [0, 1, 2, 3]) {
    for (const id of idsOf(s, g)) act(ctx, s, 'a', { type: 'toggle', id });
    guess(ctx, s, 'a', idsOf(s, g));
  }
  expect(s.solved).toBe(1);
  act(ctx, s, 'a', { type: 'next' });
  ctx.offline.add('a');
  ctx.offline.add('b');
  rawabit.tick!(ctx, s);
  expect(s.phase).toBe('play'); // people away don't end a co-op puzzle
  act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('play');
});

test('co-op: bots don\'t play', () => {
  const ctx = fakeCtx(['k']);
  const s = startRawabit(ctx, ['a', 'k'], settings({ mode: 'coop' }), seeded(2));
  rawabit.botPlan!(ctx, s, ['k']);
  expect(ctx.jobs).toHaveLength(0);
  // the last person leaving a co-op game with only bots ends it
  rawabit.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

function runBots(players: string[], levels: Record<string, BotLevel>, seed: number, o: Partial<RawabitSettings> = {}) {
  const ctx = fakeCtx(players);
  const s = startRawabit(ctx, players, settings(o), seeded(seed));
  for (let step = 0; step < 2000 && s.phase !== 'final'; step++) {
    if (s.phase === 'play')
      for (const b of players) {
        ctx.botLevel = () => levels[b];
        rawabit.botPlan!(ctx, s, [b]);
      }
    ctx.jobs.sort((x, y) => x.at - y.at);
    const job = ctx.jobs.shift();
    const wake = s.endsAt ?? Infinity;
    if (!job || job.at > wake) {
      if (job) ctx.jobs.unshift(job);
      ctx.now = Math.max(ctx.now, wake);
      rawabit.tick!(ctx, s);
      continue;
    }
    ctx.now = Math.max(ctx.now, job.at);
    rawabit.act(ctx, s, job.by, job.a as never);
  }
  return s;
}

test('bots finish puzzles, with human-like time, and the expert beats the easy one', () => {
  let expertWins = 0;
  let easyMistakes = 0;
  let expertMistakes = 0;
  for (let seed = 1; seed <= 16; seed++) {
    const s = runBots(['x', 'e'], { x: 'expert', e: 'easy' }, seed, { puzzles: 3 });
    expect(s.phase).toBe('final');
    const top = rawabit.result!(s)!.places[0];
    if (top.includes('x') && !top.includes('e')) expertWins++;
  }
  for (let seed = 1; seed <= 40; seed++) {
    const ctx = fakeCtx(['x', 'e']);
    const s = startRawabit(ctx, ['x', 'e'], settings(), seeded(seed));
    const t0 = ctx.now;
    for (let i = 0; i < 40 && s.phase === 'play'; i++) {
      for (const b of ['x', 'e']) {
        ctx.botLevel = () => (b === 'x' ? 'expert' : 'easy');
        rawabit.botPlan!(ctx, s, [b]);
      }
      ctx.jobs.sort((p, q) => p.at - q.at);
      const job = ctx.jobs.shift()!;
      expect(job.at - t0).toBeGreaterThan(0);
      ctx.now = job.at;
      rawabit.act(ctx, s, job.by, job.a as never);
    }
    easyMistakes += s.boards.e.mistakes;
    expertMistakes += s.boards.x.mistakes;
  }
  expect(expertWins).toBeGreaterThanOrEqual(12);
  expect(easyMistakes).toBeGreaterThan(expertMistakes * 1.5);
});

test('a bot\'s check: sees its own board only, never the same wrong four twice, delays by colour', () => {
  const left: BotGroup[] = [
    { group: 0, color: 'yellow', ids: [0, 1, 2, 3] },
    { group: 3, color: 'purple', ids: [4, 5, 6, 7] },
  ];
  expect(seeChance('easy', 'yellow', 1)).toBe(1);
  expect(seeChance('expert', 'yellow', 4)).toBeGreaterThan(seeChance('expert', 'purple', 4));
  expect(seeChance('expert', 'blue', 4)).toBeGreaterThan(seeChance('easy', 'blue', 4));
  const rnd = seeded(7);
  const tried = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const g = botGuess('easy', left, tried, rnd);
    expect(g.ids).toHaveLength(4);
    expect(new Set(g.ids).size).toBe(4);
    for (const id of g.ids) expect(id).toBeLessThan(8);
    expect(g.delay).toBeGreaterThanOrEqual(RAWABIT_BOT.easy.ms[0] * 0.8);
    if (!g.right) {
      expect(tried.has(guessKey(g.ids))).toBe(false);
      tried.add(guessKey(g.ids));
    }
  }
  // the last group left: always right, a little faster
  const last = botGuess('easy', [left[1]], new Set(), seeded(3));
  expect(last).toMatchObject({ ids: [4, 5, 6, 7], right: true });
  // no wrong four left to try: it checks the group
  expect(wrongFour(left[0], [left[0]], new Set(), seeded(1))).toBeNull();
});

test('bots are planned in a race only for unfinished boards', () => {
  const ctx = fakeCtx(['k', 'm']);
  const { s } = start(['a', 'k', 'm'], {}, ctx);
  for (const g of [0, 1, 2, 3]) guess(ctx, s, 'm', idsOf(s, g));
  rawabit.botPlan!(ctx, s, ['k', 'm']);
  expect(ctx.jobs.map((j) => j.by)).toEqual(['k']);
  expect(ctx.jobs[0].a).toMatchObject({ type: 'guess', round: 1 });
});

/* ------------------------------------------------------------------ */
/* Leaving, settings                                                   */
/* ------------------------------------------------------------------ */

test('leaving: the puzzle goes on (or ends when the rest are done); the result leaves them out', () => {
  const { s, ctx } = start(['a', 'b', 'c']);
  for (const g of [0, 1, 2, 3]) guess(ctx, s, 'a', idsOf(s, g));
  for (const g of [0, 1, 2, 3]) guess(ctx, s, 'b', idsOf(s, g));
  expect(s.phase).toBe('play');
  rawabit.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a', 'b']);
  act(ctx, s, 'a', { type: 'next' });
  expect(rawabit.result!(s)!.places).toEqual([['a'], ['b']]);
  // everyone leaving ends the game without a result
  const t = start(['a', 'b']);
  rawabit.onLeave!(t.ctx, t.s, 'a');
  expect(t.s.phase).toBe('play');
  rawabit.onLeave!(t.ctx, t.s, 'b');
  expect(t.s.phase).toBe('final');
  expect(rawabit.result!(t.s)).toBeNull();
});

test('settings: sanitised at start, validated in the lobby', () => {
  expect(sanitizeRawabit(undefined)).toEqual({ mode: 'race', puzzles: 3, minutes: 0 });
  expect(sanitizeRawabit({ mode: 'x' as never, puzzles: 6, minutes: 9 })).toEqual({ mode: 'race', puzzles: 5, minutes: 5 });
  const st = { ...RAWABIT_DEFAULTS };
  rawabit.patchSettings!(st, { mode: 'coop', puzzles: 1, minutes: 3 });
  expect(st).toEqual({ mode: 'coop', puzzles: 1, minutes: 3 });
  rawabit.patchSettings!(st, { mode: 'solo', puzzles: 'many', minutes: -4 });
  expect(st).toEqual({ mode: 'coop', puzzles: 1, minutes: 0 });
  const { s } = start(['a'], { puzzles: 5 });
  expect(s.queue).toHaveLength(5);
  // a stale round number is ignored
  const { s: s2, ctx } = start(['a']);
  rawabit.act(ctx, s2, 'a', { type: 'guess', round: 9, ids: idsOf(s2, 0) } as never);
  expect(s2.boards.a.found).toHaveLength(0);
  // only players act
  rawabit.act(ctx, s2, 'zz', { type: 'guess', round: 1, ids: idsOf(s2, 0) } as never);
  expect(s2.boards.zz).toBeUndefined();
});
