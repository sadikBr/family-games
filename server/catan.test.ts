/** «المستوطنون» — board, rules, trading, development cards, titles, time-outs, leaving and full bot games. */
import { expect, test } from 'bun:test';

import type { CatanSettings, CatanView } from '../src/shared/games/catan';
import {
  BEGINNER,
  COAST,
  EDGES,
  EDGE_HEXES,
  HEX_COUNT,
  HEX_EDGES,
  HEX_NEIGHBORS,
  HEX_VERTS,
  NUMBERS,
  PORT_SLOTS,
  RES,
  VERT_COUNT,
  VERT_EDGES,
  VERT_HEXES,
  EDGE_COUNT,
  emptyRes,
  isRed,
  redsApart,
  resOf,
  resTotal,
} from '../src/shared/catan-board';
import { autoDiscard, wouldAccept } from './catan-bot';
import { legalSettlements, longestRoad, makeBoard, publicVp, ratios, totalVp, type State } from './catan-rules';
import { catan, produce, updateLongest } from './games/catan';
import { GameError } from './types';

const SETTINGS: CatanSettings = { layout: 'beginner', target: 10, seconds: 0 };

function fakeCtx(bots: string[] = []) {
  const fx: string[] = [];
  const ctx: any = {
    now: 1000,
    fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id.toUpperCase(),
    memo: new Map(),
    bot: () => {},
  };
  return { ctx, fx };
}

/** A game with a fixed seat order a, b, c (, d), still in setup. */
function newGame(n = 3, settings: Partial<CatanSettings> = {}) {
  const { ctx, fx } = fakeCtx();
  const ids = ['a', 'b', 'c', 'd'].slice(0, n);
  const s = catan.start(ctx, ids, { ...SETTINGS, ...settings });
  s.order = ids.slice();
  s.setupList = [...ids, ...ids.slice().reverse()];
  s.turn = ids[0];
  return { s, ctx, fx, ids };
}

/** A game past the setup, empty board, `a` to play in the main phase. */
function midGame(n = 3, settings: Partial<CatanSettings> = {}) {
  const g = newGame(n, settings);
  const { s } = g;
  s.phase = 'main';
  s.setupStep = s.setupList.length;
  s.turn = 'a';
  s.turnNo = 10;
  return g;
}

/** the phase, read without the type narrowing of earlier checks */
const ph = (s: State): string => s.phase;
const act = (g: { ctx: any; s: State }, by: string, a: Record<string, unknown> & { type: string }) => catan.act(g.ctx, g.s, by, a);
const view = (g: { ctx: any; s: State }, me: string) => catan.view(g.ctx, g.s, me) as CatanView;

function give(s: State, id: string, m: Partial<Record<(typeof RES)[number], number>>) {
  for (const r of RES) {
    const n = m[r] ?? 0;
    s.hands[id][r] += n;
    s.bank[r] -= n;
  }
}

function bankOk(s: State) {
  for (const r of RES) expect(s.bank[r] + s.order.reduce((a, id) => a + s.hands[id][r], 0)).toBe(19);
}

/* ------------------------------------------------------------------ */
/* Board                                                               */
/* ------------------------------------------------------------------ */

test('geometry: 19 hexes, 54 intersections, 72 paths, 30 coast paths, 9 harbours on the coast', () => {
  expect(HEX_COUNT).toBe(19);
  expect(VERT_COUNT).toBe(54);
  expect(EDGE_COUNT).toBe(72);
  expect(COAST.length).toBe(30);
  for (const vs of HEX_VERTS) expect(new Set(vs).size).toBe(6);
  for (const es of HEX_EDGES) expect(new Set(es).size).toBe(6);
  for (let v = 0; v < VERT_COUNT; v++) {
    expect(VERT_HEXES[v].length).toBeGreaterThanOrEqual(1);
    expect(VERT_EDGES[v].length).toBeGreaterThanOrEqual(2);
    expect(VERT_EDGES[v].length).toBeLessThanOrEqual(3);
  }
  // the centre hex has 6 neighbours, the corners 3
  expect(HEX_NEIGHBORS[9].length).toBe(6);
  expect(HEX_NEIGHBORS[0].length).toBe(3);
  expect(PORT_SLOTS.length).toBe(9);
  const portVerts = new Set<number>();
  for (const p of PORT_SLOTS) {
    expect(EDGE_HEXES[p.edge].length).toBe(1); // a coast path
    expect(p.verts).toEqual(EDGES[p.edge]);
    for (const v of p.verts) portVerts.add(v);
  }
  expect(portVerts.size).toBe(18); // harbours never share an intersection
});

