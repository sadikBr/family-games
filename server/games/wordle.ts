/**
 * «كلمة السر» — everyone races to find the same hidden 5-letter word in 6 tries.
 * Green = right letter, right place; yellow = in the word, elsewhere; grey = not in the word.
 * You see the others' colours (not their letters). Points: (7 − tries) × 100, +100 for the first to solve.
 *
 * The word set is a lobby setting (`words`): everyday words («كلمات عامة»), words of the Quran
 * («كلمات قرآنية» — prophets, surahs, places, Names of Allah…, with the kind of word as an optional hint
 * and, after the round, a verse where the word appears), or a mix of both. Race mode: the round ends as
 * soon as someone finds the word. This game absorbed the former «كلمة قرآنية» (id `qword`): the room
 * maps that id here with the Quran set (see GAME_ALIASES in shared/protocol).
 * Guesses must be real words: server/data/wordle-valid.txt (built by tools/wordle-dict.mjs), plus, when
 * Quran words can come up, any 5-letter word of the Quran (qword-words.ts).
 */
import { readFileSync } from 'node:fs';

import type { WordleMark, WordleSettings, WordleView, WordleWords } from '../../src/shared/protocol';
import { MAX_TRIES, WORD_LEN, markGuess, normWord } from '../../src/shared/wordle';
import { WORDLE_WORDS } from '../content-games2';
import { qdeck } from '../qdeck';
import { verseRef, verseText } from '../qquote-quran';
import { QWORD_ANSWERS, QWORD_CAT_LABEL, type QwordEntry } from '../qword-content';
import { quranJoinedIndex, quranWordIndex, verseFor } from '../qword-words';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, randInt, shuffle } from '../util';
import { forFont } from './tajweed';

export const ROUND_MS = 4 * 60_000;
/** The answer and the scores after a round… */
export const REVEAL_MS = 7000;
/** …a little longer when there is a verse to read. */
export const REVEAL_VERSE_MS = 9000;
/** Once half of the players are done, the others get at most this long. */
export const HURRY_MS = 60_000;

const ANSWERS = WORDLE_WORDS.map(normWord);

/** Every accepted guess for everyday words (already normalised), plus the answers themselves. */
export const VALID_GUESSES: Set<string> = new Set([
  ...readFileSync(new URL('../data/wordle-valid.txt', import.meta.url), 'utf8').split('\n').filter(Boolean),
  ...ANSWERS,
]);

/** The Quran answers, normalised like the guesses. */
export const QWORD_KEYS: string[] = QWORD_ANSWERS.map((e) => normWord(e.word));

let quranValid: Set<string> | null = null;
/** Every accepted guess when Quran words can come up: the Quran's 5-letter words, the dictionary, the answers. */
export function qwordValid(): Set<string> {
  quranValid ??= new Set([...quranWordIndex().keys(), ...quranJoinedIndex().keys(), ...VALID_GUESSES, ...QWORD_KEYS]);
  return quranValid;
}

const WORD_SETS: WordleWords[] = ['general', 'quran', 'mix'];

/** A hidden word: how it is shown, its normalised letters, and the Quran entry it comes from (if any). */
interface Entry {
  word: string;
  key: string;
  quran: QwordEntry | null;
}

interface Row {
  guess: string;
  marks: WordleMark[];
}

interface State {
  settings: WordleSettings;
  players: string[];
  words: Entry[];
  round: number;
  phase: WordleView['phase'];
  rows: Record<string, Row[]>;
  solvedAt: Record<string, number>; // id → order of solving (0 = first)
  endsAt: number | null;
  timerTotal: number;
  results: WordleView['results'];
  scores: Record<string, number>;
  botNext: Record<string, number>; // bot → number of rows already planned
  hurried: boolean; // the round time was cut because half of the players are done
  /** after the round: a verse with the word (Quran words) */
  verse: { text: string; ref: string } | null;
}

/** The settings with every field filled (rooms made before the merge only have `rounds`). */
function full(s: WordleSettings): Required<WordleSettings> {
  return { rounds: s.rounds, words: s.words && WORD_SETS.includes(s.words) ? s.words : 'general', race: s.race ?? false, hint: s.hint ?? true };
}

