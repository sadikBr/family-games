/**
 * «الدومينو» — rules (matching, orientation, doubles, the opening tile, drawing from «السوق», passing, the
 * blocked round and its scoring, team scoring, the end of the game), bots (they finish games at every
 * strength, the expert beats the easy bot most of the time), no leak of other hands or the boneyard,
 * the turn timer, leaving mid-game and the settings.
 */
import { expect, test } from 'bun:test';

import {
  DOMINO_DEFAULTS,
  DOMINO_SET,
  endsOf,
  handPips,
  legalEnds,
  openingTile,
  orient,
  type DominoPlaced,
  type DominoSettings,
  type DominoTileId,
  type DominoView,
} from '../src/shared/games/domino';
import { dominoUnit, layoutLine, rectsOverlap, type DominoRect } from '../src/shared/games/domino-layout';
import type { BotLevel } from '../src/shared/protocol';
import { chooseDominoMove, legalMoves } from './domino-bot';
import { botInfo, domino, sanitizeDomino, startDomino, tilesText, type DominoState } from './games/domino';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Said = { text: string; by?: string };
type Ctx = GameCtx & { now: number; jobs: Job[]; said: Said[]; fxs: [string, string | undefined][] };

function fakeCtx(bots: string[] = [], level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push([k, t]),
    say: (text, by) => ctx.said.push({ text, by }),
    isConnected: () => true,
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
    fxs: [],
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

const settings = (o: Partial<DominoSettings> = {}): DominoSettings => ({ ...DOMINO_DEFAULTS, ...o });
const view = (ctx: GameCtx, s: DominoState, me: string) => domino.view(ctx, s, me) as DominoView;
const turn = (s: DominoState) => domino.turnOf!(s)[0];
const playAs = (ctx: GameCtx, s: DominoState, by: string, tile: DominoTileId, end?: 'L' | 'R') => domino.act(ctx, s, by, { type: 'play', tile, ...(end ? { end } : {}) });
const placed = (id: DominoTileId, l: number, r: number): DominoPlaced => ({ id, l, r, by: 'x', seq: 0 });

/** A round set up by hand: hands, boneyard, the line, whose turn. */
function rig(s: DominoState, hands: Record<string, DominoTileId[]>, opts: { boneyard?: DominoTileId[]; line?: DominoPlaced[]; turn?: string; opening?: DominoTileId | null } = {}) {
  s.hands = Object.fromEntries(Object.entries(hands).map(([k, v]) => [k, v.slice()]));
  s.boneyard = (opts.boneyard ?? []).slice();
  s.drawOn = s.settings.draw && s.seats.length <= 3 && s.boneyard.length > 0;
  s.line = (opts.line ?? []).slice();
  s.anchor = 0;
  s.opening = opts.opening ?? null;
  s.passes = 0;
  s.lacks = Object.fromEntries(s.seats.map((id) => [id, new Set<number>()]));
  if (opts.turn) s.turnIdx = s.seats.indexOf(opts.turn);
  s.phase = 'play';
  s.result = null;
}

/** Every tile not used in the given lists. */
const rest = (...used: DominoTileId[][]) => DOMINO_SET.filter((t) => !used.flat().includes(t));

/** Plays the whole game with bots (each at its own strength when given), returns the final state. */
function runBots(players: string[], o: Partial<DominoSettings>, levels: Record<string, BotLevel> | BotLevel, seed: number) {
  const ctx = fakeCtx(players, typeof levels === 'string' ? levels : 'expert');
  const rnd = seeded(seed);
  const s = startDomino(ctx, players, settings(o), rnd);
  for (let step = 0; step < 5000 && s.phase !== 'final'; step++) {
    if (s.phase === 'roundEnd') {
      domino.act(ctx, s, players[0], { type: 'next' });
      continue;
    }
    const id = turn(s);
    const level = typeof levels === 'string' ? levels : levels[id];
    const m = chooseDominoMove(level, botInfo(s, id), rnd);
    expect(m).not.toBeNull();
    playAs(ctx, s, id, m!.tile, m!.end);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

test('rules: the set, matching, orientation and the opening tile', () => {
  expect(DOMINO_SET.length).toBe(28);
  expect(new Set(DOMINO_SET).size).toBe(28);
  expect(handPips(DOMINO_SET)).toBe(168);
  expect(legalEnds('2-5', null)).toEqual(['R']);
  expect(legalEnds('2-5', [5, 3])).toEqual(['L']);
  expect(legalEnds('2-5', [5, 2])).toEqual(['L', 'R']);
  expect(legalEnds('1-4', [5, 2])).toEqual([]);
  // the matching number faces the line
  expect(orient('2-5', 'L', [5, 3])).toEqual([2, 5]);
  expect(orient('2-5', 'R', [3, 5])).toEqual([5, 2]);
  expect(orient('4-4', 'R', [1, 4])).toEqual([4, 4]);
  expect(endsOf([placed('2-5', 2, 5), placed('5-5', 5, 5), placed('5-1', 5, 1)])).toEqual([2, 1]);
  // the highest double; no double: the heaviest tile
  expect(openingTile({ a: ['5-6', '1-1'], b: ['3-3', '0-6'] })).toEqual({ by: 'b', tile: '3-3' });
  expect(openingTile({ a: ['5-6', '1-2'], b: ['4-6', '0-3'] })).toEqual({ by: 'a', tile: '5-6' });
  expect(openingTile({ a: ['4-6'], b: ['5-5'] })).toEqual({ by: 'b', tile: '5-5' });
  expect(tilesText(1)).toBe('قطعة واحدة');
  expect(tilesText(2)).toBe('قطعتان');
  expect(tilesText(5)).toBe('5 قطع');
});

test('rules: a fresh game deals 7 each, the boneyard holds the rest, the highest double opens', () => {
  for (const n of [2, 3, 4]) {
    const players = ['a', 'b', 'c', 'd'].slice(0, n);
    const ctx = fakeCtx();
    const s = startDomino(ctx, players, settings(), seeded(n));
    for (const p of players) expect(s.hands[p].length).toBe(7);
    expect(s.boneyard.length).toBe(28 - 7 * n);
    expect(s.drawOn).toBe(n < 4);
    const open = openingTile(s.hands)!;
    expect(s.opening).toBe(open.tile);
    expect(turn(s)).toBe(open.by);
    const v = view(ctx, s, open.by);
    expect(v.moves).toEqual([{ tile: open.tile, ends: ['R'] }]);
    // another tile can't open
    const other = s.hands[open.by].find((t) => t !== open.tile)!;
    expect(() => playAs(ctx, s, open.by, other)).toThrow(GameError);
    // not your turn
    const notMe = players.find((p) => p !== open.by)!;
    expect(() => playAs(ctx, s, notMe, s.hands[notMe][0])).toThrow(GameError);
    playAs(ctx, s, open.by, open.tile);
    expect(s.line.length).toBe(1);
    expect(s.hands[open.by].length).toBe(6);
  }
});

test('rules: playing on either end, choosing the end, doubles, the anchor', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b'], settings({ draw: false }), seeded(1));
  rig(s, { a: ['3-3', '3-5', '1-3', '0-0'], b: ['3-6', '6-6', '2-4', '0-1'] }, { turn: 'a', boneyard: rest(['3-3', '3-5', '1-3', '0-0', '3-6', '6-6', '2-4', '0-1']) });
  s.drawOn = false;
  playAs(ctx, s, 'a', '3-3');
  expect(endsOf(s.line)).toEqual([3, 3]);
  // b: 3-6 fits both (equal ends): no end needed
  expect(turn(s)).toBe('b');
  playAs(ctx, s, 'b', '3-6');
  expect(endsOf(s.line)).toEqual([3, 6]);
  // a: 3-5 fits only the left
  expect(() => playAs(ctx, s, 'a', '3-5', 'R')).toThrow(GameError);
  playAs(ctx, s, 'a', '3-5');
  expect(endsOf(s.line)).toEqual([5, 6]);
  expect(s.anchor).toBe(1);
  expect(s.line[0]).toMatchObject({ id: '3-5', l: 5, r: 3 });
  // b: 6-6 on the right
  playAs(ctx, s, 'b', '6-6');
  expect(endsOf(s.line)).toEqual([5, 6]);
  expect(s.line[s.line.length - 1]).toMatchObject({ id: '6-6', l: 6, r: 6 });
  // a tile that fits both (different) ends needs an end
  rig(s, { a: ['1-5', '0-0'], b: ['2-4', '0-1'] }, { turn: 'a', line: [placed('5-1', 5, 1)] });
  s.drawOn = false;
  expect(view(ctx, s, 'a').moves).toEqual([{ tile: '1-5', ends: ['L', 'R'] }]);
  expect(() => playAs(ctx, s, 'a', '1-5')).toThrow(GameError);
  playAs(ctx, s, 'a', '1-5', 'L');
  expect(endsOf(s.line)).toEqual([1, 1]);
  expect(s.line[0]).toMatchObject({ l: 1, r: 5 });
});

test('rules: a player who can’t play draws from «السوق» until a tile fits', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b'], settings(), seeded(2));
  // drawn from the end of the list
  const bone: DominoTileId[] = ['0-1', '6-6', '0-2', '2-6'];
  rig(s, { a: ['4-4', '0-4'], b: ['1-1', '1-2'] }, { turn: 'a', boneyard: bone, opening: null });
  playAs(ctx, s, 'a', '4-4');
  // b holds no 4: draws 2-6 (no), 0-2 (no), 6-6 (no), 0-1 (no) … the boneyard empties, then passes
  expect(s.boneyard.length).toBe(0);
  expect(s.hands.b.length).toBe(6);
  expect(ctx.said.some((x) => x.text.includes('من السوق: 4 قطع'))).toBe(true);
  // the pass came after the draw, so the turn is a's again
  expect(turn(s)).toBe('a');
  expect(s.last?.kind).toBe('pass');

  // a draw that finds a tile: the player waits with it
  rig(s, { a: ['4-4', '0-4'], b: ['1-1', '1-2'] }, { turn: 'a', boneyard: ['0-0', '4-5', '2-2'] });
  playAs(ctx, s, 'a', '4-4');
  expect(s.hands.b).toEqual(['1-1', '1-2', '2-2', '4-5']);
  expect(s.boneyard).toEqual(['0-0']);
  expect(turn(s)).toBe('b');
  expect(view(ctx, s, 'b').moves).toEqual([{ tile: '4-5', ends: ['L', 'R'] }]);
  // what the table learnt: b had no 4 (every tile b keeps after playing the drawn one lacks it)
  expect(botInfo(s, 'a').lacks.b).toEqual([4]);
  playAs(ctx, s, 'b', '4-5');
  expect(s.hands.b.some((t) => t.includes('4'))).toBe(false);
});

test('rules: drawing off: a player who can’t play passes; everyone passing blocks the round', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c'], settings({ draw: false }), seeded(3));
  rig(s, { a: ['5-5', '0-1'], b: ['1-2', '2-3'], c: ['5-6', '0-0'] }, { turn: 'a', boneyard: ['4-4', '3-4'] });
  expect(s.drawOn).toBe(false);
  playAs(ctx, s, 'a', '5-5');
  // b passes, c plays 5-6
  expect(turn(s)).toBe('c');
  expect(ctx.said.some((x) => x.text.startsWith('لا قطعة مناسبة'))).toBe(true);
  expect(s.boneyard.length).toBe(2);
  playAs(ctx, s, 'c', '5-6');
  // ends 5|6: a has 0-1 (no), b no, c 0-0 no: blocked
  expect(s.phase).toBe('roundEnd');
  const r = s.result!;
  expect(r.how).toBe('blocked');
  // pips: a 1, b 3+5=8, c 0 → c wins with the lowest total, scores a+b = 9
  expect(r.pips).toEqual({ a: 1, b: 8, c: 0 });
  expect(r.winner).toBe('c');
  expect(r.points).toBe(9);
  expect(s.sides.find((x) => x.key === 'c')!.score).toBe(9);
  // the next round: c opens with any tile
  domino.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('play');
  expect(s.round).toBe(2);
  expect(turn(s)).toBe('c');
  expect(s.opening).toBeNull();
});

