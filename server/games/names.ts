/**
 * اسم ولد، اسم بنت — the Moroccan classic.
 * A letter is drawn; everyone fills the categories on their own phone; the first to finish
 * shouts "STOP!" (or, with «ستوب» off in the settings, everyone writes until the timer ends — or until
 * everyone has said they're done). Then the family reviews answers together and votes out the dodgy ones.
 * Answers must really start with the letter: «الرباط» doesn't count for ر (see startsWithLetter).
 * Unique answer = 10, shared answer = 5 (also for the same word spelled a bit differently, like
 * «زيمبابوي» / «زمبابوي» — see similarAnswers), empty / wrong = 0.
 * Answers are checked against an Arabic dictionary (server/dictionary.ts): players see a warning
 * while writing, and with the strict check an unknown word is wrong unless most of the other players
 * vote to keep it.
 */
import {
  NAMES_CATEGORIES,
  type NamesCell,
  type NamesSettings,
  type NamesVerdict,
  type NamesView,
} from '../../src/shared/protocol';
import { GAME_LETTERS, displayLetter, similarAnswers, startsWithLetter } from '../../src/shared/arabic';
import { NAMES_DICT } from '../bot-content';
import { knownWord } from '../dictionary';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, pick, shuffle } from '../util';

const SPIN_MS = 3200;
const GRACE_MS = 3000; // after STOP: last chance for answers to arrive
const CATS = NAMES_CATEGORIES.map((c) => c.key);
const BOT_SKILL = 0.72; // chance a bot finds an answer for a category

interface State {
  settings: NamesSettings;
  phase: NamesView['phase'];
  participants: string[];
  round: number;
  letters: string[]; // shuffled letters for the whole game
  letter: string;
  endsAt: number | null;
  stoppedBy: string | null;
  done: string[];
  answers: Record<string, Record<string, string>>;
  rejects: Record<string, Set<string>>; // `${player}|${cat}` -> voters
  keeps: Record<string, Set<string>>; // strict check: `${player}|${cat}` -> voters keeping an unknown word
  known: Map<string, boolean>; // `${cat}|${text}` -> dictionary answer (memo)
  roundPoints: Record<string, number> | null;
  cellPoints: Record<string, number> | null; // `${player}|${cat}` -> points
  scores: Record<string, number>;
  botPlanned: Set<string>; // `${round}|${bot}`
}

const cellKey = (player: string, cat: string) => `${player}|${cat}`;

/** «ستوب» off: once every connected human said «أنهيت», end the writing. */
function checkAllDone(ctx: GameCtx, s: State) {
  if (s.phase !== 'write') return;
  const waiting = s.participants.filter((id) => !s.done.includes(id) && ctx.isConnected(id) && !ctx.isBot(id));
  if (waiting.length) return;
  s.phase = 'stopping';
  s.endsAt = ctx.now + GRACE_MS;
  ctx.fx('buzz');
  ctx.say?.('أنهى الجميع الكتابة');
}

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.letter = s.letters[(s.round - 1) % s.letters.length];
  s.phase = 'spin';
  s.endsAt = ctx.now + SPIN_MS;
  s.stoppedBy = null;
  s.done = [];
  s.answers = Object.fromEntries(s.participants.map((id) => [id, {}]));
  s.rejects = {};
  s.keeps = {};
  s.roundPoints = null;
  s.cellPoints = null;
  ctx.fx('start');
}

function filledCount(s: State, id: string) {
  const a = s.answers[id] ?? {};
  return CATS.filter((c) => (a[c] ?? '').trim().length > 0).length;
}

/** Humans (connected, not the owner) who can vote an answer out. */
function voters(ctx: GameCtx, s: State, owner: string) {
  return s.participants.filter((id) => id !== owner && ctx.isConnected(id) && !ctx.isBot(id));
}

const dictMode = (s: State) => s.settings.dict ?? 'strict';

/** Is this answer in the dictionary? (always true with the check off) */
function isKnown(s: State, cat: string, text: string): boolean {
  if (dictMode(s) === 'off' || !text.trim()) return true;
  const k = `${cat}|${text.trim()}`;
  let v = s.known.get(k);
  if (v === undefined) {
    v = knownWord(text, cat);
    s.known.set(k, v);
  }
  return v;
}