test('board: the beginners board and random boards have the official pieces', () => {
  const check = (b: ReturnType<typeof makeBoard>) => {
    const count = (t: string) => b.hexes.filter((x) => x === t).length;
    expect([count('wood'), count('sheep'), count('grain'), count('brick'), count('ore'), count('desert')]).toEqual([4, 4, 4, 3, 3, 1]);
    const nums = b.nums.filter((n): n is number => n !== null).sort((x, y) => x - y);
    expect(nums).toEqual(NUMBERS);
    expect(b.nums[b.hexes.indexOf('desert')]).toBeNull();
    expect(b.ports.filter((p) => p === 'any').length).toBe(4);
    expect(new Set(b.ports.filter((p) => p !== 'any'))).toEqual(new Set(RES));
  };
  check(makeBoard('beginner'));
  expect(makeBoard('beginner').hexes).toEqual(BEGINNER.hexes);
  for (let i = 0; i < 200; i++) check(makeBoard('random'));
});

test('board: 6 and 8 are never neighbours (random boards and the beginners board)', () => {
  expect(redsApart(BEGINNER.nums)).toBe(true);
  for (let i = 0; i < 500; i++) {
    const b = makeBoard('random');
    for (let h = 0; h < HEX_COUNT; h++) {
      if (!isRed(b.nums[h])) continue;
      for (const n of HEX_NEIGHBORS[h]) expect(isRed(b.nums[n])).toBe(false);
    }
  }
  const bad = BEGINNER.nums.slice();
  bad[9] = 6; // the centre, next to the 6 on hex 4
  expect(redsApart(bad)).toBe(false);
});

test('start: robber on the desert, 19 of each resource, 25 development cards, snake setup order', () => {
  const g = newGame(4);
  expect(g.s.robber).toBe(g.s.hexes.indexOf('desert'));
  for (const r of RES) expect(g.s.bank[r]).toBe(19);
  expect(g.s.deck.length).toBe(25);
  expect(g.s.deck.filter((k) => k === 'knight').length).toBe(14);
  expect(g.s.deck.filter((k) => k === 'vp').length).toBe(5);
  expect(g.s.setupList).toEqual(['a', 'b', 'c', 'd', 'd', 'c', 'b', 'a']);
  expect(catan.turnOf!(g.s)).toEqual(['a']);
});

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

test('setup: distance rule, road next to the new settlement, snake order, the second settlement pays', () => {
  const g = newGame(3);
  const { s } = g;
  const v0 = HEX_VERTS[9][0];
  act(g, 'a', { type: 'settle', v: v0 });
  expect(() => act(g, 'a', { type: 'settle', v: HEX_VERTS[9][3] })).toThrow(GameError); // a road is due
  const far = VERT_EDGES[HEX_VERTS[0][0]][0];
  expect(() => act(g, 'a', { type: 'road', e: far })).toThrow(GameError); // not next to the settlement
  act(g, 'a', { type: 'road', e: VERT_EDGES[v0][0] });
  expect(s.turn).toBe('b');
  // b may not build next to a's settlement
  const neighbour = EDGES[VERT_EDGES[v0][1]].find((v) => v !== v0)!;
  expect(() => act(g, 'b', { type: 'settle', v: neighbour })).toThrow(GameError);
  expect(legalSettlements(s, 1, true)).not.toContain(neighbour);
  expect(legalSettlements(s, 1, true)).not.toContain(v0);
  expect(() => act(g, 'c', { type: 'settle', v: HEX_VERTS[4][0] })).toThrow('ليس دورك');

  const place = (id: string, v: number) => {
    act(g, id, { type: 'settle', v });
    act(g, id, { type: 'road', e: VERT_EDGES[v].find((e) => s.roads[e] === -1)! });
  };
  place('b', HEX_VERTS[0][0]);
  place('c', HEX_VERTS[2][0]);
  expect(s.turn).toBe('c'); // c places twice in a row
  expect(resTotal(s.hands.c)).toBe(0);
  const second = HEX_VERTS[16][3];
  place('c', second);
  // one card per touching producing hex
  const expected = emptyRes();
  for (const h of VERT_HEXES[second]) if (s.hexes[h] !== 'desert') expected[s.hexes[h] as (typeof RES)[number]]++;
  expect(s.hands.c).toEqual(expected);
  place('b', HEX_VERTS[18][3]);
  place('a', HEX_VERTS[12][0]);
  expect(ph(s)).toBe('roll');
  expect(s.turn).toBe('a');
  bankOk(s);
});

