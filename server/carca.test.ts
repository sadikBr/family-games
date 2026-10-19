/** «المدن والطرق»: the tile set, edge matching, followers, scoring, end of game, discards, bots, leaving. */
import { expect, test } from 'bun:test';

import type { CarcaSettings, CarcaView } from '../src/shared/games/carca';
import {
  FOLLOWERS,
  START_TILE,
  TILES,
  TILE_TYPES,
  TOTAL_TILES,
  edgeAt,
  facingPort,
  fieldCities,
  fits,
  groupOf,
  legalRotations,
  legalSpots,
  localEdge,
  makeBoard,
  makePile,
  rotatePoint,
} from '../src/shared/carca-tiles';
import { carca, followerOptions, type CarcaState } from './games/carca';
import { planMove } from './carca-bot';

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

const SETTINGS: CarcaSettings = { farmers: true, seconds: 0, level: 2 };

/** A game in a chosen position: `board` replaces the board, `tile` is drawn by `turn`. */
function setup(players = ['a', 'b'], opts: Partial<CarcaSettings> = {}) {
  const f = fakeCtx();
  const s = carca.start(f.ctx, players, { ...SETTINGS, ...opts });
  s.order = players.slice();
  s.pile = ['B', 'B', 'B', 'B'];
  s.colors = Object.fromEntries(players.map((p, i) => [p, i]));
  const at = (turn: string, tile: string, board?: { x: number; y: number; t: string; r: number }[]) => {
    if (board) s.board = board.map((b) => ({ ...b }));
    s.turn = turn;
    s.tile = tile;
    s.step = 'place';
    if (!s.pile.length) s.pile = ['B', 'B'];
  };
  return { ...f, s, at };
}

const D0 = { x: 0, y: 0, t: 'D', r: 0 };
const place = (ctx: any, s: CarcaState, by: string, x: number, y: number, r: number) => carca.act(ctx, s, by, { type: 'place', x, y, r });
const follower = (ctx: any, s: CarcaState, by: string, f: number | null) => carca.act(ctx, s, by, { type: 'follower', f });

/* ------------------------------------------------------------------ */
/* Tiles                                                               */
/* ------------------------------------------------------------------ */

test('tile set: 72 tiles in 24 types with the official counts', () => {
  expect(TILE_TYPES.length).toBe(24);
  expect(TILE_TYPES.map((t) => t.id).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWX');
  const total = TILE_TYPES.reduce((n, t) => n + t.count, 0);
  expect(total).toBe(TOTAL_TILES);
  const count = Object.fromEntries(TILE_TYPES.map((t) => [t.id, t.count]));
  expect(count).toEqual({ A: 2, B: 4, C: 1, D: 4, E: 5, F: 2, G: 1, H: 3, I: 2, J: 3, K: 3, L: 3, M: 2, N: 3, O: 2, P: 3, Q: 1, R: 3, S: 2, T: 1, U: 8, V: 9, W: 4, X: 1 });
  const where = (pred: (t: (typeof TILE_TYPES)[number]) => boolean) => TILE_TYPES.filter(pred).reduce((n, t) => n + t.count, 0);
  const has = (t: (typeof TILE_TYPES)[number], k: string) => t.feats.some((f) => f.k === k);
  expect(where((t) => has(t, 'monastery') && !has(t, 'road'))).toBe(4);
  expect(where((t) => has(t, 'monastery') && has(t, 'road'))).toBe(2);
  expect(where((t) => t.feats.some((f) => f.pennant))).toBe(10); // C 1, F 2, M 2, O 2, Q 1, S 2
  expect(TILES.C.feats).toEqual([expect.objectContaining({ k: 'city', pennant: true, ports: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] })]);
  // 8 straight roads, 9 curves
  const edges = (id: string) => [0, 1, 2, 3].map((d) => localEdge(id, d)).join('');
  expect(TILE_TYPES.filter((t) => edges(t.id) === 'RFRF').map((t) => t.id)).toEqual(['U']);
  expect(TILE_TYPES.filter((t) => edges(t.id) === 'FFRR').map((t) => t.id)).toEqual(['V']);
  // the pile: 71 tiles, one D fewer (the start tile)
  const pile = makePile();
  expect(pile.length).toBe(71);
  expect(START_TILE).toBe('D');
  expect(pile.filter((t) => t === 'D').length).toBe(3);
});

