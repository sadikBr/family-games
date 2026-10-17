/**
 * «الخربقة» — see src/shared/kharbga.ts for the rules. Simplified: no exchanges; a blocked player passes.
 * Setting: a player may undo a piece placed this turn, or drop all their remaining pieces at random
 * (the turn then passes and the other player places the rest of theirs).
 */
import { CENTER, PIECES, applyMove, botMove, botPlace, movesFor, other, type Side } from '../../src/shared/kharbga';
import type { KharbgaSettings, KharbgaView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';

const QUIET_LIMIT = 80; // moves in a row without a capture → the game ends on piece count

interface State {
  settings: KharbgaSettings;
  attacker: string;
  defender: string;
  board: number[];
  phase: KharbgaView['phase'];
  turn: Side;
  toPlace: Record<Side, number>;
  placedThisTurn: number[]; // cells placed this turn (can be undone)
  chainFrom: number | null;
  firstMove: boolean;
  last: KharbgaView['last'];
  quiet: number;
  winner: KharbgaView['winner'];
  reason: KharbgaView['reason'];
  moves: number;
  botAt: number;
  feed: Feed;
  score: Record<string, number>;
}

const idOf = (s: State, side: Side) => (side === 1 ? s.attacker : s.defender);
/** «قطعة», «قطعتين», «3 قطع»… */
const pieces = (n: number) => (n === 1 ? 'قطعة' : n === 2 ? 'قطعتين' : n <= 10 ? `${n} قطع` : `${n} قطعة`);
/** While placing, `last` marks the pieces put down in the latest turn (from = first, to = last). */
const markPlaced = (s: State) => {
  const p = s.placedThisTurn;
  s.last = p.length ? { from: p[0], to: p[p.length - 1], captured: [] } : null;
};
const count = (s: State, side: Side) => s.board.filter((v) => v === side).length;

function end(ctx: GameCtx, s: State, winner: KharbgaView['winner'], reason: KharbgaView['reason']) {
  s.phase = 'final';
  s.winner = winner;
  s.reason = reason;
  s.chainFrom = null;
  if (winner === 'draw') ctx.fx('win');
  else if (winner) duelWin(ctx, s.score, idOf(s, winner));
}

/** After a placement: start the moving phase, or hand the turn over (two pieces per turn). */
function afterPlace(s: State, side: Side) {
  if (s.toPlace[1] === 0 && s.toPlace[2] === 0) {
    s.phase = 'move';
    s.placedThisTurn = [];
    // the attacker opens by entering the centre; if none of its pieces touch it, the defender opens
    s.turn = movesFor(s.board, 1, null, true).length ? 1 : 2;
    s.feed.push(s.turn === 1 ? 'اكتمل الوضع — المهاجم يبدأ بالدخول إلى الوسط' : 'لا قطعة للمهاجم بجانب الوسط — المدافع يبدأ');
  } else if (s.placedThisTurn.length >= 2 || s.toPlace[side] === 0) {
    s.placedThisTurn = [];
    if (s.toPlace[other(side)] > 0) s.turn = other(side); // otherwise the other side is done: keep placing
  }
}

/** Hand the turn over, handling blocked players. */
function passTurn(ctx: GameCtx, s: State) {
  s.chainFrom = null;
  const next = other(s.turn);
  if (movesFor(s.board, next).length) {
    s.turn = next;
    return;
  }
  if (!movesFor(s.board, s.turn).length) {
    const a = count(s, 1), d = count(s, 2);
    return end(ctx, s, a === d ? 'draw' : a > d ? 1 : 2, 'blocked');
  }
  s.feed.push(`${ctx.playerName(idOf(s, next))} محاصر — ${ctx.playerName(idOf(s, s.turn))} يلعب مرة أخرى`);
  ctx.say?.(`${ctx.playerName(idOf(s, next))} محاصر — ${ctx.playerName(idOf(s, s.turn))} يلعب مرة أخرى`);
}

export const kharbga: GameModule<State, KharbgaSettings> = {
  turnOf: (s) => s.phase === 'final' ? [] : [idOf(s, s.turn)],
  id: 'kharbga',

  start(ctx, participants, settings) {
    const { first: attacker, second: defender, score } = startDuel(ctx, 'kharbga', participants); // the attacker alternates
    ctx.fx('start');
    return {
      settings,
      attacker,
      defender,
      board: Array(49).fill(0),
      phase: 'place',
      turn: 1,
      toPlace: { 1: PIECES, 2: PIECES },
      placedThisTurn: [],
      chainFrom: null,
      firstMove: true,
      last: null,
      quiet: 0,
      winner: null,
      reason: null,
      moves: 0,
      botAt: -1,
      feed: new Feed(),
      score,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    const side: Side | null = by === s.attacker ? 1 : by === s.defender ? 2 : null;
    if (!side) return;
    if (a.type === 'resign') {
      ctx.say?.(`${ctx.playerName(by)} انسحب`, by);
      return end(ctx, s, other(side), 'resign');
    }
    if (side !== s.turn) throw new GameError('ليس دورك');

    if (s.phase === 'place') {
      if (a.type === 'undo') {
        const cell = s.placedThisTurn.pop();
        if (cell === undefined) throw new GameError('لا شيء للتراجع عنه');
        s.board[cell] = 0;
        s.toPlace[side] += 1;
        s.moves += 1;
        markPlaced(s);
        ctx.say?.(`${ctx.playerName(by)} رفع قطعة وضعها`, by);
        ctx.fx('card', by);
        return;
      }
      if (a.type === 'placeRandom') {
        if (!s.toPlace[side]) return;
        const free = shuffle(s.board.map((v, i) => (v === 0 && i !== CENTER ? i : -1)).filter((i) => i >= 0));
        for (const cell of free.slice(0, s.toPlace[side])) s.board[cell] = side;
        s.toPlace[side] = 0;
        s.moves += 1;
        s.feed.push(`${ctx.playerName(by)} وزّع قطعه الباقية عشوائياً`, { by });
        ctx.say?.(`${ctx.playerName(by)} وزّع قطعه الباقية عشوائياً`, by);
        s.placedThisTurn = [];
        s.last = null;
        ctx.fx('card', by);
        afterPlace(s, side);
        return;
      }
      if (a.type !== 'place' || !isNum(a.cell) || a.cell === CENTER || s.board[a.cell] !== 0) return;
      s.board[a.cell] = side;
      s.toPlace[side] -= 1;
      s.placedThisTurn.push(a.cell);
      s.moves += 1;
      markPlaced(s);
      ctx.say?.(`${ctx.playerName(by)} وضع قطعة (بقي ${s.toPlace[side]})`, by);
      ctx.fx('card', by);
      afterPlace(s, side);
      return;
    }

    if (a.type !== 'move' || !isNum(a.from) || !isNum(a.to)) return;
    const legal = movesFor(s.board, side, s.chainFrom, s.firstMove);
    const m = legal.find((x) => x.from === a.from && x.to === a.to);
    if (!m) throw new GameError(s.firstMove ? 'الحركة الأولى يجب أن تكون إلى الوسط' : s.chainFrom !== null ? 'يجب أن تواصل الأكل بنفس القطعة' : 'حركة غير مسموحة');
    const { board, captured } = applyMove(s.board, m, side);
    s.board = board;
    s.moves += 1;
    s.firstMove = false;
    s.last = { from: m.from, to: m.to, captured };
    if (captured.length) {
      s.quiet = 0;
      s.feed.push(`${ctx.playerName(by)} أكل ${pieces(captured.length)}`, { by });
      ctx.fx('throw', by);
      if (!count(s, other(side))) {
        ctx.say?.(`${ctx.playerName(by)} أكل ${pieces(captured.length)}`, by);
        return end(ctx, s, side, 'captured');
      }
      if (movesFor(s.board, side, m.to).length) {
        ctx.say?.(`${ctx.playerName(by)} أكل ${pieces(captured.length)} ويواصل الأكل`, by);
        s.chainFrom = m.to; // keep capturing with the same piece
        return;
      }
      ctx.say?.(`${ctx.playerName(by)} أكل ${pieces(captured.length)}`, by);
    } else {
      s.quiet += 1;
      ctx.say?.(`${ctx.playerName(by)} حرّك قطعة`, by);
      ctx.fx('card', by);
      if (s.quiet >= QUIET_LIMIT) {
        const a1 = count(s, 1), d = count(s, 2);
        return end(ctx, s, a1 === d ? 'draw' : a1 > d ? 1 : 2, 'limit');
      }
    }
    passTurn(ctx, s);
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    const id = idOf(s, s.turn);
    if (!bots.includes(id) || s.botAt === s.moves) return;
    s.botAt = s.moves;
    if (s.phase === 'place') {
      ctx.bot(id, `p:${s.moves}`, randDelay(350, 700), { type: 'place', cell: botPlace(s.board, s.turn) });
      return;
    }
    const m = botMove(s.board, s.turn, s.chainFrom, s.firstMove, s.settings.level);
    if (m) ctx.bot(id, `m:${s.moves}`, randDelay(800, 1400), { type: 'move', from: m.from, to: m.to });
  },

  view(ctx, s, me): KharbgaView {
    const mySide: Side | null = me === s.attacker ? 1 : me === s.defender ? 2 : null;
    return {
      game: 'kharbga',
      phase: s.phase,
      attacker: s.attacker,
      defender: s.defender,
      board: s.board,
      turn: s.turn,
      mySide,
      toPlace: s.toPlace,
      canUndo: s.phase === 'place' && mySide === s.turn && s.placedThisTurn.length > 0,
      chainFrom: s.chainFrom,
      moves: s.phase === 'move' && mySide === s.turn ? movesFor(s.board, s.turn, s.chainFrom, s.firstMove) : [],
      last: s.last,
      counts: { 1: count(s, 1), 2: count(s, 2) },
      winner: s.winner,
      reason: s.reason,
      feed: s.feed.list(),
      score: s.score,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'final' || (id !== s.attacker && id !== s.defender)) return;
    end(ctx, s, id === s.attacker ? 2 : 1, 'left');
  },
};
