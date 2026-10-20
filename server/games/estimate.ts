/**
 * «كم تقدّر؟» — estimation. Each round a question whose answer is a number (server/estimate-content.ts);
 * everyone types a number on their own phone before the timer ends (one guess, it can't be changed).
 * The true answer stays on the server until the reveal: then every guess is shown on a number line with
 * the answer and a «did you know» line. The closest three score 3 / 2 / 1 (equal distances share a
 * place), an exact guess (within 1% for an approximate answer) 2 more. The reveal moves on by itself
 * (or the host taps «التالي»); after the last round, the podium.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  ESTIMATE_CAT_LABEL,
  ESTIMATE_EXACT_BONUS,
  ESTIMATE_EXACT_SHARE,
  ESTIMATE_MAX_DIGITS,
  ESTIMATE_PLACE_POINTS,
  ESTIMATE_ROUNDS,
  ESTIMATE_SECONDS,
  formatNumber,
  parseGuess,
  type EstimateResult,
  type EstimateSettings,
  type EstimateView,
} from '../../src/shared/games/estimate';
import { ESTIMATE, type EstimateQ } from '../estimate-content';
import { easyDelay } from '../ai/social-quiz';
import { qdeck } from '../qdeck';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { voiceClosestTo, voiceExact, KNOW_VOICE } from '../voice-calls-knowledge';
import { placesByScore, soleWinner } from './mcq';

/** The round's result stays on the screens this long (at the room's pace). */
export const ESTIMATE_REVEAL_MS = 9000;

type Rnd = () => number;

interface State {
  settings: EstimateSettings;
  participants: string[];
  items: EstimateQ[];
  /** 0-based */
  round: number;
  phase: EstimateView['phase'];
  startedAt: number;
  endsAt: number | null;
  answers: Record<string, { guess: number; at: number }>;
  results: EstimateResult[] | null;
  scores: Record<string, number>;
  wins: Record<string, number>;
  rnd: Rnd;
}

const snap = (v: unknown, allowed: readonly number[], d: number): number =>
  isNum(v) ? allowed.reduce((best, r) => (Math.abs(r - v) < Math.abs(best - v) ? r : best), allowed[0]) : d;

export function sanitizeEstimate(raw: Partial<EstimateSettings> | undefined): EstimateSettings {
  return { rounds: snap(raw?.rounds, ESTIMATE_ROUNDS, 10), seconds: snap(raw?.seconds, ESTIMATE_SECONDS, 30) };
}

/** A guess as a phone may send it (a number, or the typed text): null when it isn't a valid guess. */
export function readGuess(raw: unknown): number | null {
  if (isStr(raw)) return parseGuess(raw);
  if (!isNum(raw) || raw < 0 || raw >= 10 ** ESTIMATE_MAX_DIGITS) return null;
  return Math.round(raw * 1000) / 1000;
}

/** Whether a guess counts as exact. */
export function isExact(q: Pick<EstimateQ, 'a' | 'approx'>, guess: number): boolean {
  const diff = Math.abs(guess - q.a);
  return q.approx ? diff <= ESTIMATE_EXACT_SHARE * Math.abs(q.a) + 1e-9 : diff < 1e-9;
}

/** Places by distance (equal distances share a place), 3 / 2 / 1 points, the exact bonus. */
export function scoreGuesses(q: Pick<EstimateQ, 'a' | 'approx'>, ids: string[], guesses: Record<string, number | undefined>): EstimateResult[] {
  const diffs = ids.filter((id) => guesses[id] !== undefined).map((id) => Math.abs((guesses[id] as number) - q.a));
  return ids.map((id) => {
    const g = guesses[id];
    if (g === undefined) return { id, guess: null, diff: null, place: null, exact: false, points: 0 };
    const diff = Math.abs(g - q.a);
    const place = 1 + diffs.filter((d) => d < diff - 1e-9).length;
    const exact = isExact(q, g);
    const points = (ESTIMATE_PLACE_POINTS[place - 1] ?? 0) + (exact ? ESTIMATE_EXACT_BONUS : 0);
    return { id, guess: g, diff, place, exact, points };
  });
}

function ask(ctx: GameCtx, s: State) {
  s.phase = 'ask';
  s.answers = {};
  s.results = null;
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.settings.seconds * 1000;
  ctx.fx('reveal');
}

function reveal(ctx: GameCtx, s: State) {
  const q = s.items[s.round];
  s.results = scoreGuesses(
    q,
    s.participants,
    Object.fromEntries(Object.entries(s.answers).map(([id, a]) => [id, a.guess])),
  );
  for (const r of s.results) s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
  const first = s.results.filter((r) => r.place === 1);
  for (const r of first) s.wins[r.id] = (s.wins[r.id] ?? 0) + 1;
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, ESTIMATE_REVEAL_MS);
  if (!first.length) {
    ctx.say?.('لا تقديرات في هذه الجولة', undefined, KNOW_VOICE.noGuess);
    return;
  }
  const names = first.map((r) => ctx.playerName(r.id)).join(' و');
  const exact = first.some((r) => r.exact);
  ctx.say?.(
    `${exact ? 'إصابة بالضبط' : 'الأقرب'}: ${names} (${formatNumber(first[0].guess as number, q.year)})`,
    first.length === 1 ? first[0].id : undefined,
    exact ? voiceExact(names) : voiceClosestTo(names),
  );
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.items.length) return finish(ctx, s);
  s.round++;
  ask(ctx, s);
}

