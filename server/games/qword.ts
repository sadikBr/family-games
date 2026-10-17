/**
 * «كلمة قرآنية» — «كلمة السر» with a word of the Quran: everyone races to find the same hidden 5-letter word
 * in 6 tries (green = right place, yellow = elsewhere, grey = not in the word); you see the others' colours,
 * not their letters. Points: (7 − tries) × 100, +100 for the first to solve. Race mode: the round ends as soon
 * as someone finds the word. After each round a verse where the word appears is shown with its reference.
 * Guesses: any 5-letter word of the Quran (see qword-words.ts) or of «كلمة السر»'s dictionary.
 */
import { MAX_TRIES, WORD_LEN, markGuess, normWord } from '../../src/shared/wordle';
import type { WordleMark } from '../../src/shared/protocol';
import type { QwordSettings, QwordView } from '../../src/shared/games/qword';
import { QWORD_ANSWERS, QWORD_CAT_LABEL, type QwordEntry } from '../qword-content';
import { quranJoinedIndex, quranWordIndex, verseFor } from '../qword-words';
import { verseRef, verseText } from '../qquote-quran';
import { qdeck } from '../qdeck';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, randInt } from '../util';
import { VALID_GUESSES } from './wordle';

export const ROUND_MS = 4 * 60_000;
export const REVEAL_MS = 9000;
/** Once half of the players are done, the others get at most this long. */
export const HURRY_MS = 60_000;

/** The answers, normalised like the guesses. */
export const QWORD_KEYS: string[] = QWORD_ANSWERS.map((e) => normWord(e.word));

let valid: Set<string> | null = null;
/** Every accepted guess (normalised): the Quran's 5-letter words, the «كلمة السر» dictionary, the answers. */
export function qwordValid(): Set<string> {
  valid ??= new Set([...quranWordIndex().keys(), ...quranJoinedIndex().keys(), ...VALID_GUESSES, ...QWORD_KEYS]);
  return valid;
}

interface Row {
  guess: string;
  marks: WordleMark[];
}

interface State {
  settings: QwordSettings;
  players: string[];
  words: QwordEntry[];
  round: number;
  phase: QwordView['phase'];
  rows: Record<string, Row[]>;
  solvedAt: Record<string, number>; // id → order of solving (0 = first)
  endsAt: number | null;
  timerTotal: number;
  results: QwordView['results'];
  scores: Record<string, number>;
  botNext: Record<string, number>; // bot → number of rows already planned
  hurried: boolean;
  /** after the round: a verse with the word */
  verse: QwordView['verse'];
}

const entry = (s: State) => s.words[s.round - 1];
const key = (s: State) => normWord(entry(s).word);
const done = (s: State, id: string) => s.solvedAt[id] !== undefined || (s.rows[id]?.length ?? 0) >= MAX_TRIES;

/** The only top scorer, or undefined on a tie. */
function topScorer(s: State): string | undefined {
  if (!s.players.length) return undefined;
  const best = Math.max(...s.players.map((id) => s.scores[id] ?? 0));
  const top = s.players.filter((id) => (s.scores[id] ?? 0) === best);
  return top.length === 1 ? top[0] : undefined;
}

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
  s.verse = qwordVerse(entry(s));
  s.endsAt = ctx.now + REVEAL_MS;
  s.timerTotal = REVEAL_MS;
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

/** The verse shown with a word: the entry's own, or the first short verse where it appears. */
export function qwordVerse(e: QwordEntry): { text: string; ref: string } | null {
  const r = e.ref ?? verseFor(normWord(e.word));
  const text = r && verseText(r[0], r[1]);
  return r && text ? { text, ref: verseRef(r[0], r[1]) } : null;
}

export const qword: GameModule<State, QwordSettings> = {
  id: 'qword',

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      players: participants,
      // the room's deck: words don't come back until all of them have been played
      words: qdeck(ctx, 'qword', QWORD_ANSWERS).deal(settings.rounds),
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
    if (!qwordValid().has(g)) throw new GameError('هذه الكلمة ليست في القرآن ولا في القاموس — جرّب كلمة أخرى');
    if (s.rows[by].some((r) => r.guess === g)) throw new GameError('جرّبت هذه الكلمة من قبل');
    const marks = markGuess(g, key(s));
    s.rows[by].push({ guess: g, marks });
    if (marks.every((m) => m === 'g')) {
      s.solvedAt[by] = Object.keys(s.solvedAt).length;
      ctx.fx('correct', by);
      if (s.settings.race) {
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
    // a bot guesses answers that fit what it has learned so far, at a human-ish pace
    for (const b of bots) {
      if (!s.players.includes(b) || done(s, b)) continue;
      const n = s.rows[b].length;
      if (s.botNext[b] === n) continue;
      s.botNext[b] = n;
      const tried = new Set(s.rows[b].map((r) => r.guess));
      const fits = QWORD_KEYS.filter((w) => !tried.has(w) && s.rows[b].every((r) => markGuess(r.guess, w).join() === r.marks.join()));
      const any = QWORD_KEYS.filter((w) => !tried.has(w));
      const pool = fits.length && Math.random() < 0.75 ? fits : any;
      ctx.bot(b, `w:${s.round}:${n}`, randInt(9000, 16000), { type: 'guess', word: pool[randInt(0, pool.length - 1)] });
    }
  },

  view(ctx, s, me): QwordView {
    const shown = s.phase !== 'play';
    const e = entry(s);
    return {
      game: 'qword',
      phase: s.phase,
      round: s.round,
      rounds: s.words.length,
      length: WORD_LEN,
      maxTries: MAX_TRIES,
      race: s.settings.race,
      hint: s.settings.hint || shown ? QWORD_CAT_LABEL[e.cat] : null,
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
    if (typeof patch.race === 'boolean') settings.race = patch.race;
    if (typeof patch.hint === 'boolean') settings.hint = patch.hint;
  },
};

export type { State as QwordState };
