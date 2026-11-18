/** «أين تقع؟» — content, maps (Morocco whole with its Sahara), distance, scoring, flow, timeouts, no leaks, bots, leaving, settings. */
import { expect, test } from 'bun:test';

import { AYNA_BORDERS, AYNA_GEO, AYNA_LAND, AYNA_MOROCCO, type AynaMapKey } from '../src/shared/ayna-map';
import { AYNA_DEFAULTS, AYNA_MAPS, aynaKm, aynaPoints, aynaProject, aynaUnproject, inMap, type AynaSettings, type AynaView } from '../src/shared/games/ayna';
import { AYNA_PLACES } from './ayna-content';
import { AYNA_REVEAL_MS, BOT_MISS, ayna, aynaPool, botDelay, botPin, sanitizeAyna, type AynaState } from './games/ayna';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}

function fakeCtx(bots: string[] = [], level: 'easy' | 'smart' | 'expert' = 'expert') {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const said: string[] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; keys: Set<string>; fxs: typeof fxs; offline: Set<string>; said: string[] } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    memo: new Map(),
    botLevel: () => level,
    say: (text, _by, voice) => said.push(`${text}|${voice ?? ''}`),
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
    said,
  };
  return ctx;
}

const MAPS = Object.keys(AYNA_MAPS) as AynaMapKey[];
const SETTINGS: AynaSettings = { rounds: 8, seconds: 20, map: 'mixed' };
const view = (ctx: GameCtx, s: AynaState, me: string) => ayna.view(ctx, s, me) as AynaView;
const pin = (ctx: GameCtx, s: AynaState, by: string, lat: number, lon: number) => ayna.act(ctx, s, by, { type: 'pin', lat, lon });
const confirm = (ctx: GameCtx, s: AynaState, by: string, lat?: number, lon?: number) => ayna.act(ctx, s, by, { type: 'confirm', lat, lon });

/* ------------------------------------------------------------------ */
/* Map paths: decode and point-in-polygon                              */
/* ------------------------------------------------------------------ */

type Pt = [number, number];

/** "M x y l dx dy … [z]" pieces → absolute point lists */
function decode(path: string): Pt[][] {
  const out: Pt[][] = [];
  for (const part of path.split('M').filter(Boolean)) {
    const m = part.replace(/z$/, '').match(/^(-?\d+) (-?\d+)l(.*)$/);
    expect(m).not.toBeNull();
    let x = Number(m![1]);
    let y = Number(m![2]);
    const pts: Pt[] = [[x, y]];
    const nums = (m![3].match(/-?\d+/g) ?? []).map(Number);
    expect(nums.length % 2).toBe(0);
    for (let i = 0; i < nums.length; i += 2) {
      x += nums[i];
      y += nums[i + 1];
      pts.push([x, y]);
    }
    out.push(pts);
  }
  return out;
}

/** inside one ring (even-odd) */
function inRing(r: Pt[], [px, py]: Pt): boolean {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** inside the union of the rings (the paths are filled «nonzero»: touching countries add up) */
const inside = (rings: Pt[][], p: Pt) => rings.some((r) => inRing(r, p));

/** distance (map units) from a point to the nearest edge of the rings */
function edgeDist(rings: Pt[][], [px, py]: Pt): number {
  let best = Infinity;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j];
      const [bx, by] = r[i];
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
      best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
    }
  }
  return best;
}

