/**
 * «البلد الغامض» — guess the country from clues that appear one by one (src/shared/games/balad.ts has
 * the rules). Each round: clue 1 at once, then one more every `interval` ms; a right guess scores by the
 * newest clue (60…10, +1…5 for speed); a wrong guess locks its guesser 3 s; the round ends when every
 * player still here found it or the last clue's time ran out. The reveal (paced; the host can skip it)
 * shows the country, its flag and who found it at which clue. Countries come from the room's deck.
 *
 * Hidden until the reveal: the country, and every clue not shown yet. The view sends only the clues
 * whose time has come, my own guesses, and who found it (never with what).
 */
import {
  BALAD_CLUES,
  BALAD_DEFAULTS,
  BALAD_INTERVALS,
  BALAD_LOCK_MS,
  BALAD_REGIONS,
  BALAD_ROUNDS,
  baladPool,
  baladPoints,
  type BaladRegion,
  type BaladResult,
  type BaladSettings,
  type BaladView,
} from '../../src/shared/games/balad';
import { BALAD_BY_CODE, matchCountry } from '../../src/shared/games/balad-countries';
import { BALAD_CLUE_TEXT } from '../balad-content';
import { planBotRound, type BotGuess } from '../balad-bots';
import { COUNTRIES, UNCLEAR_CAPITAL } from '../flags-content';
import { qdeck } from '../qdeck';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { KNOW_VOICE, voiceFastestRight } from '../voice-calls-knowledge';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

export const BALAD_REVEAL_MS = 9000;

type Rnd = () => number;

interface Guess {
  code: string;
  at: number;
  right: boolean;
}

export interface BaladState {
  settings: BaladSettings;
  participants: string[];
  /** the countries of the game, one per round (codes) */
  countries: string[];
  /** 0-based */
  round: number;
  phase: 'clues' | 'reveal' | 'final';
  startedAt: number;
  /** clues shown so far (1…6) */
  shown: number;
  endsAt: number | null;
  /** this round's guesses */
  guesses: Record<string, Guess[]>;
  /** this round's right guess: at which clue (0-based) and for how much */
  hits: Record<string, { clue: number; points: number; at: number }>;
  locks: Record<string, number>;
  results: BaladResult[] | null;
  scores: Record<string, number>;
  rights: Record<string, number>;
  /** the bots' guesses for the round they were planned for */
  plans: Record<string, { round: number; guesses: BotGuess[] }>;
  rnd: Rnd;
}

const REGION_KEYS = BALAD_REGIONS.map((r) => r.key);

export function sanitizeBalad(raw: Partial<BaladSettings> | undefined): BaladSettings {
  return {
    rounds: snapTo(raw?.rounds, BALAD_ROUNDS, BALAD_DEFAULTS.rounds),
    interval: snapTo(raw?.interval, BALAD_INTERVALS, BALAD_DEFAULTS.interval),
    region: isStr(raw?.region) && REGION_KEYS.includes(raw.region as BaladRegion) ? (raw.region as BaladRegion) : BALAD_DEFAULTS.region,
  };
}

/** The countries of a region that have their clues. */
export const regionCodes = (region: BaladRegion): string[] => baladPool(region).map((c) => c.code).filter((c) => !!BALAD_CLUE_TEXT[c]);

const intervalMs = (s: BaladState) => s.settings.interval * 1000;
const country = (s: BaladState) => s.countries[s.round];

function shuffled<T>(xs: readonly T[], rnd: Rnd): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function beginRound(ctx: GameCtx, s: BaladState) {
  s.phase = 'clues';
  s.startedAt = ctx.now;
  s.shown = 1;
  s.endsAt = ctx.now + BALAD_CLUES * intervalMs(s);
  s.guesses = {};
  s.hits = {};
  s.locks = {};
  s.results = null;
  ctx.fx('reveal');
}

