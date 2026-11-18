/**
 * «من سيربح المليون؟» — the game (rules at the top of src/shared/games/million.ts).
 *
 * Turns: every player in seat order takes the hot seat (once or twice). A turn: a short intro, then the
 * questions of the ladder one by one (million-content.ts: the level of each rung, never a question twice in
 * a game, the room's decks so they don't come back soon either). A question: «ask» (the contestant picks,
 * the audience answers secretly; 50:50 at once, «اسأل الجمهور» → «poll» until the audience has voted,
 * «اتصل بصديق» → «call» until the friend answers; the question's clock pauses meanwhile) → «lock» (the final
 * answer lit, a moment of suspense) → «reveal» → the next rung, or «turnEnd» (the prize won) → next turn.
 *
 * The view never holds the right answer before the reveal, nor anyone's audience answer but one's own
 * (the audience chart only once asked for, as counts).
 */
import {
  MILLION_AUDIENCE_POINT,
  MILLION_DEFAULTS,
  MILLION_FRIEND_MS,
  MILLION_LETTERS,
  MILLION_POLL_MS,
  MILLION_ROUNDS,
  MILLION_STEP_LEVEL,
  MILLION_TIMERS,
  MILLION_TOPICS,
  formatMoney,
  prizeAt,
  safePrize,
  type MillionCall,
  type MillionLifeline,
  type MillionOutcome,
  type MillionPhase,
  type MillionSettings,
  type MillionTopic,
  type MillionTurn,
  type MillionView,
} from '../../src/shared/games/million';
import { millionPools, dupKey, type MillionQ } from '../million-content';
import { audienceDelay, botAnswer, friendDelay, friendSure, makeMind, seatDelay, seatMove, type Mind } from '../million-bot';
import { qdeck } from '../qdeck';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, randInt } from '../util';
import { voiceFinal, voiceOnly, voiceQuestion } from '../voice-calls-party';
import { mcqOptions } from './mcq';

/** Pauses (at the room's pace). */
export const MILLION_INTRO_MS = 3200;
export const MILLION_RIGHT_MS = 3000;
export const MILLION_END_REVEAL_MS = 4200;
export const MILLION_TURN_END_MS = 6500;
/** The suspense after «الإجابة النهائية»: longer as the prize grows. */
export const lockMs = (step: number) => 1400 + step * 140;
/** A contestant away this long (no timer) walks away. */
export const MILLION_AWAY_MS = 60_000;

interface Q {
  text: string;
  options: string[];
  correct: number;
  label: string;
  lv: number;
  /** what marks it as used (text and near-duplicate key) */
  keys: string[];
}

interface State {
  settings: MillionSettings;
  participants: string[];
  /** the hot seat, turn by turn */
  queue: string[];
  turnIdx: number;
  phase: MillionPhase;
  hot: string | null;
  step: number;
  won: number;
  q: Q | null;
  removed: number[];
  used: Record<MillionLifeline, boolean>;
  /** lifelines used on this question (a new bot decision after each) */
  helps: number;
  locked: number | null;
  outcome: MillionOutcome | null;
  /** end of the current pause / poll */
  endsAt: number | null;
  endsTotal: number;
  /** the question's clock (ask only) */
  clockEnds: number | null;
  pausedLeft: number | null;
  poll: number[] | null;
  call: MillionCall | null;
  audience: string[];
  answers: Record<string, number>;
  audienceRight: string[] | null;
  prizes: Record<string, number>;
  audiencePts: Record<string, number>;
  history: MillionTurn[];
  usedQ: Set<string>;
  minds: Record<string, Mind>;
  awaySince: number | null;
}

const snap = (v: unknown, opts: readonly number[], d: number): number => (isNum(v) && opts.includes(v) ? v : d);
const isTopic = (v: unknown): v is MillionTopic => isStr(v) && MILLION_TOPICS.some((t) => t.key === v);