const LAND = Object.fromEntries(MAPS.map((m) => [m, decode(AYNA_LAND[m])])) as Record<AynaMapKey, Pt[][]>;
const MOROCCO = Object.fromEntries(MAPS.map((m) => [m, decode(AYNA_MOROCCO[m])])) as Record<AynaMapKey, Pt[][]>;
/** km per map unit, roughly, near a point (for tolerances) */
const kmPerUnit = (map: AynaMapKey, lat: number) => {
  const [x0, y0] = aynaProject(map, 0, lat);
  const [x1, y1] = aynaProject(map, 0, lat + 1);
  return 111.2 / Math.hypot(x1 - x0, y1 - y0);
};
const xy = (map: AynaMapKey, p: { lat: number; lon: number }) => aynaProject(map, p.lon, p.lat);

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 200+ places, unique names, valid fields, each map well stocked', () => {
  expect(AYNA_PLACES.length).toBeGreaterThanOrEqual(200);
  expect(new Set(AYNA_PLACES.map((p) => p.name)).size).toBe(AYNA_PLACES.length);
  for (const p of AYNA_PLACES) {
    expect(p.name.trim(), p.name).toBe(p.name);
    expect(/[ء-ي]/.test(p.name), p.name).toBe(true);
    expect(Number.isFinite(p.lat) && Number.isFinite(p.lon), p.name).toBe(true);
    expect(p.where.length, p.name).toBeGreaterThan(2);
    expect(['city', 'capital', 'landmark', 'river', 'mountain', 'nature']).toContain(p.type);
  }
  for (const m of MAPS) expect(aynaPool(m).length, m).toBeGreaterThanOrEqual(60);
  // the owner's rules: Palestine is named, the other name never appears
  expect(AYNA_PLACES.filter((p) => p.where.includes('فلسطين')).length).toBeGreaterThanOrEqual(8);
  expect(JSON.stringify(AYNA_PLACES)).not.toContain('إسرائيل');
  expect(JSON.stringify(AYNA_PLACES)).not.toContain('الصحراء الغربية');
});

test('content: every place inside its map, no two places on the same spot', () => {
  for (const p of AYNA_PLACES) expect(inMap(p.map, p, p.map === 'morocco' ? 0.3 : 0.6), p.name).toBe(true);
  for (const m of MAPS) {
    const pool = aynaPool(m);
    for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) expect(aynaKm(pool[i], pool[j]), `${pool[i].name} ~ ${pool[j].name}`).toBeGreaterThan(0.8);
  }
});

test('content: every place is on land (or on the coast) on its own map; Moroccan places inside Morocco', () => {
  for (const p of AYNA_PLACES) {
    const at = xy(p.map, p);
    // simplified coasts: a coastal city may sit a few km «in the sea»
    const tol = { morocco: 8, arab: 20, world: 45 }[p.map] / kmPerUnit(p.map, p.lat);
    expect(inside(LAND[p.map], at) || edgeDist(LAND[p.map], at) < tol, `${p.name} on land`).toBe(true);
    if (p.map === 'morocco') expect(inside(MOROCCO.morocco, at) || edgeDist(MOROCCO.morocco, at) < tol, `${p.name} in Morocco`).toBe(true);
  }
});

test('content: spot checks of well-known distances', () => {
  const at = (name: string) => AYNA_PLACES.find((p) => p.name === name)!;
  const near = (a: string, b: string, km: number, pct = 0.08) => {
    const d = aynaKm(at(a), at(b));
    expect(d, `${a}–${b}: ${Math.round(d)} km`).toBeGreaterThan(km * (1 - pct));
    expect(d, `${a}–${b}: ${Math.round(d)} km`).toBeLessThan(km * (1 + pct));
  };
  near('الرباط', 'الدار البيضاء', 87);
  near('فاس', 'مراكش', 390);
  near('طنجة', 'الكويرة', 2100, 0.06);
  near('العيون', 'الداخلة', 455);
  near('مكة المكرمة', 'المدينة المنورة', 340);
  near('القاهرة', 'الإسكندرية', 180);
  near('لندن', 'مدريد', 1265);
  near('طوكيو', 'بكين', 2100);
  near('واشنطن', 'لوس أنجلوس', 3700);
  expect(at('برازيليا').lat).toBeLessThan(0);
});

/* ------------------------------------------------------------------ */
/* The maps                                                            */
/* ------------------------------------------------------------------ */

test('maps: compact paths, inside each map, light enough for a phone', () => {
  let total = 0;
  for (const m of MAPS) {
    const g = AYNA_GEO[m];
    for (const path of [AYNA_LAND[m], AYNA_BORDERS[m], AYNA_MOROCCO[m]]) {
      expect(path).toMatch(/^M-?\d+ -?\d+l/);
      expect(path).toMatch(/^[Mlz0-9 -]+$/);
      total += path.length;
    }
    const pad = m === 'world' ? 0.19 : 0.03;
    for (const ring of LAND[m]) for (const [x, y] of ring) {
      expect(x).toBeGreaterThanOrEqual(-g.w * 0.03);
      expect(x).toBeLessThanOrEqual(g.w * 1.03);
      expect(y).toBeGreaterThanOrEqual(-g.h * pad);
      expect(y).toBeLessThanOrEqual(g.h * (1 + pad));
    }
    // the open sea is not land
    const sea = { morocco: [33, -11], arab: [34, 18], world: [-20, -30] }[m];
    expect(inside(LAND[m], xy(m, { lat: sea[0], lon: sea[1] })), `${m} sea`).toBe(false);
  }
  expect(total).toBeLessThan(110_000);
});

