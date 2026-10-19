/**
 * «المنقلة» — Kalah for two: six pits a side and a store each. The starting player alternates
 * between games and the series score is kept (see ../duel.ts).
 */
import { MANCALA_SEEDS, mancalaSowMs, mancalaStore, type MancalaLevel, type MancalaMove, type MancalaSettings, type MancalaView } from '../../src/shared/games/mancala';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { mancalaBotPit, pitsOf, sow } from '../mancala-rules';
import { mancalaExpert } from '../ai/boards-mancala';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { clamp, isNum } from '../util';
import { VB, voiceAnd, voiceResult, voiceWinner } from '../voice-calls-boards';

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

/** «لماما»، «للحسن»: a name after the preposition لـ (announcements never conjugate a verb for the player). */
const li = (n: string) => (/^[\u0621-\u064A]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

/** «حبة واحدة», «حبتان», «5 حبات», «12 حبة» */
const seedsText = (n: number) => (n === 1 ? 'حبة واحدة' : n === 2 ? 'حبتان' : n <= 10 ? `${n} حبات` : `${n} حبة`);

/** How long the phones take to show a move (seeds land one by one, a capture travels to the store): see mancala.tsx. */
export const sowingMs = (m: MancalaMove | null) => mancalaSowMs(m);

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
    if (a.type === 'resign') {
      ctx.say?.(`انسحاب من ${ctx.playerName(by)}`, by, voiceAnd(VB.resign, voiceWinner(ctx.playerName(s.seats[other(side as 0 | 1)]))));
      return forfeit(ctx, s, by);
    }
    if (a.type !== 'sow') return;
    if (side !== s.turn) throw new GameError('ليس دورك');
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
    // read aloud (after the end check, so the result rides on the move): a capture, an extra turn, the winner
    const over = s.phase !== 'play';
    const voice = voiceAnd(r.capture && VB.capture, r.extra && !r.over && VB.extraTurn, over && voiceResult(s.winner === null || s.winner === 'draw' ? null : ctx.playerName(s.seats[s.winner])));
    ctx.say?.(`توزيع من ${ctx.playerName(by)}: ${seedsText(before[pit])}${r.capture ? ` — أكلٌ: ${seedsText(r.capture.seeds)}` : ''}${r.extra && !r.over ? ' — ودور إضافي' : ''}`, by, voice);
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'play') return;
    const id = s.seats[s.turn];
    if (!bots.includes(id)) return;
    if (s.botCache?.moves !== s.moves) {
      // the room's «مستوى البوتات» (the old per-game level is ignored)
      const level = botLevel(ctx);
      const pit = level === 'expert' ? mancalaExpert(s.board, s.turn) : mancalaBotPit(s.board, s.turn, level === 'smart' ? 'medium' : 'easy');
      s.botCache = { moves: s.moves, pit };
    }
    // wait for the seeds of the last move to finish moving on the phones
    const anim = sowingMs(s.last);
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

  result(s) {
    if (s.phase !== 'final' || s.winner === null) return null;
    if (s.winner === 'draw') return { places: [[...s.seats]] };
    return { places: [[s.seats[s.winner]], [s.seats[other(s.winner)]]] };
  },

  patchSettings(settings, patch) {
    if (isNum(patch.seeds) && (MANCALA_SEEDS as readonly number[]).includes(patch.seeds)) settings.seeds = patch.seeds;
    if (patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') settings.level = patch.level as MancalaLevel;
  },
};
