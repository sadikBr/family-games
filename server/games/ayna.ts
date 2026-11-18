/**
 * «أين تقع؟» — each round names a place (a Moroccan city, a capital, a landmark, a river or a mountain);
 * everyone drops a pin on the map on their own phone and may move it until «تأكيد» or the end of the
 * timer (a pin still moving then counts where it is; no pin = 0). Points by the great-circle distance
 * to the true spot, on a curve fitted to the round's map (see aynaPoints). The reveal shows the spot,
 * every pin and its distance. Maps: المغرب، العالم العربي، العالم، or «منوّع» (each round on its place's map).
 */
import {
  AYNA_MAPS,
  AYNA_MAP_SETTINGS,
  AYNA_ROUNDS,
  AYNA_SECONDS,
  aynaKm,
  aynaPoints,
  clampToMap,
  type AynaMapKey,
  type AynaMapSetting,
  type AynaPoint,
  type AynaResult,
  type AynaSettings,
  type AynaView,
} from '../../src/shared/games/ayna';
import type { BotLevel } from '../../src/shared/protocol';
import { AYNA_PLACES, type AynaPlace } from '../ayna-content';
import { randDelay } from '../cardkit';
import { qdeck } from '../qdeck';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { ASK, voiceAnd, voiceAnswer, voiceClosest, voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';

export const AYNA_REVEAL_MS = 10_000;
const MAP_KEYS = Object.keys(AYNA_MAPS) as AynaMapKey[];
const SETTING_KEYS = AYNA_MAP_SETTINGS.map((m) => m.key);

interface Pin extends AynaPoint {
  at: number;
  confirmed: boolean;
}

interface State {
  settings: AynaSettings;
  participants: string[];
  phase: AynaView['phase'];
  places: AynaPlace[];
  /** 0-based index into places */
  round: number;
  endsAt: number | null;
  timerTotal: number;
  pins: Record<string, Pin>;
  results: AynaResult[] | null;
  scores: Record<string, number>;
}

/** The allowed value nearest to `v`. */
const nearest = (v: number, allowed: number[]) => allowed.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), allowed[0]);

export function sanitizeAyna(raw: Partial<AynaSettings>): AynaSettings {
  return {
    rounds: isNum(raw.rounds) ? nearest(raw.rounds, AYNA_ROUNDS) : 10,
    seconds: isNum(raw.seconds) ? nearest(raw.seconds, AYNA_SECONDS) : 20,
    map: SETTING_KEYS.includes(raw.map as AynaMapSetting) ? (raw.map as AynaMapSetting) : 'mixed',
  };
}

/** The places asked on one map. */
export const aynaPool = (map: AynaMapKey): AynaPlace[] => AYNA_PLACES.filter((p) => p.map === map);

/** The game's places: from the chosen map's deck, or for «منوّع» the three maps in turn (shuffled each cycle). */
export function dealPlaces(ctx: GameCtx, setting: AynaMapSetting, rounds: number): AynaPlace[] {
  if (setting !== 'mixed') return qdeck(ctx, `ayna:${setting}`, aynaPool(setting)).deal(rounds);
  const order: AynaMapKey[] = [];
  while (order.length < rounds) order.push(...shuffle(MAP_KEYS));
  const out: AynaPlace[] = [];
  for (const map of order.slice(0, rounds)) out.push(qdeck(ctx, `ayna:${map}`, aynaPool(map)).draw((p) => out.includes(p)));
  return out;
}

function startRound(ctx: GameCtx, s: State) {
  s.pins = {};
  s.results = null;
  s.phase = 'play';
  s.timerTotal = s.settings.seconds * 1000;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('start');
  voiceOnly(ctx, ASK.where(s.places[s.round].name));
}

function reveal(ctx: GameCtx, s: State) {
  const place = s.places[s.round];
  s.results = s.participants.map((id) => {
    const g = s.pins[id];
    if (!g) return { id, guess: null, km: null, points: 0, confirmed: false };
    const km = Math.round(aynaKm(g, place));
    const points = aynaPoints(km, place.map);
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, guess: { lat: g.lat, lon: g.lon }, km, points, confirmed: g.confirmed };
  });
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, AYNA_REVEAL_MS);
  ctx.fx('reveal');
  const best = s.results.filter((r) => r.km !== null).sort((a, b) => a.km! - b.km!)[0];
  voiceOnly(ctx, voiceAnd(best && best.points > 0 ? voiceClosest(ctx.playerName(best.id)) : null, voiceAnswer(place.where ? `${place.name}، ${place.where}` : place.name)));
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  ctx.fx('win', soleWinner(s.scores));
  if (s.participants.length) voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.places.length) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