test('maps: Morocco is drawn whole with its Sahara, on every map, with no line across it', () => {
  const pts = {
    العيون: { lat: 27.1536, lon: -13.2033 },
    أوسرد: { lat: 22.56, lon: -14.33 },
    'بئر كندوز': { lat: 21.62, lon: -16.47 },
    السمارة: { lat: 26.7384, lon: -11.6719 },
    'بئر أنزران': { lat: 23.89, lon: -14.53 },
    الرباط: { lat: 34.0209, lon: -6.8416 },
    مراكش: { lat: 31.6295, lon: -7.9811 },
    // near the eastern and southern borders: Natural Earth puts these in a separate «W. Sahara» polygon
    تيفاريتي: { lat: 26.15, lon: -10.57 },
    'بئر لحلو': { lat: 26.35, lon: -9.57 },
    امهيريز: { lat: 24.18, lon: -12.7 },
    أغوينيت: { lat: 22.18, lon: -13.13 },
  };
  for (const m of MAPS) {
    for (const [name, p] of Object.entries(pts)) expect(inside(MOROCCO[m], xy(m, p)), `${m}: ${name}`).toBe(true);
    // Dakhla sits at the tip of its thin peninsula: on (or right by) Morocco's coast on every map
    const dakhla = xy(m, { lat: 23.6848, lon: -15.958 });
    expect(inside(MOROCCO[m], dakhla) || edgeDist(MOROCCO[m], dakhla) * kmPerUnit(m, 23.7) < 6, `${m}: الداخلة`).toBe(true);
    // not Morocco: Algiers, Nouakchott, Tindouf's side of the border
    for (const p of [{ lat: 36.75, lon: 3.06 }, { lat: 18.07, lon: -15.96 }, { lat: 27.0, lon: -6.0 }]) expect(inside(MOROCCO[m], xy(m, p))).toBe(false);
  }
  // one piece of land from Tangier to Lagouira: the biggest ring of Morocco holds both the north and the Sahara
  const rings = MOROCCO.morocco;
  const big = rings.reduce((a, b) => (b.length > a.length ? b : a));
  expect(inside([big], xy('morocco', pts.الرباط))).toBe(true);
  expect(inside([big], xy('morocco', pts['بئر كندوز']))).toBe(true);
  // no border line runs through Morocco (Natural Earth's line between «Morocco» and «W. Sahara» would)
  for (const m of MAPS) {
    // a border may only run along Morocco's edge: never with Morocco on both sides of it
    for (const line of decode(AYNA_BORDERS[m])) {
      for (let k = 1; k < line.length; k++) {
        const [ax, ay] = line[k - 1];
        const [bx, by] = line[k];
        const len = Math.hypot(bx - ax, by - ay);
        if (!len) continue;
        const [nx, ny] = [((ay - by) / len) * 0.8, ((bx - ax) / len) * 0.8];
        const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
        const both = inside(MOROCCO[m], [mx + nx, my + ny]) && inside(MOROCCO[m], [mx - nx, my - ny]);
        expect(both, `${m}: a border across Morocco at ${mx},${my}`).toBe(false);
      }
    }
  }
});

test('projection: unproject undoes project on every map', () => {
  for (const m of MAPS) {
    const g = AYNA_GEO[m];
    for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.8]]) {
      const lon = g.lonMin + (g.lonMax - g.lonMin) * fx;
      const lat = g.latMin + (g.latMax - g.latMin) * fy;
      const [x, y] = aynaProject(m, lon, lat);
      const p = aynaUnproject(m, x, y);
      expect(p.lon).toBeCloseTo(lon, 8);
      expect(p.lat).toBeCloseTo(lat, 8);
    }
    const [x0, y0] = aynaProject(m, g.lonMin, g.latMax);
    const [x1, y1] = aynaProject(m, g.lonMax, g.latMin);
    expect(x0).toBeCloseTo(0, 6);
    expect(y0).toBeCloseTo(0, 6);
    expect(Math.abs(x1 - g.w)).toBeLessThan(1);
    expect(Math.abs(y1 - g.h)).toBeLessThan(1);
  }
});