test('rules: a blocked round with a tie for the lowest scores nothing; the highest double opens again', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b'], settings({ draw: false }), seeded(4));
  rig(s, { a: ['6-6', '1-2'], b: ['0-3'] }, { turn: 'a' });
  playAs(ctx, s, 'a', '6-6');
  // b passes, a passes: blocked; a 3, b 3
  expect(s.result!.winner).toBeNull();
  expect(s.result!.points).toBe(0);
  expect(s.sides.every((x) => x.score === 0)).toBe(true);
  domino.act(ctx, s, 'a', { type: 'next' });
  expect(s.opening).toBe(openingTile(s.hands)!.tile);
});

test('rules: domino — the winner scores every pip left in the opponents’ hands', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c'], settings(), seeded(5));
  rig(s, { a: ['2-2'], b: ['6-6', '5-6'], c: ['4-5', '0-1'] }, { turn: 'a', boneyard: ['3-3'] });
  playAs(ctx, s, 'a', '2-2');
  expect(s.result).toMatchObject({ how: 'domino', winner: 'a', by: 'a', points: 12 + 11 + 9 + 1 });
  expect(s.sides.find((x) => x.key === 'a')!.score).toBe(33);
  // everyone's tiles are shown at the end of the round
  expect(view(ctx, s, 'b').result!.hands.c).toEqual(['4-5', '0-1']);
  expect(s.history).toEqual([{ round: 1, winner: 'a', points: 33, how: 'domino' }]);
});

