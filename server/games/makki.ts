/**
 * «مكية أم مدنية؟» — each round shows a surah (name and number in the Mushaf, from server/makki-data.ts);
 * everyone answers once on their own phone: «مكية» or «مدنية», or (other question types) the juz' where it
 * begins or its number of verses among four options. A right answer scores (10 + up to 5 for speed) × the
 * streak (3 in a row ×1.5, 5 in a row ×2); a wrong answer or none breaks the streak. The answer and the
 * surah's card (verses, juz', why it is called so, its theme, the note on a disputed classification) stay on
 * the server until the reveal. The reveal moves on by itself (or the host taps «التالي»); then the podium.
 *
 * The surahs of a game go from famous to less famous; the Madani ones, fewer in the Mushaf, come a little
 * more often in «مكية أم مدنية» so both answers keep coming. The room remembers which surahs it saw.
 *
 * Bots are right with a chance set by their strength and the surah's fame (the verses question counts as
 * harder), and take the time a person needs to read and tap, a little longer on the harder surahs.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  MAKKI_ASK,
  MAKKI_DEFAULTS,
  MAKKI_MODES,
  MAKKI_ROUNDS,
  MAKKI_SCOPES,
  MAKKI_SECONDS,
  ayatLabel,
  juzLabel,
  makkiKinds,
  makkiMult,
  makkiPoints,
  makkiSeconds,
  makkiSpeed,
  type MakkiKind,
  type MakkiMode,
  type MakkiResult,
  type MakkiScope,
  type MakkiSettings,
  type MakkiView,
} from '../../src/shared/games/makki';
import { quizDelay } from '../ai/social-quiz';
import { AMMA_FIRST, DISPUTED_NOTE, SURAHS, type Fame, type Surah } from '../makki-data';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { KNOW_VOICE, voiceFastestRight } from '../voice-calls-knowledge';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

/** The reveal (answer + the surah's card) stays this long, at the room's pace. */
export const MAKKI_REVEAL_MS = 9000;

type Rnd = () => number;

export interface MakkiQuestion {
  surah: Surah;
  kind: MakkiKind;
  options: string[];
  correct: number;
  seconds: number;
}

interface State {
  settings: MakkiSettings;
  participants: string[];
  qs: MakkiQuestion[];
  round: number;
  phase: MakkiView['phase'];
  startedAt: number;
  endsAt: number | null;
  answers: Record<string, { choice: number; at: number }>;
  results: MakkiResult[] | null;
  scores: Record<string, number>;
  streaks: Record<string, number>;
  best: Record<string, number>;
  rights: Record<string, number>;
  rnd: Rnd;
}

export function sanitizeMakki(raw: Partial<MakkiSettings> | undefined): MakkiSettings {
  return {
    rounds: snapTo(raw?.rounds, MAKKI_ROUNDS, MAKKI_DEFAULTS.rounds),
    seconds: snapTo(raw?.seconds, MAKKI_SECONDS, MAKKI_DEFAULTS.seconds),
    mode: isStr(raw?.mode) && (MAKKI_MODES as string[]).includes(raw.mode) ? (raw.mode as MakkiMode) : MAKKI_DEFAULTS.mode,
    scope: isStr(raw?.scope) && (MAKKI_SCOPES as string[]).includes(raw.scope) ? (raw.scope as MakkiScope) : MAKKI_DEFAULTS.scope,
  };
}

/* ------------------------------------------------------------------ */
/* Dealing                                                             */
/* ------------------------------------------------------------------ */

export const scopeSurahs = (scope: MakkiScope): Surah[] => SURAHS.filter((x) => scope === 'all' || x.n >= AMMA_FIRST);

const SEEN_KEY = 'makki:seen';

/** The surahs this room has already seen (forgotten once most of the scope has been seen). */
export function roomSeen(ctx: GameCtx, scope: MakkiScope): Set<number> {
  let seen = ctx.memo.get(SEEN_KEY) as Set<number> | undefined;
  if (!seen) {
    seen = new Set();
    ctx.memo.set(SEEN_KEY, seen);
  }
  const pool = scopeSurahs(scope);
  const left = pool.filter((x) => !seen.has(x.n)).length;
  if (left < pool.length * 0.35) for (const x of pool) seen.delete(x.n);
  return seen;
}

