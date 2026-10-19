/**
 * لودو — roll the dice and race your 4 pieces home (2 in the quick variant).
 * A 6 (or a 1 with the setting) brings a piece out. A 6 also gives another roll (three 6s in a row lose the turn).
 * Landing on other pieces outside a safe square sends them back to base (+ another roll).
 * Pieces need the exact number to finish; finishing a piece gives another roll.
 * When a human has only one possible move, it is played for them shortly after the roll.
 * With «podium», play goes on after the first finisher until one player is left.
 */
import { FINISH, SAFE, seatColors, trackIndex } from '../../src/shared/ludo';
import type { LudoColor, LudoSettings, LudoView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { ludoBotMove } from '../ai/misc-ludo';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

interface State {
  settings: LudoSettings;
  seats: { id: string; color: LudoColor }[];
  tokens: Record<string, number[]>;
  turnIdx: number;
  phase: LudoView['phase'];
  dice: number | null;
  rollId: number;
  sixes: number;
  lastMove: LudoView['lastMove'];
  ranking: string[];
  winner: string | null;
  feed: Feed;
  moves: number;
  /** Server time at which the only legal move is played automatically. */
  autoAt: number | null;
}

/** Tests set BOT_SPEED to speed bots up; the auto-move wait follows so test games stay short. */
const SPEED = Number(process.env.BOT_SPEED ?? 1) || 1;
/** The dice land after ~1.2 s; a moment later a single legal move is played for the player. */
export const AUTO_MOVE_MS = 2000 * SPEED;

/** «لماما»، «للحسن»: a name after the preposition لـ (announcements never conjugate a verb for the player). */
const li = (n: string) => (/^[\u0621-\u064A]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

const colorOf = (s: State, id: string) => s.seats.find((x) => x.id === id)!.color;
const current = (s: State) => s.seats[s.turnIdx].id;

export function movableTokens(tokens: number[], dice: number, exitOnOne: boolean): number[] {
  const out: number[] = [];
  tokens.forEach((p, i) => {
    if (p >= FINISH) return;
    if (p < 0) {
      if (dice === 6 || (exitOnOne && dice === 1)) out.push(i);
      return;
    }
    if (p + dice <= FINISH) out.push(i);
  });
  return out;
}

/** Movable tokens, keeping one per starting square (pieces stacked together make the same move). */
export function distinctMoves(tokens: number[], dice: number, exitOnOne: boolean): number[] {
  const seen = new Set<number>();
  return movableTokens(tokens, dice, exitOnOne).filter((t) => {
    if (seen.has(tokens[t])) return false;
    seen.add(tokens[t]);
    return true;
  });
}

/** Players still racing (not finished). */
const racing = (s: State) => s.seats.filter((x) => !s.ranking.includes(x.id));

function finish(ctx: GameCtx, s: State) {
  // podium: the last one left takes the last place; otherwise only the winner is ranked
  if (s.settings.podium || !s.ranking.length) for (const x of racing(s)) s.ranking.push(x.id);
  s.phase = 'final';
  s.autoAt = null;
  if (!s.winner) s.winner = s.ranking[0] ?? null;
  ctx.fx('win', s.winner ?? undefined);
}

function nextTurn(s: State) {
  s.sixes = 0;
  s.autoAt = null;
  for (let k = 0; k < s.seats.length; k++) {
    s.turnIdx = (s.turnIdx + 1) % s.seats.length;
    if (!s.ranking.includes(current(s))) break;
  }
  s.phase = 'roll';
  s.dice = null;
}

/** Move a token; returns ids of captured players. */
function moveToken(s: State, id: string, t: number): { captured: string[]; finished: boolean } {
  const color = colorOf(s, id);
  const from = s.tokens[id][t];
  const to = from < 0 ? 0 : from + s.dice!;
  s.tokens[id][t] = to;
  const captured: string[] = [];
  const at = trackIndex(color, to);
  if (at !== null && !SAFE.includes(at)) {
    for (const seat of s.seats) {
      if (seat.id === id) continue;
      s.tokens[seat.id] = s.tokens[seat.id].map((p) => {
        if (trackIndex(seat.color, p) === at) {
          if (!captured.includes(seat.id)) captured.push(seat.id);
          return -1;
        }
        return p;
      });
    }
  }
  s.lastMove = { by: id, token: t, from, to, captured };
  return { captured, finished: to === FINISH };
}

/** One short line for the turn bar: what the move did. */
function sayMove(ctx: GameCtx, s: State, id: string, res: { captured: string[]; finished: boolean }) {
  const name = li(ctx.playerName(id));
  const lm = s.lastMove!;
  let text: string;
  if (res.captured.length) text = `رمية ${name}: ${s.dice} — قطعة ${res.captured.map((c) => ctx.playerName(c)).join(' و')} عادت إلى القاعدة`;
  else if (res.finished) text = `قطعة ${name} وصلت إلى البيت`;
  else if (lm.from < 0) text = `رمية ${name}: ${s.dice} — خروج قطعة`;
  else text = `رمية ${name}: ${s.dice} — حركة قطعة`;
  const again = s.dice === 6 || res.captured.length > 0 || res.finished;
  if (again && s.tokens[id].some((p) => p < FINISH)) text += ' — ودور إضافي';
  ctx.say?.(text, id);
}

function afterMove(ctx: GameCtx, s: State, id: string, res: { captured: string[]; finished: boolean }) {
  sayMove(ctx, s, id, res);
  if (res.captured.length) {
    s.feed.push(`${ctx.playerName(id)} أكل ${res.captured.map((c) => ctx.playerName(c)).join(' و ')}`, { by: id });
    ctx.fx('boom', res.captured[0]);
  }
  if (res.finished) {
    s.feed.push(`${ctx.playerName(id)} أدخل قطعة إلى البيت`, { by: id });
    ctx.fx('correct', id);
  }
  if (s.tokens[id].every((p) => p >= FINISH)) {
    s.ranking.push(id);
    if (!s.winner) s.winner = id;
    if (!s.settings.podium || racing(s).length < 2) return finish(ctx, s);
    s.feed.push(`${ctx.playerName(id)} أنهى في المركز ${s.ranking.length}`, { by: id });
    ctx.fx('correct', id);
    nextTurn(s);
    return;
  }
  const again = s.dice === 6 || res.captured.length > 0 || res.finished;
  if (again) {
    s.phase = 'roll';
    s.dice = null;
    s.autoAt = null;
  } else nextTurn(s);
}

export const ludo: GameModule<State, LudoSettings> = {
  turnOf: (s) => s.phase === 'roll' || s.phase === 'move' ? [current(s)] : [],
  id: 'ludo',

  start(ctx, participants, settings) {
    const colors = seatColors(participants.length);
    const seats = participants.map((id, i) => ({ id, color: colors[i] }));
    ctx.fx('start');
    return {
      settings,
      seats,
      tokens: Object.fromEntries(participants.map((id) => [id, settings.quick ? [-1, -1] : [-1, -1, -1, -1]])),
      turnIdx: Math.floor(Math.random() * participants.length),
      phase: 'roll',
      dice: null,
      rollId: 0,
      sixes: 0,
      lastMove: null,
      ranking: [],
      winner: null,
      feed: new Feed(),
      moves: 0,
      autoAt: null,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    if (current(s) !== by) throw new GameError('ليس دورك');
    if (a.type === 'roll') {
      if (s.phase !== 'roll') return;
      const d = 1 + Math.floor(Math.random() * 6);
      s.dice = d;
      s.rollId += 1;
      s.moves += 1;
      ctx.fx('tick', by);
      if (d === 6) {
        s.sixes += 1;
        if (s.sixes === 3) {
          s.feed.push(`${ctx.playerName(by)}: ثلاث رميات من 6 متتالية! ضاع الدور`, { by });
          ctx.say?.(`ثلاث رميات من 6 ${li(ctx.playerName(by))} — ضاع الدور`, by);
          nextTurn(s);
          s.dice = d;
          return;
        }
      }
      const can = movableTokens(s.tokens[by], d, s.settings.exitOnOne);
      if (!can.length) {
        s.feed.push(`${ctx.playerName(by)} رمى ${d} — لا توجد حركة`, { by });
        ctx.say?.(`رمية ${li(ctx.playerName(by))}: ${d} — لا حركة ممكنة`, by);
        nextTurn(s);
        s.dice = d; // keep showing the roll
        return;
      }
      ctx.say?.(`رمية ${li(ctx.playerName(by))}: ${d}`, by);
      s.phase = 'move';
      s.autoAt = distinctMoves(s.tokens[by], d, s.settings.exitOnOne).length === 1 ? ctx.now + AUTO_MOVE_MS : null;
      return;
    }
    if (a.type === 'move') {
      if (s.phase !== 'move' || !isNum(a.token)) return;
      const can = movableTokens(s.tokens[by], s.dice!, s.settings.exitOnOne);
      if (!can.includes(a.token)) throw new GameError('لا يمكن تحريك هذه القطعة');
      s.moves += 1;
      s.autoAt = null;
      const res = moveToken(s, by, a.token);
      ctx.fx('card', by);
      afterMove(ctx, s, by, res);
    }
  },

  botPlan(ctx, s) {
    if (s.phase === 'final') return;
    const bot = current(s);
    if (!ctx.isBot(bot)) return;
    if (s.phase === 'roll') {
      // a roll still on the table (nothing could move) stays readable a little longer
      ctx.bot(bot, `roll:${s.moves}`, s.dice ? randDelay(1500, 1900) : randDelay(1000, 1400), { type: 'roll' });
      return;
    }
    const best = ludoBotMove(s, bot, s.dice!, s.settings.exitOnOne, botLevel(ctx));
    // the dice land after ~1.2 s on the phones: the piece moves once the number has been seen
    ctx.bot(bot, `move:${s.moves}`, randDelay(1500, 1900), { type: 'move', token: best });
  },

  tick(ctx, s) {
    if (s.phase !== 'move' || s.autoAt === null || ctx.now < s.autoAt) return false;
    s.autoAt = null;
    const by = current(s);
    const only = distinctMoves(s.tokens[by], s.dice!, s.settings.exitOnOne);
    if (only.length !== 1) return true;
    ludo.act(ctx, s, by, { type: 'move', token: only[0] });
    return true;
  },

  view(ctx, s, me): LudoView {
    return {
      game: 'ludo',
      phase: s.phase,
      seats: s.seats,
      tokens: s.tokens,
      turn: current(s),
      dice: s.dice,
      rollId: s.rollId,
      movable: s.phase === 'move' && current(s) === me ? movableTokens(s.tokens[me], s.dice!, s.settings.exitOnOne) : [],
      autoAt: current(s) === me ? s.autoAt : null,
      lastMove: s.lastMove,
      winner: s.winner,
      ranking: s.ranking,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    const i = s.seats.findIndex((x) => x.id === id);
    if (i < 0 || s.phase === 'final') return;
    const wasTurn = s.turnIdx === i;
    s.seats.splice(i, 1);
    delete s.tokens[id];
    s.feed.push(`${ctx.playerName(id)} غادر اللعبة`);
    if (racing(s).length < 2) return finish(ctx, s);
    if (s.turnIdx > i) s.turnIdx -= 1;
    s.turnIdx %= s.seats.length;
    if (wasTurn) {
      // the seat that slid into this index may already have finished
      s.turnIdx = (s.turnIdx - 1 + s.seats.length) % s.seats.length;
      nextTurn(s);
    }
  },

  result(s) {
    if (s.phase !== 'final' || !s.ranking.length) return null;
    // without «podium» only the winner is ranked: everyone else shares second place (as on the final screen)
    const rest = s.seats.map((x) => x.id).filter((id) => !s.ranking.includes(id));
    return { places: [...s.ranking.map((id) => [id]), ...(rest.length ? [rest] : [])] };
  },
};