test('after the setup a settlement must touch your own road and keep the distance', () => {
  const g = midGame();
  const { s } = g;
  const h = 9;
  const [v0, v1, v2] = HEX_VERTS[h];
  s.buildings[v0] = { s: 0, city: false };
  s.roads[HEX_EDGES[h][0]] = 0; // v0 - v1
  give(s, 'a', { wood: 3, brick: 3, sheep: 2, grain: 2 });
  expect(() => act(g, 'a', { type: 'settle', v: v1 })).toThrow(GameError); // next to v0
  expect(() => act(g, 'a', { type: 'settle', v: v2 })).toThrow(GameError); // not on a road of mine
  act(g, 'a', { type: 'road', e: HEX_EDGES[h][1] }); // v1 - v2
  act(g, 'a', { type: 'settle', v: v2 });
  expect(s.buildings[v2]).toEqual({ s: 0, city: false });
  expect(s.hands.a).toEqual(resOf({ wood: 1, brick: 1, sheep: 1, grain: 1 }));
  bankOk(s);
});

/* ------------------------------------------------------------------ */
/* Production                                                          */
/* ------------------------------------------------------------------ */

test('production: settlements 1, cities 2, nothing under the robber', () => {
  const g = midGame();
  const { s } = g;
  s.nums = s.nums.map(() => null);
  const h = s.hexes.indexOf('ore');
  const h2 = s.hexes.indexOf('wood');
  s.nums[h] = 6;
  s.nums[h2] = 6;
  s.buildings[HEX_VERTS[h][0]] = { s: 0, city: false };
  s.buildings[HEX_VERTS[h][2]] = { s: 1, city: true };
  s.buildings[HEX_VERTS[h2][3]] = { s: 2, city: false };
  s.robber = h2;
  produce(s, 6);
  expect(s.hands.a.ore).toBe(1);
  expect(s.hands.b.ore).toBe(2);
  expect(resTotal(s.hands.c)).toBe(0); // robbed
  produce(s, 5);
  expect(s.hands.a.ore).toBe(1);
  bankOk(s);
});

test('production: a short bank pays nobody, unless only one player is owed', () => {
  const g = midGame();
  const { s } = g;
  s.nums = s.nums.map(() => null);
  const h = s.hexes.indexOf('grain');
  s.nums[h] = 8;
  s.robber = s.hexes.indexOf('desert');
  s.buildings[HEX_VERTS[h][0]] = { s: 0, city: true };
  s.buildings[HEX_VERTS[h][3]] = { s: 1, city: true };
  give(s, 'c', { grain: 16 }); // the bank keeps 3, 4 are owed
  produce(s, 8);
  expect(s.hands.a.grain).toBe(0);
  expect(s.hands.b.grain).toBe(0);
  expect(s.log.some((e) => e.t === 'short')).toBe(true);
  // only a is owed: a gets what is left
  s.buildings[HEX_VERTS[h][3]] = null;
  give(s, 'c', { grain: 2 }); // 1 left in the bank, 2 owed
  produce(s, 8);
  expect(s.hands.a.grain).toBe(1);
  expect(s.bank.grain).toBe(0);
  bankOk(s);
});

/* ------------------------------------------------------------------ */
/* The 7                                                               */
/* ------------------------------------------------------------------ */

