/**
 * «موجة» — one player sees a secret point on a scale (e.g. بارد ↔ ساخن) and gives a short clue;
 * everyone else turns their dial to where they think the point is.
 * Points by distance: ≤4 → 4, ≤10 → 3, ≤17 → 2. The clue-giver earns the average of the guessers' points.
 */
import type { WaveSettings, WaveView } from '../../src/shared/protocol';
import { WAVE_SPECTRUMS } from '../content-games2';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';

const GUESS_MS = 90_000;
export const CLUE_MS = 60_000;
/** the results stay up this long (the screen shows a countdown bar) */
export const WAVE_REVEAL_MS = 11_000;

export const wavePoints = (d: number) => (d <= 4 ? 4 : d <= 10 ? 3 : d <= 17 ? 2 : 0);

interface State {
  settings: WaveSettings;
  order: string[]; // clue-givers, in turn
  /** index in `order` of this round's clue-giver */
  giverIdx: number;
  /** this round's clue-giver (stored, so it never changes when someone else leaves) */
  giver: string;
  /** the player whose clue time ran out this round */
  passedFrom: string | null;
  players: string[];
  cards: [string, string][];
  round: number;
  phase: WaveView['phase'];
  target: number;
  clue: string | null;
  guesses: Record<string, number>;
  results: WaveView['results'];
  endsAt: number | null;
  scores: Record<string, number>;
}

const psychic = (s: State) => s.giver;
const rounds = (s: State) => s.order.length * s.settings.rounds;

function nextGiver(ctx: GameCtx, s: State) {
  s.giverIdx = (s.giverIdx + 1) % s.order.length;
  s.giver = s.order[s.giverIdx];
  s.endsAt = ctx.now + CLUE_MS;
}

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'clue';
  s.target = 3 + Math.floor(Math.random() * 95);
  s.clue = null;
  s.guesses = {};
  s.results = null;
  s.passedFrom = null;
  nextGiver(ctx, s);
  ctx.fx('reveal');
}

/** The top scorer, or null on a tie. */
function topScorer(s: State): string | null {
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
}

function reveal(ctx: GameCtx, s: State) {
  const p = psychic(s);
  const guessers = s.players.filter((id) => id !== p);
  s.results = guessers.map((id) => {
    const g = s.guesses[id];
    const points = g === undefined ? 0 : wavePoints(Math.abs(g - s.target));
    s.scores[id] += points;
    return { id, guess: g ?? null, points };
  });
  const avg = s.results.length ? Math.round(s.results.reduce((t, r) => t + r.points, 0) / s.results.length) : 0;
  s.scores[p] += avg;
  s.results.push({ id: p, guess: null, points: avg });
  s.phase = 'reveal';
  s.endsAt = ctx.now + WAVE_REVEAL_MS;
  ctx.fx(s.results.some((r) => r.points >= 3) ? 'correct' : 'buzz');
  const best = s.results.filter((r) => r.id !== p).sort((a, b) => b.points - a.points)[0];
  ctx.say?.(
    best && best.points > 0 ? `الهدف كان عند ${s.target}: أقرب تخمين من ${ctx.playerName(best.id)} (+${best.points})` : `الهدف كان عند ${s.target}: لم يقترب أحد`,
    best && best.points > 0 ? best.id : undefined,
  );
}

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

export const wave: GameModule<State, WaveSettings> = {
  turnOf: (s) => s.phase === 'clue' ? [s.giver] : [],
  id: 'wave',

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    const s: State = {
      settings,
      order,
      giverIdx: -1,
      giver: order[0],
      passedFrom: null,
      players: participants,
      cards: shuffle(WAVE_SPECTRUMS),
      round: 0,
      phase: 'clue',
      target: 50,
      clue: null,
      guesses: {},
      results: null,
      endsAt: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
    };
    ctx.fx('start');
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (!s.players.includes(by)) return;
    if (a.type === 'clue') {
      if (s.phase !== 'clue' || by !== psychic(s)) return;
      const clue = isStr(a.text) ? a.text.trim().slice(0, 40) : '';
      if (!clue) throw new GameError('اكتب تلميحاً');
      s.clue = clue;
      s.phase = 'guess';
      s.endsAt = ctx.now + GUESS_MS;
      ctx.say?.(`تلميح ${ctx.playerName(by)}: «${clue}» — حرّكوا المؤشر`, by);
      return;
    }
    if (a.type === 'guess') {
      if (s.phase !== 'guess' || by === psychic(s) || s.guesses[by] !== undefined) return;
      if (!isNum(a.value)) return;
      s.guesses[by] = Math.max(0, Math.min(100, Math.round(a.value)));
      const waiting = s.players.filter((id) => id !== psychic(s) && s.guesses[id] === undefined && ctx.isConnected(id));
      if (!waiting.length) reveal(ctx, s);
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'clue') {
      // no clue in time: the next player gives it instead
      s.passedFrom = s.giver;
      nextGiver(ctx, s);
      ctx.fx('tick');
      ctx.say?.(`انتهى وقت ${ctx.playerName(s.passedFrom)}: التلميح الآن عند ${ctx.playerName(s.giver)}`, s.giver);
    } else if (s.phase === 'guess') reveal(ctx, s);
    else if (s.phase === 'reveal') {
      if (s.round >= rounds(s)) {
        s.phase = 'final';
        s.endsAt = null;
        const w = topScorer(s);
        if (w) ctx.fx('win', w);
        else ctx.fx('win');
      } else newRound(ctx, s);
    }
    return true;
  },

  view(ctx, s, me): WaveView {
    const p = psychic(s);
    const shown = s.phase === 'reveal' || s.phase === 'final';
    return {
      game: 'wave',
      phase: s.phase,
      round: s.round,
      rounds: rounds(s),
      psychic: p,
      spectrum: s.cards[(s.round - 1) % s.cards.length],
      target: shown || me === p ? s.target : null,
      clue: s.clue,
      passedFrom: s.phase === 'clue' ? s.passedFrom : null,
      locked: Object.keys(s.guesses),
      myGuess: s.guesses[me] ?? null,
      guesses: shown ? s.guesses : null,
      results: s.results,
      endsAt: s.endsAt,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.players.includes(id)) return;
    s.players = s.players.filter((p) => p !== id);
    const wasPsychic = psychic(s) === id;
    const i = s.order.indexOf(id);
    s.order = s.order.filter((p) => p !== id);
    // keep the pointer on the same clue-giver (or, if they left, just before the next one)
    if (i >= 0 && (i < s.giverIdx || (i === s.giverIdx && wasPsychic))) s.giverIdx -= 1;
    if (s.players.length < 2) {
      s.phase = 'final';
      s.endsAt = null;
      return;
    }
    if (wasPsychic && (s.phase === 'clue' || s.phase === 'guess')) {
      s.round -= 1;
      newRound(ctx, s);
      return;
    }
    if (s.phase === 'guess' && !s.players.some((p) => p !== psychic(s) && s.guesses[p] === undefined && ctx.isConnected(p))) reveal(ctx, s);
  },

  result(s) {
    if (s.phase !== 'final' || !s.players.length) return null;
    return { places: placesByScore(s.players, (id) => s.scores[id] ?? 0) };
  },
};
