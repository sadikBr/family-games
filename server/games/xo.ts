/**
 * «إكس أو» — tic-tac-toe on a 3×3 to 9×9 board (k in a row wins, see src/shared/xo.ts); X starts,
 * players swap X/O each game. Wins are counted across games.
 */
import type { XoSettings, XoView } from '../../src/shared/protocol';
import { XO_SIZES, inRow, xoBest, xoWinner, type Mark, type XoSize } from '../../src/shared/xo';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { xoBot } from '../ai/boards-xo';
import { GameError, botLevel, type GameModule } from '../types';
import { isNum } from '../util';

interface State {
  settings: XoSettings;
  x: string;
  o: string;
  board: Mark[];
  size: number;
  last: number | null;
  turn: 'x' | 'o';
  line: number[] | null;
  winner: XoView['winner'];
  phase: XoView['phase'];
  moves: number;
  botMove: number;
  score: Record<string, number>;
}

export const xo: GameModule<State, XoSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.turn === 'x' ? s.x : s.o] : [],
  id: 'xo',
  start(ctx, participants, settings) {
    const { first: x, second: o, score } = startDuel(ctx, 'xo', participants);
    ctx.fx('start');
    const size = XO_SIZES.includes(settings.size as XoSize) ? (settings.size as number) : 3;
    return { settings, x, o, board: Array(size * size).fill(''), size, last: null, turn: 'x', line: null, winner: null, phase: 'play', moves: 0, botMove: -1, score };
  },
  act(ctx, s, by, a) {
    if (s.phase !== 'play' || a.type !== 'mark') return;
    const me = by === s.x ? 'x' : by === s.o ? 'o' : null;
    if (!me) return;
    if (me !== s.turn) throw new GameError('ليس دورك');
    if (!isNum(a.cell) || a.cell < 0 || a.cell >= s.board.length || s.board[a.cell]) return;
    s.board[a.cell] = me;
    s.last = a.cell;
    s.moves += 1;
    ctx.fx('card', by);
    const w = xoWinner(s.board, s.size, inRow(s.size));
    ctx.say?.(`${me === 'x' ? 'X' : 'O'} من ${ctx.playerName(by)}${w ? ' — خط كامل!' : ''}`, by);
    if (w) {
      s.line = w.line;
      s.winner = w.mark;
      s.phase = 'final';
      duelWin(ctx, s.score, by);
    } else if (s.board.every(Boolean)) {
      s.winner = 'draw';
      s.phase = 'final';
    } else s.turn = me === 'x' ? 'o' : 'x';
  },
  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const id = s.turn === 'x' ? s.x : s.o;
    if (!bots.includes(id) || s.botMove === s.moves) return;
    s.botMove = s.moves;
    const level = botLevel(ctx); // the room's «مستوى البوتات» (the old per-game level is ignored)
    const cell = level === 'easy' ? xoBest(s.board, s.turn, 1) : xoBot(s.board, s.turn, level);
    ctx.bot(id, `xo:${s.moves}`, randDelay(600, 1100), { type: 'mark', cell });
  },
  view(ctx, s, me): XoView {
    return { game: 'xo', phase: s.phase, x: s.x, o: s.o, board: s.board, size: s.size, inRow: inRow(s.size), last: s.last, turn: s.turn, mine: me === s.x ? 'x' : me === s.o ? 'o' : null, line: s.line, winner: s.winner, score: s.score };
  },
  result(s) {
    if (s.phase !== 'final') return null;
    if (s.winner === 'draw') return { places: [[s.x, s.o]] };
    const [win, lose] = s.winner === 'x' ? [s.x, s.o] : [s.o, s.x];
    return { places: [[win], [lose]] };
  },
  onLeave(ctx, s, id) {
    if (s.phase !== 'play' || (id !== s.x && id !== s.o)) return;
    s.winner = id === s.x ? 'o' : 'x';
    s.phase = 'final';
    duelWin(ctx, s.score, id === s.x ? s.o : s.x);
  },
};