export function sanitizeMillion(raw: Partial<MillionSettings> | undefined): MillionSettings {
  return {
    rounds: snap(raw?.rounds, MILLION_ROUNDS, MILLION_DEFAULTS.rounds),
    timer: snap(raw?.timer, MILLION_TIMERS, MILLION_DEFAULTS.timer),
    topic: isTopic(raw?.topic) ? raw.topic : MILLION_DEFAULTS.topic,
  };
}

const letter = (i: number) => MILLION_LETTERS[i] ?? '?';
const money = formatMoney;
const present = (ctx: GameCtx, id: string) => ctx.isConnected(id) || ctx.isBot(id);
const noLifelines = (): Record<MillionLifeline, boolean> => ({ fifty: false, audience: false, friend: false });

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

/** The levels to try for a rung: its own, then the nearest ones. */
function levelOrder(lv: number): number[] {
  const out = [lv];
  for (let d = 1; d <= 4; d++) for (const l of [lv - d, lv + d]) if (l >= 1 && l <= 5) out.push(l);
  return out;
}

/** A fresh question for the rung (never one already asked in this game). */
export function drawQuestion(ctx: GameCtx, topic: MillionTopic, step: number, usedQ: Set<string>): Q {
  const pools = millionPools()[topic];
  const isUsed = (q: MillionQ) => usedQ.has(q.q) || usedQ.has(dupKey(q));
  let picked: MillionQ | null = null;
  for (const lv of levelOrder(MILLION_STEP_LEVEL[step])) {
    const pool = pools[lv];
    if (!pool.some((q) => !isUsed(q))) continue;
    picked = qdeck(ctx, `million:${topic}:${lv}`, pool).draw(isUsed);
    break;
  }
  // (every question of the topic already asked: can't happen with the pools' sizes, but stay safe)
  picked ??= qdeck(ctx, `million:${topic}:${MILLION_STEP_LEVEL[step]}`, pools[MILLION_STEP_LEVEL[step]]).draw();
  const { options, correct } = mcqOptions(picked.a, [...picked.w]);
  return { text: picked.q, options, correct, label: picked.label, lv: picked.lv, keys: [picked.q, dupKey(picked)] };
}

/* ------------------------------------------------------------------ */
/* Flow                                                                */
/* ------------------------------------------------------------------ */

function setPause(ctx: GameCtx, s: State, ms: number) {
  s.endsTotal = paced(ctx, ms);
  s.endsAt = ctx.now + s.endsTotal;
}

function startTurn(ctx: GameCtx, s: State) {
  // skip turns of players who left
  while (s.turnIdx < s.queue.length && !s.participants.includes(s.queue[s.turnIdx])) s.turnIdx++;
  if (s.turnIdx >= s.queue.length) return finish(ctx, s);
  const hot = s.queue[s.turnIdx];
  s.hot = hot;
  s.step = 0;
  s.won = 0;
  s.used = noLifelines();
  s.audience = s.participants.filter((p) => p !== hot);
  s.q = null;
  s.outcome = null;
  s.locked = null;
  s.removed = [];
  s.poll = null;
  s.call = null;
  s.answers = {};
  s.audienceRight = null;
  s.clockEnds = null;
  s.pausedLeft = null;
  s.awaySince = null;
  s.phase = 'intro';
  setPause(ctx, s, MILLION_INTRO_MS);
  ctx.fx('start', hot);
  ctx.say?.(`الكرسي الساخن: ${ctx.playerName(hot)}`, hot);
}

function ask(ctx: GameCtx, s: State) {
  const q = drawQuestion(ctx, s.settings.topic, s.step, s.usedQ);
  for (const k of q.keys) s.usedQ.add(k);
  s.q = q;
  s.removed = [];
  s.helps = 0;
  s.locked = null;
  s.outcome = null;
  s.poll = null;
  s.call = null;
  s.answers = {};
  s.audienceRight = null;
  s.minds = {};
  s.phase = 'ask';
  s.endsAt = null;
  s.pausedLeft = null;
  s.clockEnds = s.settings.timer ? ctx.now + s.settings.timer * 1000 : null;
  s.awaySince = null;
  voiceOnly(ctx, voiceQuestion(q.text, q.options));
}

