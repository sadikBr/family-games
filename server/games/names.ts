/**
 * اسم ولد، اسم بنت — the Moroccan classic.
 * A letter is drawn; everyone fills the categories on their own phone; the first to finish
 * shouts "STOP!" (or, with «ستوب» off in the settings, everyone writes until the timer ends — or until
 * everyone has said they're done). Then the family reviews answers together and votes out the dodgy ones.
 * Answers must really start with the letter: «الرباط» doesn't count for ر (see startsWithLetter).
 * Unique answer = 10, shared answer = 5 (also for the same word spelled a bit differently, like
 * «زيمبابوي» / «زمبابوي» — see similarAnswers), empty / wrong = 0.
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
  roundPoints: Record<string, number> | null;
  cellPoints: Record<string, number> | null; // `${player}|${cat}` -> points
  scores: Record<string, number>;
  botPlanned: Set<string>; // `${round}|${bot}`
}

const cellKey = (player: string, cat: string) => `${player}|${cat}`;

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.letter = s.letters[(s.round - 1) % s.letters.length];
  s.phase = 'spin';
  s.endsAt = ctx.now + SPIN_MS;
  s.stoppedBy = null;
  s.done = [];
  s.answers = Object.fromEntries(s.participants.map((id) => [id, {}]));
  s.rejects = {};
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

function verdict(ctx: GameCtx, s: State, owner: string, cat: string): NamesVerdict {
  const text = (s.answers[owner]?.[cat] ?? '').trim();
  if (!text) return 'empty';
  if (!startsWithLetter(text, s.letter)) return 'letter';
  const votes = s.rejects[cellKey(owner, cat)]?.size ?? 0;
  const eligible = voters(ctx, s, owner).length;
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
        if (isStr(a.cat) && isStr(a.text)) s.answers[by][a.cat] = a.text.slice(0, 30);
        if (filledCount(s, by) < CATS.length) throw new GameError('املأ كل الخانات أولاً قبل «ستوب»');
        if (!s.settings.stop) {
          // «ستوب» is off: mark this player as done; the round ends with the timer or when all are done
          if (!s.done.includes(by)) s.done.push(by);
          const waiting = s.participants.filter((id) => !s.done.includes(id) && ctx.isConnected(id) && !ctx.isBot(id));
          if (!waiting.length) {
            s.phase = 'stopping';
            s.endsAt = ctx.now + GRACE_MS;
            ctx.fx('buzz');
          }
          return;
        }
        s.phase = 'stopping';
        s.stoppedBy = by;
        s.endsAt = ctx.now + GRACE_MS;
        ctx.fx('buzz', by);
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
      case 'score': {
        if (s.phase === 'review') score(ctx, s);
        return;
      }
      case 'next': {
        if (s.phase !== 'results') return;
        if (s.round >= s.settings.rounds) {
          s.phase = 'final';
          s.endsAt = null;
          ctx.fx('win');
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
      return true;
    }
    if (s.phase === 'write') {
      s.phase = 'stopping';
      s.endsAt = ctx.now + GRACE_MS;
      ctx.fx('buzz');
      return true;
    }
    if (s.phase === 'stopping') {
      s.phase = 'review';
      s.endsAt = null;
      ctx.fx('tick');
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
      board,
      roundPoints: s.roundPoints,
      scores: s.scores,
    };
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
  },
};
