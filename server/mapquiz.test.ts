/** «أين المكان؟» — content, map, distance, scoring, round flow, bots, leaving, a full bot game. */
import { expect, test } from 'bun:test';

import {
  MAPQUIZ_REGIONS,
  distanceKm,
  inRegion,
  mapProject,
  mapUnproject,
  mapquizPoints,
  regionBox,
  type MapquizRegion,
  type MapquizSettings,
  type MapquizView,
} from '../src/shared/games/mapquiz';
import { MAP_H, MAP_LAT_MAX, MAP_LAT_MIN, MAP_LON_MAX, MAP_LON_MIN, MAP_PATH, MAP_W } from '../src/shared/mapquiz-map';
import { BOT_ERROR_KM, botGuess, mapquiz, mapquizPool, MAPQUIZ_REVEAL_MS, sanitizeMapquiz, type MapquizState } from './games/mapquiz';
import { MAP_PLACES } from './mapquiz-content';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}

function fakeCtx(bots: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; keys: Set<string>; fxs: typeof fxs; offline: Set<string> } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    keys,
    fxs,
    offline,
  };
  return ctx;
}

const SETTINGS: MapquizSettings = { rounds: 5, seconds: 20, region: 'all', level: 'medium' };
const view = (ctx: GameCtx, s: MapquizState, me: string) => mapquiz.view(ctx, s, me) as MapquizView;
const guess = (ctx: GameCtx, s: MapquizState, by: string, lat: number, lon: number) => mapquiz.act(ctx, s, by, { type: 'guess', lat, lon });
const REGIONS = Object.keys(MAPQUIZ_REGIONS) as MapquizRegion[];

/* ------------------------------------------------------------------ */
/* Content and map                                                     */
/* ------------------------------------------------------------------ */

test('content: 50+ places, unique ids and names, a fact each, real-looking coordinates', () => {
  expect(MAP_PLACES.length).toBeGreaterThanOrEqual(50);
  expect(new Set(MAP_PLACES.map((p) => p.id)).size).toBe(MAP_PLACES.length);
  expect(new Set(MAP_PLACES.map((p) => p.name)).size).toBe(MAP_PLACES.length);
  for (const p of MAP_PLACES) {
    expect(p.fact.length, p.id).toBeGreaterThan(15);
    expect(p.fact.length, p.id).toBeLessThan(110);
    expect(Number.isFinite(p.lat) && Number.isFinite(p.lon), p.id).toBe(true);
  }
});

test('content: every place falls inside the whole map, and no two places are confusingly close', () => {
  for (const p of MAP_PLACES) {
    expect(inRegion('all', p, 0.5), p.id).toBe(true);
    expect(p.lon > MAP_LON_MIN && p.lon < MAP_LON_MAX && p.lat > MAP_LAT_MIN && p.lat < MAP_LAT_MAX, p.id).toBe(true);
  }
  for (let i = 0; i < MAP_PLACES.length; i++) {
    for (let j = i + 1; j < MAP_PLACES.length; j++) {
      const a = MAP_PLACES[i];
      const b = MAP_PLACES[j];
      expect(distanceKm(a, b), `${a.id} ~ ${b.id}`).toBeGreaterThan(40);
    }
  }
});

test('content: spot checks of well-known coordinates', () => {
  const at = (id: string) => MAP_PLACES.find((p) => p.id === id)!;
  // Makkah–Madinah is about 340 km in a straight line, Fes–Marrakesh about 390, Bukhara–Samarkand about 220
  expect(distanceKm(at('makkah'), at('madinah'))).toBeGreaterThan(320);
  expect(distanceKm(at('makkah'), at('madinah'))).toBeLessThan(360);
  expect(distanceKm(at('fes'), at('marrakesh'))).toBeGreaterThan(360);
  expect(distanceKm(at('fes'), at('marrakesh'))).toBeLessThan(420);
  expect(distanceKm(at('bukhara'), at('samarkand'))).toBeGreaterThan(200);
  expect(distanceKm(at('bukhara'), at('samarkand'))).toBeLessThan(240);
  expect(at('zanzibar').lat).toBeLessThan(0);
});