const general = (w: string): Entry => ({ word: w, key: normWord(w), quran: null });
const fromQuran = (e: QwordEntry): Entry => ({ word: e.word, key: normWord(e.word), quran: e });

/** `n` words of the chosen set, from the room's decks (words don't come back until all were played). */
function deal(ctx: GameCtx, set: WordleWords, n: number): Entry[] {
  const g = (k: number) => qdeck(ctx, 'wordle', WORDLE_WORDS).deal(k).map(general);
  const q = (k: number) => qdeck(ctx, 'qword', QWORD_ANSWERS).deal(k).map(fromQuran);
  if (set === 'general') return g(n);
  if (set === 'quran') return q(n);
  // a mix: about half of each (an odd one either way), in a random order
  const nq = Math.floor(n / 2) + (n % 2 && Math.random() < 0.5 ? 1 : 0);
  return shuffle([...g(n - nq), ...q(nq)]);
}

/** The verse shown with a Quran word: the entry's own, or the first short verse where it appears. */
export function qwordVerse(e: QwordEntry): { text: string; ref: string } | null {
  const r = e.ref ?? verseFor(normWord(e.word));
  const found = r && verseText(r[0], r[1]);
  const text = found ? forFont(found) : found; // open tanween as the Quran font draws it
  return r && text ? { text, ref: verseRef(r[0], r[1]) } : null;
}

/** The only top scorer, or undefined on a tie. */
function topScorer(s: State): string | undefined {
  if (!s.players.length) return undefined;
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : undefined;
}

const entry = (s: State) => s.words[s.round - 1];
const done = (s: State, id: string) => s.solvedAt[id] !== undefined || (s.rows[id]?.length ?? 0) >= MAX_TRIES;
/** Quran words can come up in this game: their words are accepted as guesses too. */
const withQuran = (s: State) => full(s.settings).words !== 'general';

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.phase = 'play';
  s.rows = Object.fromEntries(s.players.map((p) => [p, []]));
  s.solvedAt = {};
  s.results = null;
  s.botNext = {};
  s.hurried = false;
  s.verse = null;
  s.endsAt = ctx.now + ROUND_MS;
  s.timerTotal = ROUND_MS;
  ctx.fx('start');
}

function finishRound(ctx: GameCtx, s: State) {
  s.results = s.players.map((id) => {
    const solved = s.solvedAt[id] !== undefined;
    const tries = solved ? s.rows[id].length : null;
    const points = solved ? (MAX_TRIES + 1 - tries!) * 100 + (s.solvedAt[id] === 0 ? 100 : 0) : 0;
    s.scores[id] = (s.scores[id] ?? 0) + points;
    return { id, tries, points };
  });
  s.phase = 'reveal';
  const q = entry(s).quran;
  s.verse = q ? qwordVerse(q) : null;
  s.timerTotal = s.verse ? REVEAL_VERSE_MS : REVEAL_MS;
  s.endsAt = ctx.now + s.timerTotal;
  ctx.fx('reveal');
}