/** A lifeline that waits for someone: the question's clock stops. */
function pauseClock(ctx: GameCtx, s: State) {
  if (s.clockEnds !== null) s.pausedLeft = Math.max(3000, s.clockEnds - ctx.now);
  s.clockEnds = null;
}

function resume(ctx: GameCtx, s: State) {
  s.phase = 'ask';
  s.endsAt = null;
  if (s.pausedLeft !== null) s.clockEnds = ctx.now + s.pausedLeft;
  s.pausedLeft = null;
}

/** The audience's answers to this question count (at the reveal). */
function scoreAudience(s: State) {
  const q = s.q!;
  s.audienceRight = s.audience.filter((p) => s.answers[p] === q.correct);
  for (const p of s.audienceRight) s.audiencePts[p] = (s.audiencePts[p] ?? 0) + MILLION_AUDIENCE_POINT;
}

/** The final answer is in: lit for everyone, a moment of suspense. */
function lockIn(ctx: GameCtx, s: State, choice: number) {
  s.locked = choice;
  s.clockEnds = null;
  s.pausedLeft = null;
  s.phase = 'lock';
  setPause(ctx, s, lockMs(s.step));
  ctx.say?.(`الإجابة النهائية: «${letter(choice)}» · ${ctx.playerName(s.hot!)}`, s.hot!);
}

function reveal(ctx: GameCtx, s: State) {
  const hot = s.hot!;
  const right = s.locked === s.q!.correct;
  scoreAudience(s);
  s.phase = 'reveal';
  if (right) {
    s.won = s.step + 1;
    if (s.won >= 15) {
      s.outcome = 'million';
      setPause(ctx, s, MILLION_END_REVEAL_MS);
      ctx.fx('correct');
      ctx.say?.(`المليون من نصيب ${ctx.playerName(hot)}!`, hot);
      return;
    }
    s.outcome = 'right';
    setPause(ctx, s, MILLION_RIGHT_MS);
    ctx.fx('correct', hot);
    ctx.say?.(`إجابة صحيحة! الرصيد ${money(prizeAt(s.won))} · ${ctx.playerName(hot)}`, hot);
    return;
  }
  s.outcome = 'wrong';
  setPause(ctx, s, MILLION_END_REVEAL_MS);
  ctx.fx('buzz', hot);
  ctx.say?.(`إجابة خاطئة · الجائزة ${money(safePrize(s.won))} · ${ctx.playerName(hot)}`, hot);
}

/** The turn stops without a final answer (walk-away, time, away): the right answer is shown. */
function stopTurn(ctx: GameCtx, s: State, outcome: 'walk' | 'time' | 'away') {
  const hot = s.hot!;
  scoreAudience(s);
  s.outcome = outcome;
  s.locked = null;
  s.clockEnds = null;
  s.pausedLeft = null;
  s.call = s.call ? { ...s.call, done: true } : null;
  s.phase = 'reveal';
  setPause(ctx, s, MILLION_END_REVEAL_MS);
  const prize = money(prizeAt(s.won));
  ctx.fx('reveal');
  if (outcome === 'walk') ctx.say?.(`انسحاب بـ${prize} · ${ctx.playerName(hot)}`, hot);
  else if (outcome === 'time') ctx.say?.(`انتهى الوقت · الجائزة ${prize} · ${ctx.playerName(hot)}`, hot);
  else ctx.say?.(`انتهى الدور لغياب ${ctx.playerName(hot)} · الجائزة ${prize}`, hot);
}

