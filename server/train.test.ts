/** «قطار المغرب» — the board, the rules, hidden information, leaving and whole games of bots. */
import { expect, test } from 'bun:test';

import { emptyHand, joined, longestPath, payOptions, payWith, routeOpen, type TrainView } from '../src/shared/games/train';
import { TRAIN_LAND, TRAIN_MOROCCO } from '../src/shared/train-outline';
import { BOARD_H, BOARD_W, CITIES, CITY, RAIL_DIST, ROUTES, TICKETS, routeSlots, type TrainRoute } from '../src/shared/train-map';
import type { BotLevel } from '../src/shared/protocol';
import { botDecide, cheapest, plan } from './train-bots';
import { botSee, sanitizeTrain, train } from './games/train';
import { places, type State } from './train-rules';
import { GameError } from './types';

function fakeCtx(level: BotLevel = 'expert') {
  const said: string[] = [];
  const fx: string[] = [];
  const ctx: any = {
    now: 1000,
    fx: (k: string) => fx.push(k),
    say: (t: string) => said.push(t),
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => ({ a: 'سارة', b: 'أحمد', c: 'Bob', d: 'ليلى', e: 'يوسف' })[id as 'a'] ?? id,
    memo: new Map(),
    bot: () => {},
    botLevel: () => level,
  };
  return { ctx, said, fx };
}

/** a seeded random (mulberry32) */
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

function newGame(n = 3, seed = 1, level: BotLevel = 'expert') {
  const g = fakeCtx(level);
  const ids = ['a', 'b', 'c', 'd', 'e'].slice(0, n);
  const s: State = train.start(g.ctx, ids, { wagons: 40, seconds: 0 });
  s.rnd = seeded(seed);
  return { ...g, s, ids };
}
const act = (g: { ctx: any; s: State }, by: string, a: Record<string, unknown> & { type: string }) => train.act(g.ctx, g.s, by, a);
const view = (g: { ctx: any; s: State }, me: string) => train.view(g.ctx, g.s, me) as TrainView;

/** everyone keeps their first two tickets: the first turn */
function started(n = 3, seed = 1) {
  const g = newGame(n, seed);
  for (const id of g.s.order) act(g, id, { type: 'keep', ids: g.s.offer[id].slice(0, 2) });
  return g;
}

const route = (a: string, b: string): TrainRoute => ROUTES.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a))!;

/* ------------------------------------------------------------------ */
/* The board                                                           */
/* ------------------------------------------------------------------ */

test('the board: 36 cities, 60–80 routes of 1–6 in the 8 colours and grey, all joined', () => {
  expect(CITIES.length).toBe(36);
  expect(new Set(CITIES.map((c) => c.id)).size).toBe(36);
  expect(ROUTES.length).toBeGreaterThanOrEqual(60);
  expect(ROUTES.length).toBeLessThanOrEqual(80);
  for (const r of ROUTES) {
    expect(CITY[r.a]).toBeDefined();
    expect(CITY[r.b]).toBeDefined();
    expect(r.len).toBeGreaterThanOrEqual(1);
    expect(r.len).toBeLessThanOrEqual(6);
    if (r.twin !== undefined) expect(ROUTES[r.twin].twin).toBe(r.id);
  }
  const colours = new Set(ROUTES.map((r) => r.color));
  expect(colours.size).toBe(9);
  expect(ROUTES.filter((r) => r.twin !== undefined).length).toBeGreaterThanOrEqual(10);
  // every city reachable from Tangier, the Sahara included
  for (const c of CITIES) expect(joined(ROUTES, 'tng', c.id)).toBe(true);
  for (const c of CITIES) {
    expect(c.x).toBeGreaterThan(0);
    expect(c.x).toBeLessThan(BOARD_W);
    expect(c.y).toBeGreaterThan(0);
    expect(c.y).toBeLessThan(BOARD_H);
  }
});

test('the drawn wagons: each slot between its cities, never squashed or stretched too much', () => {
  for (const r of ROUTES) {
    const sl = routeSlots(r);
    expect(sl.length).toBe(r.len);
    for (const x of sl) {
      expect(x.len).toBeGreaterThan(24);
      expect(x.len).toBeLessThan(100);
    }
  }
});

