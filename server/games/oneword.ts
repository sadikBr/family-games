/**
 * «كلمة واحدة» — the cooperative party game «Just One».
 *
 * The family plays a deck of 13 cards (or 7) together. Each card one player guesses (in turn); everyone
 * else sees the mystery word and secretly writes ONE word as a clue. The clues are compared: identical or
 * near-identical ones are all removed (see oneword-match.ts), and any clue-giver may also cross out a clue
 * that breaks the rules, within a short check. The guesser sees the surviving clues and makes one guess or
 * passes: right = the card is won; pass = the card is lost; wrong = the card and the next one are lost (on
 * the last card, a won card is lost instead). The final score out of 13 comes with the official rating.
 */
import {
  ONEWORD_CARDS,
  onewordRating,
  type OnewordClue,
  type OnewordHistory,
  type OnewordLevel,
  type OnewordResult,
  type OnewordSettings,
  type OnewordView,
} from '../../src/shared/games/oneword';
import { li } from '../../src/shared/li';
import { randDelay } from '../cardkit';
import { ONEWORD_WORDS, type OnewordWord } from '../oneword-content';
import { clueKey, clueProblem, cleanClue, duplicates, guessMatches, sameClue } from '../oneword-match';
import { qdeck } from '../qdeck';
import { conventionClue, expertGuess } from '../ai/social-oneword';
import { botLevel, GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { PVOICE, voiceGuesser, voicePlain } from '../voice-calls-party';

/** the guesser's time */
export const GUESS_MS = 45_000;
/** the check of the clues: at most this long … */
export const CHECK_MS = 15_000;
/** … and at least this long, so the cancelled clues can be seen */
export const CHECK_MIN_MS = 4000;
/** the reveal after a guess (the host can move on sooner) */
export const REVEAL_MS = 9000;

const LEVELS: OnewordLevel[] = ['easy', 'medium', 'hard'];

interface State {
  settings: OnewordSettings;
  /** the players, in guessing order */
  participants: string[];
  phase: OnewordView['phase'];
  guesserIdx: number;
  guesser: string;
  word: OnewordWord | null;
  /** words already played this game (keys) */
  used: string[];
  /** clue text by clue-giver (clue phase) */
  written: Record<string, string>;
  /** the clues on the table (from the check on) */
  table: OnewordClue[];
  ready: string[];
  /** changes when a clue is crossed out or restored (bots approve again) */
  rev: number;
  won: number;
  lost: number;
  /** cards still in the deck (not counting the one in play) */
  left: number;
  guess: OnewordView['guess'];
  endsAt: number | null;
  /** the check can end once everyone approved, but not before this */
  minUntil: number;
  timerTotal: number;
  step: number;
  history: OnewordHistory[];
  /** what the bots decided for the current step (worked out once, not on every plan) */
  botMemo: { step: number; clues: Record<string, string>; guess?: string | null };
}

function sanitize(raw: Partial<OnewordSettings> | undefined): OnewordSettings {
  const cards = (ONEWORD_CARDS as readonly number[]).includes(raw?.cards as number) ? (raw!.cards as number) : 13;
  const seconds = isNum(raw?.seconds) ? Math.max(45, Math.min(90, Math.round(raw.seconds / 15) * 15)) : 60;
  const level = LEVELS.includes(raw?.level as OnewordLevel) ? (raw!.level as OnewordLevel) : 'medium';
  return { cards, seconds, level };
}

export const giversOf = (s: State) => s.participants.filter((p) => p !== s.guesser);

function setTimer(ctx: GameCtx, s: State, ms: number) {
  s.timerTotal = ms;
  s.endsAt = ctx.now + ms;
}

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

/** Draw the next card for the current guesser. */
function startCard(ctx: GameCtx, s: State) {
  const n = s.participants.length;
  s.guesserIdx = ((s.guesserIdx % n) + n) % n;
  s.guesser = s.participants[s.guesserIdx];
  const deck = qdeck(ctx, 'oneword', ONEWORD_WORDS);
  s.word = deck.draw((w) => s.used.includes(clueKey(w.w)));
  s.used.push(clueKey(s.word.w));
  s.left--;
  s.phase = 'clues';
  s.written = {};
  s.table = [];
  s.ready = [];
  s.guess = null;
  s.step++;
  setTimer(ctx, s, s.settings.seconds * 1000);
  ctx.fx('card');
}

/** Mark the clues that cancel each other (crossed-out ones stay crossed out). */
function markDuplicates(s: State) {
  const dups = duplicates(s.table.map((c) => (c.text && c.status !== 'none' ? c.text : null)));
  s.table.forEach((c, i) => {
    if (c.status === 'none') return;
    if (dups.has(i)) {
      c.status = 'dup';
      c.struckBy = null;
    } else if (c.status === 'dup') c.status = 'ok';
  });
}

function startCheck(ctx: GameCtx, s: State) {
  s.phase = 'check';
  s.table = giversOf(s).map((by) => {
    const text = s.written[by] ?? null;
    return { by, text, status: text ? 'ok' : 'none', struckBy: null };
  });
  markDuplicates(s);
  s.ready = [];
  s.step++;
  setTimer(ctx, s, CHECK_MS);
  s.minUntil = ctx.now + CHECK_MIN_MS;
  const d = s.table.filter((c) => c.status === 'dup').length;
  ctx.fx(d ? 'boom' : 'reveal');
  ctx.say?.(d ? `المقارنة: التلميحات المحذوفة لتطابقها ${d}` : 'المقارنة: لا تلميحات متطابقة');
}

function startGuess(ctx: GameCtx, s: State) {
  s.phase = 'guess';
  s.step++;
  setTimer(ctx, s, GUESS_MS);
  ctx.fx('start', s.guesser);
  const n = s.table.filter((c) => c.status === 'ok').length;
  ctx.say?.(`التلميحات الباقية: ${n} — التخمين ${li(ctx.playerName(s.guesser))}`, s.guesser, voiceGuesser(ctx.playerName(s.guesser)));
}

function resolve(ctx: GameCtx, s: State, text: string | null, result: OnewordResult) {
  const word = s.word!;
  let burned = false;
  let refunded = false;
  if (result === 'right') {
    s.won++;
    ctx.fx('correct');
  } else {
    s.lost++;
    if (result === 'wrong') {
      // a wrong guess also costs the next card — or, on the last card, one already won
      if (s.left > 0) {
        s.left--;
        s.lost++;
        burned = true;
      } else if (s.won > 0) {
        s.won--;
        s.lost++;
        refunded = true;
      }
      ctx.fx('buzz', s.guesser);
    } else ctx.fx('skip', s.guesser);
  }
  s.guess = { text, result, burned, refunded };
  s.history.push({ word: word.w, guesser: s.guesser, result, guess: text });
  s.phase = 'reveal';
  s.step++;
  setTimer(ctx, s, REVEAL_MS);
  const name = ctx.playerName(s.guesser);
  const said =
    result === 'right'
      ? `تخمين ${name}: «${text}» صحيح! +1`
      : result === 'wrong'
        ? `تخمين ${name}: «${text}» خطأ — الكلمة «${word.w}»`
        : result === 'pass'
          ? `تخمين ${name}: تجاوز — الكلمة «${word.w}»`
          : `انتهى وقت التخمين — الكلمة «${word.w}»`;
  // right / wrong / pass / time up — never the word (it is on the screens, the voice leaves it there)
  const voice = result === 'right' ? PVOICE.right : result === 'wrong' ? PVOICE.wrong : result === 'pass' ? PVOICE.pass : PVOICE.timeUp;
  ctx.say?.(said, s.guesser, voice);
}

function nextCard(ctx: GameCtx, s: State) {
  if (s.left <= 0) return finish(ctx, s);
  s.guesserIdx++;
  startCard(ctx, s);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  s.step++;
  ctx.fx('win');
  const rating = onewordRating(s.won, s.settings.cards).title;
  ctx.say?.(`النهاية: ${s.won} من ${s.settings.cards} — ${rating}`, undefined, voicePlain(rating));
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/**
 * A bot's clue: one of the word's associations, the obvious ones more often. Like people who try to be
 * original, it usually (not always) steers clear of clues already chosen (`avoid`), so cancellations happen
 * now and then without wiping out the table when many bots play.
 */
export function botClue(word: OnewordWord, avoid: string[] = [], rnd: () => number = Math.random): string {
  const ok = word.c.filter((c) => !clueProblem(c, word));
  const all = ok.length ? ok : word.c;
  const fresh = all.filter((c) => !avoid.some((a) => sameClue(a, c)));
  const pool = fresh.length && rnd() < 0.7 ? fresh : all;
  const weights = pool.map((_, i) => 1 / (1 + 0.45 * i));
  let x = rnd() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i];
    if (x <= 0) return pool[i];
  }
  return pool[0];
}