/** The prize of the turn that just ended. */
function turnPrize(s: State): number {
  if (s.outcome === 'wrong') return safePrize(s.won);
  if (s.outcome === 'left') return 0;
  return prizeAt(s.won);
}

function endTurn(ctx: GameCtx, s: State) {
  const hot = s.hot!;
  const prize = turnPrize(s);
  s.prizes[hot] = (s.prizes[hot] ?? 0) + prize;
  s.history.push({ id: hot, won: s.won, prize, outcome: s.outcome ?? 'walk' });
  s.phase = 'turnEnd';
  setPause(ctx, s, MILLION_TURN_END_MS);
}

function nextTurn(ctx: GameCtx, s: State) {
  s.turnIdx++;
  startTurn(ctx, s);
}

/** Final places: the prizes, then the audience points. */
export function millionPlaces(s: Pick<State, 'participants' | 'prizes' | 'audiencePts'>): string[][] {
  const key = (id: string) => [s.prizes[id] ?? 0, s.audiencePts[id] ?? 0];
  const sorted = [...s.participants].sort((a, b) => {
    const [pa, aa] = key(a);
    const [pb, ab] = key(b);
    return pb - pa || ab - aa;
  });
  const places: string[][] = [];
  sorted.forEach((id, i) => {
    const prev = sorted[i - 1];
    if (i > 0 && key(id)[0] === key(prev)[0] && key(id)[1] === key(prev)[1]) places[places.length - 1].push(id);
    else places.push([id]);
  });
  return places;
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.hot = null;
  s.endsAt = null;
  s.clockEnds = null;
  s.pausedLeft = null;
  s.call = null;
  if (!s.participants.length) return;
  const top = millionPlaces(s)[0];
  ctx.fx('win', top.length === 1 ? top[0] : undefined);
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.prizes[p] ?? 0));
}

/* ------------------------------------------------------------------ */
/* Lifelines                                                           */
/* ------------------------------------------------------------------ */

function useFifty(ctx: GameCtx, s: State) {
  const q = s.q!;
  const wrong = [0, 1, 2, 3].filter((i) => i !== q.correct);
  const keep = wrong[randInt(0, wrong.length - 1)];
  s.removed = wrong.filter((i) => i !== keep);
  s.used.fifty = true;
  s.helps++;
  ctx.say?.(`حذف إجابتين · ${ctx.playerName(s.hot!)}`, s.hot!);
}

const pollWaiting = (ctx: GameCtx, s: State) => s.audience.filter((p) => s.answers[p] === undefined && present(ctx, p));

function useAudience(ctx: GameCtx, s: State) {
  s.used.audience = true;
  s.helps++;
  pauseClock(ctx, s);
  s.phase = 'poll';
  s.endsTotal = MILLION_POLL_MS;
  s.endsAt = ctx.now + MILLION_POLL_MS;
  ctx.say?.(`اسأل الجمهور · ${ctx.playerName(s.hot!)}`, s.hot!);
  if (!pollWaiting(ctx, s).length) closePoll(ctx, s);
}

function closePoll(ctx: GameCtx, s: State) {
  const counts = [0, 0, 0, 0];
  for (const p of s.audience) {
    const a = s.answers[p];
    if (a !== undefined) counts[a]++;
  }
  s.poll = counts;
  resume(ctx, s);
}

function useFriend(ctx: GameCtx, s: State, to: string) {
  s.used.friend = true;
  s.helps++;
  pauseClock(ctx, s);
  s.phase = 'call';
  s.call = { friend: to, endsAt: ctx.now + MILLION_FRIEND_MS, answer: null, sure: null, done: false };
  ctx.say?.(`اتصال بصديق: ${ctx.playerName(to)}`, s.hot!);
}

