/**
 * «البالونات» — the family letter-guessing game (rules at the top of src/shared/games/balloons.ts).
 *
 * Each round: the setter (the next seat every round; bots too) picks a category and writes a word, checked
 * by server/balloons-words.ts (or asks the app for one); with «الكلمة من التطبيق» or only two players the
 * app chooses and everyone guesses. The guessers play in seat order after the setter: a letter in the
 * word shows every box it fills (+1 a box, play again), a letter that isn't pops one of the 7 balloons and
 * the turn passes (each phone plays the small pop itself); «أعرف الكلمة!» right = the hidden boxes + 2
 * and the round won, wrong = a balloon and the turn passes (nobody sits out). The word complete or the
 * last balloon popped ends the round (the setter: +1 per popped balloon); a short reveal, then the next
 * round; a podium at the end.
 *
 * The view never holds the hidden letters for a guesser: only the boxes found so far (and the length).
 * The setter's phone gets the word. Bots choose letters from the public board (balloons-words.ts).
 */
import {
  BALLOONS_CATS,
  BALLOONS_CAT_LABEL,
  BALLOONS_COUNT,
  BALLOONS_ROUNDS,
  BALLOONS_TURN_SECONDS,
  BALLOONS_WORD_BONUS,
  letterKey,
  prepareWord,
  type BalloonsCat,
  type BalloonsMove,
  type BalloonsResult,
  type BalloonsSettings,
  type BalloonsTry,
  type BalloonsView,
} from '../../src/shared/games/balloons';
import type { BotLevel } from '../../src/shared/protocol';
import { botMove, checkSecret, pickCat, pickWord, warmDictionaries, type Rnd } from '../balloons-words';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { voiceCategory, voiceRoundEnd } from '../voice-calls-balloons';
import { placesByScore, soleWinner } from './mcq';

/** The round's result stays on the screens this long (at the room's pace). */
export const BALLOONS_REVEAL_MS = 7000;
/** Longest whole-word guess kept. */
const MAX_LEN = 24;

interface Round {
  /** who chose the word (null: the app) */
  setter: string | null;
  cat: BalloonsCat | null;
  chars: string[];
  keys: string[];
  alStripped: boolean;
  found: boolean[];
  tried: BalloonsTry[];
  wrongWords: { by: string; text: string; key: string }[];
  balloons: number;
  guessers: string[];
  turnIdx: number;
  gains: Record<string, number>;
}