function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'ask') return;
  const waiting = s.participants.filter((p) => !s.answers[p] && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** How often a bot simply knows the number (by strength; hard questions much less). */
export const BOT_KNOWS: Record<BotLevel, [number, number]> = { easy: [0.12, 0.02], smart: [0.3, 0.08], expert: [0.55, 0.18] };
/** The spread of a bot's guess when it doesn't know: log-normal sigma, for normal / hard questions. */
export const BOT_SIGMA: Record<BotLevel, [number, number]> = { easy: [0.6, 0.9], smart: [0.3, 0.5], expert: [0.12, 0.25] };
/** …and in years, for a year question. */
export const BOT_YEARS: Record<BotLevel, [number, number]> = { easy: [40, 90], smart: [15, 40], expert: [5, 15] };

const gauss = (rnd: Rnd) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());

/** A number as a person would type it: two significant digits for a big one, the answer's decimals. */
export function humanRound(v: number, answer: number): number {
  const decimals = (String(answer).split('.')[1] ?? '').length;
  if (v < 0) v = 0;
  if (decimals > 0 && v < 100) {
    const f = 10 ** Math.min(decimals, 2);
    return Math.round(v * f) / f;
  }
  if (v < 100) return Math.round(v);
  const mag = 10 ** (Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

/** A bot's guess: the answer when it knows it, else a noisy guess around it (noise by strength). */
export function botGuess(level: BotLevel, q: EstimateQ, rnd: Rnd = Math.random): number {
  const k = q.hard ? 1 : 0;
  if (rnd() < BOT_KNOWS[level][k]) return q.a;
  if (q.year && q.a >= 300) {
    const g = Math.round(q.a + gauss(rnd) * BOT_YEARS[level][k]);
    return clamp(g, 1, 2026);
  }
  let g = q.a * Math.exp(clamp(gauss(rnd), -2.5, 2.5) * BOT_SIGMA[level][k]);
  // a small count is still a whole number, and a year in the Hijri calendar at least 1
  if (q.year) g = Math.max(1, g);
  const out = humanRound(g, q.a);
  return out === q.a && rnd() < 0.5 ? humanRound(g * (rnd() < 0.5 ? 0.9 : 1.1), q.a) : out;
}

/** When a bot sends its guess: reading the question and typing take a while. */
export function botDelay(level: BotLevel, seconds: number, rnd: Rnd = Math.random): number {
  const total = seconds * 1000;
  if (level === 'easy') return easyDelay(seconds);
  const [lo, hi] = level === 'smart' ? [0.35, 0.8] : [0.22, 0.55];
  return Math.round(clamp(total * (lo + rnd() * (hi - lo)), Math.min(4000, total * 0.3), total * 0.9));
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startEstimate(ctx: GameCtx, participants: string[], raw: EstimateSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeEstimate(raw);
  const items = qdeck(ctx, 'estimate', ESTIMATE).deal(settings.rounds);
  const s: State = {
    settings,
    participants: [...participants],
    items,
    round: 0,
    phase: 'ask',
    startedAt: ctx.now,
    endsAt: null,
    answers: {},
    results: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    wins: {},
    rnd,
  };
  ctx.fx('start');
  ask(ctx, s);
  return s;
}

export const estimate: GameModule<State, EstimateSettings> = {
  id: 'estimate',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startEstimate(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    const guess = readGuess(a.guess);
    if (guess === null) return;
    s.answers[by] = { guess, at: ctx.now };
    maybeReveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'ask') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    return true;
  },

  // everyone answers at once: no «your turn» chime
  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'ask') return;
    const level = botLevel(ctx);
    const q = s.items[s.round];
    for (const b of s.participants) {
      if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      ctx.bot(b, `est:${s.round}`, botDelay(level, s.settings.seconds, s.rnd), { type: 'answer', round: s.round + 1, guess: botGuess(level, q, s.rnd) });
    }
  },

  view(ctx, s, me): EstimateView {
    const q = s.items[s.round];
    const shown = s.phase !== 'ask';
    return {
      game: 'estimate',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.items.length,
      label: ESTIMATE_CAT_LABEL[q.cat],
      question: q.q,
      unit: q.unit,
      year: !!q.year,
      approx: !!q.approx,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'ask' ? s.settings.seconds * 1000 : paced(ctx, ESTIMATE_REVEAL_MS),
      answered: s.participants.filter((p) => !!s.answers[p]),
      mine: s.answers[me]?.guess ?? null,
      answer: shown ? q.a : null,
      fact: shown ? q.fact : null,
      results: shown ? s.results : null,
      scores: s.scores,
      players: s.participants,
      wins: s.wins,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    delete s.answers[id];
    delete s.wins[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = snap(patch.rounds, ESTIMATE_ROUNDS, settings.rounds);
    if (isNum(patch.seconds)) settings.seconds = snap(patch.seconds, ESTIMATE_SECONDS, settings.seconds);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as EstimateState };