test('tile set: the edges of every type (north, east, south, west)', () => {
  const expected: Record<string, string> = {
    A: 'FFRF', B: 'FFFF', C: 'CCCC', D: 'CRFR', E: 'CFFF', F: 'FCFC', G: 'FCFC', H: 'CFCF', I: 'CFFC', J: 'CRRF', K: 'CFRR', L: 'CRRR',
    M: 'CFFC', N: 'CFFC', O: 'CRRC', P: 'CRRC', Q: 'CCFC', R: 'CCFC', S: 'CCRC', T: 'CCRC', U: 'RFRF', V: 'FFRR', W: 'FRRR', X: 'RRRR',
  };
  for (const t of TILE_TYPES) expect([0, 1, 2, 3].map((d) => localEdge(t.id, d)).join('')).toBe(expected[t.id]);
});

test('tile set: every tile’s features are consistent', () => {
  for (const t of TILE_TYPES) {
    const owner = new Array(12).fill(-1);
    t.feats.forEach((f, i) => {
      if (f.k === 'monastery') expect(f.ports).toEqual([]);
      for (const p of f.ports) {
        expect(owner[p]).toBe(-1); // each port belongs to exactly one feature
        owner[p] = i;
      }
      if (f.k === 'road') for (const p of f.ports) expect(p % 3).toBe(1); // roads leave by the middle of a side
      if (f.k === 'city') for (const p of f.ports) for (const q of [0, 1, 2]) expect(f.ports).toContain(Math.floor(p / 3) * 3 + q); // whole sides
      if (f.k === 'field') {
        for (const c of f.cities ?? []) expect(t.feats[c].k).toBe('city');
      } else expect(f.cities).toBeUndefined();
      if (f.pennant) expect(f.k).toBe('city');
      expect(f.spot[0]).toBeGreaterThan(0);
      expect(f.spot[0]).toBeLessThan(100);
      expect(f.spot[1]).toBeGreaterThan(0);
      expect(f.spot[1]).toBeLessThan(100);
    });
    expect(owner.every((o) => o >= 0)).toBe(true); // all 12 ports covered
    // a road side has fields on both sides of the road
    for (let d = 0; d < 4; d++) {
      const e = localEdge(t.id, d);
      const ks = [0, 1, 2].map((k) => t.feats[owner[d * 3 + k]].k);
      if (e === 'C') expect(ks).toEqual(['city', 'city', 'city']);
      if (e === 'R') expect(ks).toEqual(['field', 'road', 'field']);
      if (e === 'F') expect(ks).toEqual(['field', 'field', 'field']);
    }
    // every city touches at least one field unless the tile is all city; every city-side field lists that city
    t.feats.forEach((f, i) => {
      if (f.k !== 'city' || f.ports.length === 12) return;
      expect(t.feats.some((g) => g.k === 'field' && g.cities?.includes(i))).toBe(true);
    });
  }
  // fields cut off from the city by a road do not touch it
  expect(TILES.D.feats[3].cities).toEqual([]);
  expect(TILES.J.feats[2].cities).toEqual([]);
  expect(TILES.H.feats[2].cities).toEqual([0, 1]);
});