function endCall(ctx: GameCtx, s: State, answer: number | null, sure: boolean | null) {
  if (!s.call) return;
  s.call = { ...s.call, answer, sure, done: true };
  resume(ctx, s);
  const name = ctx.playerName(s.call.friend);
  if (answer === null) ctx.say?.(`انتهت المكالمة دون جواب من ${name}`, s.call.friend);
  else ctx.say?.(`جواب ${name}: «${letter(answer)}»${sure ? ' — متأكد' : ' — غير متأكد'}`, s.call.friend);
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

function planSeat(ctx: GameCtx, s: State, b: string) {
  const level = botLevel(ctx);
  const q = s.q!;
  const key = `${s.turnIdx}:${s.step}`;
  let mind = s.minds[b];
  if (!mind || mind.key !== key) mind = s.minds[b] = makeMind(level, key, q);
  const move = seatMove({
    level,
    step: s.step,
    won: s.won,
    q,
    mind,
    removed: s.removed,
    used: s.used,
    canAudience: s.audience.length > 0,
    canFriend: friendsFor(ctx, s).length > 0,
    poll: s.poll,
    call: s.call,
  });
  const delay = seatDelay(level, q, s.helps === 0, mind.knows, s.settings.timer * 1000);
  const id = `seat:${key}:${s.helps}`;
  if (move.type === 'friend') {
    const friends = friendsFor(ctx, s);
    // an expert asks the one who has known the most so far
    const best = level === 'expert' ? [...friends].sort((a, c) => (s.audiencePts[c] ?? 0) - (s.audiencePts[a] ?? 0))[0] : friends[randInt(0, friends.length - 1)];
    ctx.bot(b, id, delay, { type: 'friend', to: best });
  } else ctx.bot(b, id, delay, move);
}

const friendsFor = (ctx: GameCtx, s: State) => s.audience.filter((p) => present(ctx, p));

function planAudience(ctx: GameCtx, s: State, b: string) {
  const level = botLevel(ctx);
  const q = s.q!;
  const { choice, knows } = botAnswer(level, q, s.removed);
  const base = `aud:${s.turnIdx}:${s.step}`;
  ctx.bot(b, base, audienceDelay(level, q, s.settings.timer, knows), { type: 'answer', choice });
  // asked for the chart: a quicker vote
  if (s.phase === 'poll') ctx.bot(b, `${base}:poll`, randInt(1200, 4000), { type: 'answer', choice });
}

function planFriend(ctx: GameCtx, s: State, b: string) {
  const level = botLevel(ctx);
  const { choice, knows } = botAnswer(level, s.q!, s.removed, Math.random, 0.04);
  ctx.bot(b, `friend:${s.turnIdx}:${s.step}`, friendDelay(level), { type: 'tell', choice, sure: friendSure(level, knows) });
}

/* ------------------------------------------------------------------ */
/* Module                                                              */
/* ------------------------------------------------------------------ */

export function startMillion(ctx: GameCtx, participants: string[], raw: MillionSettings): State {
  const settings = sanitizeMillion(raw);
  const queue: string[] = [];
  for (let r = 0; r < settings.rounds; r++) queue.push(...participants);
  const s: State = {
    settings,
    participants: [...participants],
    queue,
    turnIdx: 0,
    phase: 'intro',
    hot: null,
    step: 0,
    won: 0,
    q: null,
    removed: [],
    used: noLifelines(),
    helps: 0,
    locked: null,
    outcome: null,
    endsAt: null,
    endsTotal: 0,
    clockEnds: null,
    pausedLeft: null,
    poll: null,
    call: null,
    audience: [],
    answers: {},
    audienceRight: null,
    prizes: Object.fromEntries(participants.map((p) => [p, 0])),
    audiencePts: Object.fromEntries(participants.map((p) => [p, 0])),
    history: [],
    usedQ: new Set(),
    minds: {},
    awaySince: null,
  };
  startTurn(ctx, s);
  return s;
}

const validChoice = (s: State, c: unknown): c is number => isNum(c) && Number.isInteger(c) && c >= 0 && c < 4 && !s.removed.includes(c);

export const million: GameModule<State, MillionSettings> = {
  id: 'million',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startMillion(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    const seat = by === s.hot;
    const bot = ctx.isBot(by);
    switch (a.type) {
      case 'final': {
        if (!seat || s.phase !== 'ask') return;
        if (!validChoice(s, a.choice)) throw new GameError('اختر إجابة من الإجابات الظاهرة');
        return lockIn(ctx, s, a.choice);
      }
      case 'walk': {
        if (!seat || s.phase !== 'ask') return;
        return stopTurn(ctx, s, 'walk');
      }
      case 'fifty': {
        if (!seat || s.phase !== 'ask' || s.used.fifty) return;
        return useFifty(ctx, s);
      }
      case 'audience': {
        if (!seat || s.phase !== 'ask' || s.used.audience) return;
        if (!s.audience.length) throw new GameError('لا جمهور في هذه اللعبة');
        return useAudience(ctx, s);
      }
      case 'friend': {
        if (!seat || s.phase !== 'ask' || s.used.friend) return;
        const to = a.to;
        if (!isStr(to) || !s.audience.includes(to)) throw new GameError('اختر صديقاً من اللاعبين');
        if (!present(ctx, to)) throw new GameError('هذا اللاعب غير متصل الآن');
        return useFriend(ctx, s, to);
      }
      case 'tell': {
        const c = s.call;
        if (s.phase !== 'call' || !c || c.done || c.friend !== by) return;
        if (!validChoice(s, a.choice)) {
          if (bot) throw new GameError('');
          throw new GameError('اختر إجابة من الإجابات الظاهرة');
        }
        return endCall(ctx, s, a.choice, a.sure === true);
      }
      case 'answer': {
        if (seat || !s.audience.includes(by)) return;
        if (s.phase !== 'ask' && s.phase !== 'poll' && s.phase !== 'call') return;
        if (s.answers[by] !== undefined) return;
        if (!validChoice(s, a.choice)) {
          if (bot) throw new GameError('');
          throw new GameError('اختر إجابة من الإجابات الظاهرة');
        }
        s.answers[by] = a.choice;
        if (s.phase === 'poll' && !pollWaiting(ctx, s).length) closePoll(ctx, s);
        return;
      }
      case 'next': {
        if (s.phase === 'turnEnd') nextTurn(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    switch (s.phase) {
      case 'intro':
        if (s.endsAt !== null && ctx.now >= s.endsAt) {
          ask(ctx, s);
          return true;
        }
        return false;
      case 'ask': {
        if (s.clockEnds !== null && ctx.now >= s.clockEnds) {
          stopTurn(ctx, s, 'time');
          return true;
        }
        // a contestant gone quiet (no timer to end the turn)
        const hot = s.hot!;
        if (!ctx.isBot(hot) && !ctx.isConnected(hot)) {
          if (s.awaySince === null) s.awaySince = ctx.now;
          else if (ctx.now - s.awaySince >= MILLION_AWAY_MS) {
            stopTurn(ctx, s, 'away');
            return true;
          }
        } else s.awaySince = null;
        return false;
      }
      case 'poll':
        if (s.endsAt !== null && ctx.now >= s.endsAt) {
          closePoll(ctx, s);
          return true;
        }
        return false;
      case 'call':
        if (s.call && ctx.now >= s.call.endsAt) {
          endCall(ctx, s, null, null);
          return true;
        }
        return false;
      case 'lock':
        if (s.endsAt !== null && ctx.now >= s.endsAt) {
          reveal(ctx, s);
          return true;
        }
        return false;
      case 'reveal':
        if (s.endsAt !== null && ctx.now >= s.endsAt) {
          if (s.outcome === 'right') {
            s.step++;
            ask(ctx, s);
          } else endTurn(ctx, s);
          return true;
        }
        return false;
      case 'turnEnd':
        if (s.endsAt !== null && ctx.now >= s.endsAt) {
          nextTurn(ctx, s);
          return true;
        }
        return false;
      default:
        return false;
    }
  },

  turnOf(s) {
    if (s.phase === 'ask' && s.hot) return [s.hot];
    if (s.phase === 'call' && s.call && !s.call.done) return [s.call.friend];
    if (s.phase === 'poll') return s.audience.filter((p) => s.answers[p] === undefined);
    return [];
  },

  botPlan(ctx, s, bots) {
    if (!s.q || (s.phase !== 'ask' && s.phase !== 'poll' && s.phase !== 'call')) return;
    const isBot = (id: string) => bots.includes(id) || ctx.isBot(id);
    if (s.phase === 'ask' && s.hot && isBot(s.hot)) planSeat(ctx, s, s.hot);
    if (s.phase === 'call' && s.call && !s.call.done && isBot(s.call.friend)) planFriend(ctx, s, s.call.friend);
    for (const b of s.audience) if (isBot(b) && s.answers[b] === undefined) planAudience(ctx, s, b);
  },

  view(ctx, s, me): MillionView {
    const shown = s.phase === 'reveal' || s.phase === 'turnEnd';
    const q = s.q;
    const endsAt =
      s.phase === 'ask' ? s.clockEnds : s.phase === 'call' ? (s.call?.endsAt ?? null) : s.phase === 'final' ? null : s.endsAt;
    const timerTotal = s.phase === 'ask' ? s.settings.timer * 1000 : s.phase === 'call' ? MILLION_FRIEND_MS : s.endsTotal;
    return {
      game: 'million',
      phase: s.phase,
      topic: s.settings.topic,
      turn: Math.min(s.turnIdx + 1, s.queue.length),
      turns: s.queue.length,
      hot: s.hot,
      step: s.step,
      won: s.won,
      question: q && s.phase !== 'intro' && s.phase !== 'final' ? { text: q.text, options: [...q.options], label: q.label } : null,
      removed: [...s.removed],
      used: { ...s.used },
      canAudience: s.audience.length > 0,
      canFriend: s.audience.some((p) => present(ctx, p)),
      locked: s.locked,
      correct: shown && q ? q.correct : null,
      outcome: shown ? s.outcome : null,
      endsAt,
      timerTotal,
      pausedLeft: s.pausedLeft,
      poll: s.poll ? [...s.poll] : null,
      call: s.call ? { ...s.call } : null,
      audience: [...s.audience],
      answered: Object.keys(s.answers),
      myAnswer: s.answers[me] ?? null,
      audienceRight: shown && s.audienceRight ? [...s.audienceRight] : null,
      prizes: { ...s.prizes },
      audiencePts: { ...s.audiencePts },
      history: s.history.filter((t) => s.participants.includes(t.id)).map((t) => ({ ...t })),
      players: [...s.participants],
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    s.audience = s.audience.filter((p) => p !== id);
    delete s.answers[id];
    delete s.prizes[id];
    delete s.audiencePts[id];
    if (s.phase === 'final') return;
    if (!s.participants.length) return finish(ctx, s);
    if (s.hot === id) {
      // the contestant left: their turn ends here, the next one begins
      if (s.phase !== 'turnEnd') ctx.say?.('انتهى الدور: مغادرة صاحب الكرسي');
      return nextTurn(ctx, s);
    }
    if (s.phase === 'call' && s.call && !s.call.done && s.call.friend === id) return endCall(ctx, s, null, null);
    if (s.phase === 'poll' && !pollWaiting(ctx, s).length) closePoll(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = snap(patch.rounds, MILLION_ROUNDS, settings.rounds);
    if (isNum(patch.timer)) settings.timer = snap(patch.timer, MILLION_TIMERS, settings.timer);
    if (isTopic(patch.topic)) settings.topic = patch.topic;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: millionPlaces(s) };
  },
};

export type { State as MillionState };