/** Everyone still here (online, or a bot) has confirmed: reveal now. */
function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  const waiting = s.participants.filter((p) => !s.pins[p]?.confirmed && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A bot's typical miss, as a share of the map's scale (easy ≈ a vague idea, expert ≈ knows the map well). */
export const BOT_MISS: Record<BotLevel, number> = { easy: 0.8, smart: 0.35, expert: 0.12 };

/** A bot's pin: near the place, off by a random distance (half-normal around its level's typical miss). */
export function botPin(place: AynaPoint & { map: AynaMapKey }, level: BotLevel, rnd: () => number = Math.random): AynaPoint {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  const km = Math.abs(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)) * BOT_MISS[level] * AYNA_MAPS[place.map].scaleKm;
  const dir = rnd() * 2 * Math.PI;
  const dLat = (km * Math.cos(dir)) / 111.2;
  const dLon = (km * Math.sin(dir)) / (111.2 * Math.max(0.2, Math.cos((place.lat * Math.PI) / 180)));
  const p = clampToMap(place.map, { lat: place.lat + dLat, lon: place.lon + dLon });
  return { lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000 };
}

/** When a bot confirms: a person needs a few seconds to read, find the spot and tap; easier bots hesitate longer. */
export function botDelay(level: BotLevel, total: number): number {
  if (level === 'expert') return randDelay(Math.min(3500, total * 0.25), total * 0.55);
  if (level === 'smart') return randDelay(Math.min(4500, total * 0.3), total * 0.75);
  return randDelay(Math.min(5000, total * 0.35), total * 0.9);
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const ayna: GameModule<State, AynaSettings> = {
  id: 'ayna',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    const settings = sanitizeAyna(raw);
    const s: State = {
      settings,
      participants: [...participants],
      phase: 'play',
      places: dealPlaces(ctx, settings.map, settings.rounds),
      round: 0,
      endsAt: null,
      timerTotal: settings.seconds * 1000,
      pins: {},
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
    if ((a.type !== 'pin' && a.type !== 'confirm') || s.phase !== 'play' || !s.participants.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round + 1) return; // a tap from the previous round
    const had = s.pins[by];
    if (had?.confirmed) return;
    const map = s.places[s.round].map;
    let p: AynaPoint | null = had ? { lat: had.lat, lon: had.lon } : null;
    if (isNum(a.lat) && isNum(a.lon) && Number.isFinite(a.lat) && Number.isFinite(a.lon)) p = clampToMap(map, { lat: a.lat, lon: a.lon });
    if (!p) return; // «تأكيد» with no pin
    s.pins[by] = { ...p, at: ctx.now, confirmed: a.type === 'confirm' };
    if (a.type === 'confirm') {
      ctx.fx('throw', by);
      maybeReveal(ctx, s);
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'play') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.participants.filter((p) => !s.pins[p]?.confirmed) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const place = s.places[s.round];
    const level = botLevel(ctx);
    for (const b of s.participants) {
      if (s.pins[b]?.confirmed || !(bots.includes(b) || ctx.isBot(b))) continue;
      const g = botPin(place, level);
      ctx.bot(b, `pin:${s.round}`, botDelay(level, s.timerTotal), { type: 'confirm', round: s.round + 1, lat: g.lat, lon: g.lon });
    }
  },

  view(ctx, s, me): AynaView {
    const place = s.places[s.round];
    const shown = s.phase !== 'play';
    const mine = s.pins[me];
    return {
      game: 'ayna',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.places.length,
      setting: s.settings.map,
      map: place.map,
      name: place.name,
      type: place.type,
      answer: shown ? { lat: place.lat, lon: place.lon, where: place.where } : null,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'reveal' ? paced(ctx, AYNA_REVEAL_MS) : s.timerTotal,
      confirmed: s.participants.filter((id) => s.pins[id]?.confirmed),
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
    delete s.pins[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = nearest(patch.rounds, AYNA_ROUNDS);
    if (isNum(patch.seconds)) settings.seconds = nearest(patch.seconds, AYNA_SECONDS);
    if (isStr(patch.map) && SETTING_KEYS.includes(patch.map as AynaMapSetting)) settings.map = patch.map as AynaMapSetting;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as AynaState };
