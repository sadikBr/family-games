/**
 * «فك الشيفرة» — everyone races to crack the same secret code of coloured pegs, each on their own phone.
 *
 * After each guess: black = right colour in the right place, white = right colour elsewhere. A round
 * ends when everyone has cracked it or used every try (or on the timer; once half of the players are
 * done the others get at most HURRY_MS). Points for cracking it: 100 per try left (maxTries + 1 − tries),
 * up to 100 for speed, and FIRST_BONUS for the first to crack it. The others' progress is shown as their
 * marks only, never their colours.
 */
import {
  CODEBREAK_COLORS,
  CODEBREAK_PEGS,
  CODEBREAK_TRIES,
  codebreakMarks,
  type CodebreakLevel,
  type CodebreakRow,
  type CodebreakSettings,
  type CodebreakView,
} from '../../src/shared/games/codebreak';
import { botGuess, randomCode } from '../codebreak-bot';
import { randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

export const ROUND_MS = 5 * 60_000;
/** Once half of the players are done, the others get at most this long. */
export const HURRY_MS = 90_000;
export const REVEAL_MS = 9000;
export const FIRST_BONUS = 100;

const LEVELS: CodebreakLevel[] = ['easy', 'medium', 'hard'];

interface State {
  settings: CodebreakSettings;
  players: string[];
  names: Record<string, string>;
  round: number;
  phase: CodebreakView['phase'];
  code: number[];
  rows: Record<string, CodebreakRow[]>;
  /** who cracked it: order (0 = first) and time since the round started */
  solved: Record<string, { order: number; ms: number }>;
  startedAt: number;
  endsAt: number | null;
  timerTotal: number;
  hurried: boolean;
  results: CodebreakView['results'];
  scores: Record<string, number>;
  /** bot → number of rows already planned */
  botNext: Record<string, number>;
}

function clean(settings: CodebreakSettings): CodebreakSettings {
  const tries = isNum(settings.maxTries) ? settings.maxTries : 10;
  return {
    rounds: isNum(settings.rounds) ? Math.max(1, Math.min(10, Math.round(settings.rounds))) : 3,
    pegs: settings.pegs === 5 ? 5 : 4,
    colors: settings.colors === 8 ? 8 : 6,
    repeats: !!settings.repeats,
    maxTries: Math.max(CODEBREAK_TRIES.min, Math.min(CODEBREAK_TRIES.max, Math.round(tries))),
    level: LEVELS.includes(settings.level) ? settings.level : 'medium',
  };
}

const done = (s: State, id: string) => s.solved[id] !== undefined || (s.rows[id]?.length ?? 0) >= s.settings.maxTries;

/** Points for cracking the code in `tries` after `ms`. */
export function codebreakPoints(maxTries: number, tries: number, ms: number, first: boolean): number {
  const speed = Math.round((100 * Math.max(0, ROUND_MS - ms)) / ROUND_MS);
  return 100 * (maxTries + 1 - tries) + speed + (first ? FIRST_BONUS : 0);
}

function topScorer(s: State): string | null {
  if (!s.players.length) return null;
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
}

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  s.code = randomCode(s.settings.pegs, s.settings.colors, s.settings.repeats);
  s.rows = Object.fromEntries(s.players.map((p) => [p, []]));
  s.solved = {};
  s.results = null;
  s.botNext = {};
  s.hurried = false;
  s.startedAt = ctx.now;
  s.timerTotal = ROUND_MS;
  s.endsAt = ctx.now + ROUND_MS;
  ctx.fx('start');
}

function finishRound(ctx: GameCtx, s: State) {
  s.results = s.players.map((id) => {
    const sv = s.solved[id];
    const tries = sv ? s.rows[id].length : null;
    const points = sv ? codebreakPoints(s.settings.maxTries, tries!, sv.ms, sv.order === 0) : 0;
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, tries, ms: sv?.ms ?? null, first: sv?.order === 0, points };
  });
  s.hurried = false;
  if (s.round >= s.settings.rounds || !s.players.length) {
    s.phase = 'final';
    s.endsAt = null;
    const w = topScorer(s);
    if (w) ctx.fx('win', w);
    else ctx.fx('win');
  } else {
    s.phase = 'reveal';
    s.endsAt = ctx.now + REVEAL_MS;
    s.timerTotal = REVEAL_MS;
    ctx.fx('reveal');
  }
}

/** Nobody left to wait for: everyone is done, or gone offline without a bot playing for them. */
const allDone = (ctx: GameCtx, s: State) => s.players.every((id) => done(s, id) || !(ctx.isConnected(id) || ctx.isBot(id)));