/** One pick among weighted items. */
function weighted<T>(items: T[], weight: (t: T) => number, rnd: Rnd): T {
  const ws = items.map(weight);
  let r = rnd() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** `k` distinct values from `cands`, each drawn with its weight. */
function pickDistinct(cands: number[], k: number, weight: (v: number) => number, rnd: Rnd): number[] {
  const left = [...cands];
  const out: number[] = [];
  while (out.length < k && left.length) {
    const v = weighted(left, weight, rnd);
    out.push(v);
    left.splice(left.indexOf(v), 1);
  }
  return out;
}

/** Three wrong juz' numbers near the right one (1–30). */
export function juzDistractors(juz: number, rnd: Rnd): number[] {
  const cands = Array.from({ length: 30 }, (_, i) => i + 1).filter((j) => j !== juz && Math.abs(j - juz) <= 5);
  return pickDistinct(cands, 3, (j) => [0, 4, 3, 2, 1, 1][Math.abs(j - juz)], rnd);
}

/** Three wrong verse counts, plausible for that surah (never below 3, all different). */
export function ayatDistractors(ayat: number, rnd: Rnd): number[] {
  const step = Math.max(1, Math.round(ayat * 0.1));
  const cands = new Set<number>();
  for (let k = 1; k <= 4; k++) {
    for (const sign of [-1, 1]) {
      const jitter = step > 2 ? Math.floor(rnd() * Math.ceil(step / 2)) : 0;
      const v = ayat + sign * (k * step + jitter);
      if (v >= 3 && v !== ayat) cands.add(v);
    }
  }
  return pickDistinct([...cands], 3, (v) => 1 / Math.abs(v - ayat) ** 0.5, rnd);
}

export function makeQuestion(surah: Surah, kind: MakkiKind, seconds: number, rnd: Rnd): MakkiQuestion {
  const secs = makkiSeconds(kind, seconds);
  if (kind === 'type') return { surah, kind, options: ['مكية', 'مدنية'], correct: surah.madani ? 1 : 0, seconds: secs };
  const right = kind === 'juz' ? surah.juz : surah.ayat;
  const values = [right, ...(kind === 'juz' ? juzDistractors(right, rnd) : ayatDistractors(right, rnd))].sort((a, b) => a - b);
  return { surah, kind, options: values.map((v) => (kind === 'juz' ? juzLabel(v) : ayatLabel(v))), correct: values.indexOf(right), seconds: secs };
}

/** The fame a round prefers: famous surahs in the first ~40% of the game, then known, then harder. */
export function wantedFame(i: number, n: number): Fame {
  const p = n <= 1 ? 0 : i / (n - 1);
  return p < 0.4 ? 1 : p < 0.75 ? 2 : 3;
}

const KIND_WEIGHT: Record<MakkiKind, number> = { type: 2, juz: 1, ayat: 1 };

/** The game's questions: kinds by the mode, surahs from famous to harder, no surah twice. */
export function dealQuestions(settings: MakkiSettings, rnd: Rnd, seen: Set<number> = new Set()): MakkiQuestion[] {
  const kinds = makkiKinds(settings.mode, settings.scope);
  const pool = scopeSurahs(settings.scope);
  const n = Math.min(settings.rounds, pool.length);
  const used = new Set<number>();
  const qs: MakkiQuestion[] = [];
  // Madani surahs are fewer: a boost keeps both answers coming in «مكية أم مدنية»
  const madaniBoost = settings.scope === 'amma' ? 4 : 2.2;
  for (let i = 0; i < n; i++) {
    const kind = kinds.length === 1 ? kinds[0] : weighted(kinds, (k) => KIND_WEIGHT[k], rnd);
    const want = wantedFame(i, n);
    const left = pool.filter((x) => !used.has(x.n));
    const surah = weighted(
      left,
      (x) => {
        const d = Math.abs(x.fame - want);
        const fame = d === 0 ? 4 : d === 1 ? 1 : 0.25;
        // the many short surahs of juz' 30 would make «في أي جزء تبدأ؟» too plain: fewer of them there
        const juz30 = kind === 'juz' && x.juz === 30 ? 0.3 : 1;
        return fame * juz30 * (seen.has(x.n) ? 0.12 : 1) * (kind === 'type' && x.madani ? madaniBoost : 1);
      },
      rnd,
    );
    used.add(surah.n);
    qs.push(makeQuestion(surah, kind, settings.seconds, rnd));
  }
  return qs;
}

/* ------------------------------------------------------------------ */
/* Rounds                                                              */
/* ------------------------------------------------------------------ */

const totalMs = (q: MakkiQuestion) => q.seconds * 1000;

/** One player's result for the current question; `prev` = their streak before it. */
export function scoreAnswer(choice: number | null, ms: number | null, correct: number, total: number, prev: number): Omit<MakkiResult, 'id'> {
  if (choice === null || ms === null) return { choice: null, correct: false, speed: 0, mult: 1, points: 0, streak: 0, ms: null };
  if (choice !== correct) return { choice, correct: false, speed: 0, mult: 1, points: 0, streak: 0, ms };
  const streak = prev + 1;
  return { choice, correct: true, speed: makkiSpeed(ms, total), mult: makkiMult(streak), points: makkiPoints(ms, total, streak), streak, ms };
}

function ask(ctx: GameCtx, s: State) {
  s.phase = 'ask';
  s.answers = {};
  s.results = null;
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + totalMs(s.qs[s.round]);
  ctx.fx('reveal');
}

function reveal(ctx: GameCtx, s: State) {
  const q = s.qs[s.round];
  s.results = s.participants.map((id) => {
    const a = s.answers[id];
    return { id, ...scoreAnswer(a?.choice ?? null, a ? a.at - s.startedAt : null, q.correct, totalMs(q), s.streaks[id] ?? 0) };
  });
  for (const r of s.results) {
    s.scores[r.id] = (s.scores[r.id] ?? 0) + r.points;
    s.streaks[r.id] = r.streak;
    s.best[r.id] = Math.max(s.best[r.id] ?? 0, r.streak);
    if (r.correct) s.rights[r.id] = (s.rights[r.id] ?? 0) + 1;
  }
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, MAKKI_REVEAL_MS);
  const right = s.results.filter((r) => r.correct);
  if (!right.length) {
    ctx.say?.('لا إجابة صحيحة في هذه السورة', undefined, KNOW_VOICE.noRight);
    return;
  }
  const fastest = Math.min(...right.map((r) => r.ms ?? 0));
  const first = right.filter((r) => r.ms === fastest);
  const names = first.map((r) => ctx.playerName(r.id)).join(' و');
  ctx.say?.(`أسرع إجابة صحيحة: ${names}`, first.length === 1 ? first[0].id : undefined, voiceFastestRight(names));
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.qs.length) return finish(ctx, s);
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

