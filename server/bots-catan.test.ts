/**
 * The bots of «المستوطنون» and «المدن والطرق»: the expert beats the previous bot over seeded series,
 * known positions are played right, decisions stay fast, and every move is legal.
 * Everything is seeded (Math.random is replaced during a game) and nothing depends on the clock.
 */
import { expect, test } from 'bun:test';

import type { CarcaSettings } from '../src/shared/games/carca';
import type { CatanSettings } from '../src/shared/games/catan';
import type { BotLevel } from '../src/shared/protocol';
import { EDGES, HEX_VERTS, RES, VERT_EDGES, VERT_HEXES, emptyRes } from '../src/shared/catan-board';
import { TOTAL_TILES, edgeAt, makeBoard, type Board } from '../src/shared/carca-tiles';
import { planMove } from './carca-bot';
import { planMove as oldPlan } from './carca-bot-easy';
import { autoDiscard, botAction, botRobber } from './catan-bot';
import { publicVp, type State } from './catan-rules';
import { carca } from './games/carca';
import { catan } from './games/catan';
import { GameError } from './types';

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seeded<T>(seed: number, f: () => T): T {
  const orig = Math.random;
  Math.random = mulberry(seed);
  try {
    return f();
  } finally {
    Math.random = orig;
  }
}

/** Fastest of a few runs: the work done, not the machine's load. */
function cost(f: () => unknown): number {
  let best = Infinity;
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    f();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* «المستوطنون»                                                       */
/* ------------------------------------------------------------------ */

/** A whole bot game, each seat with its own level; bot moves run in the order of their delays. */
function catanGame(levels: BotLevel[], seed: number, opts: { snap?: (s: State, id: string) => void; layout?: CatanSettings['layout'] } = {}) {
  return seeded(seed, () => {
    const ids = levels.map((_, i) => `p${i}`);
    const lv: Record<string, BotLevel> = Object.fromEntries(ids.map((id, i) => [id, levels[i]]));
    const jobs: { at: number; by: string; a: any; key: string }[] = [];
    const keys = new Set<string>();
    let level: BotLevel = 'expert';
    let only = '';
    const ctx: any = {
      now: 0,
      fx: () => {},
      isConnected: () => true,
      isBot: (x: string) => x === only,
      botLevel: () => level,
      playerName: (id: string) => id,
      memo: new Map(),
      bot: (by: string, key: string, d: number, a: any) => {
        const k = `${by}|${key}`;
        if (keys.has(k)) return;
        keys.add(k);
        jobs.push({ at: ctx.now + d, by, a, key: k });
      },
    };
    const plan = () => {
      for (const id of ids) {
        only = id;
        level = lv[id];
        catan.botPlan!(ctx, s, ids);
      }
    };
    const s = catan.start(ctx, ids, { layout: opts.layout ?? 'random', target: 10, seconds: 0 });
    plan();
    const errors: Record<string, number> = {};
    for (let steps = 0; s.phase !== 'final' && steps < 40000; steps++) {
      jobs.sort((a, b) => a.at - b.at);
      const j = jobs.shift();
      if (!j) throw new Error(`stuck: ${s.phase} ${s.turn}`);
      ctx.now = Math.max(ctx.now, j.at);
      level = lv[j.by];
      if (opts.snap && j.by === s.turn && lv[j.by] === 'expert') opts.snap(structuredClone(s), j.by);
      try {
        catan.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        errors[lv[j.by]] = (errors[lv[j.by]] ?? 0) + 1;
        keys.delete(j.key);
      }
      plan();
      for (const id of s.order) for (const r of RES) expect(s.hands[id][r]).toBeGreaterThanOrEqual(0);
    }
    expect(s.phase).toBe('final');
    return { s, lv, errors };
  });
}

/** A position past the setup with a fixed seat order, `a` to play in the main phase. */
function catanAt(n = 3) {
  const ctx: any = { now: 0, fx: () => {}, isConnected: () => true, isBot: () => true, playerName: (x: string) => x, memo: new Map(), bot: () => {} };
  const ids = ['a', 'b', 'c', 'd'].slice(0, n);
  const s = seeded(1, () => catan.start(ctx, ids, { layout: 'beginner', target: 10, seconds: 0 }));
  s.order = ids.slice();
  s.phase = 'main';
  s.setupStep = s.setupList.length;
  s.turn = 'a';
  s.turnNo = 20;
  return { s, ctx };
}

function give(s: State, id: string, m: Partial<Record<(typeof RES)[number], number>>) {
  for (const r of RES) {
    const n = m[r] ?? 0;
    s.hands[id][r] += n;
    s.bank[r] -= n;
  }
}

test('catan: one expert against two previous bots wins far more than its share', () => {
  let wins = 0;
  let vp = 0;
  const N = 60;
  for (let g = 0; g < N; g++) {
    const levels: BotLevel[] = [0, 1, 2].map((i) => (i === g % 3 ? 'expert' : 'easy'));
    const { s, lv } = catanGame(levels, 7000 + g);
    const me = s.order.find((id) => lv[id] === 'expert')!;
    if (s.final!.winner === me) wins++;
    vp += s.final!.rows[me].total;
  }
  console.log(`catan: expert 1 vs 2 previous bots: ${wins}/${N} wins (fair share ${N / 3}), ${(vp / N).toFixed(2)} points a game`);
  expect(wins).toBeGreaterThanOrEqual(26); // ≥ 43 % where a third is par
}, 120_000);

test('catan: two experts against two previous bots win most 4-player games', () => {
  let wins = 0;
  const N = 30;
  for (let g = 0; g < N; g++) {
    const levels: BotLevel[] = g % 2 ? ['expert', 'easy', 'expert', 'easy'] : ['easy', 'expert', 'easy', 'expert'];
    const { s, lv } = catanGame(levels, 8000 + g);
    if (lv[s.final!.winner!] === 'expert') wins++;
  }
  console.log(`catan: 2 experts vs 2 previous bots: experts won ${wins}/${N}`);
  expect(wins).toBeGreaterThanOrEqual(19);
}, 120_000);

test('catan: no illegal moves, every level, 3 and 4 players', () => {
  for (const [levels, seed] of [
    [['expert', 'smart', 'easy'], 1],
    [['smart', 'smart', 'expert', 'expert'], 2],
    [['expert', 'expert', 'expert'], 3],
    [['expert', 'smart', 'easy', 'expert'], 4],
  ] as [BotLevel[], number][]) {
    const { s, errors } = catanGame(levels, seed, { layout: seed % 2 ? 'beginner' : 'random' });
    expect(errors.expert ?? 0).toBe(0);
    expect(errors.smart ?? 0).toBe(0);
    // the distance rule held all game
    s.buildings.forEach((b, v) => {
      if (!b) return;
      for (const e of VERT_EDGES[v]) for (const u of EDGES[e]) if (u !== v) expect(s.buildings[u]).toBeNull();
    });
    for (const id of s.order) expect(s.final!.rows[id].total).toBe(publicVp(s, id) + s.devs[id].filter((d) => d.k === 'vp').length);
  }
}, 120_000);

test('catan: a build that wins comes first', () => {
  const { s } = catanAt();
  // a at 9 points: three cities and three settlements, with ore and grain for one more city
  for (const v of [HEX_VERTS[0][0], HEX_VERTS[2][0], HEX_VERTS[12][0]]) s.buildings[v] = { s: 0, city: true };
  for (const v of [HEX_VERTS[16][0], HEX_VERTS[18][3]]) s.buildings[v] = { s: 0, city: false };
  const v5 = HEX_VERTS[7][3];
  s.buildings[v5] = { s: 0, city: false };
  expect(publicVp(s, 'a')).toBe(9);
  give(s, 'a', { grain: 2, ore: 3, wood: 1, brick: 1 });
  const p = botAction(s, 'a', 'expert')!;
  expect(p.action).toMatchObject({ type: 'city' });
});

test('catan: the robber goes on the leader, never on its own hex; monopoly takes what the others hold', () => {
  const { s } = catanAt();
  // b leads on the 6 hills (hex 4); a has a settlement on the 8 mountains (hex 11)
  s.buildings[HEX_VERTS[4][0]] = { s: 1, city: true };
  s.buildings[HEX_VERTS[4][3]] = { s: 1, city: true };
  s.buildings[HEX_VERTS[11][0]] = { s: 0, city: false };
  s.buildings[HEX_VERTS[11][3]] = { s: 2, city: false };
  give(s, 'b', { wood: 2 });
  give(s, 'c', { sheep: 1 });
  expect(botRobber(s, 'a', 'expert')).toBe(4);
  // monopoly: the bank says ore is in the others' hands
  give(s, 'b', { ore: 5 });
  give(s, 'c', { ore: 3 });
  s.devs.a.push({ k: 'monopoly', turn: 1 });
  s.buildings[HEX_VERTS[11][0]] = { s: 0, city: false };
  give(s, 'a', { grain: 2 });
  const p = botAction(s, 'a', 'expert')!;
  expect(p.action).toMatchObject({ type: 'play', k: 'monopoly', r: 'ore' });
});

test('catan: a knight that takes the largest army and wins is played before rolling', () => {
  const { s } = catanAt();
  s.phase = 'roll';
  for (const v of [HEX_VERTS[0][0], HEX_VERTS[2][0], HEX_VERTS[12][0], HEX_VERTS[16][0]]) s.buildings[v] = { s: 0, city: true };
  s.knights.a = 2;
  s.knights.b = 2;
  s.devs.a.push({ k: 'knight', turn: 3 });
  expect(publicVp(s, 'a')).toBe(8);
  expect(botAction(s, 'a', 'expert')!.action).toEqual({ type: 'play', k: 'knight' });
});

test('catan: year of plenty completes a city; discards keep the city', () => {
  const { s } = catanAt();
  s.buildings[HEX_VERTS[11][0]] = { s: 0, city: false };
  give(s, 'a', { grain: 2, ore: 1 });
  s.devs.a.push({ k: 'plenty', turn: 1 });
  const p = botAction(s, 'a', 'expert')!.action as any;
  expect(p.type).toBe('play');
  expect(p.k).toBe('plenty');
  expect([p.r, p.r2]).toEqual(['ore', 'ore']);
  const g = catanAt();
  g.s.buildings[HEX_VERTS[11][0]] = { s: 0, city: false };
  give(g.s, 'a', { grain: 2, ore: 3, wood: 3, sheep: 2 });
  const d = autoDiscard(g.s, 'a', 5, 'expert');
  expect(d.ore + d.grain).toBe(0);
});

test('catan: the opening goes on rich spots and the second settlement adds what is missing', () => {
  const ctx: any = { now: 0, fx: () => {}, isConnected: () => true, isBot: () => true, playerName: (x: string) => x, memo: new Map(), bot: () => {} };
  let pips = 0;
  let kinds = 0;
  const N = 30;
  for (let g = 0; g < N; g++) {
    seeded(300 + g, () => {
      const s = catan.start(ctx, ['a', 'b', 'c'], { layout: 'random', target: 10, seconds: 0 });
      while (s.phase === 'setup') {
        const p = botAction(s, s.turn, s.turn === s.order[g % 3] ? 'expert' : 'easy')!;
        catan.act(ctx, s, s.turn, p.action as any);
      }
      const seat = g % 3;
      const prod = emptyRes();
      s.buildings.forEach((b, v) => {
        if (b?.s === seat) for (const h of VERT_HEXES[v]) if (s.hexes[h] !== 'desert') prod[s.hexes[h] as (typeof RES)[number]] += 6 - Math.abs(7 - s.nums[h]!);
      });
      pips += RES.reduce((a, r) => a + prod[r], 0);
      kinds += RES.filter((r) => prod[r] > 0).length;
    });
  }
  // about 20 pips (of the best ~26) and nearly all five resources
  expect(pips / N).toBeGreaterThan(18);
  expect(kinds / N).toBeGreaterThan(4.5);
});

test('catan: decisions stay within the time budget', () => {
  const snaps: { s: State; id: string }[] = [];
  catanGame(['expert', 'easy', 'expert'], 42, { snap: (s, id) => snaps.length < 400 && snaps.push({ s, id }) });
  const times = snaps.map(({ s, id }) => cost(() => botAction(s, id, 'expert')));
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  console.log(`catan: ${times.length} decisions, median ${times[times.length >> 1].toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${times.at(-1)!.toFixed(2)} ms`);
  expect(p95).toBeLessThan(40);
  expect(times.at(-1)!).toBeLessThan(200);
}, 60_000);

/* ------------------------------------------------------------------ */
/* «المدن والطرق»                                                      */
/* ------------------------------------------------------------------ */

type CarcaBot = 'expert' | 'smart' | 'old1' | 'old2';

function carcaGame(levels: CarcaBot[], seed: number, farmers = true, onMove?: (inp: Parameters<typeof planMove>[0]) => void) {
  return seeded(seed, () => {
    const ids = levels.map((_, i) => `p${i}`);
    const lv = Object.fromEntries(ids.map((id, i) => [id, levels[i]]));
    const ctx: any = { now: 0, fx: () => {}, isConnected: () => true, isBot: () => true, playerName: (x: string) => x, memo: new Map(), bot: () => {} };
    const s = carca.start(ctx, ids, { farmers, seconds: 0, level: 2 });
    while (s.phase === 'play') {
      const id = s.turn;
      const L = lv[id];
      const inp = { board: s.board, followers: s.followers, tile: s.tile!, me: id, order: s.order, tilesLeft: s.pile.length, supply: s.supply[id], farmers, withFollower: true, remaining: s.pile };
      if (onMove && L === 'expert') onMove(structuredClone({ ...inp, level: 'expert' as const }));
      const m = L === 'old1' || L === 'old2' ? oldPlan({ ...inp, level: L === 'old1' ? 1 : 2 }) : planMove({ ...inp, level: L });
      expect(m).not.toBeNull();
      // no fallback: a refused move would throw here
      carca.act(ctx, s, id, { type: 'place', x: m!.x, y: m!.y, r: m!.r });
      if (s.step === 'follower' && s.turn === id) {
        if (m!.f !== null) expect(s.options).toContain(m!.f);
        carca.act(ctx, s, id, { type: 'follower', f: m!.f });
      } else expect(m!.f === null || s.supply[id] >= 0).toBe(true);
    }
    return { s, lv };
  });
}

function checkBoard(board: Board) {
  for (const p of board.values()) {
    for (let d = 0; d < 4; d++) {
      const nb = board.get(`${p.x + [0, 1, 0, -1][d]},${p.y + [-1, 0, 1, 0][d]}`);
      if (nb) expect(edgeAt(p.t, p.r, d)).toBe(edgeAt(nb.t, nb.r, (d + 2) % 4));
    }
  }
}

test('carca: the expert beats the previous strong bot head to head', () => {
  let wins = 0;
  let margin = 0;
  const N = 30;
  for (let g = 0; g < N; g++) {
    const levels: CarcaBot[] = g % 2 ? ['old2', 'expert'] : ['expert', 'old2'];
    const { s, lv } = carcaGame(levels, 500 + g);
    const me = s.order.find((id) => lv[id] === 'expert')!;
    const op = s.order.find((id) => id !== me)!;
    if (s.scores[me] > s.scores[op]) wins++;
    margin += s.scores[me] - s.scores[op];
  }
  console.log(`carca: expert vs previous strong bot: ${wins}/${N} wins, ${(margin / N).toFixed(1)} points ahead a game`);
  expect(wins).toBeGreaterThanOrEqual(21);
  expect(margin / N).toBeGreaterThan(8);
}, 120_000);

test('carca: no illegal moves (2–5 players, every level, with and without farmers)', () => {
  for (const [levels, farmers, seed] of [
    [['expert', 'smart'], true, 1],
    [['expert', 'old1', 'smart', 'expert', 'old2'], true, 2],
    [['expert', 'expert', 'expert'], false, 3],
  ] as [CarcaBot[], boolean, number][]) {
    const { s } = carcaGame(levels, seed, farmers);
    expect(s.phase).toBe('final');
    expect(s.board.length + s.discarded).toBe(TOTAL_TILES);
    checkBoard(makeBoard(s.board));
    for (const id of s.order) {
      const b = s.breakdown[id];
      expect(b.road + b.city + b.monastery + b.farm).toBe(s.scores[id]);
      if (!farmers) expect(b.farm).toBe(0);
    }
  }
}, 120_000);

const D0 = { x: 0, y: 0, t: 'D', r: 0 };
const base = { me: 'a', order: ['a', 'b'], farmers: true, level: 'expert' as const, withFollower: true };

test('carca: completes its own city; never helps the opponent finish one', () => {
  const m = planMove({ ...base, board: [D0], followers: [{ owner: 'a', x: 0, y: 0, f: 0 }], tile: 'E', tilesLeft: 50, supply: 6 });
  expect(m).toMatchObject({ x: 0, y: -1, r: 2 });
  const n = planMove({ ...base, board: [D0], followers: [{ owner: 'b', x: 0, y: 0, f: 0 }], tile: 'E', tilesLeft: 50, supply: 6 });
  expect(n!.x === 0 && n!.y === -1).toBe(false);
});

test('carca: surrounds its monastery for 9; no follower on a city that can never be closed', () => {
  // a's monastery at (0,1) with seven neighbours: the last cell is (1,2)
  const board = [
    D0,
    { x: 0, y: 1, t: 'B', r: 0 },
    { x: -1, y: 0, t: 'U', r: 1 },
    { x: 1, y: 0, t: 'U', r: 1 },
    { x: -1, y: 1, t: 'B', r: 0 },
    { x: 1, y: 1, t: 'B', r: 0 },
    { x: -1, y: 2, t: 'B', r: 0 },
    { x: 0, y: 2, t: 'B', r: 0 },
  ];
  const m = planMove({ ...base, board, followers: [{ owner: 'a', x: 0, y: 1, f: 0 }], tile: 'B', tilesLeft: 30, supply: 6, remaining: ['B', 'U', 'V', 'E'] });
  expect(m).toMatchObject({ x: 1, y: 2 });
  // with no tile left that has a city on one side only, a lone city edge can't be closed: no knight there
  const n = planMove({ ...base, board: [D0], followers: [], tile: 'E', tilesLeft: 6, supply: 7, remaining: ['U', 'V', 'V', 'U', 'B', 'W'] });
  if (n && n.f !== null) {
    const t = n.x === 0 && n.y === -1 ? 'joined' : 'free';
    // a follower on a free lone city edge would be stuck forever
    expect(t === 'joined' || n.f !== 0).toBe(true);
  }
});

test('carca: grabs a free city early, keeps followers late only for points', () => {
  const m = planMove({ ...base, board: [D0], followers: [], tile: 'E', tilesLeft: 60, supply: 7 });
  expect(m!.f).not.toBeNull();
  // the very last tile: any follower that scores something goes down (it is worth nothing in hand)
  const last = planMove({ ...base, board: [D0], followers: [], tile: 'U', tilesLeft: 0, supply: 3 });
  expect(last!.f).not.toBeNull();
});

test('carca: decisions stay within the time budget', () => {
  const inputs: Parameters<typeof planMove>[0][] = [];
  carcaGame(['expert', 'old2', 'expert'], 77, true, (inp) => inputs.push(inp));
  const times = inputs.map((inp) => cost(() => planMove(inp)));
  times.sort((a, b) => a - b);
  console.log(`carca: ${times.length} decisions, median ${times[times.length >> 1].toFixed(2)} ms, max ${times.at(-1)!.toFixed(2)} ms`);
  expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(40);
  expect(times.at(-1)!).toBeLessThan(150);
}, 60_000);

test('settings: the old per-game bot level is still accepted (and ignored by the bots)', () => {
  const st: CarcaSettings = { farmers: true, seconds: 0, level: 2 };
  carca.patchSettings!(st, { level: 1 });
  expect(st.level).toBe(1);
  // the room's level decides: 'easy' plays the previous bot
  const a = planMove({ ...base, board: [D0], followers: [], tile: 'E', tilesLeft: 60, supply: 7, level: 'easy', random: () => 0.5 });
  expect(a).not.toBeNull();
});
