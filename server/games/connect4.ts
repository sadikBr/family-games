/** «أربعة في صف» — drop discs; four in a row (any direction) wins. Best-of series score kept between games. */
import { COLS, bestColumn, dropRow, winLine, type Disc } from '../../src/shared/connect4';
import type { Connect4Settings, Connect4View } from '../../src/shared/protocol';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

interface State {
  settings: Connect4Settings;
  red: string;
  yellow: string;
  board: Disc[];
  turn: 1 | 2;
  last: number | null;
  line: number[] | null;
  phase: Connect4View['phase'];
  winner: Connect4View['winner'];
  moves: number;
  botMove: number;
  score: Record<string, number>;
}

/** `id` resigned or left: the other player wins the game (and it counts in the series). */
function forfeit(ctx: GameCtx, s: State, id: string) {
  if (id !== s.red && id !== s.yellow) return;
  s.winner = id === s.red ? 2 : 1;
  s.phase = 'final';
  duelWin(ctx, s.score, id === s.red ? s.yellow : s.red);
}

export const connect4: GameModule<State, Connect4Settings> = {
  id: 'connect4',

  start(ctx, participants, settings) {
    const { first: red, second: yellow, score } = startDuel(ctx, 'connect4', participants); // red always drops first
    ctx.fx('start');
    return {
      settings,
      red,
      yellow,
      board: Array(42).fill(0),
      turn: 1,
      last: null,
      line: null,
      phase: 'play',
      winner: null,
      moves: 0,
      botMove: -1,
      score,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play') return;
    const me = by === s.red ? 1 : by === s.yellow ? 2 : 0;
    if (!me) return;
    if (a.type === 'resign') return forfeit(ctx, s, by);
    if (a.type !== 'drop') return;
    if (me !== s.turn) throw new GameError('ماشي دورك');
    if (!isNum(a.col) || a.col < 0 || a.col >= COLS) return;
    const r = dropRow(s.board, a.col);
    if (r < 0) throw new GameError('العمود ممتلئ');
    const i = r * COLS + a.col;
    s.board[i] = me;
    s.last = i;
    s.moves += 1;
    ctx.fx('card', by);
    const line = winLine(s.board, i);
    if (line) {
      s.line = line;
      s.winner = me;
      s.phase = 'final';
      duelWin(ctx, s.score, by);
    } else if (s.board.every((x) => x)) {
      s.winner = 'draw';
      s.phase = 'final';
    } else s.turn = me === 1 ? 2 : 1;
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const id = s.turn === 1 ? s.red : s.yellow;
    if (!bots.includes(id) || s.botMove === s.moves) return; // think once per turn
    s.botMove = s.moves;
    ctx.bot(id, `c4:${s.moves}`, randDelay(700, 1300), { type: 'drop', col: bestColumn(s.board, s.turn, s.settings.level) });
  },

  view(ctx, s, me): Connect4View {
    return {
      game: 'connect4',
      phase: s.phase,
      red: s.red,
      yellow: s.yellow,
      board: s.board,
      turn: s.turn,
      myDisc: me === s.red ? 1 : me === s.yellow ? 2 : null,
      last: s.last,
      line: s.line,
      winner: s.winner,
      score: s.score,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'play') forfeit(ctx, s, id);
  },
};