test('rules: teams — partners sit across, the pair scores, a blocked round counts the pair’s total', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(6));
  expect(s.teams).toBe(true);
  expect(s.sides.map((x) => x.members)).toEqual([
    ['a', 'c'],
    ['b', 'd'],
  ]);
  expect(s.boneyard.length).toBe(0);
  expect(s.drawOn).toBe(false);
  // c goes out: the pair a+c scores b+d's pips
  rig(s, { a: ['6-6'], b: ['5-5'], c: ['0-1'], d: ['3-4', '0-2'] }, { turn: 'c', line: [placed('1-1', 1, 1)] });
  playAs(ctx, s, 'c', '0-1');
  expect(s.result).toMatchObject({ how: 'domino', winner: 'A', by: 'c', points: 10 + 9 });
  expect(s.sides[0].score).toBe(19);
  const v = view(ctx, s, 'a');
  expect(v.sides[0]).toEqual({ key: 'A', members: ['a', 'c'], score: 19 });
  // blocked: the pair's total decides (a 12 + c 0 = 12 against b 2 + d 9 = 11 → B wins, scores 12)
  domino.act(ctx, s, 'a', { type: 'next' });
  // d plays the only fitting tile, then nobody can play
  rig(s, { a: ['6-6'], b: ['0-2'], c: ['0-0'], d: ['4-5', '1-3'] }, { turn: 'd', line: [placed('3-3', 3, 3)] });
  playAs(ctx, s, 'd', '1-3', 'R');
  // ends 3|1: a, b, c, d can't play → blocked; A: 12 + 0 = 12, B: 2 + 9 = 11 → B scores 12
  expect(s.result).toMatchObject({ how: 'blocked', winner: 'B', points: 12 });
  expect(s.result!.by).toBe('b');
  expect(s.sides[1].score).toBe(12);
});

