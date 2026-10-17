/** «الشطرنج» — full chess rules for two players (or a player and a bot). */
import { START_FEN, botMove, fromFen, inCheck, legalMoves, makeMove, repKey, resultOf, sqName, type Color, type Pos } from '../../src/shared/chess';
import type { ChessSettings, ChessView } from '../../src/shared/protocol';
import { Feed, randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';

const NAME: Record<string, string> = { p: 'الجندي', n: 'الحصان', b: 'الفيل', r: 'الرخ', q: 'الوزير', k: 'الملك' };

interface State {
  settings: ChessSettings;
  white: string;
  black: string;
  pos: Pos;
  reps: Record<string, number>;
  lastMove: { from: number; to: number } | null;
  captured: { w: string[]; b: string[] };
  phase: ChessView['phase'];
  winner: ChessView['winner'];
  reason: ChessView['reason'];
  ply: number;
  botPly: number;
  feed: Feed;
  score: Record<string, number>;
}

const colorFor = (s: State, id: string): Color | null => (id === s.white ? 'w' : id === s.black ? 'b' : null);

function play(ctx: GameCtx, s: State, by: string, from: number, to: number, promo?: string) {
  const legal = legalMoves(s.pos).filter((m) => m.from === from && m.to === to);
  if (!legal.length) throw new GameError('حركة غير مسموحة');
  const m = legal.find((x) => x.promo === (promo ?? 'q')) ?? legal[0];
  const piece = s.pos.b[from];
  const target = s.pos.b[to];
  const enPassant = piece.toLowerCase() === 'p' && to === s.pos.ep && !target;
  const mover = s.pos.turn;
  s.pos = makeMove(s.pos, m);
  if (target) s.captured[mover].push(target);
  if (enPassant) s.captured[mover].push(mover === 'w' ? 'p' : 'P');
  s.lastMove = { from, to };
  s.ply += 1;
  const key = repKey(s.pos);
  s.reps[key] = (s.reps[key] ?? 0) + 1;
  const castled = piece.toLowerCase() === 'k' && Math.abs(to - from) === 2;
  s.feed.push(
    castled
      ? `${ctx.playerName(by)} قام بالتبييت`
      : `${ctx.playerName(by)}: ${NAME[piece.toLowerCase()]} من ${sqName(from)} إلى ${sqName(to)}${target || enPassant ? ' (أكل)' : ''}${m.promo ? ' — ترقية' : ''}`,
    { by },
  );
  ctx.fx(target || enPassant ? 'throw' : 'card', by);
  const res = resultOf(s.pos, s.reps);
  if (res) {
    s.phase = 'final';
    s.winner = res.winner;
    s.reason = res.reason;
    if (res.winner === 'draw') ctx.fx('win');
    else duelWin(ctx, s.score, res.winner === 'w' ? s.white : s.black);
  } else if (inCheck(s.pos)) ctx.fx('buzz', s.pos.turn === 'w' ? s.white : s.black);
}

export const chess: GameModule<State, ChessSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.pos.turn === 'w' ? s.white : s.black] : [],
  id: 'chess',

  start(ctx, participants, settings) {
    const { first: white, second: black, score } = startDuel(ctx, 'chess', participants); // white alternates
    const pos = fromFen(START_FEN);
    ctx.fx('start');
    return {
      settings,
      white,
      black,
      pos,
      reps: { [repKey(pos)]: 1 },
      lastMove: null,
      captured: { w: [], b: [] },
      phase: 'play',
      winner: null,
      reason: null,
      ply: 0,
      botPly: -1,
      feed: new Feed(),
      score,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play') return;
    const me = colorFor(s, by);
    if (!me) return;
    if (a.type === 'resign') {
      s.phase = 'final';
      s.winner = me === 'w' ? 'b' : 'w';
      s.reason = 'resign';
      duelWin(ctx, s.score, me === 'w' ? s.black : s.white);
      return;
    }
    if (a.type !== 'move') return;
    if (s.pos.turn !== me) throw new GameError('ليس دورك');
    if (!isNum(a.from) || !isNum(a.to)) return;
    play(ctx, s, by, a.from, a.to, isStr(a.promo) && 'qrbn'.includes(a.promo) ? a.promo : undefined);
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const id = s.pos.turn === 'w' ? s.white : s.black;
    if (!bots.includes(id) || s.botPly === s.ply) return; // think once per turn
    s.botPly = s.ply;
    const m = botMove(s.pos, s.settings.level);
    if (m) ctx.bot(id, `mv:${s.ply}`, randDelay(900, 1700), { type: 'move', from: m.from, to: m.to, promo: m.promo });
  },

  view(ctx, s, me): ChessView {
    const myColor = colorFor(s, me);
    return {
      game: 'chess',
      phase: s.phase,
      white: s.white,
      black: s.black,
      board: s.pos.b,
      turn: s.pos.turn,
      myColor,
      moves: s.phase === 'play' && myColor === s.pos.turn ? legalMoves(s.pos) : [],
      lastMove: s.lastMove,
      check: s.phase === 'play' && inCheck(s.pos),
      captured: s.captured,
      winner: s.winner,
      reason: s.reason,
      feed: s.feed.list(),
      score: s.score,
    };
  },

  onLeave(ctx, s, id) {
    const c = colorFor(s, id);
    if (!c || s.phase !== 'play') return;
    s.phase = 'final';
    s.winner = c === 'w' ? 'b' : 'w';
    s.reason = 'left';
    duelWin(ctx, s.score, c === 'w' ? s.black : s.white);
  },
};