/** Validate a guess sent by a phone. */
function readGuess(s: State, raw: unknown): number[] {
  const { pegs, colors, repeats } = s.settings;
  if (!Array.isArray(raw) || raw.length !== pegs || !raw.every((c) => Number.isInteger(c) && c >= 0 && c < colors)) {
    throw new GameError(`املأ الخانات الـ${pegs} كلها بالألوان`);
  }
  const g = raw as number[];
  if (!repeats && new Set(g).size !== g.length) throw new GameError('لا تكرار للألوان في هذه اللعبة');
  return g;
}

export const codebreak: GameModule<State, CodebreakSettings> = {
  id: 'codebreak',

  start(ctx, participants, settings) {
    const s: State = {
      settings: clean(settings),
      players: [...participants],
      names: Object.fromEntries(participants.map((id) => [id, ctx.playerName(id)])),
      round: 0,
      phase: 'play',
      code: [],
      rows: {},
      solved: {},
      startedAt: ctx.now,
      endsAt: null,
      timerTotal: ROUND_MS,
      hurried: false,
      results: null,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      botNext: {},
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type !== 'guess' || s.phase !== 'play' || !s.players.includes(by) || done(s, by)) return;
    if (isNum(a.round) && a.round !== s.round) return; // a bot's guess from an earlier round
    const g = readGuess(s, a.code);
    if (s.rows[by].some((r) => r.guess.join() === g.join())) throw new GameError('جرّبت هذا الرمز من قبل');
    const m = codebreakMarks(g, s.code);
    s.rows[by].push({ guess: g, ...m });
    if (m.black === s.settings.pegs) {
      s.solved[by] = { order: Object.keys(s.solved).length, ms: ctx.now - s.startedAt };
      ctx.fx('correct', by);
    } else if (s.rows[by].length >= s.settings.maxTries) ctx.fx('buzz', by);
    if (allDone(ctx, s)) {
      finishRound(ctx, s);
      return;
    }
    // half of the players are done: the rest hurry up
    const finished = s.players.filter((id) => done(s, id)).length;
    if (finished * 2 >= s.players.length && s.endsAt !== null && s.endsAt > ctx.now + HURRY_MS) {
      s.endsAt = ctx.now + HURRY_MS;
      s.hurried = true;
      ctx.fx('tick');
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'play') finishRound(ctx, s);
    else if (s.phase === 'reveal') newRound(ctx, s);
    else return false;
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.players.filter((id) => !done(s, id)) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const { level } = s.settings;
    for (const b of bots) {
      if (!s.players.includes(b) || done(s, b)) continue;
      const n = s.rows[b].length;
      if (s.botNext[b] === n) continue;
      s.botNext[b] = n;
      const code = botGuess(s.rows[b], s.settings);
      // a person needs a moment to read the clues and place the pegs
      const [lo, hi] = level === 'easy' ? [14000, 24000] : level === 'medium' ? [10000, 18000] : [8000, 14000];
      const delay = n === 0 ? randDelay(4000, 9000) : randDelay(lo, hi) + (s.settings.pegs - 4) * 2000;
      ctx.bot(b, `g:${s.round}:${n}`, delay, { type: 'guess', code, round: s.round });
    }
  },

  view(_ctx, s, me): CodebreakView {
    const over = s.phase !== 'play';
    return {
      game: 'codebreak',
      phase: s.phase,
      round: s.round,
      rounds: s.settings.rounds,
      pegs: s.settings.pegs,
      colors: s.settings.colors,
      repeats: s.settings.repeats,
      maxTries: s.settings.maxTries,
      players: s.players,
      names: s.names,
      myRows: s.rows[me] ?? [],
      others: s.players
        .filter((id) => id !== me)
        .map((id) => ({ id, rows: (s.rows[id] ?? []).map(({ black, white }) => ({ black, white })), solved: s.solved[id] !== undefined, done: done(s, id) })),
      code: over || (s.players.includes(me) && done(s, me)) ? s.code : null,
      endsAt: s.endsAt,
      timerTotal: s.timerTotal,
      hurried: s.phase === 'play' && s.hurried,
      results: s.results,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    s.players = s.players.filter((p) => p !== id);
    delete s.scores[id];
    if (s.phase === 'final') return;
    if (!s.players.length) {
      s.phase = 'final';
      s.endsAt = null;
      return;
    }
    if (s.phase === 'play' && allDone(ctx, s)) finishRound(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
    if (CODEBREAK_PEGS.includes(patch.pegs as 4)) settings.pegs = patch.pegs as number;
    if (CODEBREAK_COLORS.includes(patch.colors as 6)) settings.colors = patch.colors as number;
    if (typeof patch.repeats === 'boolean') settings.repeats = patch.repeats;
    if (isNum(patch.maxTries)) settings.maxTries = Math.max(CODEBREAK_TRIES.min, Math.min(CODEBREAK_TRIES.max, Math.round(patch.maxTries)));
    if (LEVELS.includes(patch.level as CodebreakLevel)) settings.level = patch.level as CodebreakLevel;
  },
};

export type { State as CodebreakState };
