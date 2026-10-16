/** «الخربقة» — see src/shared/kharbga.ts for the rules. Simplified: no exchanges; a blocked player passes. */
import { CENTER, PIECES, applyMove, botMove, botPlace, movesFor, other, type Side } from '../../src/shared/kharbga';
import type { KharbgaSettings, KharbgaView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
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
  placedThisTurn: number;
  chainFrom: number | null;
  firstMove: boolean;
  last: KharbgaView['last'];
  quiet: number;
  winner: KharbgaView['winner'];
  reason: KharbgaView['reason'];
  moves: number;
  botAt: number;
  feed: Feed;
}

const idOf = (s: State, side: Side) => (side === 1 ? s.attacker : s.defender);
const count = (s: State, side: Side) => s.board.filter((v) => v === side).length;

function end(ctx: GameCtx, s: State, winner: KharbgaView['winner'], reason: KharbgaView['reason']) {
  s.phase = 'final';
  s.winner = winner;
  s.reason = reason;
  s.chainFrom = null;
  ctx.fx('win', winner === 1 ? s.attacker : winner === 2 ? s.defender : undefined);
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
}

export const kharbga: GameModule<State, KharbgaSettings> = {
  id: 'kharbga',

  start(ctx, participants, settings) {
    const [attacker, defender] = shuffle(participants.slice(0, 2));
    ctx.fx('start');
    return {
      settings,
      attacker,
      defender,
      board: Array(49).fill(0),
      phase: 'place',
      turn: 1,
      toPlace: { 1: PIECES, 2: PIECES },
      placedThisTurn: 0,
      chainFrom: null,
      firstMove: true,
      last: null,
      quiet: 0,
      winner: null,
      reason: null,
      moves: 0,
      botAt: -1,
      feed: new Feed(),
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    const side: Side | null = by === s.attacker ? 1 : by === s.defender ? 2 : null;
    if (!side) return;
    if (a.type === 'resign') return end(ctx, s, other(side), 'resign');
    if (side !== s.turn) throw new GameError('ماشي دورك');

    if (s.phase === 'place') {
      if (a.type !== 'place' || !isNum(a.cell) || a.cell === CENTER || s.board[a.cell] !== 0) return;
      s.board[a.cell] = side;
      s.toPlace[side] -= 1;
      s.placedThisTurn += 1;
      s.moves += 1;
      ctx.fx('card', by);
      if (s.toPlace[1] === 0 && s.toPlace[2] === 0) {
        s.phase = 'move';
        s.placedThisTurn = 0;
        // the attacker opens by entering the centre; if none of its pieces touch it, the defender opens
        s.turn = movesFor(s.board, 1, null, true).length ? 1 : 2;
        s.feed.push(s.turn === 1 ? 'اكتمل الوضع — المهاجم يبدأ بالدخول إلى الوسط' : 'لا قطعة للمهاجم بجانب الوسط — المدافع يبدأ');
      } else if (s.placedThisTurn >= 2 || s.toPlace[side] === 0) {
        s.placedThisTurn = 0;
        s.turn = other(side);
      }
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
      s.feed.push(`${ctx.playerName(by)} أكل ${captured.length === 1 ? 'قطعة' : `${captured.length} قطع`}`, { by });
      ctx.fx('throw', by);
      if (!count(s, other(side))) return end(ctx, s, side, 'captured');
      if (movesFor(s.board, side, m.to).length) {
        s.chainFrom = m.to; // keep capturing with the same piece
        return;
      }
    } else {
      s.quiet += 1;
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
      chainFrom: s.chainFrom,
      moves: s.phase === 'move' && mySide === s.turn ? movesFor(s.board, s.turn, s.chainFrom, s.firstMove) : [],
      last: s.last,
      counts: { 1: count(s, 1), 2: count(s, 2) },
      winner: s.winner,
      reason: s.reason,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'final' || (id !== s.attacker && id !== s.defender)) return;
    end(ctx, s, id === s.attacker ? 2 : 1, 'left');
  },
};
