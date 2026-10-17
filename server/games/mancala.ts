/**
 * «المنقلة» — Kalah for two: six pits a side and a store each. The starting player alternates
 * between games and the series score is kept (see ../duel.ts).
 */
import { MANCALA_SEEDS, mancalaStore, type MancalaLevel, type MancalaMove, type MancalaSettings, type MancalaView } from '../../src/shared/games/mancala';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { mancalaBotPit, pitsOf, sow } from '../mancala-rules';
import { GameError, type GameCtx, type GameModule } from '../types';
import { clamp, isNum } from '../util';

interface State {
  settings: MancalaSettings;
  seats: [string, string];
  board: number[];
  turn: 0 | 1;
  last: MancalaMove | null;
  phase: MancalaView['phase'];
  winner: MancalaView['winner'];
  reason: MancalaView['reason'];
  moves: number;
  score: Record<string, number>;
  botCache: { moves: number; pit: number } | null;
}

const other = (side: 0 | 1): 0 | 1 => (side === 0 ? 1 : 0);

function finishByBoard(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.reason = 'empty';
  const a = s.board[mancalaStore(0)], b = s.board[mancalaStore(1)];
  s.winner = a > b ? 0 : b > a ? 1 : 'draw';
  if (s.winner !== 'draw') duelWin(ctx, s.score, s.seats[s.winner]);
}

/** `id` resigned or left: the other player wins (and it counts in the series). */
function forfeit(ctx: GameCtx, s: State, id: string) {
  const side = s.seats.indexOf(id);
  if (side < 0 || s.phase !== 'play') return;
  s.phase = 'final';
  s.reason = 'forfeit';
  s.winner = other(side as 0 | 1);
  duelWin(ctx, s.score, s.seats[s.winner]);
}

export const mancala: GameModule<State, MancalaSettings> = {
  id: 'mancala',

  turnOf: (s) => (s.phase === 'play' ? [s.seats[s.turn]] : []),

  start(ctx, participants, settings) {
    const { first, second, score } = startDuel(ctx, 'mancala', participants);
    const seeds = clamp(Math.round(settings.seeds || 4), 3, 6);
    const board = Array(14).fill(seeds);
    board[6] = board[13] = 0;
    ctx.fx('start');
    return { settings, seats: [first, second], board, turn: 0, last: null, phase: 'play', winner: null, reason: null, moves: 0, score, botCache: null };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play') return;
    const side = s.seats.indexOf(by);
    if (side < 0) return;
    if (a.type === 'resign') return forfeit(ctx, s, by);
    if (a.type !== 'sow') return;
    if (side !== s.turn) throw new GameError('ماشي دورك');
    const pit = a.pit;
    if (!isNum(pit) || !pitsOf(s.turn).includes(pit)) throw new GameError('اختر حفرة من جهتك');
    if (s.board[pit] === 0) throw new GameError('هذه الحفرة فارغة');
    const before = s.board.slice();
    const r = sow(s.board, s.turn, pit);
    s.board = r.board;
    s.moves += 1;
    s.last = { seq: s.moves, side: s.turn, from: pit, path: r.path, before, capture: r.capture, extra: r.extra };
    if (r.capture) ctx.fx('correct', by);
    else if (r.extra) ctx.fx('reveal', by);
    else ctx.fx('card', by);
    if (r.over) finishByBoard(ctx, s);
    else if (!r.extra) s.turn = other(s.turn);
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const id = s.seats[s.turn];
    if (!bots.includes(id)) return;
    if (s.botCache?.moves !== s.moves) s.botCache = { moves: s.moves, pit: mancalaBotPit(s.board, s.turn, s.settings.level) };
    // wait for the seeds of the last move to finish moving on the phones
    const anim = Math.min(s.last?.path.length ?? 0, 14) * 75;
    ctx.bot(id, `m:${s.moves}`, anim + randDelay(650, 1100), { type: 'sow', pit: s.botCache.pit });
  },

  view(ctx, s, me): MancalaView {
    const side = s.seats.indexOf(me);
    return {
      game: 'mancala',
      phase: s.phase,
      seats: s.seats,
      board: s.board,
      turn: s.turn,
      mySide: side < 0 ? null : (side as 0 | 1),
      last: s.last,
      winner: s.winner,
      reason: s.reason,
      score: s.score,
      seeds: s.settings.seeds,
    };
  },

  onLeave(ctx, s, id) {
    forfeit(ctx, s, id);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.seeds) && (MANCALA_SEEDS as readonly number[]).includes(patch.seeds)) settings.seeds = patch.seeds;
    if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') settings.level = patch.level as MancalaLevel;
  },
};