test('a 7: everyone over 7 cards gives back half (at the same time), then the robber moves and steals', () => {
  const g = midGame(4);
  const { s } = g;
  s.phase = 'roll';
  give(s, 'a', { wood: 4, brick: 5 }); // 9 → 4
  give(s, 'b', { ore: 8 }); // 8 → 4
  give(s, 'c', { sheep: 7 }); // 7: keeps all
  s.rig = [[3, 4]];
  act(g, 'a', { type: 'roll' });
  expect(ph(s)).toBe('discard');
  expect(s.discard).toEqual({ a: 4, b: 4 });
  expect(catan.turnOf!(s).sort()).toEqual(['a', 'b']);
  expect(() => act(g, 'a', { type: 'robber', h: 0 })).toThrow(GameError);
  expect(() => act(g, 'b', { type: 'discard', cards: { ore: 3 } })).toThrow(GameError); // not enough
  expect(() => act(g, 'b', { type: 'discard', cards: { wood: 4 } })).toThrow(GameError); // not hers
  act(g, 'b', { type: 'discard', cards: { ore: 4 } });
  expect(ph(s)).toBe('discard');
  act(g, 'a', { type: 'discard', cards: { wood: 2, brick: 2 } });
  expect(ph(s)).toBe('robber');
  expect(resTotal(s.hands.a)).toBe(5);
  expect(resTotal(s.hands.b)).toBe(4);
  expect(() => act(g, 'a', { type: 'robber', h: s.robber })).toThrow(GameError); // must move
  // c is alone next to the target hex: the card is stolen at once
  const h = 0;
  s.buildings[HEX_VERTS[h][0]] = { s: 2, city: false };
  act(g, 'a', { type: 'robber', h });
  expect(s.robber).toBe(h);
  expect(resTotal(s.hands.c)).toBe(6);
  expect(resTotal(s.hands.a)).toBe(6);
  expect(ph(s)).toBe('main');
  // the stolen card is shown to the thief and the victim only
  const steal = (id: string) => view(g, id).log.find((e) => e.t === 'steal') as { r?: string };
  expect(steal('a').r).toBe('sheep');
  expect(steal('c').r).toBe('sheep');
  expect(steal('b').r).toBeUndefined();
  bankOk(s);
});

test('the robber next to two players: the roller chooses whom to steal from', () => {
  const g = midGame();
  const { s } = g;
  const h = 4;
  s.buildings[HEX_VERTS[h][0]] = { s: 1, city: false };
  s.buildings[HEX_VERTS[h][3]] = { s: 2, city: false };
  give(s, 'b', { ore: 1 });
  give(s, 'c', { wood: 2 });
  s.phase = 'robber';
  act(g, 'a', { type: 'robber', h });
  expect(ph(s)).toBe('steal');
  expect(s.victims.sort()).toEqual(['b', 'c']);
  expect(() => act(g, 'a', { type: 'steal', p: 'a' })).toThrow(GameError);
  act(g, 'a', { type: 'steal', p: 'b' });
  expect(s.hands.a.ore).toBe(1);
  expect(ph(s)).toBe('main');
});

test('discarding: the bots keep what their next build needs', () => {
  const g = midGame();
  const { s } = g;
  const v = HEX_VERTS[9][0];
  s.buildings[v] = { s: 0, city: false }; // a city is possible
  give(s, 'a', { grain: 2, ore: 3, wood: 3, sheep: 2 });
  const d = autoDiscard(s, 'a', 5);
  expect(resTotal(d)).toBe(5);
  expect(d.ore + d.grain).toBe(0);
});

/* ------------------------------------------------------------------ */
/* Development cards                                                   */
/* ------------------------------------------------------------------ */

test('development cards: not on the turn bought, one per turn, a knight before rolling, VP cards hidden', () => {
  const g = midGame();
  const { s } = g;
  s.deck = ['knight', 'knight', 'vp'];
  give(s, 'a', { sheep: 3, grain: 3, ore: 3 });
  act(g, 'a', { type: 'buy' });
  act(g, 'a', { type: 'buy' });
  act(g, 'a', { type: 'buy' });
  expect(s.devs.a.map((d) => d.k).sort()).toEqual(['knight', 'knight', 'vp']);
  expect(() => act(g, 'a', { type: 'buy' })).toThrow(GameError); // deck empty
  expect(() => act(g, 'a', { type: 'play', k: 'knight' })).toThrow('لا تُلعب البطاقة في دور شرائها');
  expect(() => act(g, 'a', { type: 'play', k: 'vp' })).toThrow(GameError);
  // the VP card counts for a, but the others don't see it
  expect(totalVp(s, 'a')).toBe(1);
  expect(view(g, 'a').me!.vp).toBe(1);
  expect(view(g, 'b').players.a.vp).toBe(0);
  expect(view(g, 'b').players.a.dev).toBe(3);
  expect(view(g, 'b').me!.devs).toEqual([]);

  act(g, 'a', { type: 'end' });
  act(g, 'b', { type: 'roll' }); // whatever comes
  s.phase = 'main';
  s.discard = {};
  act(g, 'b', { type: 'end' });
  s.turn = 'a';
  s.phase = 'roll';
  s.turnNo += 1;
  s.devPlayed = false;
  // a knight before rolling: robber, then back to rolling
  act(g, 'a', { type: 'play', k: 'knight' });
  expect(ph(s)).toBe('robber');
  expect(s.knights.a).toBe(1);
  act(g, 'a', { type: 'robber', h: 0 });
  expect(ph(s)).toBe('roll');
  s.rig = [[2, 3]];
  act(g, 'a', { type: 'roll' });
  expect(() => act(g, 'a', { type: 'play', k: 'knight' })).toThrow('بطاقة تطوير واحدة فقط في كل دور');
});

