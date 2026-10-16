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
const REVEAL_MS = 8000;

export const wavePoints = (d: number) => (d <= 4 ? 4 : d <= 10 ? 3 : d <= 17 ? 2 : 0);

interface State {
  settings: WaveSettings;
  order: string[]; // clue-givers, in turn
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

const psychic = (s: State) => s.order[(s.round - 1) % s.order.length];
const rounds = (s: State) => s.order.length * s.settings.rounds;

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'clue';
  s.target = 3 + Math.floor(Math.random() * 95);
  s.clue = null;
  s.guesses = {};
  s.results = null;
  s.endsAt = null;
  ctx.fx('reveal');
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
  s.endsAt = ctx.now + REVEAL_MS;
  ctx.fx(s.results.some((r) => r.points >= 3) ? 'correct' : 'buzz');
}

export const wave: GameModule<State, WaveSettings> = {
  id: 'wave',

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    const s: State = {
      settings,
      order,
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
    if (s.phase === 'guess') reveal(ctx, s);
    else if (s.phase === 'reveal') {
      if (s.round >= rounds(s)) {
        s.phase = 'final';
        s.endsAt = null;
        ctx.fx('win');
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
    s.order = s.order.filter((p) => p !== id);
    if (s.players.length < 2) {
      s.phase = 'final';
      s.endsAt = null;
      return;
    }
    if (wasPsychic && (s.phase === 'clue' || s.phase === 'guess')) {
      s.round -= 1;
      newRound(ctx, s);
    }
  },
};