/** A bot's chance of the right answer by the surah's fame [famous, known, harder]. */
export const MAKKI_BOT_RIGHT: Record<BotLevel, [number, number, number]> = {
  easy: [0.85, 0.72, 0.6],
  smart: [0.93, 0.84, 0.75],
  expert: [0.98, 0.93, 0.88],
};

/** How hard a question is (1–3): the surah's fame, one step harder for its number of verses. */
export const hardness = (q: MakkiQuestion): Fame => (q.kind === 'ayat' ? (Math.min(3, q.surah.fame + 1) as Fame) : q.surah.fame);

export const botRightChance = (level: BotLevel, q: MakkiQuestion): number => MAKKI_BOT_RIGHT[level][hardness(q) - 1];

/** A bot's answer and when it comes: reading the name and the options, then a tap; slower on harder surahs. */
export function botAnswer(level: BotLevel, q: MakkiQuestion, rnd: Rnd = Math.random): { choice: number; delay: number } {
  const right = rnd() < botRightChance(level, q);
  const wrong = q.options.map((_, i) => i).filter((i) => i !== q.correct);
  const choice = right ? q.correct : wrong[Math.floor(rnd() * wrong.length)];
  const chars = q.surah.name.length + 5 + MAKKI_ASK[q.kind].length + Math.round(0.6 * q.options.join('').length);
  const base = quizDelay(level, q.seconds, chars, right);
  const think = level === 'easy' ? 0 : (hardness(q) - 1) * (300 + Math.floor(rnd() * 500));
  return { choice, delay: Math.round(clamp(base + think, 900, q.seconds * 1000 * 0.9)) };
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startMakki(ctx: GameCtx, participants: string[], raw: MakkiSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeMakki(raw);
  const seen = roomSeen(ctx, settings.scope);
  const qs = dealQuestions(settings, rnd, seen);
  for (const q of qs) seen.add(q.surah.n);
  const zero = () => Object.fromEntries(participants.map((p) => [p, 0]));
  const s: State = {
    settings,
    participants: [...participants],
    qs,
    round: 0,
    phase: 'ask',
    startedAt: ctx.now,
    endsAt: null,
    answers: {},
    results: null,
    scores: zero(),
    streaks: zero(),
    best: zero(),
    rights: zero(),
    rnd,
  };
  ctx.fx('start');
  ask(ctx, s);
  return s;
}

export const makki: GameModule<State, MakkiSettings> = {
  id: 'makki',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startMakki(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'answer' || s.phase !== 'ask' || !s.participants.includes(by) || s.answers[by]) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    const q = s.qs[s.round];
    if (!isNum(a.choice) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= q.options.length) return;
    if (ctx.now > (s.endsAt ?? 0)) return;
    s.answers[by] = { choice: a.choice, at: ctx.now };
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
    const q = s.qs[s.round];
    for (const b of s.participants) {
      if (s.answers[b] || !(bots.includes(b) || ctx.isBot(b))) continue;
      const { choice, delay } = botAnswer(level, q, s.rnd);
      ctx.bot(b, `makki:${s.round}`, delay, { type: 'answer', round: s.round + 1, choice });
    }
  },

  view(ctx, s, me): MakkiView {
    const q = s.qs[s.round];
    const shown = s.phase !== 'ask';
    const x = q.surah;
    return {
      game: 'makki',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.qs.length,
      kind: q.kind,
      n: x.n,
      name: x.name,
      ask: MAKKI_ASK[q.kind],
      options: q.options,
      endsAt: s.endsAt,
      timerTotal: s.phase === 'ask' ? totalMs(q) : paced(ctx, MAKKI_REVEAL_MS),
      answered: s.participants.filter((p) => !!s.answers[p]),
      mine: s.answers[me]?.choice ?? null,
      correct: shown ? q.correct : null,
      card: shown ? { madani: x.madani, ayat: x.ayat, juz: x.juz, why: x.why ?? null, theme: x.theme ?? null, note: x.disputed ? DISPUTED_NOTE : null } : null,
      results: shown ? s.results : null,
      scores: s.scores,
      players: s.participants,
      streaks: s.streaks,
      best: s.best,
      rights: s.rights,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    for (const m of [s.scores, s.answers, s.streaks, s.best, s.rights]) delete m[id];
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.rounds !== undefined) settings.rounds = snapTo(patch.rounds, MAKKI_ROUNDS, settings.rounds);
    if (patch.seconds !== undefined) settings.seconds = snapTo(patch.seconds, MAKKI_SECONDS, settings.seconds);
    if (isStr(patch.mode) && (MAKKI_MODES as string[]).includes(patch.mode)) settings.mode = patch.mode as MakkiMode;
    if (isStr(patch.scope) && (MAKKI_SCOPES as string[]).includes(patch.scope)) settings.scope = patch.scope as MakkiScope;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as MakkiState };