test('Morocco is one shape with its Sahara: no line between them in the outline data', () => {
  // the outline is filled (the app draws the coast as a halo under the fill), so it has no inner border path
  expect(TRAIN_MOROCCO.length).toBeGreaterThan(500);
  expect(TRAIN_LAND.length).toBeGreaterThan(500);
  // Dakhla, Laayoune and Lagouira are on the same land as Tangier and Fes (inside the same rings)
  const rings: [number, number][][] = [];
  for (const m of TRAIN_MOROCCO.matchAll(/M(-?\d+) (-?\d+)l([^z]*)z/g)) {
    let x = Number(m[1]);
    let y = Number(m[2]);
    const ring: [number, number][] = [[x, y]];
    const nums = (m[3].match(/-?\d+/g) ?? []).map(Number);
    for (let i = 0; i < nums.length; i += 2) ring.push([(x += nums[i]), (y += nums[i + 1])]);
    rings.push(ring);
  }
  // the rings overlap a little (drawn with the non-zero rule): inside any of them is on the land
  const inRing = (ring: [number, number][], px: number, py: number) => {
    let n = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) n++;
    }
    return n % 2 === 1;
  };
  const inside = (px: number, py: number) => rings.some((r) => inRing(r, px, py));
  for (const c of CITIES) expect(inside(c.x, c.y)).toBe(true);
});

test('tickets: 40–45, values 5–22 from the shortest rail distance, long Sahara crossings among them', () => {
  expect(TICKETS.length).toBeGreaterThanOrEqual(40);
  expect(TICKETS.length).toBeLessThanOrEqual(45);
  for (const t of TICKETS) {
    expect(t.value).toBeGreaterThanOrEqual(5);
    expect(t.value).toBeLessThanOrEqual(22);
    expect(RAIL_DIST[t.a][t.b]).toBeLessThan(Infinity);
  }
  const tngDkh = TICKETS.find((t) => t.a === 'tng' && t.b === 'dkh')!;
  expect(tngDkh.value).toBe(22);
  expect(new Set(TICKETS.map((t) => `${t.a}-${t.b}`)).size).toBe(TICKETS.length);
});

/* ------------------------------------------------------------------ */
/* Rule helpers                                                        */
/* ------------------------------------------------------------------ */

test('paying: the route colour with locomotives filling in; grey takes any one colour', () => {
  const r = route('cas', 'mrk'); // 5, orange (twin green)
  const h = { ...emptyHand(), orange: 3, loco: 2, red: 5 };
  expect(payWith(h, r, 'orange')).toEqual({ color: 'orange', n: 3, locos: 2 });
  expect(payWith(h, r, 'red')).toBeNull();
  expect(payWith(h, r, 'loco')).toBeNull();
  const grey = route('ouj', 'taz'); // 3 grey
  const opts = payOptions({ ...emptyHand(), red: 3, blue: 2, loco: 1 }, grey);
  expect(opts.map((o) => o.color)).toEqual(['red', 'blue']);
  expect(opts[1]).toEqual({ color: 'blue', n: 2, locos: 1 });
  expect(payOptions({ ...emptyHand(), loco: 3 }, grey)).toEqual([{ color: 'loco', n: 0, locos: 3 }]);
});

test('double routes: one lane with 2–3 players; both with 4–5, never both by one player', () => {
  const r = route('rab', 'cas');
  const twin = ROUTES[r.twin!];
  const owners = ROUTES.map(() => null as string | null);
  owners[r.id] = 'a';
  expect(routeOpen(owners, twin, 'b', false)).toBe(false);
  expect(routeOpen(owners, twin, 'b', true)).toBe(true);
  expect(routeOpen(owners, twin, 'a', true)).toBe(false);
});