test('development cards: road building, year of plenty, monopoly', () => {
  const g = midGame();
  const { s } = g;
  const h = 9;
  s.buildings[HEX_VERTS[h][0]] = { s: 0, city: false };
  s.devs.a = [
    { k: 'roads', turn: 1 },
    { k: 'plenty', turn: 1 },
    { k: 'monopoly', turn: 1 },
  ];
  act(g, 'a', { type: 'play', k: 'roads' });
  expect(ph(s)).toBe('roads');
  act(g, 'a', { type: 'road', e: HEX_EDGES[h][0] });
  act(g, 'a', { type: 'road', e: HEX_EDGES[h][1] });
  expect(ph(s)).toBe('main');
  expect(resTotal(s.hands.a)).toBe(0); // free
  s.devPlayed = false;
  give(s, 'b', { ore: 2, wood: 1 });
  give(s, 'c', { ore: 3 });
  act(g, 'a', { type: 'play', k: 'monopoly', r: 'ore' });
  expect(s.hands.a.ore).toBe(5);
  expect(s.hands.b).toEqual(resOf({ wood: 1 }));
  expect(s.hands.c.ore).toBe(0);
  s.devPlayed = false;
  expect(() => act(g, 'a', { type: 'play', k: 'plenty', r: 'ore' })).toThrow(GameError);
  act(g, 'a', { type: 'play', k: 'plenty', r: 'brick', r2: 'brick' });
  expect(s.hands.a.brick).toBe(2);
  bankOk(s);
});

/* ------------------------------------------------------------------ */
/* Titles                                                              */
/* ------------------------------------------------------------------ */

test('longest road: 5+ continuous, a tie keeps the holder, an opponent settlement breaks it', () => {
  const g = midGame();
  const { s } = g;
  const A = 9;
  const B = 0;
  s.buildings[HEX_VERTS[A][0]] = { s: 0, city: false };
  for (let i = 0; i < 4; i++) s.roads[HEX_EDGES[A][i]] = 0;
  expect(longestRoad(s, 0)).toBe(4);
  give(s, 'a', { wood: 1, brick: 1 });
  act(g, 'a', { type: 'road', e: HEX_EDGES[A][4] });
  expect(longestRoad(s, 0)).toBe(5);
  expect(s.longest).toBe('a');
  expect(publicVp(s, 'a')).toBe(3);

  // b reaches 5 too: a keeps it
  // b: paths 1..5 around hex B (corners 1 → 0), then one more out of corner 1
  s.buildings[HEX_VERTS[B][0]] = { s: 1, city: false };
  for (let i = 1; i < 5; i++) s.roads[HEX_EDGES[B][i]] = 1;
  s.turn = 'b';
  give(s, 'b', { wood: 2, brick: 2 });
  act(g, 'b', { type: 'road', e: HEX_EDGES[B][5] });
  expect(longestRoad(s, 1)).toBe(5);
  expect(s.longest).toBe('a');
  // b goes to 6: b takes it
  const e6 = VERT_EDGES[HEX_VERTS[B][1]].find((e) => !HEX_EDGES[B].includes(e))!;
  act(g, 'b', { type: 'road', e: e6 });
  expect(longestRoad(s, 1)).toBe(6);
  expect(s.longest).toBe('b');

  // c settles in the middle of b's road (corner 2 of hex B): 2 + 4
  s.buildings[HEX_VERTS[B][2]] = { s: 2, city: false };
  expect(longestRoad(s, 1)).toBe(4);
  updateLongest(s);
  expect(s.longest).toBe('a'); // a has the single longest road (5)
  s.buildings[HEX_VERTS[A][3]] = { s: 2, city: false };
  updateLongest(s);
  expect(s.longest).toBeNull(); // nobody has 5 any more
});

test('largest army: 3 knights, then someone must play more to take it', () => {
  const g = midGame();
  const { s } = g;
  const playKnight = (id: string) => {
    s.turn = id;
    s.phase = 'main';
    s.devPlayed = false;
    s.devs[id].push({ k: 'knight', turn: 0 });
    act(g, id, { type: 'play', k: 'knight' });
    act(g, id, { type: 'robber', h: s.robber === 0 ? 1 : 0 });
  };
  playKnight('a');
  playKnight('a');
  expect(s.army).toBeNull();
  playKnight('a');
  expect(s.army).toBe('a');
  expect(publicVp(s, 'a')).toBe(2);
  for (let i = 0; i < 3; i++) playKnight('b');
  expect(s.army).toBe('a'); // a tie is not enough
  playKnight('b');
  expect(s.army).toBe('b');
});