/* ------------------------------------------------------------------ */
/* Distance and scoring                                                */
/* ------------------------------------------------------------------ */

test('distance: great-circle km', () => {
  expect(aynaKm({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  expect(aynaKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.19, 1);
  expect(aynaKm({ lat: 60, lon: 0 }, { lat: 60, lon: 1 })).toBeCloseTo(55.6, 0);
  // across the 180° meridian the short way
  expect(aynaKm({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 })).toBeCloseTo(111.19, 1);
  // antipodes: half the Earth's circumference
  expect(aynaKm({ lat: 0, lon: 0 }, { lat: 0, lon: 180 })).toBeCloseTo(Math.PI * 6371, 0);
  const a = { lat: 34.02, lon: -6.84 };
  const b = { lat: 48.86, lon: 2.35 };
  expect(aynaKm(a, b)).toBeCloseTo(aynaKm(b, a), 6);
  expect(aynaKm(a, b)).toBeGreaterThan(1750);
  expect(aynaKm(a, b)).toBeLessThan(1850);
});

test('scoring: 1000 on the spot, always falling with distance, scaled to the map', () => {
  for (const m of MAPS) {
    expect(aynaPoints(0, m)).toBe(1000);
    expect(aynaPoints(AYNA_MAPS[m].exactKm, m)).toBe(1000);
    let last = 1000;
    for (const km of [AYNA_MAPS[m].exactKm + 1, 50, 100, 250, 500, 1000, 3000, 10000, 20000]) {
      if (km <= AYNA_MAPS[m].exactKm) continue;
      const p = aynaPoints(km, m);
      expect(p, `${m} ${km}`).toBeLessThanOrEqual(last);
      expect(p).toBeGreaterThanOrEqual(0);
      last = p;
    }
    // one scale away: about a third
    expect(aynaPoints(AYNA_MAPS[m].exactKm + AYNA_MAPS[m].scaleKm, m)).toBe(368);
  }
  // the same miss is worth less on a closer map
  expect(aynaPoints(150, 'morocco')).toBeLessThan(aynaPoints(150, 'arab'));
  expect(aynaPoints(150, 'arab')).toBeLessThan(aynaPoints(150, 'world'));
  expect(aynaPoints(100, 'morocco')).toBeGreaterThan(400);
  expect(aynaPoints(500, 'world')).toBeGreaterThan(600);
  expect(aynaPoints(5000, 'world')).toBeLessThan(10);
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

test('settings: sanitised at start, patch accepts only the offered values', () => {
  expect(sanitizeAyna({})).toEqual(AYNA_DEFAULTS);
  expect(sanitizeAyna({ rounds: 3, seconds: 90, map: 'moon' } as never)).toEqual({ rounds: 8, seconds: 30, map: 'mixed' });
  expect(sanitizeAyna({ rounds: 14, seconds: 16, map: 'morocco' })).toEqual({ rounds: 15, seconds: 15, map: 'morocco' });
  const st = sanitizeAyna({});
  ayna.patchSettings!(st, { rounds: 8, seconds: 30, map: 'world' });
  expect(st).toEqual({ rounds: 8, seconds: 30, map: 'world' });
  ayna.patchSettings!(st, { rounds: 'x', seconds: null, map: 'mars' });
  expect(st).toEqual({ rounds: 8, seconds: 30, map: 'world' });
  ayna.patchSettings!(st, { rounds: 100 });
  expect(st.rounds).toBe(15);
  const s = ayna.start(fakeCtx(), ['a'], { rounds: 99, seconds: 1, map: 'x' } as never);
  expect(s.settings).toEqual({ rounds: 15, seconds: 15, map: 'mixed' });
  expect(s.places.length).toBe(15);
});

test('settings: one map asks only its places; «منوّع» mixes the three maps', () => {
  for (const m of MAPS) {
    const s = ayna.start(fakeCtx(), ['a'], { ...SETTINGS, map: m, rounds: 15 });
    expect(s.places.every((p) => p.map === m)).toBe(true);
    expect(new Set(s.places).size).toBe(15);
    expect(view(fakeCtx(), s, 'a').map).toBe(m);
  }
  const s = ayna.start(fakeCtx(), ['a'], { ...SETTINGS, rounds: 15 });
  expect(new Set(s.places.map((p) => p.map)).size).toBe(3);
  expect(new Set(s.places).size).toBe(15);
  // the round's view follows its own place's map
  for (let i = 0; i < 3; i++) {
    expect(view(fakeCtx(), s, 'a').map).toBe(s.places[s.round].map);
    ayna.act(fakeCtx(), s, 'a', { type: 'confirm', lat: 0, lon: 0 });
    ayna.act(fakeCtx(), s, 'a', { type: 'next' });
  }
});

test('places do not come back in the same room until the deck is used up', () => {
  const ctx = fakeCtx();
  const seen = new Set<string>();
  for (let g = 0; g < 4; g++) {
    const s = ayna.start(ctx, ['a'], { ...SETTINGS, map: 'morocco', rounds: 15 });
    for (const p of s.places) {
      expect(seen.has(p.name), p.name).toBe(false);
      seen.add(p.name);
    }
  }
});

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

test('a round: pins move until «تأكيد», distances and points at the reveal, then the next place', () => {
  const ctx = fakeCtx();
  const s = ayna.start(ctx, ['a', 'b', 'c'], { ...SETTINGS, map: 'morocco' });
  const place = s.places[0];
  expect(view(ctx, s, 'a').name).toBe(place.name);
  expect(ayna.turnOf!(s)).toEqual(['a', 'b', 'c']);

  ayna.act(ctx, s, 'a', { type: 'pin', lat: 'x', lon: 3 });
  expect(s.pins.a).toBeUndefined();
  confirm(ctx, s, 'a'); // nothing to confirm yet
  expect(s.pins.a).toBeUndefined();
  pin(ctx, s, 'a', 30, -8);
  pin(ctx, s, 'a', place.lat, place.lon); // moved onto the spot
  expect(view(ctx, s, 'a').mine).toEqual({ lat: place.lat, lon: place.lon });
  expect(view(ctx, s, 'a').confirmed).toEqual([]);
  confirm(ctx, s, 'a');
  expect(view(ctx, s, 'a').confirmed).toEqual(['a']);
  pin(ctx, s, 'a', 25, -12); // can't move after confirming
  confirm(ctx, s, 'a', 25, -12);
  expect(s.pins.a.lat).toBe(place.lat);
  expect(ayna.turnOf!(s)).toEqual(['b', 'c']);

  confirm(ctx, s, 'b', place.lat + 1, place.lon); // ~111 km off, pin and confirm at once
  ayna.act(ctx, s, 'c', { type: 'confirm', lat: 60, lon: 40, round: 99 }); // a stale round: ignored
  expect(s.phase).toBe('play');
  confirm(ctx, s, 'c', 60, 40); // off the map: kept on its edge
  expect(s.pins.c.lat).toBe(AYNA_GEO.morocco.latMax);
  expect(s.pins.c.lon).toBe(AYNA_GEO.morocco.lonMax);
  expect(s.phase).toBe('reveal');

  const v = view(ctx, s, 'a');
  expect(v.answer).toEqual({ lat: place.lat, lon: place.lon, where: place.where });
  const r = Object.fromEntries(v.results!.map((x) => [x.id, x]));
  expect(r.a).toMatchObject({ km: 0, points: 1000, confirmed: true });
  const bKm = Math.round(aynaKm(s.pins.b, place));
  expect(bKm).toBeGreaterThan(100);
  expect(r.b.km).toBe(bKm);
  expect(r.b.points).toBe(aynaPoints(bKm, 'morocco'));
  expect(r.c.points).toBeLessThan(r.b.points);
  expect(s.scores.a).toBe(1000);
  // everyone sees everyone's pins now
  expect(view(ctx, s, 'c').results!.find((x) => x.id === 'b')!.guess).toEqual({ lat: place.lat + 1, lon: place.lon });

  ayna.act(ctx, s, 'b', { type: 'next' });
  expect(s.round).toBe(1);
  expect(s.phase).toBe('play');
  expect(view(ctx, s, 'a').mine).toBeNull();
});

test('timeouts: a pin still moving counts where it is, no pin scores 0, the clock moves on', () => {
  const ctx = fakeCtx();
  const s = ayna.start(ctx, ['a', 'b', 'c'], { ...SETTINGS, map: 'world' });
  const place = s.places[0];
  pin(ctx, s, 'a', place.lat, place.lon); // never confirmed
  confirm(ctx, s, 'b', place.lat + 3, place.lon);
  // c does nothing
  ctx.now = s.endsAt! - 1;
  expect(ayna.tick!(ctx, s)).toBe(false);
  expect(s.phase).toBe('play');
  ctx.now = s.endsAt! + 1;
  expect(ayna.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.a).toMatchObject({ km: 0, points: 1000, confirmed: false });
  expect(r.b.confirmed).toBe(true);
  expect(r.b.points).toBeGreaterThan(0);
  expect(r.c).toEqual({ id: 'c', guess: null, km: null, points: 0, confirmed: false });
  expect(s.scores.c).toBe(0);
  // the reveal ends by itself, too
  ctx.now += AYNA_REVEAL_MS + 1;
  ayna.tick!(ctx, s);
  expect(s.round).toBe(1);
  expect(s.phase).toBe('play');
  // and a full game of silence ends with a podium of zeros
  while (s.phase !== 'final') {
    ctx.now = s.endsAt! + 1;
    ayna.tick!(ctx, s);
  }
  expect(ayna.result!(s)!.places.flat().sort()).toEqual(['a', 'b', 'c']);
});

/** every number anywhere in a view */
function numbers(v: unknown, out: number[] = []): number[] {
  if (typeof v === 'number') out.push(v);
  else if (v && typeof v === 'object') for (const x of Object.values(v)) numbers(x, out);
  return out;
}

test('no leaks: before the reveal no view holds the true spot, where it is, or anyone else’s pin', () => {
  const ctx = fakeCtx();
  const s = ayna.start(ctx, ['a', 'b'], { ...SETTINGS, map: 'arab' });
  const place = s.places[0];
  pin(ctx, s, 'a', 21.123, 39.456);
  for (const me of ['a', 'b', 'spectator']) {
    const v = view(ctx, s, me);
    const json = JSON.stringify(v);
    expect(v.answer).toBeNull();
    expect(v.results).toBeNull();
    const nums = numbers(v);
    expect(nums).not.toContain(place.lat);
    expect(nums).not.toContain(place.lon);
    expect(json).not.toContain(`"${place.where}"`);
    if (me !== 'a') {
      expect(v.mine).toBeNull();
      expect(nums).not.toContain(21.123);
      expect(nums).not.toContain(39.456);
    }
  }
  // a confirmed pin is still secret: only «who has confirmed» is shared
  confirm(ctx, s, 'a');
  const vb = view(ctx, s, 'b');
  expect(vb.confirmed).toEqual(['a']);
  expect(numbers(vb)).not.toContain(21.123);
  // the spoken line names the place but nothing else
  expect(ctx.said.some((x) => x.includes(place.name))).toBe(true);
  expect(ctx.said.join(' ')).not.toContain(String(place.lat));
});

test('result: places by total score, ties share a place, null until the end', () => {
  const ctx = fakeCtx();
  const s = ayna.start(ctx, ['a', 'b', 'c'], { ...SETTINGS, map: 'morocco' });
  expect(ayna.result!(s)).toBeNull();
  while (s.phase !== 'final') {
    if (s.phase === 'play') {
      const p = s.places[s.round];
      confirm(ctx, s, 'a', p.lat, p.lon);
      confirm(ctx, s, 'b', p.lat, p.lon);
      confirm(ctx, s, 'c', p.lat + 2, p.lon);
    }
    ayna.act(ctx, s, 'a', { type: 'next' });
  }
  expect(ayna.result!(s)).toEqual({ places: [['a', 'b'], ['c']] });
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]); // a tie: no sole winner
});

test('leaving: the round ends when the rest have confirmed; the last one out ends the game', () => {
  const ctx = fakeCtx();
  const s = ayna.start(ctx, ['a', 'b', 'c'], SETTINGS);
  confirm(ctx, s, 'a', 30, 0);
  pin(ctx, s, 'b', 31, 0);
  ayna.onLeave!(ctx, s, 'b');
  expect(s.pins.b).toBeUndefined();
  expect(s.scores.b).toBeUndefined();
  expect(s.phase).toBe('play');
  ayna.onLeave!(ctx, s, 'zz'); // not a player: nothing happens
  ctx.offline.add('c'); // offline players don't hold the round
  ayna.onLeave!(ctx, s, 'zz');
  expect(s.phase).toBe('play');
  ayna.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.results!.map((r) => r.id)).toEqual(['a']);
  ayna.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
  expect(ayna.result!(s)).toBeNull();
});

test('a player who leaves during the reveal drops out of its results', () => {
  const ctx = fakeCtx();
  const s = ayna.start(ctx, ['a', 'b'], SETTINGS);
  confirm(ctx, s, 'a', 30, 0);
  confirm(ctx, s, 'b', 30, 0);
  expect(s.phase).toBe('reveal');
  ayna.onLeave!(ctx, s, 'b');
  expect(s.results!.map((r) => r.id)).toEqual(['a']);
  expect(s.phase).toBe('reveal');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: pins land near the place, closer for stronger bots, scaled to the map, on the map', () => {
  for (const m of MAPS) {
    const place = aynaPool(m)[3];
    const mean = (level: 'easy' | 'smart' | 'expert') => {
      let sum = 0;
      for (let i = 0; i < 1500; i++) sum += aynaKm(botPin(place, level), place);
      return sum / 1500;
    };
    const e = mean('easy');
    const sm = mean('smart');
    const x = mean('expert');
    expect(x).toBeLessThan(sm);
    expect(sm).toBeLessThan(e);
    // half-normal: the mean miss is about 0.8 × the typical one
    const typical = BOT_MISS.expert * AYNA_MAPS[m].scaleKm;
    expect(x).toBeGreaterThan(typical * 0.6);
    expect(x).toBeLessThan(typical * 1.0);
    for (let i = 0; i < 200; i++) expect(inMap(m, botPin(place, 'easy'))).toBe(true);
  }
  // the miss is in km of the map: wider on the world map than on Morocco's
  const mo = aynaPool('morocco')[0];
  const wo = aynaPool('world')[0];
  let a = 0;
  let b = 0;
  for (let i = 0; i < 500; i++) {
    a += aynaKm(botPin(mo, 'smart'), mo);
    b += aynaKm(botPin(wo, 'smart'), wo);
  }
  expect(b).toBeGreaterThan(a * 4);
});

test('bots: human-like timing inside the round timer', () => {
  for (const total of [15_000, 20_000, 30_000]) {
    for (const level of ['easy', 'smart', 'expert'] as const) {
      for (let i = 0; i < 200; i++) {
        const d = botDelay(level, total);
        expect(d).toBeGreaterThanOrEqual(2500);
        expect(d).toBeLessThan(total);
      }
    }
  }
});

function runBotGame(ids: string[], humans: string[] = [], settings = SETTINGS, level: 'easy' | 'smart' | 'expert' = 'smart') {
  const bots = ids.filter((i) => !humans.includes(i));
  const ctx = fakeCtx(bots, level);
  const s = ayna.start(ctx, ids, settings);
  const plan = () => ayna.botPlan!(ctx, s, bots);
  plan();
  const phases = new Set<string>();
  let guard = 0;
  while (s.phase !== 'final' && guard++ < 100_000) {
    ctx.now += 250;
    let changed = ayna.tick!(ctx, s);
    for (const j of ctx.jobs.filter((x) => x.at <= ctx.now)) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        ayna.act(ctx, s, j.by, j.a);
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

test('a full bot game reaches the podium (1, 4 and 12 players; every map and level)', () => {
  for (const [n, map, level] of [
    [1, 'morocco', 'easy'],
    [4, 'arab', 'smart'],
    [12, 'world', 'expert'],
    [3, 'mixed', 'smart'],
  ] as const) {
    const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
    const { s, ctx, phases } = runBotGame(ids, [], { ...SETTINGS, map, rounds: 8 }, level);
    expect(s.phase).toBe('final');
    expect(phases.has('reveal')).toBe(true);
    expect(s.round).toBe(7);
    expect(Object.values(s.scores).every((x) => x > 0)).toBe(true);
    expect(ctx.fxs.filter(([k]) => k === 'win')).toHaveLength(1);
    expect(ayna.result!(s)!.places.flat().sort()).toEqual([...ids].sort());
  }
});

test('with a person who never taps, the clock moves the game on; expert bots score well', () => {
  const { s } = runBotGame(['me', 'bot1'], ['me'], { ...SETTINGS, rounds: 8 }, 'expert');
  expect(s.phase).toBe('final');
  expect(s.scores.me).toBe(0);
  expect(s.scores.bot1).toBeGreaterThan(8 * 600);
});
