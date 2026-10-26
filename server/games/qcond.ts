/**
 * «سؤال وشرط» — the Arabic card game, on every phone. Each round turns over a question card (a category)
 * and a condition card (server/qcond-content.ts deals only pairs with known answers); everyone types; the
 * first valid answer takes the card (+1). A wrong answer gets a hint for its author only («لا تبدأ بحرف
 * الجيم», «ليست مدينة معروفة») and costs one of QCOND_TRIES tries. A real word the lists don't know for the
 * category stops the clock: the other people vote, and a majority accepts it (the round is then theirs, at
 * the moment it was sent). Everyone asking «تخطّي», or the time running out, ends the round with a few
 * valid answers as examples. Bots answer from the lists after a human delay by «مستوى البوتات» (a card
 * with few answers takes them longer); easy bots slip now and then.
 */
import {
  QCOND_CAT_INFO,
  QCOND_ROUNDS,
  QCOND_SECONDS,
  QCOND_TRIES,
  QCOND_VOTE_MS,
  qcondClean,
  type QcondAttempt,
  type QcondCondKind,
  type QcondRoundResult,
  type QcondSettings,
  type QcondView,
} from '../../src/shared/games/qcond';
import type { BotLevel } from '../../src/shared/protocol';
import { answersFor, botAnswer, botSlip, catKey, dealPairs, examplesFor, judge, realWord, type QcondPair, type Rnd } from '../qcond-content';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr } from '../util';
import { PVOICE, voiceFinal, voiceOnly, voiceRoundTo } from '../voice-calls-party';
import { QCOND_REFUSED, voiceCards } from '../voice-calls-qcond';
import { placesByScore, soleWinner } from './mcq';

/** The round's result stays on the screens this long (at the room's pace). */
export const QCOND_REVEAL_MS = 6000;
/** After a refused vote, the round goes on with at least this much time. */
export const QCOND_RESUME_MS = 6000;
/** Longest answer kept. */
const MAX_LEN = 30;

interface Vote {
  by: string;
  text: string;
  yes: Set<string>;
  no: Set<string>;
  voters: string[];
  /** when the answer was sent (the round's moment if it is accepted) */
  at: number;
  endsAt: number;
  /** the round's time left when the vote began */
  left: number;
}

interface State {
  settings: QcondSettings;
  participants: string[];
  phase: QcondView['phase'];
  pairs: QcondPair[];
  /** 0-based */
  round: number;
  /** when the cards were turned over */
  startedAt: number;
  /** play: the end of the round; reveal: the next round */
  endsAt: number | null;
  /** ms the clock stood still for votes this round */
  paused: number;
  tries: Record<string, number>;
  lastWrong: Record<string, { text: string; hint: string }>;
  attempts: QcondAttempt[];
  skips: Set<string>;
  vote: Vote | null;
  result: QcondRoundResult | null;
  scores: Record<string, number>;
  /** bumped when the bots must think again (a new round, the end of a vote) */
  botGen: number;
  planned: Set<string>;
  rnd: Rnd;
}

const snap = (v: unknown, opts: readonly number[], d: number): number =>
  isNum(v) ? opts.reduce((best, o) => (Math.abs(o - v) < Math.abs(best - v) ? o : best), opts[0]) : d;

export function sanitizeQcond(raw: Partial<QcondSettings> | undefined): QcondSettings {
  return { rounds: snap(raw?.rounds, QCOND_ROUNDS, 10), seconds: snap(raw?.seconds, QCOND_SECONDS, 30) };
}

const pair = (s: State) => s.pairs[s.round];
const humans = (ctx: GameCtx, s: State) => s.participants.filter((p) => ctx.isConnected(p) && !ctx.isBot(p));

function startRound(ctx: GameCtx, s: State) {
  s.phase = 'play';
  s.startedAt = ctx.now;
  s.endsAt = ctx.now + s.settings.seconds * 1000;
  s.paused = 0;
  s.tries = {};
  s.lastWrong = {};
  s.attempts = [];
  s.skips = new Set();
  s.vote = null;
  s.result = null;
  s.botGen++;
  const { cat, cond } = pair(s);
  ctx.fx('start');
  ctx.say?.(`${QCOND_CAT_INFO[cat].label} — ${condText(s)}`, undefined, voiceCards(cat, cond));
}