/* ------------------------------------------------------------------ */
/* Trading                                                             */
/* ------------------------------------------------------------------ */

test('bank trade: 4:1, 3:1 with a generic harbour, 2:1 with the matching harbour', () => {
  const g = midGame();
  const { s } = g;
  s.ports = ['any', 'sheep', 'any', 'any', 'brick', 'wood', 'any', 'grain', 'ore'];
  expect(ratios(s, 0)).toEqual(resOf({ wood: 4, brick: 4, sheep: 4, grain: 4, ore: 4 }));
  give(s, 'a', { wood: 4 });
  expect(() => act(g, 'a', { type: 'bank', give: 'wood', get: 'wood' })).toThrow(GameError);
  act(g, 'a', { type: 'bank', give: 'wood', get: 'ore' });
  expect(s.hands.a).toEqual(resOf({ ore: 1 }));
  s.buildings[PORT_SLOTS[0].verts[0]] = { s: 0, city: false };
  expect(ratios(s, 0).brick).toBe(3);
  s.buildings[PORT_SLOTS[1].verts[1]] = { s: 0, city: true };
  expect(ratios(s, 0).sheep).toBe(2);
  expect(ratios(s, 0).wood).toBe(3);
  give(s, 'a', { sheep: 2 });
  act(g, 'a', { type: 'bank', give: 'sheep', get: 'grain' });
  expect(s.hands.a).toEqual(resOf({ ore: 1, grain: 1 }));
  expect(() => act(g, 'a', { type: 'bank', give: 'ore', get: 'grain' })).toThrow(GameError);
  bankOk(s);
});

test('players trade: offer, answers on every phone, the proposer picks an accepter', () => {
  const g = midGame();
  const { s } = g;
  give(s, 'a', { wood: 2 });
  give(s, 'b', { ore: 1 });
  give(s, 'c', { ore: 2 });
  expect(() => act(g, 'a', { type: 'offer', give: { wood: 3 }, want: { ore: 1 } })).toThrow(GameError);
  expect(() => act(g, 'a', { type: 'offer', give: { wood: 1 }, want: { wood: 1 } })).toThrow(GameError);
  act(g, 'a', { type: 'offer', give: { wood: 2 }, want: { ore: 1 } });
  const t = s.trade!;
  expect(catan.turnOf!(s).sort()).toEqual(['a', 'b', 'c']);
  expect(view(g, 'b').trade?.give.wood).toBe(2);
  expect(() => act(g, 'a', { type: 'accept', id: t.id, p: 'b' })).toThrow(GameError); // b hasn't accepted
  act(g, 'b', { type: 'answer', id: t.id, yes: false });
  act(g, 'c', { type: 'answer', id: t.id, yes: true });
  expect(catan.turnOf!(s)).toEqual(['a']);
  act(g, 'a', { type: 'accept', id: t.id, p: 'c' });
  expect(s.trade).toBeNull();
  expect(s.hands.a).toEqual(resOf({ ore: 1 }));
  expect(s.hands.c).toEqual(resOf({ wood: 2, ore: 1 }));
  // a player without the cards can't accept
  act(g, 'a', { type: 'offer', give: { ore: 1 }, want: { sheep: 1 } });
  expect(() => act(g, 'b', { type: 'answer', id: s.trade!.id, yes: true })).toThrow(GameError);
  // the offer ends with the turn
  act(g, 'a', { type: 'end' });
  expect(s.trade).toBeNull();
  bankOk(s);
});

test('bots accept fair offers that help them, never from someone about to win', () => {
  const g = midGame();
  const { s } = g;
  s.buildings[HEX_VERTS[9][0]] = { s: 1, city: false }; // b aims for a city
  give(s, 'b', { grain: 2, ore: 2, wood: 3 });
  const t = { id: 1, from: 'a', give: resOf({ ore: 1 }), want: resOf({ wood: 1 }), answers: {} };
  expect(wouldAccept(s, 'b', t)).toBe(true);
  expect(wouldAccept(s, 'b', { ...t, want: resOf({ grain: 1 }) })).toBe(false); // gives what it needs
  expect(wouldAccept(s, 'b', { ...t, want: resOf({ wood: 3 }) })).toBe(false); // too generous
  // a is close to the target
  for (const v of [HEX_VERTS[0][0], HEX_VERTS[2][0], HEX_VERTS[12][0], HEX_VERTS[16][0]]) s.buildings[v] = { s: 0, city: true };
  expect(publicVp(s, 'a')).toBe(8);
  expect(wouldAccept(s, 'b', t)).toBe(false);
});