test('rules: four players each for themselves when «فريقان» is off', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c', 'd'], settings({ teams: false }), seeded(7));
  expect(s.teams).toBe(false);
  expect(s.sides.length).toBe(4);
  rig(s, { a: ['6-6'], b: ['5-5'], c: ['0-1'], d: ['3-4'] }, { turn: 'c', line: [placed('1-1', 1, 1)] });
  playAs(ctx, s, 'c', '0-1');
  expect(s.result).toMatchObject({ winner: 'c', points: 12 + 10 + 7 });
});

test('rules: the game ends at the target; the winner is first in result(), partners share a place', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c', 'd'], settings({ target: 51 }), seeded(8));
  s.sides[1].score = 45;
  rig(s, { a: ['6-6'], b: ['0-1'], c: ['5-5'], d: ['3-4'] }, { turn: 'b', line: [placed('1-1', 1, 1)] });
  playAs(ctx, s, 'b', '0-1');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('B');
  expect(domino.result!(s)).toEqual({
    places: [
      ['b', 'd'],
      ['a', 'c'],
    ],
  });
  // individual: places by score
  const s2 = startDomino(ctx, ['a', 'b', 'c'], settings({ target: 51 }), seeded(9));
  s2.sides[2].score = 20;
  s2.sides[1].score = 20;
  rig(s2, { a: ['6-6'], b: ['0-1', '5-6'], c: ['3-4'] }, { turn: 'a', line: [placed('1-6', 6, 1)], boneyard: [] });
  s2.sides[0].score = 40;
  playAs(ctx, s2, 'a', '6-6', 'L');
  expect(s2.phase).toBe('final');
  expect(domino.result!(s2)).toEqual({ places: [['a'], ['b', 'c']] });
  expect(domino.result!(startDomino(ctx, ['a', 'b'], settings(), seeded(10)))).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Views                                                               */
/* ------------------------------------------------------------------ */

test('views: no other hand, no boneyard tiles — only counts', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c'], settings(), seeded(11));
  for (const me of ['a', 'b', 'c']) {
    const v = view(ctx, s, me);
    const json = JSON.stringify(v);
    expect(v.myHand.slice().sort()).toEqual(s.hands[me].slice().sort());
    for (const other of ['a', 'b', 'c'].filter((x) => x !== me)) for (const t of s.hands[other]) if (t !== s.opening) expect(json).not.toContain(`"${t}"`);
    for (const t of s.boneyard) expect(json).not.toContain(`"${t}"`);
    expect(v.boneyard).toBe(7);
    expect(v.counts).toEqual({ a: 7, b: 7, c: 7 });
    expect(v.result).toBeNull();
    if (turn(s) !== me) expect(v.moves).toEqual([]);
  }
  // the opening tile is announced to everyone (its holder opens with it)
  expect(view(ctx, s, 'a').opening).toBe(s.opening);
  // a spectator sees no hand at all
  const spec = view(ctx, s, 'zz');
  expect(spec.myHand).toEqual([]);
  for (const id of ['a', 'b', 'c']) for (const t of s.hands[id]) if (t !== s.opening) expect(JSON.stringify(spec)).not.toContain(`"${t}"`);
  // the lines said aloud never name a hidden tile
  playAs(ctx, s, turn(s), s.opening!);
  for (const said of ctx.said) for (const t of s.boneyard) expect(said.text).not.toContain(t);
});