test('the longest path uses each route once and may pass a city twice', () => {
  const rs = [route('rab', 'cas'), route('cas', 'khu'), route('khu', 'rab'), route('rab', 'mek')];
  // rab-cas 2 + cas-khu 2 + khu-rab 3 + rab-mek 3 = 10 (a loop back through Rabat)
  expect(longestPath(rs)).toBe(10);
  expect(longestPath([])).toBe(0);
});

/* ------------------------------------------------------------------ */
/* Turns                                                               */
/* ------------------------------------------------------------------ */

test('the start: 4 cards, 40 wagons, 3 tickets offered, keep at least 2; then the first turn', () => {
  const g = newGame(3);
  for (const id of g.ids) {
    expect(Object.values(g.s.hands[id]).reduce((a, b) => a + b, 0)).toBe(4);
    expect(g.s.wagons[id]).toBe(40);
    expect(g.s.offer[id].length).toBe(3);
  }
  expect(g.s.faceUp.filter(Boolean).length).toBe(5);
  const [a, b, c] = g.s.order;
  expect(() => act(g, a, { type: 'keep', ids: [g.s.offer[a][0]] })).toThrow(GameError);
  expect(() => act(g, a, { type: 'deck' })).toThrow(GameError);
  act(g, a, { type: 'keep', ids: g.s.offer[a].slice() });
  act(g, b, { type: 'keep', ids: g.s.offer[b].slice(0, 2) });
  expect(g.s.phase).toBe('pick');
  act(g, c, { type: 'keep', ids: g.s.offer[c].slice(1) });
  expect(g.s.phase).toBe('play');
  expect(g.s.turn).toBe(a);
  expect(g.s.tickets[a].length).toBe(3);
  expect(g.s.tickets[b].length).toBe(2);
  // returned tickets go under the pile
  expect(g.s.ticketDeck.length).toBe(TICKETS.length - 7);
});

test('drawing: two cards; a face-up locomotive is the whole turn and never the second card', () => {
  const g = started(3);
  const [a, b] = g.s.order;
  g.s.faceUp = ['red', 'loco', 'blue', 'green', 'white'];
  act(g, a, { type: 'face', i: 0 });
  expect(g.s.turn).toBe(a);
  expect(g.s.step).toBe('second');
  g.s.faceUp[1] = 'loco';
  expect(() => act(g, a, { type: 'face', i: 1 })).toThrow(GameError);
  act(g, a, { type: 'deck' });
  expect(g.s.turn).toBe(b);
  expect(g.said.at(-1)).toContain('أحمر مكشوف');
  expect(g.said.at(-1)).toContain('من الكومة');
  g.s.faceUp = ['red', 'loco', 'blue', 'green', 'white'];
  const before = g.s.hands[b].loco;
  act(g, b, { type: 'face', i: 1 });
  expect(g.s.hands[b].loco).toBe(before + 1);
  expect(g.s.turn).not.toBe(b);
});

test('three face-up locomotives: the row is discarded and dealt again', () => {
  const g = started(3);
  const [a] = g.s.order;
  g.s.faceUp = ['loco', 'loco', 'red', 'blue', 'green'];
  g.s.deck.push('loco'); // the next card
  act(g, a, { type: 'face', i: 2 });
  expect(g.s.faceUp.filter((c) => c === 'loco').length).toBeLessThan(3);
  expect(g.s.discard.length).toBeGreaterThanOrEqual(5);
});

test('claiming: cards paid, wagons and points; owned and closed lanes refused', () => {
  const g = started(3);
  const [a, b] = g.s.order;
  const r = route('cas', 'mrk'); // 5 orange
  g.s.hands[a] = { ...emptyHand(), orange: 4, loco: 2 };
  act(g, a, { type: 'claim', route: r.id, color: 'orange' });
  expect(g.s.owners[r.id]).toBe(a);
  expect(g.s.wagons[a]).toBe(35);
  expect(g.s.points[a]).toBe(10);
  expect(g.s.hands[a]).toEqual({ ...emptyHand(), loco: 1 });
  expect(g.said.at(-1)).toContain('+10');
  // 3 players: the twin lane is closed
  g.s.hands[b] = { ...emptyHand(), green: 5 };
  expect(() => act(g, b, { type: 'claim', route: r.twin!, color: 'green' })).toThrow(GameError);
  // not enough cards
  const short = route('ouj', 'fig');
  expect(() => act(g, b, { type: 'claim', route: short.id, color: 'blue' })).toThrow(GameError);
  expect(g.s.turn).toBe(b);
});