/* ------------------------------------------------------------------ */
/* Winning, time-outs, leaving                                         */
/* ------------------------------------------------------------------ */

test('winning: the player whose turn it is wins on reaching the target', () => {
  const g = midGame(3, { target: 8 });
  const { s, fx } = g;
  const spots = [HEX_VERTS[0][0], HEX_VERTS[2][0], HEX_VERTS[12][0]];
  for (const v of spots) s.buildings[v] = { s: 0, city: true };
  s.buildings[HEX_VERTS[16][0]] = { s: 0, city: false }; // 7 points
  give(s, 'a', { grain: 2, ore: 3 });
  act(g, 'a', { type: 'city', v: HEX_VERTS[16][0] });
  expect(ph(s)).toBe('final');
  expect(s.final!.winner).toBe('a');
  expect(s.final!.rows.a).toEqual({ settlements: 0, cities: 4, vpCards: 0, longest: 0, army: 0, total: 8 });
  expect(fx).toContain('win:a');
});

test('winning: points reached during another turn count at the start of your own turn', () => {
  const g = midGame(3, { target: 8 });
  const { s } = g;
  for (const v of [HEX_VERTS[0][0], HEX_VERTS[2][0], HEX_VERTS[12][0], HEX_VERTS[16][0]]) s.buildings[v] = { s: 1, city: true };
  expect(ph(s)).toBe('main'); // a's turn: b doesn't win now
  act(g, 'a', { type: 'end' });
  expect(ph(s)).toBe('final');
  expect(s.final!.winner).toBe('b');
});

test('time-outs: the turn is played automatically, discards too', () => {
  const g = midGame(3, { seconds: 60 });
  const { s, ctx } = g;
  s.phase = 'roll';
  s.endsAt = ctx.now + 60000;
  s.rig = [[2, 2]];
  ctx.now += 59000;
  expect(catan.tick!(ctx, s)).toBe(false);
  ctx.now += 2000;
  expect(catan.tick!(ctx, s)).toBe(true);
  expect(s.turn).toBe('b');
  expect(ph(s)).toBe('roll');
  expect(s.log.some((e) => e.t === 'timeout' && e.p === 'a')).toBe(true);
  // a 7 with a human holding 10 cards: their discard times out too
  give(s, 'c', { wood: 10 });
  s.rig = [[3, 4]];
  act(g, 'b', { type: 'roll' });
  expect(ph(s)).toBe('discard');
  ctx.now = s.endsAt! + 1;
  catan.tick!(ctx, s);
  expect(resTotal(s.hands.c)).toBe(5);
  expect(ph(s)).toBe('robber');
  ctx.now = s.endsAt! + 1;
  catan.tick!(ctx, s); // the robber is moved and the turn ended for b
  expect(s.turn).toBe('c');
  bankOk(s);
});

test('time-outs in the setup place a settlement and a road', () => {
  const g = newGame(3, { seconds: 60 });
  const { s, ctx } = g;
  s.endsAt = ctx.now + 1;
  ctx.now += 10;
  catan.tick!(ctx, s);
  expect(s.buildings.filter(Boolean).length).toBe(1);
  expect(s.roads.filter((r) => r === 0).length).toBe(1);
  expect(s.turn).toBe('b');
});

test('leaving: pieces stay, cards go back to the bank, the turn passes; under 2 players the game ends', () => {
  const g = midGame();
  const { s, ctx } = g;
  s.buildings[HEX_VERTS[9][0]] = { s: 1, city: false };
  give(s, 'b', { ore: 3 });
  give(s, 'a', { wood: 1 });
  act(g, 'a', { type: 'offer', give: { wood: 1 }, want: { ore: 1 } });
  catan.onLeave!(ctx, s, 'b');
  expect(s.gone).toEqual(['b']);
  expect(s.buildings[HEX_VERTS[9][0]]).toEqual({ s: 1, city: false });
  expect(resTotal(s.hands.b)).toBe(0);
  expect(s.trade!.answers).toEqual({});
  bankOk(s);
  act(g, 'a', { type: 'end' });
  expect(s.turn).toBe('c'); // b is skipped
  act(g, 'c', { type: 'roll' });
  if (s.phase === 'discard' || s.phase === 'robber') s.phase = 'main';
  act(g, 'c', { type: 'end' });
  expect(s.turn).toBe('a');
  catan.onLeave!(ctx, s, 'c');
  expect(ph(s)).toBe('final');
  expect(s.final!.winner).toBe('a');
  expect(s.final!.reason).toBe('left');
});