test('bots see only what a player at the table sees', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c'], settings(), seeded(12));
  const info = botInfo(s, 'b');
  const json = JSON.stringify(info);
  expect(info.hand.slice().sort()).toEqual(s.hands.b.slice().sort());
  for (const t of [...s.hands.a, ...s.hands.c, ...s.boneyard]) expect(json).not.toContain(`"${t}"`);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: every strength finishes games of 2, 3 and 4 players (teams too)', () => {
  let seed = 100;
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (const [players, o] of [
      [['a', 'b'], {}],
      [['a', 'b', 'c'], { draw: false }],
      [['a', 'b', 'c', 'd'], {}],
      [['a', 'b', 'c', 'd'], { teams: false, target: 51 }],
    ] as [string[], Partial<DominoSettings>][]) {
      const s = runBots(players, o, level, seed++);
      expect(s.phase).toBe('final');
      const r = domino.result!(s)!;
      expect(r.places.flat().sort()).toEqual(players.slice().sort());
      const win = s.sides.find((x) => x.key === s.winner)!;
      expect(win.score).toBeGreaterThanOrEqual(s.settings.target);
      // every tile is somewhere, exactly once, at the end
      const all = [...s.line.map((p) => p.id), ...Object.values(s.hands).flat(), ...s.boneyard];
      expect(all.slice().sort()).toEqual(DOMINO_SET.slice().sort());
    }
  }
});

test('bots: the expert beats the easy bot most of the time; decisions are quick', () => {
  let expertWins = 0;
  const n = 60;
  let maxMs = 0;
  for (let g = 0; g < n; g++) {
    // seats alternate so neither strength always plays first
    const levels: Record<string, BotLevel> = g % 2 ? { a: 'expert', b: 'easy' } : { a: 'easy', b: 'expert' };
    const t0 = performance.now();
    const s = runBots(['a', 'b'], { target: 101 }, levels, 1000 + g);
    maxMs = Math.max(maxMs, performance.now() - t0);
    if (levels[s.winner!] === 'expert') expertWins++;
  }
  expect(expertWins / n).toBeGreaterThan(0.6);
  // a whole game in well under a second
  expect(maxMs).toBeLessThan(1000);
});

test('bots: the expert team beats an easy team most of the time', () => {
  let wins = 0;
  const n = 40;
  for (let g = 0; g < n; g++) {
    const ex = g % 2 ? ['a', 'c'] : ['b', 'd'];
    const levels: Record<string, BotLevel> = Object.fromEntries(['a', 'b', 'c', 'd'].map((p) => [p, ex.includes(p) ? 'expert' : 'easy']));
    const s = runBots(['a', 'b', 'c', 'd'], { target: 101 }, levels, 5000 + g);
    if (s.sides.find((x) => x.key === s.winner)!.members.every((m) => ex.includes(m))) wins++;
  }
  expect(wins / n).toBeGreaterThan(0.55);
});

