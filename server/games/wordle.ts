/**
 * «كلمة السر» — everyone races to find the same hidden 5-letter word in 6 tries.
 * Green = right letter, right place; yellow = in the word, elsewhere; grey = not in the word.
 * You see the others' colours (not their letters). Points: (7 − tries) × 100, +100 for the first to solve.
 * Guesses must be real words: see server/data/wordle-valid.txt (built by tools/wordle-dict.mjs).
 */
import { readFileSync } from 'node:fs';

import type { WordleMark, WordleSettings, WordleView } from '../../src/shared/protocol';
import { MAX_TRIES, WORD_LEN, markGuess, normWord } from '../../src/shared/wordle';
import { WORDLE_WORDS } from '../content-games2';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, randInt, shuffle } from '../util';

const ROUND_MS = 4 * 60_000;
const REVEAL_MS = 7000;
/** Once half of the players are done, the others get at most this long. */
export const HURRY_MS = 60_000;
const ANSWERS = WORDLE_WORDS.map(normWord);

/** Every accepted guess (already normalised), plus the answers themselves. */
export const VALID_GUESSES: Set<string> = new Set([
  ...readFileSync(new URL('../data/wordle-valid.txt', import.meta.url), 'utf8').split('\n').filter(Boolean),
  ...ANSWERS,
]);

interface Row {
  guess: string;
  marks: WordleMark[];
}

interface State {
  settings: WordleSettings;
  players: string[];
  words: string[];
  round: number;
  phase: WordleView['phase'];
  rows: Record<string, Row[]>;
  solvedAt: Record<string, number>; // id → order of solving (0 = first)
  endsAt: number | null;
  results: WordleView['results'];
  scores: Record<string, number>;
  botNext: Record<string, number>; // bot → number of rows already planned
  hurried: boolean; // the round time was cut because half of the players are done
}

/** The top scorer, or null on a tie. */
function topScorer(s: State): string | null {
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : null;
}

const answer = (s: State) => s.words[s.round - 1];
const done = (s: State, id: string) => s.solvedAt[id] !== undefined || (s.rows[id]?.length ?? 0) >= MAX_TRIES;

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  s.rows = Object.fromEntries(s.players.map((p) => [p, []]));
  s.solvedAt = {};
  s.results = null;
  s.botNext = {};
  s.hurried = false;
  s.endsAt = ctx.now + ROUND_MS;
  ctx.fx('start');
}

function finishRound(ctx: GameCtx, s: State) {
  s.results = s.players.map((id) => {
    const solved = s.solvedAt[id] !== undefined;
    const tries = solved ? s.rows[id].length : null;
    const points = solved ? (MAX_TRIES + 1 - tries!) * 100 + (s.solvedAt[id] === 0 ? 100 : 0) : 0;
    s.scores[id] += points;
    return { id, tries, points };
  });
  s.phase = 'reveal';
  s.endsAt = ctx.now + REVEAL_MS;
  ctx.fx('reveal');
}

export const wordle: GameModule<State, WordleSettings> = {
  id: 'wordle',

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      players: participants,
      words: shuffle(ANSWERS).slice(0, settings.rounds),
      round: 0,
      phase: 'play',
      rows: {},
      solvedAt: {},
      endsAt: null,
      results: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
      botNext: {},
      hurried: false,
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type !== 'guess' || s.phase !== 'play' || !s.players.includes(by) || done(s, by)) return;
    const g = isStr(a.word) ? normWord(a.word) : '';
    if ([...g].length !== WORD_LEN || !/^[ء-ي]+$/.test(g)) throw new GameError('اكتب كلمة من 5 حروف');
    if (!VALID_GUESSES.has(g)) throw new GameError('هذه الكلمة ليست في القاموس — جرّب كلمة أخرى');
    if (s.rows[by].some((r) => r.guess === g)) throw new GameError('جرّبت هذه الكلمة من قبل');
    const marks = markGuess(g, answer(s));
    s.rows[by].push({ guess: g, marks });
    if (marks.every((m) => m === 'g')) {
      s.solvedAt[by] = Object.keys(s.solvedAt).length;
      ctx.fx('correct', by);
    } else if (s.rows[by].length >= MAX_TRIES) ctx.fx('buzz', by);
    if (s.players.every((id) => done(s, id) || !(ctx.isConnected(id) || ctx.isBot(id)))) {
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
    else if (s.phase === 'reveal') {
      if (s.round >= s.words.length) {
        s.phase = 'final';
        s.endsAt = null;
        const w = topScorer(s);
        if (w) ctx.fx('win', w);
        else ctx.fx('win');
      } else newRound(ctx, s);
    }
    return true;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    // a bot guesses words that fit what it has learned so far, at a human-ish pace
    for (const b of bots) {
      if (!s.players.includes(b) || done(s, b)) continue;
      const n = s.rows[b].length;
      if (s.botNext[b] === n) continue;
      s.botNext[b] = n;
      const fits = ANSWERS.filter((w) => s.rows[b].every((r) => markGuess(r.guess, w).join() === r.marks.join()));
      const pool = fits.length && Math.random() < 0.75 ? fits : ANSWERS;
      ctx.bot(b, `w:${s.round}:${n}`, randInt(9000, 16000), { type: 'guess', word: pool[randInt(0, pool.length - 1)] });
    }
  },

  view(ctx, s, me): WordleView {
    const shown = s.phase !== 'play';
    return {
      game: 'wordle',
      phase: s.phase,
      round: s.round,
      rounds: s.words.length,
      length: WORD_LEN,
      maxTries: MAX_TRIES,
      myRows: s.rows[me] ?? [],
      others: s.players.filter((id) => id !== me).map((id) => ({ id, rows: (s.rows[id] ?? []).map((r) => r.marks), solved: s.solvedAt[id] !== undefined, done: done(s, id) })),
      answer: shown || done(s, me) ? answer(s) : null,
      endsAt: s.endsAt,
      hurried: s.phase === 'play' && s.hurried,
      results: s.results,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'play' && s.players.every((p) => p === id || done(s, p) || !(ctx.isConnected(p) || ctx.isBot(p)))) finishRound(ctx, s);
  },
};