/** The condition card's words for a say (kept short). */
function condText(s: State): string {
  const c = pair(s).cond;
  const l = c.letter === 'ا' ? 'أ' : c.letter;
  switch (c.kind) {
    case 'start':
      return `تبدأ بـ«${l}»`;
    case 'end':
      return c.letter === 'ه' ? 'تنتهي بـ«ة» أو «ه»' : `تنتهي بـ«${l}»`;
    case 'has':
      return `فيها «${l}»`;
    case 'len':
      return `من ${c.n} حروف`;
    case 'min':
      return `من ${c.n} حروف أو أكثر`;
    case 'noAlif':
      return 'بلا ألف';
  }
}

/** The round's time so far (votes not counted). */
const playMs = (s: State, at: number) => Math.max(0, at - s.startedAt - s.paused);

function endRound(ctx: GameCtx, s: State, r: Omit<QcondRoundResult, 'examples' | 'attempts'>) {
  const { cat, cond } = pair(s);
  s.result = { ...r, examples: examplesFor(cat, cond, r.text ? [r.text] : [], 3, s.rnd), attempts: s.attempts.slice() };
  s.phase = 'reveal';
  s.vote = null;
  s.endsAt = ctx.now + paced(ctx, QCOND_REVEAL_MS);
  if (r.winner) {
    s.scores[r.winner] = (s.scores[r.winner] ?? 0) + 1;
    ctx.fx('correct', r.winner);
    ctx.say?.(`البطاقة من نصيب ${ctx.playerName(r.winner)}: «${r.text}»`, r.winner, voiceRoundTo(ctx.playerName(r.winner)));
    return;
  }
  const ex = s.result.examples.join('، ');
  if (r.how === 'skip') {
    ctx.fx('skip');
    ctx.say?.(`تخطّي البطاقة. أجوبة ممكنة: ${ex}`, undefined, PVOICE.pass);
  } else {
    ctx.fx('buzz');
    ctx.say?.(`انتهى الوقت. أجوبة ممكنة: ${ex}`, undefined, PVOICE.timeUp);
  }
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  s.vote = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.pairs.length) return finish(ctx, s);
  s.round++;
  startRound(ctx, s);
}

/** Everyone still in the game asked to skip: the card goes away. */
function checkSkip(ctx: GameCtx, s: State) {
  if (s.phase !== 'play') return;
  const need = humans(ctx, s);
  if (need.length && need.every((p) => s.skips.has(p))) endRound(ctx, s, { winner: null, text: null, ms: null, how: 'skip' });
}

/* ------------------------------------------------------------------ */
/* Votes                                                               */
/* ------------------------------------------------------------------ */

function openVote(ctx: GameCtx, s: State, by: string, text: string, voters: string[]) {
  const left = Math.max(0, (s.endsAt ?? ctx.now) - ctx.now);
  s.vote = { by, text, yes: new Set(), no: new Set(), voters, at: ctx.now, endsAt: ctx.now + QCOND_VOTE_MS, left };
  s.phase = 'vote';
  s.endsAt = null;
  ctx.fx('tick');
  ctx.say?.(`تصويت: هل «${text}» ${QCOND_CAT_INFO[pair(s).cat].is}؟`, by, PVOICE.vote);
}

/** Settle the vote when its result is sure (or at its end: more yes than no). */
function checkVote(ctx: GameCtx, s: State, final: boolean) {
  const v = s.vote;
  if (s.phase !== 'vote' || !v) return;
  const voters = v.voters.filter((p) => s.participants.includes(p) && ctx.isConnected(p));
  const yes = voters.filter((p) => v.yes.has(p)).length;
  const no = voters.filter((p) => v.no.has(p)).length;
  let accept: boolean | null = null;
  if (!voters.length) accept = false;
  else if (yes * 2 > voters.length) accept = true;
  else if (no * 2 >= voters.length) accept = false;
  else if (final) accept = yes > no;
  if (accept === null) return;
  const attempt = [...s.attempts].reverse().find((a) => a.id === v.by && a.text === v.text);
  if (accept) {
    if (attempt) {
      attempt.ok = true;
      delete attempt.hint;
    }
    endRound(ctx, s, { winner: v.by, text: v.text, ms: playMs(s, v.at), how: 'vote' });
    return;
  }
  // refused: the clock starts again where it stood (with a few seconds at least)
  if (attempt) attempt.hint = 'رفضته الأغلبية';
  s.lastWrong[v.by] = { text: v.text, hint: 'رفضته الأغلبية' };
  s.phase = 'play';
  s.paused += ctx.now - v.at;
  s.endsAt = ctx.now + Math.max(v.left, QCOND_RESUME_MS);
  s.vote = null;
  s.botGen++;
  ctx.say?.(`لم يُقبل «${v.text}»`, v.by, QCOND_REFUSED);
}

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