test('geometry: rotations, facing ports and edge matching', () => {
  expect(facingPort(0)).toBe(8);
  expect(facingPort(1)).toBe(7);
  expect(facingPort(4)).toBe(10);
  expect(facingPort(11)).toBe(3);
  for (let p = 0; p < 12; p++) expect(facingPort(facingPort(p))).toBe(p);
  // D turned once: the city faces east, the road runs north–south
  expect([0, 1, 2, 3].map((d) => edgeAt('D', 1, d)).join('')).toBe('RCRF');
  expect([0, 1, 2, 3].map((d) => edgeAt('D', 2, d)).join('')).toBe('FRCR');
  expect(rotatePoint([50, 10], 1)).toEqual([90, 50]);
  expect(rotatePoint([50, 10], 2)).toEqual([50, 90]);
  expect(rotatePoint([50, 10], 4)).toEqual([50, 10]);

  const board = makeBoard([D0]);
  // a city cap above the start tile must face south
  expect(legalRotations(board, 'E', 0, -1)).toEqual([2]);
  expect(fits(board, 'E', 0, -1, 0)).toBe(false);
  // not on top of a tile, not away from the board
  expect(fits(board, 'B', 0, 0, 0)).toBe(false);
  expect(fits(board, 'B', 3, 3, 0)).toBe(false);
  // a monastery fits only below the start tile (field side)
  expect(legalSpots(board, 'B').map((s) => `${s.x},${s.y}`)).toEqual(['0,1']);
  // a straight road continues the start road to the east and west
  const u = legalSpots(board, 'U');
  expect(u.find((s) => s.x === 1 && s.y === 0)?.rs).toEqual([1, 3]);
  expect(u.find((s) => s.x === 0 && s.y === 1)?.rs).toEqual([1, 3]); // below: only turned so a field faces up
  // two neighbours must both match
  const b2 = makeBoard([D0, { x: 1, y: 0, t: 'U', r: 1 }]);
  expect(fits(b2, 'E', 1, -1, 2)).toBe(false); // (1,-1) touches U's north field: no city facing down
  expect(legalRotations(b2, 'E', 1, -1)).toEqual([0, 1, 3]);
  // (0,1) touches the start tile's field only; (1,1) touches U's south field only
  expect(legalRotations(b2, 'E', 1, 1)).toEqual([1, 2, 3]);
});