/** The newest clue index (0-based) at `now`. */
export function clueAt(s: BaladState, now: number): number {
  return Math.max(0, Math.min(BALAD_CLUES - 1, Math.floor((now - s.startedAt) / intervalMs(s))));
}

function reveal(ctx: GameCtx, s: BaladState) {
  s.shown = BALAD_CLUES;
  s.results = s.participants.map((id) => {
    const h = s.hits[id];
    const wrong = (s.guesses[id] ?? []).filter((g) => !g.right).length;
    return { id, clue: h ? h.clue + 1 : null, points: h?.points ?? 0, wrong };
  });
  for (const r of s.results) {
    s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
    if (r.clue !== null) s.rights[r.id] = (s.rights[r.id] ?? 0) + 1;
  }
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, BALAD_REVEAL_MS);
  const name = BALAD_BY_CODE[country(s)]?.name ?? '';
  const found = Object.entries(s.hits);
  if (!found.length) {
    ctx.say?.(`البلد: ${name} · لا إجابة صحيحة`, undefined, KNOW_VOICE.noRight);
    return;
  }
  const first = Math.min(...found.map(([, h]) => h.at));
  const ids = found.filter(([, h]) => h.at === first).map(([id]) => id);
  const names = ids.map((id) => ctx.playerName(id)).join(' و');
  ctx.say?.(`البلد: ${name} · أول إجابة صحيحة: ${names}`, ids.length === 1 ? ids[0] : undefined, voiceFastestRight(names));
}

function finish(ctx: GameCtx, s: BaladState) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: BaladState) {
  if (s.round + 1 >= s.countries.length) return finish(ctx, s);
  s.round++;
  beginRound(ctx, s);
}