interface State {
  settings: BalloonsSettings;
  participants: string[];
  /** the seats in the order of the start (the setters' rotation) */
  seats: string[];
  /** rounds whose setter was taken from the seats */
  seatPtr: number;
  /** the app chooses every word (the setting, or two players) */
  appMode: boolean;
  totalRounds: number;
  phase: BalloonsView['phase'];
  /** 0-based */
  round: number;
  r: Round;
  /** guess: the end of the turn (null: no limit); reveal: the next round */
  endsAt: number | null;
  last: BalloonsMove | null;
  seq: number;
  result: BalloonsResult | null;
  scores: Record<string, number>;
  usedKeys: Set<string>;
  recentCats: BalloonsCat[];
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeBalloons(raw: Partial<BalloonsSettings> | undefined): BalloonsSettings {
  return {
    rounds: snap(raw?.rounds, BALLOONS_ROUNDS, 0),
    appWords: raw?.appWords === true,
    cat: raw?.cat === 'mix' || BALLOONS_CATS.includes(raw?.cat as BalloonsCat) ? (raw!.cat as BalloonsCat | 'mix') : 'mix',
    turnSec: snap(raw?.turnSec, BALLOONS_TURN_SECONDS, 0),
  };
}

/** The game's number of rounds: everyone sets once (the app: one per player, 3 at least), or 5 / 10. */
export function roundsFor(settings: BalloonsSettings, players: number, appMode: boolean): number {
  if (settings.rounds > 0) return settings.rounds;
  return appMode ? Math.max(3, players) : players;
}

const emptyRound = (): Round => ({
  setter: null,
  cat: null,
  chars: [],
  keys: [],
  alStripped: false,
  found: [],
  tried: [],
  wrongWords: [],
  balloons: BALLOONS_COUNT,
  guessers: [],
  turnIdx: 0,
  gains: {},
});

const turnOf = (s: State): string | null => (s.phase === 'guess' ? (s.r.guessers[s.r.turnIdx] ?? null) : null);
const turnMs = (s: State) => s.settings.turnSec * 1000;
const display = (key: string) => (key === 'ا' ? 'ا/أ' : key === 'ه' ? 'ه/ة' : key === 'ي' ? 'ي/ى' : key);

/** The players in seat order starting after `from` (the setter), or from the round's own seat. */
function rotated(list: string[], start: number): string[] {
  if (!list.length) return [];
  const k = ((start % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/** The next setter: the next seat still in the game. */
function nextSetter(s: State): string | null {
  for (let i = 0; i < s.seats.length; i++) {
    const id = s.seats[(s.seatPtr + i) % s.seats.length];
    if (s.participants.includes(id)) {
      s.seatPtr = s.seatPtr + i + 1;
      return id;
    }
  }
  return null;
}

function startRound(ctx: GameCtx, s: State) {
  s.r = emptyRound();
  s.result = null;
  s.last = null;
  s.endsAt = null;
  if (s.appMode) {
    const cat = pickCat(s.settings.cat, s.rnd, s.recentCats);
    const w = pickWord(cat, 'app', s.rnd, s.usedKeys);
    const p = prepareWord(w.word);
    if (!p.ok) throw new Error(`balloons: unusable list word ${w.word}`);
    s.r.guessers = rotated(s.participants, s.round);
    beginGuess(ctx, s, cat, p.word.chars, p.word.keys, false);
    return;
  }
  const setter = nextSetter(s);
  if (!setter) return finish(ctx, s);
  s.r.setter = setter;
  const at = s.participants.indexOf(setter);
  s.r.guessers = rotated(s.participants, at + 1).filter((p) => p !== setter);
  s.phase = 'set';
  ctx.fx('start');
  ctx.say?.(`الكلمة السرية عند ${ctx.playerName(setter)}`, setter);
}

function beginGuess(ctx: GameCtx, s: State, cat: BalloonsCat, chars: string[], keys: string[], alStripped: boolean) {
  s.r.cat = cat;
  s.r.chars = chars;
  s.r.keys = keys;
  s.r.alStripped = alStripped;
  s.r.found = keys.map(() => false);
  s.r.turnIdx = 0;
  s.usedKeys.add(keys.join(''));
  s.recentCats.push(cat);
  s.phase = 'guess';
  s.endsAt = turnMs(s) ? ctx.now + turnMs(s) : null;
  if (s.r.setter) ctx.fx('reveal');
  else ctx.fx('start');
  ctx.say?.(`الفئة: ${BALLOONS_CAT_LABEL[cat]} · ${chars.length} حروف`, undefined, voiceCategory(cat));
}

function addGain(s: State, id: string, n: number) {
  if (!n) return;
  s.r.gains[id] = (s.r.gains[id] ?? 0) + n;
  s.scores[id] = (s.scores[id] ?? 0) + n;
}

function move(s: State, m: Omit<BalloonsMove, 'seq'>) {
  s.seq++;
  s.last = { ...m, seq: s.seq };
}

/** The turn goes to the next guesser (a new timer). */
function nextTurn(ctx: GameCtx, s: State) {
  if (s.r.guessers.length) s.r.turnIdx = (s.r.turnIdx + 1) % s.r.guessers.length;
  s.endsAt = turnMs(s) ? ctx.now + turnMs(s) : null;
}

function endRound(ctx: GameCtx, s: State, won: boolean, how: BalloonsResult['how'], by: string | null) {
  const word = s.r.chars.join('');
  const popped = BALLOONS_COUNT - s.r.balloons;
  if (s.r.setter && how !== 'left' && s.participants.includes(s.r.setter)) addGain(s, s.r.setter, popped);
  s.r.found = s.r.keys.map(() => true);
  s.result = { won, word, how, by, gains: { ...s.r.gains } };
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, BALLOONS_REVEAL_MS);
  if (how === 'left') {
    ctx.say?.('نهاية الجولة بعد مغادرة صاحب الكلمة');
    return;
  }
  if (won) {
    ctx.fx('correct');
    ctx.say?.(by ? `الكلمة «${word}»! بفضل ${ctx.playerName(by)}` : `الكلمة «${word}»!`, by ?? undefined, voiceRoundEnd(true, word));
  } else {
    ctx.fx('reveal');
    ctx.say?.(`انفجرت البالونات كلها، والكلمة «${word}»`, s.r.setter ?? undefined, voiceRoundEnd(false, word));
  }
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.totalRounds) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

function setWord(ctx: GameCtx, s: State, cat: BalloonsCat, text: string | null) {
  if (text === null) {
    const w = pickWord(cat, 'app', s.rnd, s.usedKeys);
    const p = prepareWord(w.word);
    if (!p.ok) throw new GameError(p.error);
    beginGuess(ctx, s, cat, p.word.chars, p.word.keys, false);
    return;
  }
  const c = checkSecret(cat, text);
  if (!c.ok) throw new GameError(c.error);
  if (s.usedKeys.has(c.word.keys.join(''))) throw new GameError('هذه الكلمة لُعبت في هذه المباراة: اختر كلمة أخرى');
  beginGuess(ctx, s, cat, c.word.chars, c.word.keys, c.word.alStripped);
}

function guessLetter(ctx: GameCtx, s: State, by: string, raw: string) {
  const key = letterKey(raw);
  if (!key) throw new GameError('اختر حرفاً من لوحة الحروف');
  if (s.r.tried.some((t) => t.key === key)) throw new GameError('جُرّب هذا الحرف من قبل');
  let n = 0;
  s.r.keys.forEach((k, i) => {
    if (k === key && !s.r.found[i]) {
      s.r.found[i] = true;
      n++;
    }
  });
  const name = ctx.playerName(by);
  s.r.tried.push({ key, ok: n > 0, by, n });
  if (n > 0) {
    addGain(s, by, n);
    move(s, { by, kind: 'letter', text: key, ok: true, gain: n });
    if (s.r.found.every(Boolean)) return endRound(ctx, s, true, 'letters', by);
    ctx.fx('correct', by);
    ctx.say?.(`«${display(key)}» في الكلمة: +${n} · ${name}`, by);
    // the same player chooses again (a fresh timer)
    s.endsAt = turnMs(s) ? ctx.now + turnMs(s) : null;
    return;
  }
  s.r.balloons--;
  move(s, { by, kind: 'letter', text: key, ok: false, gain: 0 });
  if (s.r.balloons <= 0) return endRound(ctx, s, false, 'balloons', null);
  ctx.say?.(`«${display(key)}» ليس في الكلمة: انفجر بالون · ${name}`, by);
  nextTurn(ctx, s);
}

function guessWord(ctx: GameCtx, s: State, by: string, raw: string) {
  const p = prepareWord(raw.slice(0, MAX_LEN));
  if (!p.ok) throw new GameError(p.error);
  const key = p.word.keys.join('');
  const text = p.word.chars.join('');
  if (s.r.wrongWords.some((w) => w.key === key)) throw new GameError('جُرّبت هذه الكلمة من قبل');
  if (key === s.r.keys.join('')) {
    const hidden = s.r.found.filter((f) => !f).length;
    const gain = hidden + BALLOONS_WORD_BONUS;
    addGain(s, by, gain);
    move(s, { by, kind: 'word', text, ok: true, gain });
    return endRound(ctx, s, true, 'word', by);
  }
  s.r.balloons--;
  s.r.wrongWords.push({ by, text, key });
  move(s, { by, kind: 'word', text, ok: false, gain: 0 });
  if (s.r.balloons <= 0) return endRound(ctx, s, false, 'balloons', null);
  ctx.say?.(`«${text}» ليست الكلمة: انفجر بالون · ${ctx.playerName(by)}`, by);
  nextTurn(ctx, s);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** A bot's time to choose a letter, by strength: [fastest, slowest] in ms. */
export const BALLOONS_BOT_MS: Record<BotLevel, [number, number]> = { easy: [2200, 4500], smart: [1800, 3600], expert: [1500, 3000] };

function planGuess(ctx: GameCtx, s: State, b: string) {
  const level = botLevel(ctx);
  const m = botMove(
    level,
    {
      cat: s.r.cat!,
      slots: s.r.keys.map((k, i) => (s.r.found[i] ? k : null)),
      tried: new Set(s.r.tried.map((t) => t.key)),
      wrongWords: new Set(s.r.wrongWords.map((w) => w.key)),
      balloons: s.r.balloons,
    },
    s.rnd,
  );
  const [lo, hi] = BALLOONS_BOT_MS[level];
  const delay = Math.round(lo + s.rnd() * (hi - lo)) + (m.kind === 'word' ? 900 : 0);
  const key = `g:${s.round}:${s.seq}:${s.r.turnIdx}`;
  ctx.bot(b, key, delay, m.kind === 'word' ? { type: 'word', round: s.round + 1, text: m.text } : { type: 'letter', round: s.round + 1, key: m.key });
}

function planSet(ctx: GameCtx, s: State, b: string) {
  // a bot chooses at its strength; a person away (autopilot) gets an ordinary word of the app's
  const level: BotLevel | 'app' = ctx.isBot(b) ? botLevel(ctx) : 'app';
  const cat = pickCat('mix', s.rnd, s.recentCats);
  const w = pickWord(cat, level, s.rnd, s.usedKeys);
  ctx.bot(b, `set:${s.round}`, 2500 + Math.round(s.rnd() * 2000), { type: 'set', round: s.round + 1, cat, word: w.word });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startBalloons(ctx: GameCtx, participants: string[], raw: BalloonsSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeBalloons(raw);
  const appMode = settings.appWords || participants.length <= 2;
  const s: State = {
    settings,
    participants: [...participants],
    seats: [...participants],
    seatPtr: 0,
    appMode,
    totalRounds: roundsFor(settings, participants.length, appMode),
    phase: 'set',
    round: 0,
    r: emptyRound(),
    endsAt: null,
    last: null,
    seq: 0,
    result: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    usedKeys: new Set(),
    recentCats: [],
    rnd,
  };
  startRound(ctx, s);
  // load the dictionaries now, not when the first word is typed (half a second)
  if (!appMode) setTimeout(warmDictionaries, 0);
  return s;
}

const isCat = (v: unknown): v is BalloonsCat => isStr(v) && BALLOONS_CATS.includes(v as BalloonsCat);

export const balloons: GameModule<State, BalloonsSettings> = {
  id: 'balloons',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startBalloons(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (isNum(a.round) && a.round !== s.round + 1) return;
    switch (a.type) {
      case 'set': {
        if (s.phase !== 'set' || s.r.setter !== by) throw new GameError('ليس دورك');
        if (!isCat(a.cat)) throw new GameError('اختر فئة الكلمة');
        if (a.word !== undefined && !isStr(a.word)) return;
        setWord(ctx, s, a.cat, isStr(a.word) ? a.word : null);
        return;
      }
      case 'letter':
      case 'word': {
        if (s.phase !== 'guess') return;
        if (turnOf(s) !== by) throw new GameError('ليس دورك');
        if (a.type === 'letter') {
          if (!isStr(a.key)) return;
          guessLetter(ctx, s, by, a.key);
        } else {
          if (!isStr(a.text)) return;
          guessWord(ctx, s, by, a.text);
        }
        return;
      }
      case 'next': {
        if (s.phase === 'reveal') next(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase === 'guess' && s.endsAt !== null && ctx.now >= s.endsAt) {
      const id = turnOf(s);
      if (id) {
        move(s, { by: id, kind: 'timeout', text: '', ok: false, gain: 0 });
        ctx.say?.(`انتهى وقت الدور · ${ctx.playerName(id)}`, id);
      }
      nextTurn(ctx, s);
      return true;
    }
    if (s.phase === 'reveal' && s.endsAt !== null && ctx.now >= s.endsAt) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  turnOf(s) {
    if (s.phase === 'set' && s.r.setter) return [s.r.setter];
    const t = turnOf(s);
    return t ? [t] : [];
  },

  botPlan(ctx, s, bots) {
    const isBotSeat = (id: string | null) => !!id && (bots.includes(id) || ctx.isBot(id));
    if (s.phase === 'set' && isBotSeat(s.r.setter)) planSet(ctx, s, s.r.setter!);
    else if (s.phase === 'guess' && isBotSeat(turnOf(s))) planGuess(ctx, s, turnOf(s)!);
  },

  view(ctx, s, me): BalloonsView {
    const r = s.r;
    const over = s.phase === 'reveal' || s.phase === 'final';
    const mine = r.setter === me;
    return {
      game: 'balloons',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.totalRounds,
      setter: r.setter,
      cat: s.phase === 'set' ? null : r.cat,
      slots: s.phase === 'set' ? [] : r.chars.map((c, i) => (over || r.found[i] ? c : null)),
      secret: r.chars.length && (over || mine) ? r.chars.join('') : null,
      alStripped: (over || mine) && r.alStripped,
      tried: r.tried.map((t) => ({ ...t })),
      wrongWords: r.wrongWords.map(({ by, text }) => ({ by, text })),
      balloons: r.balloons,
      maxBalloons: BALLOONS_COUNT,
      turn: turnOf(s),
      guessers: r.guessers.slice(),
      endsAt: s.endsAt,
      timerTotal: s.phase === 'reveal' ? paced(ctx, BALLOONS_REVEAL_MS) : turnMs(s),
      last: s.last,
      result: over ? s.result : null,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    const turn = turnOf(s);
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    if (s.phase === 'final') return;
    if (s.participants.length < 2) return finish(ctx, s);
    const r = s.r;
    if (r.setter === id && (s.phase === 'set' || s.phase === 'guess')) {
      if (s.phase === 'set') return next(ctx, s);
      return endRound(ctx, s, false, 'left', null);
    }
    const at = r.guessers.indexOf(id);
    if (at < 0) return;
    r.guessers = r.guessers.filter((p) => p !== id);
    if (s.phase !== 'guess') return;
    if (!r.guessers.length) return endRound(ctx, s, false, 'left', null);
    if (at < r.turnIdx) r.turnIdx--;
    if (r.turnIdx >= r.guessers.length) r.turnIdx = 0;
    // the leaver held the turn: the next one starts a fresh turn
    if (turn === id) s.endsAt = turnMs(s) ? ctx.now + turnMs(s) : null;
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = snap(patch.rounds, BALLOONS_ROUNDS, settings.rounds);
    if (typeof patch.appWords === 'boolean') settings.appWords = patch.appWords;
    if (patch.cat === 'mix' || isCat(patch.cat)) settings.cat = patch.cat;
    if (isNum(patch.turnSec)) settings.turnSec = snap(patch.turnSec, BALLOONS_TURN_SECONDS, settings.turnSec);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as BalloonsState };