function answer(ctx: GameCtx, s: State, by: string, raw: string) {
  const text = qcondClean(raw).slice(0, MAX_LEN).trim();
  if (!text) return;
  const used = s.tries[by] ?? 0;
  if (used >= QCOND_TRIES) return;
  // the same refused word again: not another try
  if (s.lastWrong[by] && catKey(s.lastWrong[by].text) === catKey(text)) return;
  const { cat, cond } = pair(s);
  const j = judge(cat, cond, text);
  if (j.ok) {
    s.attempts.push({ id: by, text, ok: true });
    endRound(ctx, s, { winner: by, text, ms: playMs(s, ctx.now), how: 'answer' });
    return;
  }
  s.tries[by] = used + 1;
  s.lastWrong[by] = { text, hint: j.hint };
  s.attempts.push({ id: by, text, ok: false, hint: j.hint });
  // a real word the lists don't have for this card: the others decide (bots never ask, never vote)
  const voters = humans(ctx, s).filter((p) => p !== by);
  if (j.real && !ctx.isBot(by) && voters.length) {
    s.lastWrong[by] = { text, hint: 'ليست في قوائم اللعبة: الكلمة للتصويت' };
    openVote(ctx, s, by, text, voters);
  }
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Time to find an answer to an ordinary card, by strength: [fastest, slowest] in ms. */
export const QCOND_BOT_MS: Record<BotLevel, [number, number]> = { easy: [9000, 16000], smart: [6000, 11000], expert: [3500, 6500] };
/** How often a bot finds an answer at all… */
export const QCOND_BOT_FIND: Record<BotLevel, number> = { easy: 0.6, smart: 0.82, expert: 0.97 };
/** …and how often it first sends a word that misses the condition. */
export const QCOND_BOT_SLIP: Record<BotLevel, number> = { easy: 0.35, smart: 0.12, expert: 0.03 };
/** Some conditions take longer to think about than «starts with». */
const KIND_THINK: Record<QcondCondKind, number> = { start: 1, end: 1.15, has: 1.2, len: 1.25, min: 1.1, noAlif: 1.2 };

/** How long a bot needs for this card: its strength, the kind of condition, fewer answers = longer. */
export function qcondBotDelay(level: BotLevel, answers: number, kind: QcondCondKind, rnd: Rnd = Math.random): number {
  const [lo, hi] = QCOND_BOT_MS[level];
  const rarity = 1 + 0.7 * clamp((16 - answers) / 12, 0, 1);
  return Math.round((lo + rnd() * (hi - lo)) * rarity * KIND_THINK[kind]);
}

function planBot(ctx: GameCtx, s: State, b: string) {
  const level = botLevel(ctx);
  const { cat, cond } = pair(s);
  const left = (s.endsAt ?? ctx.now) - ctx.now - 400;
  const round = s.round + 1;
  const key = `ans:${s.round}:${s.botGen}`;
  let at = qcondBotDelay(level, answersFor(cat, cond).length, cond.kind, s.rnd);
  if ((s.tries[b] ?? 0) < QCOND_TRIES - 1 && s.rnd() < QCOND_BOT_SLIP[level]) {
    const slip = botSlip(cat, cond, s.rnd);
    const slipAt = Math.round(at * (0.55 + 0.2 * s.rnd()));
    if (slip && slipAt < left) ctx.bot(b, `${key}:slip`, slipAt, { type: 'answer', round, text: slip });
    at += 2000 + Math.round(s.rnd() * 3000);
  }
  if (s.rnd() > QCOND_BOT_FIND[level] || at >= left) return;
  const text = botAnswer(cat, cond, level, s.rnd);
  if (text) ctx.bot(b, key, at, { type: 'answer', round, text });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startQcond(ctx: GameCtx, participants: string[], raw: QcondSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeQcond(raw);
  const s: State = {
    settings,
    participants: [...participants],
    phase: 'play',
    pairs: dealPairs(settings.rounds, rnd),
    round: 0,
    startedAt: ctx.now,
    endsAt: null,
    paused: 0,
    tries: {},
    lastWrong: {},
    attempts: [],
    skips: new Set(),
    vote: null,
    result: null,
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    botGen: 0,
    planned: new Set(),
    rnd,
  };
  startRound(ctx, s);
  // load the dictionaries now, not at the first wrong answer (half a second)
  setTimeout(() => {
    try {
      realWord('animal', 'قط');
    } catch {
      // no dictionary: words are judged by the lists only
    }
  }, 0);
  return s;
}

export const qcond: GameModule<State, QcondSettings> = {
  id: 'qcond',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startQcond(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    switch (a.type) {
      case 'answer': {
        if (s.phase !== 'play' || !isStr(a.text)) return;
        if (isNum(a.round) && a.round !== s.round + 1) return;
        if (s.endsAt !== null && ctx.now > s.endsAt) return;
        answer(ctx, s, by, a.text);
        return;
      }
      case 'vote': {
        const v = s.vote;
        if (s.phase !== 'vote' || !v || !v.voters.includes(by) || typeof a.yes !== 'boolean') return;
        (a.yes ? v.yes : v.no).add(by);
        (a.yes ? v.no : v.yes).delete(by);
        checkVote(ctx, s, false);
        return;
      }
      case 'skip': {
        if (s.phase !== 'play' || ctx.isBot(by)) return;
        if (s.skips.has(by)) s.skips.delete(by);
        else s.skips.add(by);
        checkSkip(ctx, s);
        return;
      }
      case 'next': {
        if (s.phase === 'reveal') next(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase === 'play' && s.endsAt !== null && ctx.now >= s.endsAt) {
      endRound(ctx, s, { winner: null, text: null, ms: null, how: 'timeout' });
      return true;
    }
    if (s.phase === 'play') {
      // someone who went offline no longer holds back a skip
      const before = s.result;
      checkSkip(ctx, s);
      return s.result !== before;
    }
    if (s.phase === 'vote' && s.vote) {
      const before = s.vote;
      checkVote(ctx, s, ctx.now >= s.vote.endsAt);
      return s.vote !== before;
    }
    if (s.phase === 'reveal' && s.endsAt !== null && ctx.now >= s.endsAt) {
      next(ctx, s);
      return true;
    }
    return false;
  },

  // everyone answers at once: no «your turn» alert
  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    for (const b of s.participants) {
      if (!(bots.includes(b) || ctx.isBot(b))) continue;
      const k = `${s.round}|${s.botGen}|${b}`;
      if (s.planned.has(k)) continue;
      s.planned.add(k);
      planBot(ctx, s, b);
    }
  },

  view(ctx, s, me): QcondView {
    const { cat, cond } = pair(s);
    const v = s.vote;
    const playing = s.phase === 'play';
    return {
      game: 'qcond',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.pairs.length,
      cat,
      cond,
      endsAt: s.phase === 'vote' ? (v?.endsAt ?? null) : s.endsAt,
      timerTotal: s.phase === 'vote' ? QCOND_VOTE_MS : s.phase === 'reveal' ? paced(ctx, QCOND_REVEAL_MS) : s.settings.seconds * 1000,
      tries: { ...s.tries },
      maxTries: QCOND_TRIES,
      myLast: s.phase === 'play' || s.phase === 'vote' ? (s.lastWrong[me] ?? null) : null,
      skips: playing ? s.participants.filter((p) => s.skips.has(p)) : [],
      skipNeeded: humans(ctx, s).length,
      vote: v
        ? { by: v.by, text: v.text, question: `هل «${v.text}» ${QCOND_CAT_INFO[cat].is}؟`, yes: [...v.yes], no: [...v.no], voters: v.voters, endsAt: v.endsAt, total: QCOND_VOTE_MS }
        : null,
      result: s.phase === 'reveal' || s.phase === 'final' ? s.result : null,
      scores: s.scores,
      players: s.participants,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    s.skips.delete(id);
    if (s.phase === 'final') return;
    if (s.participants.length < 2) return finish(ctx, s);
    if (s.vote?.by === id) {
      // the word's author left: the round goes on
      s.phase = 'play';
      s.paused += ctx.now - s.vote.at;
      s.endsAt = ctx.now + Math.max(s.vote.left, QCOND_RESUME_MS);
      s.vote = null;
      s.botGen++;
      return;
    }
    checkVote(ctx, s, false);
    checkSkip(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = snap(patch.rounds, QCOND_ROUNDS, settings.rounds);
    if (isNum(patch.seconds)) settings.seconds = snap(patch.seconds, QCOND_SECONDS, settings.seconds);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as QcondState };