test('drawing tickets: three offered, keep at least one, the rest under the pile', () => {
  const g = started(2);
  const [a, b] = g.s.order;
  const pile = g.s.ticketDeck.length;
  act(g, a, { type: 'tickets' });
  expect(g.s.step).toBe('tickets');
  expect(g.s.offer[a].length).toBe(3);
  expect(() => act(g, a, { type: 'keep', ids: [] })).toThrow(GameError);
  const pick = g.s.offer[a][2];
  act(g, a, { type: 'keep', ids: [pick] });
  expect(g.s.tickets[a]).toContain(pick);
  expect(g.s.ticketDeck.length).toBe(pile - 1);
  expect(g.s.turn).toBe(b);
});

test('the last round: two wagons or fewer, then one more turn for everyone, then the scores', () => {
  const g = started(3);
  const [a, b, c] = g.s.order;
  g.s.wagons[a] = 4;
  const r = route('ken', 'mek'); // 2 orange
  g.s.hands[a] = { ...emptyHand(), orange: 2 };
  act(g, a, { type: 'claim', route: r.id, color: 'orange' });
  expect(g.s.lastRound?.left).toEqual([b, c, a]);
  expect(g.said.at(-1)).toContain('الجولة الأخيرة');
  act(g, b, { type: 'deck' });
  act(g, b, { type: 'deck' });
  act(g, c, { type: 'deck' });
  act(g, c, { type: 'deck' });
  expect(g.s.phase).toBe('play');
  act(g, a, { type: 'deck' });
  act(g, a, { type: 'deck' });
  expect(g.s.phase).toBe('final');
  const f = g.s.final!;
  for (const id of [a, b, c]) {
    const row = f.rows[id];
    expect(row.total).toBe(row.routes + row.ticketPlus - row.ticketMinus + row.bonus);
  }
  // the only player with a route has the longest path
  expect(f.rows[a].bonus).toBe(10);
  expect(f.rows[a].longest).toBe(2);
  expect(train.result!(g.s)!.places.flat().sort()).toEqual([a, b, c].sort());
});

test('tickets count at the end: completed add, failed subtract', () => {
  const g = started(2);
  const [a, b] = g.s.order;
  const t = TICKETS.find((x) => x.a === 'ken' && x.b === 'jad')!; // 5: ken-rab-cas-jad
  g.s.tickets[a] = [t.id];
  g.s.tickets[b] = [t.id];
  for (const r of [route('ken', 'rab'), route('rab', 'cas'), route('cas', 'jad')]) g.s.owners[r.id] = a;
  g.s.points[a] = 1 + 2 + 2;
  g.s.wagons[a] = 2;
  act(g, a, { type: 'deck' });
  act(g, a, { type: 'deck' });
  act(g, b, { type: 'deck' });
  act(g, b, { type: 'deck' });
  act(g, a, { type: 'deck' });
  act(g, a, { type: 'deck' });
  const f = g.s.final!;
  expect(f.rows[a].ticketPlus).toBe(5);
  expect(f.rows[b].ticketMinus).toBe(5);
  expect(f.rows[a].total).toBe(5 + 5 + 10);
  expect(f.rows[b].total).toBe(-5);
  expect(f.winners).toEqual([a]);
  expect(places(g.s)).toEqual([[a], [b]]);
});

/* ------------------------------------------------------------------ */
/* Hidden information                                                  */
/* ------------------------------------------------------------------ */