/** Everyone who can still play is done: end the round. */
function endIfAllDone(ctx: GameCtx, s: State): boolean {
  if (s.phase !== 'play') return false;
  if (s.players.every((id) => done(s, id) || !(ctx.isConnected(id) || ctx.isBot(id)))) {
    finishRound(ctx, s);
    return true;
  }
  return false;
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

export const wordle: GameModule<State, WordleSettings> = {
  id: 'wordle',

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      players: participants,
      words: deal(ctx, full(settings).words, settings.rounds),
      round: 0,
      phase: 'play',
      rows: {},
      solvedAt: {},
      endsAt: null,
      timerTotal: ROUND_MS,
      results: null,
      scores: Object.fromEntries(participants.map((p) => [p, 0])),
      botNext: {},
      hurried: false,
      verse: null,
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (a.type !== 'guess' || s.phase !== 'play' || !s.players.includes(by) || done(s, by)) return;
    const g = isStr(a.word) ? normWord(a.word) : '';
    if ([...g].length !== WORD_LEN || !/^[ء-ي]+$/.test(g)) throw new GameError('اكتب كلمة من 5 حروف');
    if (withQuran(s) ? !qwordValid().has(g) : !VALID_GUESSES.has(g)) {
      throw new GameError(withQuran(s) ? 'هذه الكلمة ليست في القرآن ولا في القاموس — جرّب كلمة أخرى' : 'هذه الكلمة ليست في القاموس — جرّب كلمة أخرى');
    }
    if (s.rows[by].some((r) => r.guess === g)) throw new GameError('جرّبت هذه الكلمة من قبل');
    const marks = markGuess(g, entry(s).key);
    s.rows[by].push({ guess: g, marks });
    if (marks.every((m) => m === 'g')) {
      s.solvedAt[by] = Object.keys(s.solvedAt).length;
      ctx.fx('correct', by);
      if (full(s.settings).race) {
        finishRound(ctx, s);
        return;
      }
    } else if (s.rows[by].length >= MAX_TRIES) ctx.fx('buzz', by);
    if (endIfAllDone(ctx, s)) return;
    // half of the players are done: the rest hurry up
    const finished = s.players.filter((id) => done(s, id)).length;
    if (finished * 2 >= s.players.length && s.endsAt !== null && s.endsAt > ctx.now + HURRY_MS) {
      s.endsAt = ctx.now + HURRY_MS;
      s.timerTotal = HURRY_MS;
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
        ctx.fx('win', topScorer(s));
      } else newRound(ctx, s);
    }
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.players.filter((id) => !done(s, id)) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    // a bot guesses answers of the word's set that fit what it has learned so far, at a human-ish pace
    const answers = entry(s).quran ? QWORD_KEYS : ANSWERS;
    for (const b of bots) {
      if (!s.players.includes(b) || done(s, b)) continue;
      const n = s.rows[b].length;
      if (s.botNext[b] === n) continue;
      s.botNext[b] = n;
      const tried = new Set(s.rows[b].map((r) => r.guess));
      // never a word it already tried (the server would refuse it)
      const fresh = answers.filter((w) => !tried.has(w));
      const fits = fresh.filter((w) => s.rows[b].every((r) => markGuess(r.guess, w).join() === r.marks.join()));
      const pool = fits.length && Math.random() < 0.75 ? fits : fresh;
      ctx.bot(b, `w:${s.round}:${n}`, randInt(9000, 16000), { type: 'guess', word: pool[randInt(0, pool.length - 1)] });
    }
  },

  view(ctx, s, me): WordleView {
    const shown = s.phase !== 'play';
    const e = entry(s);
    const set = full(s.settings);
    // in a mix, where the word comes from is part of the hint
    const known = shown || set.hint || set.words !== 'mix';
    return {
      game: 'wordle',
      phase: s.phase,
      round: s.round,
      rounds: s.words.length,
      length: WORD_LEN,
      maxTries: MAX_TRIES,
      words: set.words,
      race: set.race,
      quran: known ? e.quran !== null : null,
      hint: e.quran && (set.hint || shown) ? QWORD_CAT_LABEL[e.quran.cat] : null,
      myRows: s.rows[me] ?? [],
      others: s.players.filter((id) => id !== me).map((id) => ({ id, rows: (s.rows[id] ?? []).map((r) => r.marks), solved: s.solvedAt[id] !== undefined, done: done(s, id) })),
      answer: shown || done(s, me) ? e.word : null,
      verse: shown ? s.verse : null,
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
    if (s.results) s.results = s.results.filter((r) => r.id !== id);
    endIfAllDone(ctx, s);
  },

  patchSettings(settings, patch) {
    if (typeof patch.rounds === 'number' && Number.isFinite(patch.rounds)) settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
    if (WORD_SETS.includes(patch.words as WordleWords)) settings.words = patch.words as WordleWords;
    if (typeof patch.race === 'boolean') settings.race = patch.race;
    if (typeof patch.hint === 'boolean') settings.hint = patch.hint;
  },

  result(s) {
    if (s.phase !== 'final' || !s.players.length) return null;
    return { places: placesByScore(s.players, (id) => s.scores[id] ?? 0) };
  },
};

export type { State as WordleState };
