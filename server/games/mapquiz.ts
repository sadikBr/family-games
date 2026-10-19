/**
 * «أين المكان؟» — each round names a city or site of the Islamic world; everyone drops a pin on the
 * map on their own phone. Points by the great-circle distance to the real spot (see mapquizPoints):
 * 1000 within 25 km, then fewer the farther the pin. The reveal shows the spot, every pin and distance.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  MAPQUIZ_REGIONS,
  distanceKm,
  inRegion,
  mapquizPoints,
  type MapquizLevel,
  type MapquizPoint,
  type MapquizRegion,
  type MapquizResult,
  type MapquizSettings,
  type MapquizView,
} from '../../src/shared/games/mapquiz';
import { randDelay } from '../cardkit';
import { MAP_PLACES, type MapPlace } from '../mapquiz-content';
import { qdeck } from '../qdeck';
import { botLevel, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr } from '../util';
import { soleWinner } from './mcq';

export const MAPQUIZ_REVEAL_MS = 10_000;
const LEVELS: MapquizLevel[] = ['easy', 'medium', 'hard'];
const REGIONS = Object.keys(MAPQUIZ_REGIONS) as MapquizRegion[];
/** a place must sit at least this far (degrees) inside a region's edge to be asked there */
const EDGE = 1;

interface State {
  settings: MapquizSettings;
  participants: string[];
  phase: MapquizView['phase'];
  places: MapPlace[];
  /** 0-based index into places */
  round: number;
  startedAt: number;
  endsAt: number | null;
  timerTotal: number;
  guesses: Record<string, MapquizPoint & { at: number }>;
  results: MapquizResult[] | null;
  scores: Record<string, number>;
}

export function sanitizeMapquiz(raw: Partial<MapquizSettings>): MapquizSettings {
  return {
    rounds: isNum(raw.rounds) ? clamp(Math.round(raw.rounds), 3, 20) : 8,
    seconds: isNum(raw.seconds) ? clamp(Math.round(raw.seconds / 5) * 5, 10, 45) : 20,
    region: REGIONS.includes(raw.region as MapquizRegion) ? (raw.region as MapquizRegion) : 'all',
    level: LEVELS.includes(raw.level as MapquizLevel) ? (raw.level as MapquizLevel) : 'medium',
  };
}

/** The places that can be asked on a region's map. */
export function mapquizPool(region: MapquizRegion): MapPlace[] {
  return MAP_PLACES.filter((p) => inRegion(region, p, EDGE));
}

/** Keep a point inside the region's visible map. */
function clampToRegion(region: MapquizRegion, p: MapquizPoint): MapquizPoint {
  const g = MAPQUIZ_REGIONS[region];
  return { lat: clamp(p.lat, g.latMin, g.latMax), lon: clamp(p.lon, g.lonMin, g.lonMax) };
}

function startRound(ctx: GameCtx, s: State) {
  s.guesses = {};
  s.results = null;
  s.phase = 'play';
  s.startedAt = ctx.now;
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('start');
}