test('views: my hand and tickets only; others are counts; the deck and ticket pile never sent', () => {
  const g = newGame(3);
  const [a, b] = g.s.order;
  const va = view(g, a);
  expect(va.me!.offer).toEqual(g.s.offer[a]);
  const json = JSON.stringify(va);
  // b's offered tickets are nowhere in a's view (only counts)
  expect(va.players[b].tickets).toBe(0);
  expect(va.players[b].cards).toBe(4);
  expect(json).not.toContain('"hands"');
  expect(json).not.toContain('ticketDeck":[');
  expect(typeof va.deck).toBe('number');
  for (const id of g.s.order) act(g, id, { type: 'keep', ids: g.s.offer[id].slice(0, 2) });
  const v = view(g, a);
  expect(v.me!.tickets.map((t) => t.id)).toEqual(g.s.tickets[a]);
  expect(Object.keys(v).sort()).toEqual(['deck', 'discard', 'doubles', 'endsAt', 'faceUp', 'final', 'game', 'last', 'lastRound', 'me', 'order', 'owners', 'phase', 'players', 'seq', 'step', 'ticketDeck', 'total', 'turn', 'turnNo'].sort());
  for (const p of Object.values(v.players)) expect(Object.keys(p).sort()).toEqual(['cards', 'gone', 'picking', 'points', 'seat', 'tickets', 'wagons']);
  // a spectator gets no private part
  expect(view(g, 'zz').me).toBeNull();
  // a card drawn from the deck is announced without its colour
  act(g, a, { type: 'deck' });
  act(g, a, { type: 'deck' });
  expect(g.said.at(-1)).toBe('بطاقتان من الكومة لسارة'.replace('سارة', g.ctx.playerName(a).replace(/^ال/, '')));
  expect(view(g, b).last).toEqual({ seq: g.s.seq, by: a, kind: 'draw', took: ['deck', 'deck'] });
});

test('bots see only their own phone: other hands and tickets are not in what they get', () => {
  const g = started(3);
  const [a, b] = g.s.order;
  const see = botSee(g.s, a, 'expert');
  const json = JSON.stringify(see);
  expect(see.hand).toEqual(g.s.hands[a]);
  expect(see.tickets).toEqual(g.s.tickets[a]);
  expect(Object.keys(see.others[0]).sort()).toEqual(['id', 'points', 'wagons']);
  expect(json).not.toContain(JSON.stringify(g.s.hands[b]));
  expect(typeof see.deck).toBe('number');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bot paths: own routes are free and rivals routes are walls', () => {
  const g = started(2);
  const [a, b] = g.s.order;
  const see = botSee(g.s, a, 'expert');
  const p = cheapest(see, 'tng', 'ttn', new Set())!;
  expect(p.cost).toBe(2);
  g.s.owners[route('tng', 'ttn').id] = b;
  // 2 players: the twin lane is closed too, the way round is longer
  const p2 = cheapest(botSee(g.s, a, 'expert'), 'tng', 'ttn', new Set())!;
  expect(p2.cost).toBeGreaterThan(2);
  g.s.tickets[a] = [TICKETS.find((t) => t.a === 'ken' && t.b === 'jad')!.id];
  const pl = plan(botSee(g.s, a, 'expert'));
  expect(pl.wagons).toBe(5);
});

test('a bot claims a planned route it can pay for, and keeps tickets that fit', () => {
  const g = started(2);
  const [a] = g.s.order;
  g.s.tickets[a] = [TICKETS.find((t) => t.a === 'ken' && t.b === 'jad')!.id];
  g.s.hands[a] = { ...emptyHand(), white: 2, black: 0 };
  const m = botDecide(botSee(g.s, a, 'expert'));
  expect(m.type).toBe('claim');
  if (m.type === 'claim') expect([route('cas', 'jad').id, route('cas', 'jad').twin]).toContain(m.route);
});

function runGame(n: number, level: BotLevel, seed: number) {
  const g = newGame(n, seed, level);
  let guard = 0;
  while (g.s.phase !== 'final' && guard++ < 3000) {
    const ids = train.turnOf!(g.s);
    for (const id of ids) {
      const m = botDecide(botSee(g.s, id, level));
      act(g, id, m as any);
    }
  }
  return { g, turns: g.s.turnNo, guard };
}