test('regions: each has enough places, inside its box', () => {
  for (const r of REGIONS) {
    const pool = mapquizPool(r);
    expect(pool.length, r).toBeGreaterThanOrEqual(r === 'all' ? 50 : 15);
    for (const p of pool) expect(inRegion(r, p), `${r}: ${p.id}`).toBe(true);
    const [x, y, w, h] = regionBox(r);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(x + w).toBeLessThanOrEqual(MAP_W);
    expect(y + h).toBeLessThanOrEqual(MAP_H);
  }
  expect(mapquizPool('maghreb').some((p) => p.id === 'fes')).toBe(true);
  expect(mapquizPool('maghreb').some((p) => p.id === 'makkah')).toBe(false);
  expect(mapquizPool('mashriq').some((p) => p.id === 'makkah')).toBe(true);
});

test('map: a compact SVG path, within the map size, with land under the places', () => {
  expect(MAP_PATH.length).toBeGreaterThan(5000);
  expect(MAP_PATH.length).toBeLessThan(60_000);
  expect(MAP_PATH).toMatch(/^M\d+ \d+l/);
  expect(MAP_PATH).toMatch(/^[Mlz0-9 -]+$/);
  // walk the path: every point inside the map
  const rings: [number, number][][] = [];
  for (const part of MAP_PATH.split('z').filter(Boolean)) {
    const m = part.match(/^M(-?\d+) (-?\d+)l(.*)$/);
    expect(m).not.toBeNull();
    let x = Number(m![1]);
    let y = Number(m![2]);
    const ring: [number, number][] = [[x, y]];
    const nums = (m![3].match(/-?\d+/g) ?? []).map(Number);
    expect(nums.length % 2).toBe(0);
    for (let i = 0; i < nums.length; i += 2) {
      x += nums[i];
      y += nums[i + 1];
      ring.push([x, y]);
    }
    for (const [px, py] of ring) {
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(MAP_W);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(MAP_H);
    }
    rings.push(ring);
  }
  expect(rings.length).toBeGreaterThan(50);
  // even-odd point-in-polygon: inland cities sit on land, open sea does not
  const onLand = (lon: number, lat: number) => {
    const [px, py] = mapProject(lon, lat);
    let inside = false;
    for (const r of rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  };
  for (const id of ['makkah', 'madinah', 'baghdad', 'cairo', 'fes', 'samarkand', 'timbuktu', 'delhi', 'isfahan', 'cordoba', 'kano', 'riyadh']) {
    const p = MAP_PLACES.find((q) => q.id === id)!;
    expect(onLand(p.lon, p.lat), id).toBe(true);
  }
  expect(onLand(18, 34)).toBe(false); // the Mediterranean
  expect(onLand(65, 15)).toBe(false); // the Arabian Sea
  expect(onLand(-30 + 15, 30)).toBe(false); // the Atlantic
});

/* ------------------------------------------------------------------ */
/* Distance and scoring                                                */
/* ------------------------------------------------------------------ */

test('distance: great-circle km', () => {
  expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  expect(distanceKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  expect(distanceKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111.19, 1);
  // a degree of longitude shrinks with latitude
  expect(distanceKm({ lat: 60, lon: 0 }, { lat: 60, lon: 1 })).toBeCloseTo(55.6, 0);
  // symmetric
  const a = { lat: 21.42, lon: 39.83 };
  const b = { lat: 34.06, lon: -4.97 };
  expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 6);
  expect(distanceKm(a, b)).toBeGreaterThan(4400);
  expect(distanceKm(a, b)).toBeLessThan(4800);
});

test('projection: unproject undoes project', () => {
  for (const [lon, lat] of [
    [-20, 55],
    [39.8, 21.4],
    [80, -8],
  ]) {
    const [x, y] = mapProject(lon, lat);
    const p = mapUnproject(x, y);
    expect(p.lon).toBeCloseTo(lon, 9);
    expect(p.lat).toBeCloseTo(lat, 9);
  }
});

test('scoring: 1000 on the spot, falling with distance, tighter on regional maps', () => {
  expect(mapquizPoints(0, 'all')).toBe(1000);
  expect(mapquizPoints(25, 'all')).toBe(1000);
  let last = 1000;
  for (const km of [50, 100, 250, 500, 1000, 2000, 5000]) {
    const p = mapquizPoints(km, 'all');
    expect(p).toBeLessThan(last);
    expect(p).toBeGreaterThanOrEqual(0);
    last = p;
  }
  expect(mapquizPoints(100, 'all')).toBeGreaterThan(850);
  expect(mapquizPoints(500, 'all')).toBeGreaterThan(450);
  expect(mapquizPoints(500, 'all')).toBeLessThan(550);
  expect(mapquizPoints(300, 'maghreb')).toBeLessThan(mapquizPoints(300, 'all'));
});

test('settings: sanitize and patch clamp everything', () => {
  expect(sanitizeMapquiz({ rounds: 1 } as never)).toEqual({ rounds: 3, seconds: 20, region: 'all', level: 'medium' });
  const st = sanitizeMapquiz({});
  mapquiz.patchSettings!(st, { rounds: 50, seconds: 3, region: 'maghreb', level: 'easy' });
  expect(st).toEqual({ rounds: 20, seconds: 10, region: 'maghreb', level: 'easy' });
  mapquiz.patchSettings!(st, { region: 'moon', level: 9, seconds: 33 });
  expect(st.region).toBe('maghreb');
  expect(st.level).toBe('easy');
  expect(st.seconds).toBe(35);
});

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

test('a round: the answer stays hidden, distances and points on reveal, then the next place', () => {
  const ctx = fakeCtx();
  const s = mapquiz.start(ctx, ['a', 'b', 'c'], SETTINGS) as MapquizState;
  const place = s.places[0];
  let v = view(ctx, s, 'a');
  expect(v.answer).toBeNull();
  expect(v.name).toBe(place.name);
  expect(JSON.stringify(v)).not.toContain(place.fact);
  expect(mapquiz.turnOf!(s)).toEqual(['a', 'b', 'c']);

  mapquiz.act(ctx, s, 'a', { type: 'guess', lat: 'x', lon: 3 });
  expect(s.guesses.a).toBeUndefined();
  guess(ctx, s, 'a', place.lat, place.lon); // spot on
  guess(ctx, s, 'a', 0, 0); // can't move after confirming
  expect(s.guesses.a.lat).toBe(place.lat);
  guess(ctx, s, 'b', place.lat + 5, place.lon); // ~556 km north (kept inside the map)
  expect(view(ctx, s, 'b').mine).not.toBeNull();
  expect(view(ctx, s, 'b').guessed.sort()).toEqual(['a', 'b']);
  expect(s.phase).toBe('play');
  guess(ctx, s, 'c', 89, 170); // outside the map: kept on its edge
  expect(s.guesses.c.lat).toBe(MAPQUIZ_REGIONS.all.latMax);
  expect(s.guesses.c.lon).toBe(MAPQUIZ_REGIONS.all.lonMax);
  expect(s.phase).toBe('reveal');

  v = view(ctx, s, 'a');
  expect(v.answer).toEqual({ lat: place.lat, lon: place.lon, fact: place.fact });
  const r = Object.fromEntries(v.results!.map((x) => [x.id, x]));
  expect(r.a.km).toBe(0);
  expect(r.a.points).toBe(1000);
  const bKm = Math.round(distanceKm(s.guesses.b, place));
  expect(r.b.km).toBe(bKm);
  expect(r.b.points).toBe(mapquizPoints(bKm, 'all'));
  expect(r.c.points).toBeLessThan(r.b.points);
  expect(s.scores.a).toBe(1000);

  mapquiz.act(ctx, s, 'b', { type: 'next' });
  expect(s.round).toBe(1);
  expect(s.phase).toBe('play');
  ctx.now = s.endsAt! + 1;
  mapquiz.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  expect(s.results!.every((x) => x.guess === null && x.km === null && x.points === 0)).toBe(true);
  ctx.now += MAPQUIZ_REVEAL_MS;
  mapquiz.tick!(ctx, s);
  expect(s.round).toBe(2);
  while (s.phase !== 'final') {
    ctx.now = s.endsAt! + 1;
    mapquiz.tick!(ctx, s);
  }
  expect(ctx.fxs.at(-1)).toEqual(['win', 'a']);
});

test('a region game only asks places of that region and keeps pins inside it', () => {
  const ctx = fakeCtx();
  const s = mapquiz.start(ctx, ['a'], { ...SETTINGS, region: 'maghreb', rounds: 20 }) as MapquizState;
  expect(s.places.length).toBe(Math.min(20, mapquizPool('maghreb').length));
  expect(s.places.every((p) => inRegion('maghreb', p))).toBe(true);
  expect(new Set(s.places).size).toBe(s.places.length);
  guess(ctx, s, 'a', 21.4, 39.8); // Makkah is off this map
  expect(inRegion('maghreb', s.results![0].guess!)).toBe(true);
});

test('leaving: the round ends when the rest have answered; the last one out ends the game', () => {
  const ctx = fakeCtx();
  const s = mapquiz.start(ctx, ['a', 'b', 'c'], SETTINGS) as MapquizState;
  guess(ctx, s, 'a', 30, 30);
  mapquiz.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('play');
  ctx.offline.add('c');
  mapquiz.onLeave!(ctx, s, 'zz'); // not a player: nothing happens
  expect(s.phase).toBe('play');
  mapquiz.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.results!.map((r) => r.id)).toEqual(['a']);
  mapquiz.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: pins land near the place, closer on harder levels', () => {
  const place = MAP_PLACES.find((p) => p.id === 'baghdad')!;
  const mean = (level: 'easy' | 'medium' | 'hard') => {
    let sum = 0;
    for (let i = 0; i < 1500; i++) sum += distanceKm(botGuess(place, level, 'all'), place);
    return sum / 1500;
  };
  const e = mean('easy');
  const m = mean('medium');
  const h = mean('hard');
  expect(h).toBeLessThan(m);
  expect(m).toBeLessThan(e);
  // half-normal: the mean miss is about 0.8 × the typical error
  expect(h).toBeGreaterThan(BOT_ERROR_KM.hard * 0.6);
  expect(h).toBeLessThan(BOT_ERROR_KM.hard * 1.0);
  for (let i = 0; i < 200; i++) expect(inRegion('maghreb', botGuess(MAP_PLACES.find((p) => p.id === 'tangier')!, 'easy', 'maghreb'))).toBe(true);
});