/** Everyone still playing has found it: the round is over. */
function maybeReveal(ctx: GameCtx, s: BaladState) {
  if (s.phase !== 'clues') return;
  const waiting = s.participants.filter((p) => !s.hits[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

export function startBalad(ctx: GameCtx, participants: string[], raw: Partial<BaladSettings> | undefined, rnd: Rnd = Math.random): BaladState {
  const settings = sanitizeBalad(raw);
  const pool = regionCodes(settings.region);
  const deck = qdeck(ctx, `balad:${settings.region}`, pool);
  const countries = shuffled(deck.deal(settings.rounds), rnd);
  const s: BaladState = {
    settings,
    participants: [...participants],
    countries,
    round: 0,
    phase: 'clues',
    startedAt: ctx.now,
    shown: 1,
    endsAt: null,
    guesses: {},
    hits: {},
    locks: {},
    results: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    rights: {},
    plans: {},
    rnd,
  };
  ctx.fx('start');
  beginRound(ctx, s);
  return s;
}

/** A guess: a country's code (picked from the list) or a typed name. */
function guess(ctx: GameCtx, s: BaladState, by: string, a: Record<string, unknown>) {
  if (s.phase !== 'clues' || !s.participants.includes(by)) return;
  if (isNum(a.round) && a.round !== s.round + 1) return;
  if (s.hits[by]) return;
  if (ctx.now >= (s.endsAt ?? 0)) return;
  if ((s.locks[by] ?? 0) > ctx.now) throw new GameError('انتظر لحظة قبل التخمين التالي');
  const code = isStr(a.code) && BALAD_BY_CODE[a.code] ? a.code : isStr(a.text) ? matchCountry(a.text.slice(0, 60)) : null;
  if (!code) throw new GameError('اسم غير معروف: اختر بلداً من الاقتراحات');
  const mine = (s.guesses[by] ??= []);
  if (mine.some((g) => g.code === code)) throw new GameError('هذا التخمين جُرِّب من قبل');
  const right = code === country(s);
  mine.push({ code, at: ctx.now, right });
  if (!right) {
    s.locks[by] = ctx.now + BALAD_LOCK_MS;
    return;
  }
  const clue = clueAt(s, ctx.now);
  const left = s.startedAt + (clue + 1) * intervalMs(s) - ctx.now;
  s.hits[by] = { clue, points: baladPoints(clue, left, intervalMs(s)), at: ctx.now };
  ctx.say?.(`إجابة صحيحة من ${ctx.playerName(by)}`, by);
  maybeReveal(ctx, s);
}

export const balad: GameModule<BaladState, BaladSettings> = {
  id: 'balad',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startBalad(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type === 'guess') guess(ctx, s, by, a);
  },

  tick(ctx, s) {
    if (s.phase === 'clues') {
      if (ctx.now >= (s.endsAt ?? 0)) {
        reveal(ctx, s);
        return true;
      }
      const shown = clueAt(s, ctx.now) + 1;
      if (shown !== s.shown) {
        s.shown = shown;
        return true;
      }
      return false;
    }
    if (s.phase === 'reveal' && ctx.now >= (s.endsAt ?? 0)) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'clues') return;
    const level = botLevel(ctx);
    const code = country(s);
    const known = !!COUNTRIES.find((c) => c.code === code)?.known;
    for (const b of s.participants) {
      if (!(bots.includes(b) || ctx.isBot(b)) || s.hits[b]) continue;
      let plan = s.plans[b];
      if (!plan || plan.round !== s.round) {
        plan = { round: s.round, guesses: planBotRound(level, code, intervalMs(s), s.rnd, known) };
        s.plans[b] = plan;
      }
      plan.guesses.forEach((g, i) => {
        // never into its own lock (room bot delays can be sped up, the lock can't)
        const at = Math.max(s.startedAt + g.at, (s.locks[b] ?? 0) + 50);
        ctx.bot(b, `balad:${s.round}:${i}`, Math.max(0, at - ctx.now), { type: 'guess', round: s.round + 1, code: g.code });
      });
    }
  },

  view(ctx, s, me): BaladView {
    const shownAll = s.phase !== 'clues';
    const code = country(s);
    const clues = BALAD_CLUE_TEXT[code] ?? [];
    const shown = shownAll ? BALAD_CLUES : Math.max(1, Math.min(s.shown, clueAt(s, ctx.now) + 1));
    const hit = s.hits[me];
    const c = COUNTRIES.find((x) => x.code === code);
    const lock = s.locks[me] ?? 0;
    return {
      game: 'balad',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.countries.length,
      region: s.settings.region,
      interval: intervalMs(s),
      clues: clues.slice(0, shown),
      clueAt: s.startedAt + (shown - 1) * intervalMs(s),
      nextAt: shownAll ? null : s.startedAt + shown * intervalMs(s),
      endsAt: s.endsAt,
      found: Object.entries(s.hits)
        .sort((x, y) => x[1].at - y[1].at)
        .map(([id, h]) => ({ id, clue: h.clue + 1 })),
      mine: hit ? { name: BALAD_BY_CODE[code]?.name ?? '', clue: hit.clue + 1, points: hit.points } : null,
      wrong: (s.guesses[me] ?? []).filter((g) => !g.right).map((g) => BALAD_BY_CODE[g.code]?.name ?? g.code),
      lockedUntil: !shownAll && lock > ctx.now ? lock : null,
      answer: shownAll
        ? { code, name: BALAD_BY_CODE[code]?.name ?? '', capital: c && !UNCLEAR_CAPITAL.has(code) ? c.capital : null, flag: c?.noFlag ? null : code }
        : null,
      results: shownAll ? s.results : null,
      scores: s.scores,
      rights: s.rights,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    delete s.rights[id];
    delete s.hits[id];
    delete s.guesses[id];
    delete s.locks[id];
    delete s.plans[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    const next = sanitizeBalad({ ...settings, ...patch } as Partial<BaladSettings>);
    if (patch.rounds !== undefined) settings.rounds = next.rounds;
    if (patch.interval !== undefined) settings.interval = next.interval;
    if (patch.region !== undefined) settings.region = next.region;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};