test('whole games of bots end with scores, at every strength and size', () => {
  const stats: string[] = [];
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    for (const n of [2, 3, 4, 5]) {
      const { g, turns, guard } = runGame(n, level, n * 7 + level.length);
      expect(guard).toBeLessThan(3000);
      expect(g.s.phase).toBe('final');
      const f = g.s.final!;
      const done = g.s.order.map((id) => f.rows[id].tickets.filter((t) => t.done).length);
      const all = g.s.order.map((id) => f.rows[id].tickets.length);
      stats.push(`${level} ${n}p: ${turns} turns, totals ${g.s.order.map((id) => f.rows[id].total).join('/')}, tickets ${done.join('/')} of ${all.join('/')}`);
      // cards are conserved: hands + deck + discard + face-up = 110
      const inHands = g.s.order.reduce((s, id) => s + Object.values(g.s.hands[id]).reduce((x, y) => x + y, 0), 0);
      const onBoard = ROUTES.filter((r) => g.s.owners[r.id]).reduce((s, r) => s + r.len, 0);
      expect(inHands + g.s.deck.length + g.s.discard.length + g.s.faceUp.filter(Boolean).length).toBe(110);
      expect(onBoard).toBe(g.s.order.reduce((s, id) => s + 40 - g.s.wagons[id], 0));
    }
  }
  console.log(stats.join('\n'));
});

test('experts beat easy bots most of the time', () => {
  let wins = 0;
  const games = 16;
  for (let k = 0; k < games; k++) {
    const g = newGame(2, 100 + k, 'expert');
    let guard = 0;
    while (g.s.phase !== 'final' && guard++ < 3000) {
      for (const id of train.turnOf!(g.s)) act(g, id, botDecide(botSee(g.s, id, id === g.s.order[k % 2] ? 'expert' : 'easy')) as any);
    }
    if (g.s.final!.winners.includes(g.s.order[k % 2])) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(9);
});

/* ------------------------------------------------------------------ */
/* Leaving, timers, settings                                           */
/* ------------------------------------------------------------------ */

test('leaving: the turn moves on, cards go back; a lone player ends the game', () => {
  const g = started(3);
  const [a, b, c] = g.s.order;
  train.onLeave!(g.ctx, g.s, a);
  expect(g.s.turn).toBe(b);
  expect(Object.values(g.s.hands[a]).every((n) => n === 0)).toBe(true);
  train.onLeave!(g.ctx, g.s, c);
  expect(g.s.phase).toBe('final');
  expect(train.result!(g.s)!.places).toEqual([[b]]);
});

test('leaving while choosing the first tickets starts the game when the others are done', () => {
  const g = newGame(3);
  const [a, b, c] = g.s.order;
  act(g, a, { type: 'keep', ids: g.s.offer[a].slice(0, 2) });
  act(g, b, { type: 'keep', ids: g.s.offer[b].slice(0, 2) });
  train.onLeave!(g.ctx, g.s, c);
  expect(g.s.phase).toBe('play');
});

test('a timed-out turn draws cards for the player; settings are sanitised', () => {
  const g = fakeCtx();
  const s: State = train.start(g.ctx, ['a', 'b'], { wagons: 99, seconds: 60 } as any);
  expect(s.settings).toEqual({ wagons: 40, seconds: 60 });
  g.ctx.now = s.endsAt! + 1;
  train.tick!(g.ctx, s);
  expect(s.phase).toBe('play');
  const who = s.turn;
  const cards = Object.values(s.hands[who]).reduce((x, y) => x + y, 0);
  g.ctx.now = s.endsAt! + 1;
  train.tick!(g.ctx, s);
  expect(s.turn).not.toBe(who);
  expect(Object.values(s.hands[who]).reduce((x, y) => x + y, 0)).toBeGreaterThan(cards);
  const st = { wagons: 40, seconds: 0 };
  train.patchSettings!(st, { wagons: 30, seconds: 90 });
  expect(st).toEqual({ wagons: 30, seconds: 90 });
  train.patchSettings!(st, { wagons: 31, seconds: 'x' });
  expect(st).toEqual({ wagons: 30, seconds: 90 });
  expect(sanitizeTrain(undefined)).toEqual({ wagons: 40, seconds: 0 });
});