/**
 * A bot guesser's guess from the surviving clues: the word whose associations match them best (a clue that
 * fits few words weighs more). Sometimes it picks another candidate (by level); with no clue or too many
 * equal candidates it passes (null).
 */
export function botGuess(clues: string[], level: OnewordLevel, exclude: string[] = [], rnd: () => number = Math.random): string | null {
  if (!clues.length) return null;
  const score = new Map<OnewordWord, number>();
  for (const clue of clues) {
    const hits = ONEWORD_WORDS.filter((w) => !exclude.includes(clueKey(w.w)) && w.c.some((a) => sameClue(a, clue)));
    for (const w of hits) score.set(w, (score.get(w) ?? 0) + 1 / Math.sqrt(hits.length));
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return null;
  const top = ranked[0][1];
  const tops = ranked.filter(([, v]) => v >= top - 1e-9);
  const tooMany = { easy: 99, medium: 4, hard: 3 }[level];
  if (tops.length >= tooMany) return null;
  const skill = { easy: 0.55, medium: 0.75, hard: 0.92 }[level];
  let pick = tops[Math.floor(rnd() * tops.length)][0];
  if (rnd() > skill && ranked.length > 1) {
    const others = ranked.filter(([w]) => w !== pick).slice(0, 4);
    pick = others[Math.floor(rnd() * others.length)][0];
  }
  return pick.w;
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export const oneword: GameModule<State, OnewordSettings> = {
  id: 'oneword',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    const settings = sanitize(raw);
    const s: State = {
      settings,
      participants: [...participants],
      phase: 'clues',
      guesserIdx: Math.floor(Math.random() * participants.length),
      guesser: participants[0],
      word: null,
      used: [],
      written: {},
      table: [],
      ready: [],
      rev: 0,
      won: 0,
      lost: 0,
      left: settings.cards,
      guess: null,
      endsAt: null,
      minUntil: 0,
      timerTotal: 0,
      step: 0,
      history: [],
      botMemo: { step: -1, clues: {} },
    };
    startCard(ctx, s);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    if (isNum(a.step) && a.step !== s.step) return;
    switch (a.type) {
      case 'clue': {
        if (s.phase !== 'clues' || !isStr(a.text)) return;
        if (!s.participants.includes(by) || by === s.guesser) return;
        const problem = clueProblem(a.text, s.word!);
        if (problem) throw new GameError(problem);
        const first = !(by in s.written);
        s.written[by] = cleanClue(a.text);
        const givers = giversOf(s);
        const n = givers.filter((g) => g in s.written).length;
        if (first) ctx.say?.(`تلميح من ${ctx.playerName(by)} (${n} من ${givers.length})`, by);
        if (n >= givers.length) startCheck(ctx, s);
        return;
      }
      case 'strike': {
        if (s.phase !== 'check' || !isNum(a.i)) return;
        if (!s.participants.includes(by) || by === s.guesser) return;
        const c = s.table[a.i];
        if (!c || (c.status !== 'ok' && c.status !== 'struck')) return;
        const on = c.status === 'ok';
        c.status = on ? 'struck' : 'ok';
        c.struckBy = on ? by : null;
        // everyone looks again at the changed table
        s.ready = s.ready.filter((p) => p === by);
        s.rev++;
        ctx.fx('card', by);
        ctx.say?.(`${on ? 'تلميح مشطوب' : 'تلميح مُعاد'} بطلب من ${ctx.playerName(by)}`, by);
        return;
      }
      case 'ready': {
        if (s.phase !== 'check') return;
        if (!s.participants.includes(by) || by === s.guesser) return;
        if (!s.ready.includes(by)) s.ready.push(by);
        if (giversOf(s).every((g) => s.ready.includes(g)) && ctx.now >= s.minUntil) startGuess(ctx, s);
        return;
      }
      case 'guess': {
        if (s.phase !== 'guess' || by !== s.guesser || !isStr(a.text)) return;
        const text = cleanClue(a.text).slice(0, 40);
        if (!text) return;
        resolve(ctx, s, text, guessMatches(text, s.word!) ? 'right' : 'wrong');
        return;
      }
      case 'pass': {
        if (s.phase !== 'guess' || by !== s.guesser) return;
        resolve(ctx, s, null, 'pass');
        return;
      }
      case 'next':
        if (s.phase === 'reveal') nextCard(ctx, s);
        return;
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null) return false;
    if (s.phase === 'check' && ctx.now >= s.minUntil && giversOf(s).every((g) => s.ready.includes(g))) {
      startGuess(ctx, s);
      return true;
    }
    if (ctx.now < s.endsAt) return false;
    switch (s.phase) {
      case 'clues':
        startCheck(ctx, s);
        return true;
      case 'check':
        startGuess(ctx, s);
        return true;
      case 'guess':
        resolve(ctx, s, null, 'timeout');
        return true;
      case 'reveal':
        nextCard(ctx, s);
        return true;
    }
    return false;
  },

  turnOf(s) {
    if (s.phase === 'clues') return giversOf(s).filter((g) => !(g in s.written));
    if (s.phase === 'check') return giversOf(s).filter((g) => !s.ready.includes(g));
    if (s.phase === 'guess') return [s.guesser];
    return [];
  },

  botPlan(ctx, s, bots) {
    const isBot = (id: string) => bots.includes(id) || ctx.isBot(id);
    // the room's bot strength (the old per-game «مستوى البوتات» is kept in the settings but ignored)
    const level = botLevel(ctx);
    if (s.botMemo.step !== s.step) s.botMemo = { step: s.step, clues: {} };
    const memo = s.botMemo;
    switch (s.phase) {
      case 'clues': {
        const ms = s.settings.seconds * 1000;
        const givers = giversOf(s);
        const humans = givers.some((g) => !isBot(g));
        const botGivers = givers.filter(isBot);
        // a bot never sees what the others wrote; easy / smart bots only steer clear of the other bots' picks
        const chosen = Object.values(memo.clues);
        for (const g of givers) {
          if (!isBot(g) || g in s.written) continue;
          const text = (memo.clues[g] ??= level === 'expert' ? conventionClue(s.word!, botGivers.indexOf(g), humans) : botClue(s.word!, chosen));
          chosen.push(text);
          // thinking of a clue and typing it, like a person
          const delay = level === 'expert' ? randDelay(3000, Math.min(9000, ms * 0.35)) : randDelay(3000, Math.min(14_000, ms * 0.5));
          ctx.bot(g, `clue:${s.step}`, delay, { type: 'clue', step: s.step, text });
        }
        return;
      }
      case 'check':
        for (const g of giversOf(s)) {
          if (isBot(g) && !s.ready.includes(g)) ctx.bot(g, `ready:${s.step}:${s.rev}`, randDelay(1500, 3500), { type: 'ready', step: s.step });
        }
        return;
      case 'guess': {
        if (!isBot(s.guesser)) return;
        const clues = s.table.filter((c) => c.status === 'ok' && c.text).map((c) => c.text!);
        // the words already played this game can't come back (the current one's key is in the list too)
        const played = s.used.filter((k) => k !== clueKey(s.word!.w));
        if (memo.guess === undefined) memo.guess = level === 'expert' ? expertGuess(clues, played) : botGuess(clues, level === 'smart' ? 'hard' : 'medium', played);
        const g = memo.guess;
        ctx.bot(s.guesser, `guess:${s.step}`, randDelay(3500, 8000), g ? { type: 'guess', step: s.step, text: g } : { type: 'pass', step: s.step });
        return;
      }
    }
  },

  view(_ctx, s, me): OnewordView {
    const role: OnewordView['role'] = me === s.guesser ? 'guesser' : s.participants.includes(me) ? 'giver' : 'watcher';
    const open = s.phase === 'reveal' || s.phase === 'final';
    let clues: OnewordClue[] | null = null;
    if (open) clues = s.table;
    else if (role === 'giver' && s.phase !== 'clues') clues = s.table;
    else if (role === 'guesser' && s.phase === 'guess') clues = s.table.filter((c) => c.status === 'ok');
    return {
      game: 'oneword',
      phase: s.phase,
      role,
      guesser: s.guesser,
      givers: giversOf(s),
      word: s.word && (open || role === 'giver') ? s.word.w : null,
      myClue: role === 'giver' ? (s.written[me] ?? null) : null,
      submitted: s.phase === 'clues' ? giversOf(s).filter((g) => g in s.written) : [],
      clues,
      ready: s.ready,
      card: s.settings.cards - s.left,
      total: s.settings.cards,
      won: s.won,
      lost: s.lost,
      left: s.left,
      guess: s.guess,
      endsAt: s.phase === 'final' ? null : s.endsAt,
      timerTotal: s.timerTotal,
      step: s.step,
      history: s.history,
    };
  },

  onLeave(ctx, s, id) {
    const idx = s.participants.indexOf(id);
    if (idx < 0) return;
    const wasGuesser = id === s.guesser;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.written[id];
    s.ready = s.ready.filter((p) => p !== id);
    if (s.phase === 'final') return;
    if (s.participants.length < 3) {
      ctx.say?.('انتهت اللعبة: عدد اللاعبين أقل من 3');
      return finish(ctx, s);
    }
    if (idx < s.guesserIdx) s.guesserIdx--;
    else if (wasGuesser && s.phase === 'reveal') s.guesserIdx--;
    const n = s.participants.length;
    s.guesserIdx = ((s.guesserIdx % n) + n) % n;
    if (wasGuesser) {
      if (s.phase === 'reveal') return;
      // the card goes back to the deck; the next player guesses a new word
      s.left++;
      startCard(ctx, s);
      ctx.say?.(`مغادرة ${ctx.playerName(id)}: التخمين ${li(ctx.playerName(s.guesser))} بكلمة جديدة`);
      return;
    }
    s.guesser = s.participants[s.guesserIdx];
    if (s.table.some((c) => c.by === id)) {
      s.table = s.table.filter((c) => c.by !== id);
      markDuplicates(s);
    }
    if (s.phase === 'clues' && giversOf(s).every((g) => g in s.written)) startCheck(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.cards) && (ONEWORD_CARDS as readonly number[]).includes(patch.cards)) settings.cards = patch.cards;
    if (isNum(patch.seconds)) settings.seconds = Math.max(45, Math.min(90, Math.round(patch.seconds / 15) * 15));
    if (LEVELS.includes(patch.level as OnewordLevel)) settings.level = patch.level as OnewordLevel;
  },

  result(s) {
    // ended early (fewer than 3 players left) before the deck was played: no result
    if (s.phase !== 'final' || !s.participants.length || s.won + s.lost < s.settings.cards) return null;
    // the family wins with more than half of the cards (7 of 13, 4 of 7: «في المتوسط» or better)
    return { places: [[...s.participants]], coop: { won: s.won * 2 > s.settings.cards } };
  },
};

export type { State as OnewordState };
