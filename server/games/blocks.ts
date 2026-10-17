/**
 * «القطع الملونة» — a polyomino territory game for 2–4 players (our own design of the classic idea).
 * Each colour has the 21 free polyominoes. The first piece covers the colour's start square; every
 * later piece touches the same colour at a corner and never along an edge. A colour that can't place
 * anything is passed automatically; the game ends when nobody can move. Scoring: −1 per square left,
 * +15 for placing all 21, +5 more if the 1-square went last.
 * Two players use a 14×14 board with starts near the middle (a 20×20 board would need two colours each,
 * which is too much for one phone screen); three or four play on 20×20 from the corners.
 */
import { PIECE_COUNT, PLACE_ERRORS, boardSize, checkPlacement, hasMove, placementCells, scoreOf, startCells, type SeatCtx } from '../../src/shared/blocks-rules';
import type { BlocksLevel, BlocksSettings, BlocksView } from '../../src/shared/games/blocks';
import { blocksBotMove } from '../blocks-bot';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';

interface State {
  settings: BlocksSettings;
  n: number;
  seats: string[];
  names: Record<string, string>;
  starts: number[];
  board: number[];
  /** seat index whose turn it is (-1 when the game is over) */
  turn: number;
  left: number[][];
  lastPiece: (number | null)[];
  done: boolean[];
  gone: boolean[];
  last: BlocksView['last'];
  passed: number[];
  moveNo: number;
  phase: BlocksView['phase'];
  winners: string[] | null;
  reason: BlocksView['reason'];
  series: Record<string, number>;
  /** the bot's choice for the current move (worked out once per move) */
  botCache: { moveNo: number; seat: number; move: { piece: number; t: number; r: number; c: number } } | null;
}

interface GroupMemo {
  group: string;
  order: string[];
  lastFirst: number;
  score: Record<string, number>;
}

/** 3–4 players: keep the same seating for the group and pass the first move (and corner) along each game. */
function startGroup(ctx: GameCtx, participants: string[]) {
  const group = participants.slice().sort().join('|');
  const prev = ctx.memo.get('blocks:group') as GroupMemo | undefined;
  if (prev && prev.group === group) {
    const lastFirst = (prev.lastFirst + 1) % prev.order.length;
    ctx.memo.set('blocks:group', { ...prev, lastFirst });
    return { seats: [...prev.order.slice(lastFirst), ...prev.order.slice(0, lastFirst)], score: prev.score };
  }
  const order = shuffle(participants);
  const score = Object.fromEntries(order.map((p) => [p, 0]));
  ctx.memo.set('blocks:group', { group, order, lastFirst: 0, score } satisfies GroupMemo);
  return { seats: order, score };
}

const seatCtx = (s: State, seat: number): SeatCtx => ({
  board: s.board,
  n: s.n,
  seat,
  start: s.starts[seat],
  first: s.left[seat].length === PIECE_COUNT,
});

const turnId = (s: State) => (s.phase === 'play' && s.turn >= 0 ? s.seats[s.turn] : null);
const scores = (s: State) => s.seats.map((_, i) => scoreOf(s.left[i], s.lastPiece[i]));

function finish(ctx: GameCtx, s: State, reason: 'blocked' | 'forfeit') {
  s.phase = 'final';
  s.reason = reason;
  s.turn = -1;
  s.botCache = null;
  const sc = scores(s);
  const inGame = s.seats.map((_, i) => i).filter((i) => !s.gone[i]);
  if (!inGame.length) {
    s.winners = [];
    return;
  }
  const best = Math.max(...inGame.map((i) => sc[i].total));
  s.winners = inGame.filter((i) => sc[i].total === best).map((i) => s.seats[i]);
  if (s.winners.length !== 1) {
    ctx.fx('reveal');
    return; // a tie: no win counted
  }
  const w = s.winners[0];
  if (s.seats.length === 2) duelWin(ctx, s.series, w);
  else {
    s.series[w] = (s.series[w] ?? 0) + 1;
    ctx.fx('win', w);
  }
}

/**
 * Hand the turn to the next colour after `from` that can still place a piece. Colours with no legal
 * placement are marked done (they can never move again: the board only fills up) and passed.
 */
function advance(ctx: GameCtx, s: State, from: number) {
  const k = s.seats.length;
  for (let step = 1; step <= k; step++) {
    const i = (from + step) % k;
    if (s.done[i] || s.gone[i]) continue;
    if (s.left[i].length && hasMove(seatCtx(s, i), s.left[i])) {
      s.turn = i;
      return;
    }
    s.done[i] = true;
    if (s.left[i].length) {
      s.passed.push(i);
      ctx.fx('skip', s.seats[i]);
    }
  }
  finish(ctx, s, 'blocked');
}