test('geometry: features join across tiles, open sides and completion', () => {
  const board = makeBoard([D0, { x: 0, y: -1, t: 'E', r: 2 }]);
  const city = groupOf(board, 0, 0, 0);
  expect(city.kind).toBe('city');
  expect(city.tiles).toBe(2);
  expect(city.complete).toBe(true);
  const road = groupOf(board, 0, 0, 1);
  expect(road.open).toBe(2);
  expect(road.complete).toBe(false);
  // the field above the road touches the city; the one below does not
  expect(fieldCities(board, groupOf(board, 0, 0, 2))).toEqual([{ id: city.id, complete: true }]);
  expect(fieldCities(board, groupOf(board, 0, 0, 3))).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Followers                                                           */
/* ------------------------------------------------------------------ */

test('followers: only on features of the new tile whose connected feature is free', () => {
  const { ctx, s, at } = setup();
  at('a', 'F', [D0]);
  s.followers = [{ owner: 'b', x: 0, y: 0, f: 0 }]; // b's knight in the start city
  place(ctx, s, 'a', 0, -1, 1); // F turned: city north–south, joins the start city
  expect(s.step).toBe('follower');
  // the city is taken; both fields are free
  expect(s.options).toEqual([1, 2]);
  expect(() => follower(ctx, s, 'a', 0)).toThrow('لا يمكن وضع تابع هنا');
  follower(ctx, s, 'a', 1);
  expect(s.followers).toContainEqual({ owner: 'a', x: 0, y: -1, f: 1 });
  expect(s.supply.a).toBe(FOLLOWERS - 1);
  expect(s.turn).toBe('b');
});

test('followers: farmers off removes fields; no followers left skips the step', () => {
  const { ctx, s, at } = setup(['a', 'b'], { farmers: false });
  at('a', 'B', [D0]);
  expect(followerOptions(s, 0, 0)).toEqual([0, 1]);
  place(ctx, s, 'a', 0, 1, 0);
  expect(s.options).toEqual([0]); // the monastery only
  follower(ctx, s, 'a', null);
  s.supply.b = 0;
  at('b', 'U');
  place(ctx, s, 'b', 1, 0, 1);
  expect(s.step).toBe('place'); // straight to the next turn
  expect(s.turn).toBe('a');
});

test('turns: errors for the wrong player or a bad spot', () => {
  const { ctx, s, at } = setup();
  at('a', 'E', [D0]);
  expect(() => place(ctx, s, 'b', 0, -1, 2)).toThrow('ليس دورك');
  expect(() => place(ctx, s, 'a', 0, -1, 0)).toThrow();
  expect(() => follower(ctx, s, 'a', null)).toThrow();
  carca.act(ctx, s, 'a', { type: 'preview', x: 0, y: -1, r: 2 });
  expect((carca.view(ctx, s, 'b') as CarcaView).preview).toEqual({ x: 0, y: -1, r: 2 });
  place(ctx, s, 'a', 0, -1, 2);
  expect(s.preview).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Scoring during the game                                             */
/* ------------------------------------------------------------------ */

test('scoring: a completed road scores 1 per tile and the follower comes back', () => {
  const { ctx, s, at } = setup();
  at('a', 'X', [D0, { x: -1, y: 0, t: 'A', r: 3 }]); // the road ends at the monastery on the west
  s.followers = [{ owner: 'a', x: 0, y: 0, f: 1 }];
  s.supply.a = 6;
  place(ctx, s, 'a', 1, 0, 0); // and at the crossroads on the east
  follower(ctx, s, 'a', null);
  expect(s.scores.a).toBe(3);
  expect(s.breakdown.a.road).toBe(3);
  expect(s.followers).toEqual([]);
  expect(s.supply.a).toBe(7);
  expect(s.log.at(-1)).toMatchObject({ kind: 'road', pts: 3, who: ['a'], end: false });
});

test('scoring: a 2-tile city scores 4; a follower put on the completing tile scores at once', () => {
  const { ctx, s, at } = setup();
  at('b', 'E', [D0]);
  place(ctx, s, 'b', 0, -1, 2);
  expect(s.options).toContain(0);
  follower(ctx, s, 'b', 0);
  expect(s.scores.b).toBe(4);
  expect(s.breakdown.b.city).toBe(4);
  expect(s.supply.b).toBe(7);
  expect(s.followers).toEqual([]);
  // the view says which follower went home (it was never on the board in any view)
  const v = carca.view(ctx, s, 'a') as CarcaView;
  expect(v.returned).toEqual({ n: 1, followers: [{ owner: 'b', x: 0, y: -1, f: 0 }] });
});

test('scoring: pennants add 2 each in a completed city', () => {
  const { ctx, s, at } = setup();
  at('a', 'F', [D0]);
  s.followers = [{ owner: 'a', x: 0, y: 0, f: 0 }];
  place(ctx, s, 'a', 0, -1, 1); // city goes on north (pennant)
  follower(ctx, s, 'a', null);
  expect(s.scores.a).toBe(0);
  at('b', 'E');
  place(ctx, s, 'b', 0, -2, 2); // closes it
  follower(ctx, s, 'b', null);
  expect(s.scores.a).toBe(2 * 3 + 2);
  expect(s.scores.b).toBe(0);
});

test('scoring: ties all score full points; the majority takes it alone', () => {
  // a (start city) and b (an upside-down D two rows up) join through a pennant city
  const board = [D0, { x: 0, y: -2, t: 'D', r: 2 }];
  {
    const { ctx, s, at } = setup();
    at('a', 'F', board);
    s.followers = [{ owner: 'a', x: 0, y: 0, f: 0 }, { owner: 'b', x: 0, y: -2, f: 0 }];
    place(ctx, s, 'a', 0, -1, 1);
    follower(ctx, s, 'a', null);
    expect(s.scores).toEqual({ a: 8, b: 8 });
    expect(s.log.at(-1)).toMatchObject({ kind: 'city', pts: 8, who: ['a', 'b'] });
    expect(s.supply).toEqual({ a: 8, b: 8 }); // both came back (supply was 7 + the hand-placed ones)
  }
  {
    // b has two knights (in the upside-down D, and in a cap to the east), a one: a three-sided city joins all
    const { ctx, s, at } = setup(['a', 'b', 'c']);
    at('c', 'R', [...board, { x: 1, y: -1, t: 'E', r: 3 }]);
    s.followers = [
      { owner: 'a', x: 0, y: 0, f: 0 },
      { owner: 'b', x: 0, y: -2, f: 0 },
      { owner: 'b', x: 1, y: -1, f: 0 },
    ];
    expect(legalRotations(makeBoard(s.board), 'R', 0, -1)).toEqual([1]);
    place(ctx, s, 'c', 0, -1, 1);
    follower(ctx, s, 'c', null);
    expect(s.scores).toEqual({ a: 0, b: 8, c: 0 });
    expect(s.followers).toEqual([]);
  }
});

test('scoring: a monastery surrounded by 8 tiles scores 9', () => {
  const { ctx, s, at } = setup();
  const around = [
    [-1, 0], [1, 0], [-1, 1], [1, 1], [-1, 2], [1, 2],
  ].map(([x, y]) => ({ x, y, t: 'B', r: 0 }));
  at('b', 'B', [D0, { x: 0, y: 1, t: 'B', r: 0 }, ...around]);
  s.followers = [{ owner: 'a', x: 0, y: 1, f: 0 }];
  place(ctx, s, 'b', 0, 2, 0);
  follower(ctx, s, 'b', null);
  expect(s.scores.a).toBe(9);
  expect(s.breakdown.a.monastery).toBe(9);
  expect(s.followers).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* End of game                                                         */
/* ------------------------------------------------------------------ */

test('end of game: unfinished features, monasteries and farms (3 per completed city)', () => {
  const { ctx, s, fx, at } = setup(['a', 'b', 'c']);
  // the start city closed by E above; a pennant city to the east left open
  at('a', 'B', [D0, { x: 0, y: -1, t: 'E', r: 2 }, { x: 1, y: 0, t: 'U', r: 1 }, { x: 3, y: 3, t: 'F', r: 0 }]);
  s.followers = [
    { owner: 'a', x: 0, y: 0, f: 2 }, // farmer under the start city
    { owner: 'b', x: 0, y: -1, f: 1 }, // farmer above the start city
    { owner: 'c', x: 0, y: 0, f: 1 }, // thief on the start road (2 tiles, open)
    { owner: 'b', x: 3, y: 3, f: 0 }, // knight in an open pennant city (1 tile + 1 pennant)
  ];
  s.pile = [];
  place(ctx, s, 'a', 0, 1, 0); // the last tile: a monastery below the start tile
  expect(s.options).toContain(0);
  follower(ctx, s, 'a', 0); // a monk on the last tile
  expect(s.phase).toBe('final');
  // monastery at (0,1): neighbours (0,0) and (1,0) → 1 + 2
  expect(s.breakdown.a.monastery).toBe(3);
  expect(s.breakdown.a.farm).toBe(3);
  expect(s.breakdown.b.farm).toBe(3);
  expect(s.breakdown.b.city).toBe(2);
  expect(s.breakdown.c.road).toBe(2);
  expect(s.scores).toEqual({ a: 6, b: 5, c: 2 });
  expect(s.final?.winners).toEqual(['a']);
  expect(fx.at(-1)).toEqual({ kind: 'win', target: 'a' });
  expect(s.log.filter((e) => e.end).length).toBe(5);
  const v = carca.view(ctx, s, 'a') as CarcaView;
  expect(v.step).toBeNull();
  expect(v.tile).toBeNull();
});

test('end of game: farmers score per field for the majority; a field with no completed city scores 0', () => {
  // two completed 2-tile cities side by side; one field below them, one above
  const { ctx, s, at } = setup(['a', 'b'], {});
  at('a', 'B', [
    { x: 0, y: 0, t: 'E', r: 0 },
    { x: 0, y: -1, t: 'E', r: 2 },
    { x: 1, y: 0, t: 'E', r: 0 },
    { x: 1, y: -1, t: 'E', r: 2 },
  ]);
  s.followers = [
    { owner: 'a', x: 0, y: 0, f: 1 },
    { owner: 'a', x: 1, y: 0, f: 1 },
    { owner: 'b', x: 0, y: -1, f: 1 }, // the field above the caps: also touches both cities
  ];
  s.pile = [];
  place(ctx, s, 'a', 0, 1, 0);
  follower(ctx, s, 'a', null);
  // a's field (below) touches the two completed cities: 6; b's field (above) too: 6
  expect(s.breakdown.a.farm).toBe(6);
  expect(s.breakdown.b.farm).toBe(6);
  expect(s.final?.winners).toEqual(['a', 'b']);
});

test('end of game: farmers off scores no farms', () => {
  const { ctx, s, at } = setup(['a', 'b'], { farmers: false });
  at('a', 'B', [D0, { x: 0, y: -1, t: 'E', r: 2 }]);
  s.followers = [{ owner: 'b', x: 0, y: 0, f: 2 }];
  s.pile = [];
  place(ctx, s, 'a', 0, 1, 0);
  follower(ctx, s, 'a', null);
  expect(s.phase).toBe('final');
  expect(s.breakdown.b.farm).toBe(0);
});

/* ------------------------------------------------------------------ */
/* Discards, time-outs, leaving                                        */
/* ------------------------------------------------------------------ */

test('a drawn tile that fits nowhere is discarded and another drawn; the game ends if none fits', () => {
  const { ctx, s, at } = setup();
  at('a', 'B', [{ x: 0, y: 0, t: 'U', r: 0 }]);
  s.pile = ['U', 'C']; // C (all city) fits nowhere next to a road and fields
  place(ctx, s, 'a', 1, 0, 0);
  follower(ctx, s, 'a', null);
  expect(s.log.at(-1)).toMatchObject({ kind: 'discard', t: 'C' });
  expect(s.tile).toBe('U');
  expect(s.turn).toBe('b');
  expect(s.pile).toEqual([]);

  const g = setup();
  g.at('a', 'B', [{ x: 0, y: 0, t: 'U', r: 0 }]);
  g.s.pile = ['C', 'C'];
  place(g.ctx, g.s, 'a', 1, 0, 0);
  follower(g.ctx, g.s, 'a', null);
  expect(g.s.phase).toBe('final');
  expect(g.s.log.filter((e) => e.kind === 'discard').length).toBe(2);
});

test('time-out: the tile goes in a legal spot without a follower', () => {
  const { ctx, s, at } = setup(['a', 'b'], { seconds: 45 });
  at('a', 'E', [D0]);
  s.endsAt = ctx.now + 45000;
  ctx.now += 46000;
  expect(carca.tick!(ctx, s)).toBe(true);
  expect(s.board.length).toBe(2);
  expect(s.followers).toEqual([]);
  expect(s.turn).toBe('b');
  expect(s.step).toBe('place');
  expect(s.endsAt).toBe(ctx.now + 45000);
  // follower step time-out
  place(ctx, s, 'b', ...(() => {
    const sp = legalSpots(makeBoard(s.board), s.tile!)[0];
    return [sp.x, sp.y, sp.rs[0]] as [number, number, number];
  })());
  if (s.step === 'follower') {
    ctx.now = s.endsAt! + 1;
    carca.tick!(ctx, s);
    expect(s.turn).toBe('a');
  }
});

test('leaving: out of the turn order, tile back in the pile, followers stay but score for nobody', () => {
  const { ctx, s, fx, at } = setup(['a', 'b', 'c']);
  at('b', 'E', [D0]);
  const pile = s.pile.length;
  s.followers = [{ owner: 'b', x: 0, y: 0, f: 0 }];
  carca.onLeave!(ctx, s, 'b');
  expect(s.order).toEqual(['a', 'c']);
  expect(s.turn).toBe('c');
  expect(s.pile.length).toBe(pile); // E went back, c drew one
  expect(s.followers.length).toBe(1);
  // the city completes: b's knight has the majority, but b is gone
  at('c', 'E');
  place(ctx, s, 'c', 0, -1, 2);
  follower(ctx, s, 'c', null);
  expect(s.scores).toEqual({ a: 0, b: 0, c: 0 });
  expect(s.log.at(-1)).toMatchObject({ kind: 'city', pts: 4, who: [] });
  // down to one player: the game ends
  carca.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('final');
  expect(s.final).toEqual({ winners: ['a'], left: ['b', 'c'] });
  expect(fx.at(-1)).toEqual({ kind: 'win', target: 'a' });
});

test('leaving during the follower step finishes the turn', () => {
  const { ctx, s, at } = setup(['a', 'b', 'c']);
  at('a', 'E', [D0]);
  place(ctx, s, 'a', 0, -1, 2);
  expect(s.step).toBe('follower');
  carca.onLeave!(ctx, s, 'a');
  expect(s.turn).toBe('b');
  expect(s.step).toBe('place');
  expect(s.board.length).toBe(2);
});

test('a bot taking over in the follower step goes on without a follower', () => {
  const { ctx, s, sched, at } = setup();
  at('a', 'E', [D0]);
  place(ctx, s, 'a', 0, -1, 2);
  expect(s.step).toBe('follower');
  carca.botPlan!(ctx, s, ['a']);
  expect(sched.at(-1)?.a).toMatchObject({ type: 'follower', f: null });
  carca.act(ctx, s, 'a', sched.at(-1)!.a);
  expect(s.turn).toBe('b');
});

test('settings are validated', () => {
  const st: CarcaSettings = { ...SETTINGS };
  carca.patchSettings!(st, { farmers: false, seconds: 60, level: 1 });
  expect(st).toEqual({ farmers: false, seconds: 60, level: 1 });
  carca.patchSettings!(st, { farmers: 'yes', seconds: 50, level: 3 });
  expect(st).toEqual({ farmers: false, seconds: 60, level: 1 });
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bot: completes its own city and takes the points', () => {
  const m = planMove({ board: [D0], followers: [{ owner: 'a', x: 0, y: 0, f: 0 }], tile: 'E', me: 'a', order: ['a', 'b'], tilesLeft: 50, supply: 6, farmers: true, level: 2, withFollower: true });
  expect(m).toMatchObject({ x: 0, y: -1, r: 2 });
  // and doesn't complete an opponent's city when it can go elsewhere usefully
  const n = planMove({ board: [D0], followers: [{ owner: 'b', x: 0, y: 0, f: 0 }], tile: 'E', me: 'a', order: ['a', 'b'], tilesLeft: 50, supply: 6, farmers: true, level: 2, withFollower: true });
  expect(n).not.toBeNull();
  expect(n!.x === 0 && n!.y === -1).toBe(false);
});

test('bot: grabs a free city early', () => {
  const m = planMove({ board: [D0], followers: [], tile: 'E', me: 'a', order: ['a', 'b'], tilesLeft: 60, supply: 7, farmers: true, level: 2, withFollower: true });
  expect(m).not.toBeNull();
  expect(m!.f).not.toBeNull();
});

function playOut(players: string[], level: 1 | 2, farmers = true) {
  const { ctx, sched } = fakeCtx();
  const s = carca.start(ctx, players, { farmers, seconds: 0, level });
  for (let i = 0; i < 1000 && s.phase === 'play'; i++) {
    sched.length = 0;
    carca.botPlan!(ctx, s, players);
    const job = sched.shift();
    if (!job) throw new Error('bot did not move');
    ctx.now += job.delay;
    carca.act(ctx, s, job.by, job.a);
  }
  return s;
}

test('bots: full games reach the final screen (2 strong bots, 5 easy bots, 3 without farmers)', () => {
  for (const [players, level, farmers] of [[['a', 'b'], 2, true], [['a', 'b', 'c', 'd', 'e'], 1, true], [['a', 'b', 'c'], 2, false]] as const) {
    const s = playOut([...players], level, farmers);
    expect(s.phase).toBe('final');
    // every tile was either placed or discarded
    expect(s.board.length + s.discarded).toBe(TOTAL_TILES);
    expect(s.pile).toEqual([]);
    // every tile on the board matches its neighbours
    const board = makeBoard(s.board);
    for (const p of s.board) {
      for (let d = 0; d < 4; d++) {
        const nb = board.get(`${p.x + [0, 1, 0, -1][d]},${p.y + [-1, 0, 1, 0][d]}`);
        if (nb) expect(edgeAt(p.t, p.r, d)).toBe(edgeAt(nb.t, nb.r, (d + 2) % 4));
      }
    }
    for (const id of players) {
      const b = s.breakdown[id];
      expect(b.road + b.city + b.monastery + b.farm).toBe(s.scores[id]);
      expect(s.supply[id] + s.followers.filter((f) => f.owner === id).length).toBe(FOLLOWERS);
      if (!farmers) expect(b.farm).toBe(0);
    }
    const total = Object.values(s.scores).reduce((t, v) => t + v, 0);
    expect(total).toBeGreaterThan(20);
    expect(s.final?.winners.length).toBeGreaterThan(0);
  }
}, 120000);