test('bots: smart plays the heaviest tile; the expert blocks a number the next player lacks', () => {
  const line = [placed('3-3', 3, 3), placed('3-5', 3, 5)];
  const base = { me: 'a', line, opening: null, seats: ['a', 'b'], partner: null, counts: { a: 3, b: 5 }, lacks: { a: [], b: [] } as Record<string, number[]> };
  const smart = chooseDominoMove('smart', { ...base, hand: ['1-3', '5-6', '0-0'] }, seeded(1));
  expect(smart).toEqual({ tile: '5-6', end: 'R' });
  // b lacks 2: the expert opens a 2 rather than a 6 (same weight otherwise)
  const ex = chooseDominoMove('expert', { ...base, hand: ['2-3', '5-1', '2-4', '1-4'], lacks: { a: [], b: [2] } }, seeded(1));
  expect(ex).toEqual({ tile: '2-3', end: 'L' });
  // the last tile always goes out
  expect(chooseDominoMove('easy', { ...base, hand: ['0-5'] }, seeded(1))).toEqual({ tile: '0-5', end: 'R' });
});

test('bots: the room plans a bot move with a human delay; a stale move is dropped', () => {
  const ctx = fakeCtx(['a', 'b'], 'smart');
  const s = startDomino(ctx, ['a', 'b'], settings(), seeded(13));
  domino.botPlan!(ctx, s, ['a', 'b']);
  expect(ctx.jobs.length).toBe(1);
  const job = ctx.jobs[0];
  const delay = job.at - ctx.now;
  expect(delay).toBeGreaterThan(700);
  expect(delay).toBeLessThan(4000);
  // planning again for the same position does nothing
  domino.botPlan!(ctx, s, ['a', 'b']);
  expect(ctx.jobs.length).toBe(1);
  domino.act(ctx, s, job.by, job.a);
  expect(s.line.length).toBe(1);
  // the same move again (an old position): ignored
  const before = s.seq;
  domino.act(ctx, s, job.by, job.a);
  expect(s.seq).toBe(before);
});

/* ------------------------------------------------------------------ */
/* Timer, leaving, settings                                            */
/* ------------------------------------------------------------------ */

test('timer: when the turn’s time runs out a tile is played automatically', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b'], settings({ turnSec: 20 }), seeded(14));
  const who = turn(s);
  expect(s.deadline).toBe(ctx.now + 20_000);
  ctx.now += 19_000;
  expect(domino.tick!(ctx, s)).toBe(false);
  ctx.now += 1_500;
  expect(domino.tick!(ctx, s)).toBe(true);
  expect(s.line.length).toBe(1);
  expect(s.line[0].by).toBe(who);
  expect(ctx.said.some((x) => x.text.startsWith('انتهى الوقت'))).toBe(true);
  // no timer: nothing happens
  const s2 = startDomino(ctx, ['a', 'b'], settings(), seeded(15));
  expect(s2.deadline).toBeNull();
  ctx.now += 999_999;
  expect(domino.tick!(ctx, s2)).toBe(false);
});

test('the round’s end moves on by itself after a pause, or at once for the host', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b'], settings(), seeded(16));
  rig(s, { a: ['2-2'], b: ['6-6'] }, { turn: 'a' });
  playAs(ctx, s, 'a', '2-2');
  expect(s.phase).toBe('roundEnd');
  expect(domino.tick!(ctx, s)).toBe(false);
  ctx.now = s.nextAt!;
  expect(domino.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('play');
  expect(s.round).toBe(2);
  expect(turn(s)).toBe('a');
});

test('leaving: the game goes on without the leaver (their turn passes on); the last one left wins', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c'], settings(), seeded(17));
  rig(s, { a: ['1-1', '0-1'], b: ['1-2', '5-5'], c: ['2-3', '4-4'] }, { turn: 'a', boneyard: ['6-6', '5-6'] });
  playAs(ctx, s, 'a', '1-1');
  expect(turn(s)).toBe('b');
  domino.onLeave!(ctx, s, 'b');
  expect(s.seats).toEqual(['a', 'c']);
  expect(s.hands.b).toBeUndefined();
  // c can't play on 1|1: draws the boneyard empty, then passes back to a
  expect(s.phase).toBe('play');
  expect(turn(s)).toBe('a');
  domino.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('a');
  expect(domino.result!(s)).toEqual({ places: [['a']] });
});