test('leaving during the setup skips the leaver', () => {
  const g = newGame(3);
  const { s, ctx } = g;
  catan.onLeave!(ctx, s, 'a');
  expect(s.turn).toBe('b');
});

test('settings are validated', () => {
  const st: CatanSettings = { ...SETTINGS };
  catan.patchSettings!(st, { layout: 'random', target: 12, seconds: 90 });
  expect(st).toEqual({ layout: 'random', target: 12, seconds: 90 });
  catan.patchSettings!(st, { layout: 'x', target: 11, seconds: 45 });
  expect(st).toEqual({ layout: 'random', target: 12, seconds: 90 });
});

test('the view hides the others hands and development cards', () => {
  const g = midGame();
  give(g.s, 'b', { ore: 2 });
  g.s.devs.b.push({ k: 'vp', turn: 1 });
  const v = view(g, 'a');
  expect(v.players.b.cards).toBe(2);
  expect(v.players.b.dev).toBe(1);
  expect(v.me!.hand).toEqual(emptyRes());
  expect(JSON.stringify(v)).not.toContain('"vp","turn"');
  expect(view(g, 'z').me).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Full bot games                                                      */
/* ------------------------------------------------------------------ */

function botGame(n: number, layout: CatanSettings['layout'], target: CatanSettings['target'] = 10) {
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const jobs: { at: number; by: string; a: any; key: string }[] = [];
  const keys = new Set<string>();
  const ctx: any = {
    now: 0,
    fx: () => {},
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, d: number, a: any) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, a, key: k });
    },
  };
  const s = catan.start(ctx, ids, { layout, target, seconds: 0 });
  catan.botPlan!(ctx, s, ids);
  let steps = 0;
  let trades = 0;
  while (s.phase !== 'final' && steps < 30000) {
    steps++;
    jobs.sort((a, b) => a.at - b.at);
    const j = jobs.shift();
    if (!j) throw new Error(`stuck: ${s.phase} ${s.turn}`);
    ctx.now = Math.max(ctx.now, j.at);
    try {
      catan.act(ctx, s, j.by, j.a);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
      keys.delete(j.key);
    }
    if (s.log.at(-1)?.t === 'trade') trades++;
    catan.tick!(ctx, s);
    catan.botPlan!(ctx, s, ids);
    // invariants
    for (const id of s.order) for (const r of RES) expect(s.hands[id][r]).toBeGreaterThanOrEqual(0);
  }
  return { s, steps, trades };
}

test('full bot games reach the end with 3 and 4 players', () => {
  let trades = 0;
  for (const [n, layout] of [
    [3, 'random'],
    [4, 'random'],
    [3, 'beginner'],
    [4, 'beginner'],
    [4, 'random'],
    [3, 'random'],
  ] as const) {
    const { s, trades: t } = botGame(n, layout);
    trades += t;
    expect(ph(s)).toBe('final');
    const w = s.final!.winner!;
    expect(s.order).toContain(w);
    expect(s.final!.rows[w].total).toBeGreaterThanOrEqual(10);
    for (const id of s.order) {
      const r = s.final!.rows[id];
      expect(r.settlements).toBeLessThanOrEqual(5);
      expect(r.cities).toBeLessThanOrEqual(4);
      expect(s.roads.filter((x) => x === s.order.indexOf(id)).length).toBeLessThanOrEqual(15);
      expect(r.total).toBe(r.settlements + 2 * r.cities + r.vpCards + r.longest + r.army);
      if (id !== w) expect(r.total).toBeLessThan(12);
    }
    // distance rule held all game
    s.buildings.forEach((b, v) => {
      if (!b) return;
      for (const e of VERT_EDGES[v]) for (const u of EDGES[e]) if (u !== v) expect(s.buildings[u]).toBeNull();
    });
    bankOk(s);
  }
  expect(trades).toBeGreaterThan(0); // the bots do trade with each other
});

test('a bot game with a target of 8 ends sooner', () => {
  const { s } = botGame(3, 'random', 8);
  expect(ph(s)).toBe('final');
  expect(s.final!.rows[s.final!.winner!].total).toBeGreaterThanOrEqual(8);
});