export const blocks: GameModule<State, BlocksSettings> = {
  id: 'blocks',

  turnOf: (s) => {
    const t = turnId(s);
    return t ? [t] : [];
  },

  start(ctx, participants, settings) {
    let seats: string[], series: Record<string, number>;
    const players = participants.slice(0, 4);
    if (players.length === 2) {
      const d = startDuel(ctx, 'blocks', players);
      seats = [d.first, d.second];
      series = d.score;
    } else ({ seats, score: series } = startGroup(ctx, players));
    const n = boardSize(seats.length);
    ctx.fx('start');
    const all = Array.from({ length: PIECE_COUNT }, (_, i) => i);
    return {
      settings,
      n,
      seats,
      names: Object.fromEntries(seats.map((p) => [p, ctx.playerName(p)])),
      starts: startCells(n, seats.length),
      board: Array(n * n).fill(-1),
      turn: 0,
      left: seats.map(() => all.slice()),
      lastPiece: seats.map(() => null),
      done: seats.map(() => false),
      gone: seats.map(() => false),
      last: null,
      passed: [],
      moveNo: 0,
      phase: 'play',
      winners: null,
      reason: null,
      series,
      botCache: null,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || a.type !== 'place') return;
    const seat = s.seats.indexOf(by);
    if (seat < 0 || s.gone[seat]) return;
    if (s.turn !== seat) throw new GameError('ليس دورك');
    const int = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
    const { piece, t, r, c } = a;
    if (!int(piece) || !int(t) || !int(r) || !int(c)) return;
    if (piece < 0 || piece >= PIECE_COUNT || t < 0 || t > 7) return;
    if (!s.left[seat].includes(piece)) throw new GameError(PLACE_ERRORS.used);
    const p = { piece, t, r, c };
    const err = checkPlacement(seatCtx(s, seat), p);
    if (err) throw new GameError(PLACE_ERRORS[err]);
    const cells = placementCells(s.n, p)!;
    for (const i of cells) s.board[i] = seat;
    s.left[seat] = s.left[seat].filter((x) => x !== piece);
    s.lastPiece[seat] = piece;
    s.last = { seat, piece, cells };
    s.passed = [];
    s.moveNo += 1;
    s.botCache = null;
    ctx.fx('card', by);
    if (!s.left[seat].length) {
      s.done[seat] = true;
      ctx.fx('correct', by);
    }
    advance(ctx, s, seat);
  },

  botPlan(ctx, s, bots) {
    const id = turnId(s);
    if (!id || !bots.includes(id)) return;
    const seat = s.turn;
    if (s.botCache?.moveNo !== s.moveNo || s.botCache.seat !== seat) {
      const live = s.seats.map((_, i) => i).filter((i) => !s.done[i] && !s.gone[i]);
      const level: BlocksLevel = s.settings.level === 'hard' ? 'hard' : 'easy';
      const m = blocksBotMove({ board: s.board, n: s.n, seat, starts: s.starts, left: s.left, live, level });
      if (!m) return; // can't happen: advance() only hands the turn to a colour that can move
      s.botCache = { moveNo: s.moveNo, seat, move: { piece: m.piece, t: m.t, r: m.r, c: m.c } };
    }
    ctx.bot(id, `m:${s.moveNo}`, randDelay(700, 1300), { type: 'place', ...s.botCache.move });
  },

  view(_ctx, s, me): BlocksView {
    return {
      game: 'blocks',
      phase: s.phase,
      n: s.n,
      seats: s.seats,
      names: s.names,
      starts: s.starts,
      board: s.board,
      turn: turnId(s),
      left: s.left,
      done: s.done,
      gone: s.gone,
      last: s.last,
      passed: s.passed,
      moveNo: s.moveNo,
      scores: scores(s),
      winners: s.winners,
      reason: s.reason,
      series: s.series,
      me: s.seats.indexOf(me),
    };
  },

  /** The leaver's pieces stay on the board and their colour is skipped; one player left ends the game. */
  onLeave(ctx, s, id) {
    const seat = s.seats.indexOf(id);
    if (seat < 0 || s.phase !== 'play' || s.gone[seat]) return;
    s.gone[seat] = true;
    s.done[seat] = true;
    const remaining = s.seats.filter((_, i) => !s.gone[i]).length;
    if (remaining <= 1) return finish(ctx, s, 'forfeit');
    if (s.turn === seat) {
      s.botCache = null;
      advance(ctx, s, seat);
    }
  },

  patchSettings(settings, patch) {
    if (patch.level === 'easy' || patch.level === 'hard') settings.level = patch.level;
  },
};