function verdict(ctx: GameCtx, s: State, owner: string, cat: string): NamesVerdict {
  const text = (s.answers[owner]?.[cat] ?? '').trim();
  if (!text) return 'empty';
  if (!startsWithLetter(text, s.letter)) return 'letter';
  const eligible = voters(ctx, s, owner).length;
  // strict: a word the dictionary doesn't know needs most of the others to keep it
  if (dictMode(s) === 'strict' && !isKnown(s, cat, text)) {
    const keeps = s.keeps[cellKey(owner, cat)]?.size ?? 0;
    if (!(eligible > 0 && keeps * 2 > eligible)) return 'unknown';
  }
  const votes = s.rejects[cellKey(owner, cat)]?.size ?? 0;
  if (eligible > 0 && votes * 2 > eligible) return 'rejected';
  return 'ok';
}

function score(ctx: GameCtx, s: State) {
  const cellPoints: Record<string, number> = {};
  const roundPoints: Record<string, number> = {};
  for (const cat of CATS) {
    const valid = s.participants.filter((id) => verdict(ctx, s, id, cat) === 'ok');
    // an answer is shared if anyone else wrote the same word (spelling slips included)
    const shared = new Set<string>();
    for (const a of valid)
      for (const b of valid) if (a !== b && similarAnswers(s.answers[a][cat], s.answers[b][cat])) shared.add(a);
    for (const id of s.participants) {
      let pts = 0;
      if (valid.includes(id)) pts = shared.has(id) ? 5 : 10;
      cellPoints[cellKey(id, cat)] = pts;
      roundPoints[id] = (roundPoints[id] ?? 0) + pts;
    }
  }
  for (const id of s.participants) s.scores[id] = (s.scores[id] ?? 0) + (roundPoints[id] ?? 0);
  s.cellPoints = cellPoints;
  s.roundPoints = roundPoints;
  s.phase = 'results';
  ctx.fx('reveal');
  const best = Math.max(...s.participants.map((id) => roundPoints[id] ?? 0));
  const top = s.participants.filter((id) => (roundPoints[id] ?? 0) === best);
  ctx.say?.(
    top.length === 1 ? `أكثر نقاط في الجولة: ${ctx.playerName(top[0])} (+${best})` : `تعادل في الجولة: ${best} نقطة لكلٍّ من ${top.map((id) => ctx.playerName(id)).join(' و')}`,
    top.length === 1 ? top[0] : undefined,
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

export const names: GameModule<State, NamesSettings> = {
  id: 'names',
  hostOnly: ['score', 'next', 'forceStop'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      phase: 'spin',
      participants,
      round: 0,
      letters: shuffle(GAME_LETTERS),
      letter: '',
      endsAt: null,
      stoppedBy: null,
      done: [],
      answers: {},
      rejects: {},
      keeps: {},
      known: new Map(),
      roundPoints: null,
      cellPoints: null,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
      botPlanned: new Set(),
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    const isPlayer = s.participants.includes(by);
    switch (a.type) {
      case 'answer': {
        if ((s.phase !== 'write' && s.phase !== 'stopping') || !isPlayer) return;
        if (!isStr(a.cat) || !CATS.includes(a.cat) || !isStr(a.text)) return;
        s.answers[by] ??= {};
        s.answers[by][a.cat] = a.text.slice(0, 30);
        return;
      }
      case 'stop': {
        if (s.phase !== 'write' || !isPlayer) return;
        if (isStr(a.cat) && isStr(a.text) && CATS.includes(a.cat)) (s.answers[by] ??= {})[a.cat] = a.text.slice(0, 30);
        if (!s.settings.stop) {
          // «ستوب» is off: mark this player as done (even with empty boxes);
          // the round ends with the timer or when all are done
          if (!s.done.includes(by)) s.done.push(by);
          checkAllDone(ctx, s);
          return;
        }
        if (filledCount(s, by) < CATS.length) throw new GameError('املأ كل الخانات أولاً قبل «ستوب»');
        s.phase = 'stopping';
        s.stoppedBy = by;
        s.endsAt = ctx.now + GRACE_MS;
        ctx.fx('buzz', by);
        ctx.say?.(`«ستوب» من ${ctx.playerName(by)}! ارفعوا الأقلام`, by);
        return;
      }
      case 'forceStop': {
        if (s.phase !== 'write') return;
        s.phase = 'stopping';
        s.endsAt = ctx.now + GRACE_MS;
        ctx.fx('buzz');
        return;
      }
      case 'reject': {
        if (s.phase !== 'review' || !isPlayer || ctx.isBot(by)) return;
        if (!isStr(a.player) || !isStr(a.cat) || a.player === by) return;
        const k = cellKey(a.player, a.cat);
        const set = (s.rejects[k] ??= new Set());
        if (set.has(by)) set.delete(by);
        else set.add(by);
        return;
      }
      case 'keep': {
        // strict dictionary check: vote to keep a word the dictionary doesn't know
        if (s.phase !== 'review' || !isPlayer || ctx.isBot(by)) return;
        if (!isStr(a.player) || !isStr(a.cat) || a.player === by || !CATS.includes(a.cat)) return;
        const k = cellKey(a.player, a.cat);
        const set = (s.keeps[k] ??= new Set());
        if (set.has(by)) set.delete(by);
        else set.add(by);
        return;
      }
      case 'score': {
        if (s.phase === 'review') score(ctx, s);
        return;
      }
      case 'next': {
        if (s.phase !== 'results') return;
        if (s.round >= s.settings.rounds) {
          s.phase = 'final';
          s.endsAt = null;
          const best = Math.max(...s.participants.map((id) => s.scores[id] ?? 0));
          const top = s.participants.filter((id) => (s.scores[id] ?? 0) === best);
          if (top.length === 1) ctx.fx('win', top[0]);
          else ctx.fx('win');
          return;
        }
        newRound(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'spin') {
      s.phase = 'write';
      s.endsAt = ctx.now + s.settings.seconds * 1000;
      ctx.fx('reveal');
      ctx.say?.(`الحرف «${displayLetter(s.letter)}»: اكتبوا!`);
      return true;
    }
    if (s.phase === 'write') {
      s.phase = 'stopping';
      s.endsAt = ctx.now + GRACE_MS;
      ctx.fx('buzz');
      ctx.say?.('انتهى الوقت: ارفعوا الأقلام');
      return true;
    }
    if (s.phase === 'stopping') {
      s.phase = 'review';
      s.endsAt = null;
      ctx.fx('tick');
      ctx.say?.('المراجعة: صوّتوا ضد الأجوبة الخاطئة');
      return true;
    }
    return false;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'write' || s.endsAt === null) return;
    const window = Math.max(5000, s.endsAt - ctx.now);
    for (const bot of bots) {
      const planKey = `${s.round}|${bot}`;
      if (!s.participants.includes(bot) || s.botPlanned.has(planKey)) continue;
      s.botPlanned.add(planKey);
      // bots "write" one box after another, like a person would
      let at = 2500 + Math.random() * 3000;
      const step = Math.min(7000, (window * 0.6) / CATS.length);
      for (const cat of shuffle(CATS)) {
        at += step * (0.6 + Math.random() * 0.8);
        const pool = NAMES_DICT[cat]?.[s.letter] ?? [];
        if (!pool.length || Math.random() > BOT_SKILL) continue;
        ctx.bot(bot, `ans:${s.round}:${cat}`, Math.round(at), { type: 'answer', cat, text: pick(pool) });
      }
    }
  },

  view(ctx, s, me): NamesView {
    const showBoard = s.phase === 'review' || s.phase === 'results' || s.phase === 'final';
    let board: NamesView['board'] = null;
    if (showBoard) {
      board = {};
      for (const id of s.participants) {
        board[id] = {};
        for (const cat of CATS) {
          const cell: NamesCell = {
            text: s.answers[id]?.[cat] ?? '',
            verdict: verdict(ctx, s, id, cat),
            rejects: [...(s.rejects[cellKey(id, cat)] ?? [])],
            points: s.cellPoints ? (s.cellPoints[cellKey(id, cat)] ?? 0) : null,
            unknown: !isKnown(s, cat, s.answers[id]?.[cat] ?? ''),
            keeps: [...(s.keeps[cellKey(id, cat)] ?? [])],
          };
          board[id][cat] = cell;
        }
      }
    }
    return {
      game: 'names',
      phase: s.phase,
      participants: s.participants,
      round: s.round,
      totalRounds: s.settings.rounds,
      letter: displayLetter(s.letter),
      endsAt: s.endsAt,
      stoppedBy: s.stoppedBy,
      done: s.done,
      progress: Object.fromEntries(s.participants.map((id) => [id, filledCount(s, id)])),
      myAnswers: s.answers[me] ?? {},
      myUnknown:
        s.phase === 'write' || s.phase === 'stopping'
          ? CATS.filter((c) => {
              const t = s.answers[me]?.[c] ?? '';
              return t.trim() !== '' && startsWithLetter(t, s.letter) && !isKnown(s, c, t);
            })
          : [],
      dict: dictMode(s),
      board,
      roundPoints: s.roundPoints,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    s.done = s.done.filter((p) => p !== id);
    if (s.done.length) checkAllDone(ctx, s);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, (id) => s.scores[id] ?? 0) };
  },
};