function reveal(ctx: GameCtx, s: State) {
  const place = s.places[s.round];
  s.results = s.participants.map((id) => {
    const g = s.guesses[id];
    if (!g) return { id, guess: null, km: null, points: 0 };
    const km = Math.round(distanceKm(g, place));
    const points = mapquizPoints(km, s.settings.region);
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, guess: { lat: g.lat, lon: g.lon }, km, points };
  });
  s.phase = 'reveal';
  s.endsAt = ctx.now + MAPQUIZ_REVEAL_MS;
  ctx.fx('reveal');
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  ctx.fx('win', soleWinner(s.scores));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.places.length) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  const waiting = s.participants.filter((p) => !s.guesses[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Typical miss (km) of a bot's pin, by the old per-game level (kept so old apps' settings still parse). */
export const BOT_ERROR_KM: Record<MapquizLevel | 'expert', number> = { easy: 500, medium: 200, hard: 60, expert: 18 };

/**
 * The room's bot strength as a typical miss: easy = the old default «متوسط», smart = «صعب», expert = a
 * person who knows the map well (most pins within the 25 km of a perfect score).
 */
const SKILL: Record<BotLevel, MapquizLevel | 'expert'> = { easy: 'medium', smart: 'hard', expert: 'expert' };

/** A bot's pin: near the place, off by a random distance (half-normal around its level's typical miss). */
export function botGuess(place: MapquizPoint, level: MapquizLevel | 'expert', region: MapquizRegion, rnd: () => number = Math.random): MapquizPoint {
  // Box–Muller
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  const km = Math.abs(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)) * BOT_ERROR_KM[level];
  const dir = rnd() * 2 * Math.PI;
  const dLat = (km * Math.cos(dir)) / 111.2;
  const dLon = (km * Math.sin(dir)) / (111.2 * Math.cos((place.lat * Math.PI) / 180));
  return clampToRegion(region, { lat: place.lat + dLat, lon: place.lon + dLon });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

/** For result(): the highest `score` first; equal scores share a place. */
function placesByScore(ids: string[], score: (id: string) => number): string[][] {
  const out: string[][] = [];
  let prev: number | null = null;
  for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
    const v = score(id);
    if (v === prev) out[out.length - 1].push(id);
    else out.push([id]);
    prev = v;
  }
  return out;
}

export const mapquiz: GameModule<State, MapquizSettings> = {
  id: 'mapquiz',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    const settings = sanitizeMapquiz(raw);
    const places = qdeck(ctx, `mapquiz:${settings.region}`, mapquizPool(settings.region)).deal(settings.rounds);
    const s: State = {
      settings,
      participants: [...participants],
      phase: 'play',
      places,
      round: 0,
      startedAt: ctx.now,
      endsAt: null,
      timerTotal: settings.seconds * 1000,
      guesses: {},
      results: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
    };
    startRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'guess' || s.phase !== 'play' || !s.participants.includes(by) || s.guesses[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    if (!isNum(a.lat) || !isNum(a.lon)) return;
    const p = clampToRegion(s.settings.region, { lat: a.lat, lon: a.lon });
    s.guesses[by] = { ...p, at: ctx.now };
    ctx.fx('throw', by);
    maybeReveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'play') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.participants.filter((p) => !s.guesses[p]) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const place = s.places[s.round];
    const level = botLevel(ctx);
    for (const b of s.participants) {
      if (s.guesses[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      const g = botGuess(place, SKILL[level], s.settings.region);
      // the score doesn't depend on speed: an expert still takes a few seconds to find the spot and confirm
      const delay =
        level === 'expert'
          ? randDelay(Math.min(3000, s.timerTotal * 0.3), Math.min(8000, s.timerTotal * 0.6))
          : randDelay(Math.max(2500, s.timerTotal * 0.35), s.timerTotal * 0.85);
      ctx.bot(b, `guess:${s.round}`, delay, { type: 'guess', round: s.round + 1, lat: g.lat, lon: g.lon });
    }
  },

  view(_ctx, s, me): MapquizView {
    const place = s.places[s.round];
    const shown = s.phase !== 'play';
    const mine = s.guesses[me];
    return {
      game: 'mapquiz',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.places.length,
      region: s.settings.region,
      name: place.name,
      answer: shown ? { lat: place.lat, lon: place.lon, fact: place.fact } : null,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'reveal' ? MAPQUIZ_REVEAL_MS : s.timerTotal,
      guessed: Object.keys(s.guesses).filter((id) => s.participants.includes(id)),
      mine: mine ? { lat: mine.lat, lon: mine.lon } : null,
      results: s.results,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = clamp(Math.round(patch.rounds), 3, 20);
    if (isNum(patch.seconds)) settings.seconds = clamp(Math.round(patch.seconds / 5) * 5, 10, 45);
    if (isStr(patch.region) && REGIONS.includes(patch.region as MapquizRegion)) settings.region = patch.region as MapquizRegion;
    if (isStr(patch.level) && LEVELS.includes(patch.level as MapquizLevel)) settings.level = patch.level as MapquizLevel;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, (id) => s.scores[id] ?? 0) };
  },
};

export type { State as MapquizState };
