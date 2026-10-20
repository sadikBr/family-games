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
 * Quran words can come up, any 5-letter word of the Quran (qword-words.ts); a guess on neither list is
 * then checked with the Arabic Hunspell dictionary and its affix rules (server/hunspell.ts: any prefix
 * and ending, «فبيتك», «كقلمي»…; dialect forms refused). The bots guess from the answers only.
 */
import { readFileSync } from 'node:fs';

import type { WordleMark, WordleSettings, WordleView, WordleWords } from '../../src/shared/protocol';
import { MAX_TRIES, WORD_LEN, markGuess, normWord } from '../../src/shared/wordle';
import { WORDLE_WORDS } from '../content-games2';
import { qdeck } from '../qdeck';
import { verseRef, verseText } from '../qquote-quran';
import { QWORD_ANSWERS, QWORD_CAT_LABEL, type QwordEntry } from '../qword-content';
import { quranJoinedIndex, quranWordIndex, verseFor } from '../qword-words';
import { wordleEasyGuess, wordleExpertGuess, wordleSmartGuess } from '../ai/misc-wordle';
import { spellArabic } from '../hunspell';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isStr, randInt, shuffle } from '../util';
import { voiceLastTry, voiceResult, voiceSolved } from '../voice-calls-boards';
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

let dialect: Set<string> | null = null;
/** Dialect forms (server/data/dialect-words.txt, shared with tools/wordle-dict.mjs), normalised. */
function dialectWord(g: string): boolean {
  if (!dialect) {
    try {
      dialect = new Set(readFileSync(new URL('../data/dialect-words.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean).map(normWord));
    } catch {
      dialect = new Set();
    }
  }
  return dialect.has(g);
}

/**
 * Is a (normalised) guess accepted: on the list, or a word the Hunspell dictionary knows — but not a
 * dialect form it happens to read as a rare فصحى one («عايز», «بتقول», «كده»).
 */
export function validGuess(g: string, quran: boolean): boolean {
  return (quran ? qwordValid() : VALID_GUESSES).has(g) || (!dialectWord(g) && spellArabic(g));
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
  s.timerTotal = paced(ctx, s.verse ? REVEAL_VERSE_MS : REVEAL_MS);
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

const uniq = (a: string[]) => [...new Set(a)];
const GENERAL_SET = uniq(ANSWERS);
const QURAN_SET = uniq(QWORD_KEYS);
const MIX_SET = uniq([...ANSWERS, ...QWORD_KEYS]);

/**
 * The words the hidden one may be, as a player sees it: the chosen list; in a mix, the list it comes
 * from only when the phones show it (the hint); with the hint, only Quran words of that kind.
 * `key` names the list (the expert bot remembers its opening guess per list).
 */
export function botKnowledge(s: Pick<State, 'settings' | 'words' | 'round'>): { answers: string[]; key: string } {
  const set = full(s.settings);
  const e = entry(s as State);
  const known = set.hint || set.words !== 'mix';
  if (!known) return { answers: MIX_SET, key: 'mix' };
  if (!e.quran) return { answers: GENERAL_SET, key: 'general' };
  if (!set.hint) return { answers: QURAN_SET, key: 'quran' };
  const cat = e.quran.cat;
  return { answers: uniq(QWORD_ANSWERS.filter((q) => q.cat === cat).map((q) => normWord(q.word))), key: `quran:${cat}` };
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
    if (!validGuess(g, withQuran(s))) {
      throw new GameError(withQuran(s) ? 'هذه الكلمة ليست في القرآن ولا في القاموس — جرّب كلمة أخرى' : 'هذه الكلمة ليست في القاموس — جرّب كلمة أخرى');
    }
    if (s.rows[by].some((r) => r.guess === g)) throw new GameError('جرّبت هذه الكلمة من قبل');
    const marks = markGuess(g, entry(s).key);
    s.rows[by].push({ guess: g, marks });
    const tries = s.rows[by].length;
    if (marks.every((m) => m === 'g')) {
      s.solvedAt[by] = Object.keys(s.solvedAt).length;
      ctx.fx('correct', by);
      // read aloud: who found it (never the word, the others are still looking)
      const first = s.solvedAt[by] === 0;
      ctx.say?.(`${first ? 'أول حل' : 'حل'}: ${ctx.playerName(by)} في ${tries === 1 ? 'محاولة واحدة' : tries === 2 ? 'محاولتين' : `${tries} محاولات`}`, by, voiceSolved(ctx.playerName(by), first));
      if (full(s.settings).race) {
        finishRound(ctx, s);
        return;
      }
    } else if (s.rows[by].length >= MAX_TRIES) ctx.fx('buzz', by);
    else if (tries === MAX_TRIES - 1) ctx.say?.(`المحاولة الأخيرة لـ${ctx.playerName(by)}`, by, voiceLastTry(ctx.playerName(by)));
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
        const w = topScorer(s);
        ctx.fx('win', w);
        ctx.say?.(w ? `انتهت اللعبة: الفوز لـ${ctx.playerName(w)} (${s.scores[w]} نقطة)` : 'انتهت اللعبة بالتعادل', w, voiceResult(w && ctx.playerName(w)));
      } else newRound(ctx, s);
    }
    return true;
  },

  turnOf(s) {
    return s.phase === 'play' ? s.players.filter((id) => !done(s, id)) : [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    // a bot knows what a player's phone shows: the list the word comes from, the hint, its own rows
    const { answers, key } = botKnowledge(s);
    const valid = withQuran(s) ? qwordValid() : VALID_GUESSES;
    const level = botLevel(ctx);
    for (const b of bots) {
      if (!s.players.includes(b) || done(s, b)) continue;
      const n = s.rows[b].length;
      if (s.botNext[b] === n) continue;
      s.botNext[b] = n;
      const rows = s.rows[b];
      const word =
        level === 'expert'
          ? wordleExpertGuess(answers, valid, rows, key)
          : level === 'smart'
            ? wordleSmartGuess(answers, rows)
            : wordleEasyGuess(answers, rows);
      if (!word) continue;
      ctx.bot(b, `w:${s.round}:${n}`, randInt(9000, 16000), { type: 'guess', word });
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