test('leaving: the opener leaves before the first tile — the next player opens with any tile', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c'], settings(), seeded(18));
  const opener = turn(s);
  domino.onLeave!(ctx, s, opener);
  expect(s.opening).toBeNull();
  expect(s.phase).toBe('play');
  const next = turn(s);
  expect(next).not.toBe(opener);
  expect(view(ctx, s, next).moves.length).toBe(s.hands[next].length);
});

test('leaving: in team mode the game ends, the side ahead wins (a tie: the full pair)', () => {
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(19));
  s.sides[0].score = 30;
  domino.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('A');
  expect(domino.result!(s)).toEqual({ places: [['a'], ['b', 'd']] });
  const s2 = startDomino(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(20));
  domino.onLeave!(ctx, s2, 'a');
  expect(s2.winner).toBe('B');
  // a stranger leaving changes nothing
  const s3 = startDomino(ctx, ['a', 'b'], settings(), seeded(21));
  domino.onLeave!(ctx, s3, 'zz');
  expect(s3.phase).toBe('play');
});

test('settings: sanitised at the start, validated on change', () => {
  expect(sanitizeDomino(undefined)).toEqual(DOMINO_DEFAULTS);
  expect(sanitizeDomino({ target: 99, draw: false, teams: false, turnSec: 33 } as DominoSettings)).toEqual({ target: 101, draw: false, teams: false, turnSec: 40 });
  expect(sanitizeDomino({ target: 'x', turnSec: -5 } as unknown as DominoSettings)).toEqual({ target: 101, draw: true, teams: true, turnSec: 0 });
  const st = { ...DOMINO_DEFAULTS };
  domino.patchSettings!(st, { target: 151, draw: false, teams: false, turnSec: 20 });
  expect(st).toEqual({ target: 151, draw: false, teams: false, turnSec: 20 });
  domino.patchSettings!(st, { target: 'big', draw: 'yes', teams: 1, turnSec: null });
  expect(st).toEqual({ target: 151, draw: false, teams: false, turnSec: 20 });
  domino.patchSettings!(st, { target: 60 });
  expect(st.target).toBe(51);
  // drawing off: 2 players never draw
  const ctx = fakeCtx();
  const s = startDomino(ctx, ['a', 'b'], settings({ draw: false }), seeded(22));
  expect(s.drawOn).toBe(false);
  expect(view(ctx, s, 'a').drawOn).toBe(false);
});

test('legal moves list a tile once on equal ends', () => {
  expect(legalMoves(['3-4', '1-1'], [placed('3-3', 3, 3)], null)).toEqual([{ tile: '3-4', end: 'R' }]);
  expect(legalMoves(['3-4', '1-1'], [], '1-1')).toEqual([{ tile: '1-1', end: 'R' }]);
});

/* ------------------------------------------------------------------ */
/* The snake on the table                                              */
/* ------------------------------------------------------------------ */

const touching = (p: DominoRect, q: DominoRect, eps = 0.01) => {
  const xOver = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
  const yOver = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
  return (Math.abs(xOver) < eps && yOver > eps) || (Math.abs(yOver) < eps && xOver > eps);
};

test('layout: the snake fits the board at every width, nothing overlaps, each tile touches the next', () => {
  const rnd = seeded(77);
  for (const width of [288, 328, 528, 702]) {
    const u = dominoUnit(width, width > 600 ? 34 : 26);
    for (let k = 0; k < 300; k++) {
      const n = 1 + Math.floor(rnd() * 28);
      const line = Array.from({ length: n }, () => {
        const dbl = rnd() < 0.25;
        const l = Math.floor(rnd() * 7);
        return { l, r: dbl ? l : Math.floor(rnd() * 7) };
      });
      const anchor = Math.floor(rnd() * n);
      const lay = layoutLine(line, anchor, width, u);
      expect(lay.tiles.length).toBe(n);
      const all = [...lay.tiles, ...lay.ghosts];
      for (const r of all) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(width + 0.01);
      }
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(rectsOverlap(all[i], all[j])).toBe(false);
      for (let i = 0; i + 1 < n; i++) expect(touching(lay.tiles[i], lay.tiles[i + 1])).toBe(true);
      // the open ends: each ghost touches its tip
      expect(touching(lay.ghosts[0], lay.tiles[0])).toBe(true);
      expect(touching(lay.ghosts[1], lay.tiles[n - 1])).toBe(true);
      expect(lay.ghosts.map((g) => g.value)).toEqual([line[0].l, line[n - 1].r]);
    }
  }
});