function runBotGame(ids: string[], humans: string[] = [], settings = SETTINGS) {
  const bots = ids.filter((i) => !humans.includes(i));
  const ctx = fakeCtx(bots);
  const s = mapquiz.start(ctx, ids, settings) as MapquizState;
  const plan = () => mapquiz.botPlan!(ctx, s, bots);
  plan();
  const phases = new Set<string>();
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 100_000) {
    ctx.now += 250;
    let changed = mapquiz.tick!(ctx, s);
    for (const j of ctx.jobs.filter((x) => x.at <= ctx.now)) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        mapquiz.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
      changed = true;
    }
    if (changed) plan();
    phases.add(s.phase);
  }
  return { s, ctx, phases };
}

test('a full bot game reaches the final screen (1, 3, 8 and 12 players; every region and level)', () => {
  for (const [n, region, level] of [
    [1, 'all', 'easy'],
    [3, 'maghreb', 'medium'],
    [8, 'mashriq', 'hard'],
    [12, 'all', 'medium'],
  ] as const) {
    const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
    const { s, ctx, phases } = runBotGame(ids, [], { ...SETTINGS, region, level, rounds: 6 });
    expect(s.phase).toBe('final');
    expect(phases.has('reveal')).toBe(true);
    expect(s.round).toBe(5);
    expect(Object.values(s.scores).every((x) => x > 0)).toBe(true);
    expect(ctx.fxs.filter(([k]) => k === 'win')).toHaveLength(1);
    expect(view(ctx, s, 'bot0').answer).not.toBeNull();
  }
});

test('with a person who never taps, the clock moves the game on', () => {
  const { s } = runBotGame(['me', 'bot1'], ['me']);
  expect(s.phase).toBe('final');
  expect(s.scores.me).toBe(0);
  expect(s.scores.bot1).toBeGreaterThan(0);
});
