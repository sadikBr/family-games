/**
 * الضامة — checkers on an 8×8 board (dark squares only).
 * Men move one step diagonally forward; captures are compulsory and chain.
 * Options: flying kings (move/capture along a whole diagonal), men capturing backwards, and the
 * maximum-capture rule (you must take the sequence that captures the most pieces).
 * A man that ends its move on the far row becomes a king.
 * You win when the other side has no pieces or no legal move. 50 moves without a capture = draw.
 */
import type { DamaSettings, DamaView } from '../../src/shared/protocol';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

export type Move = { from: number; path: number[]; captures: number[] };
/** Rule options; the maximum-capture rule is on unless `maxCapture` is false. */
export type DamaOpts = Omit<DamaSettings, 'maxCapture'> & { maxCapture?: boolean };

const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const rc = (i: number) => [Math.floor(i / 8), i % 8] as const;
const idx = (r: number, c: number) => r * 8 + c;
const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const sideOf = (v: number) => (v > 0 ? 1 : v < 0 ? -1 : 0);

export function initialBoard(): number[] {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 0) continue;
      if (r < 3) b[idx(r, c)] = -1;
      if (r > 4) b[idx(r, c)] = 1;
    }
  return b;
}

/** All capture sequences for the piece on `from`. */
function captures(b: number[], from: number, opts: DamaOpts): Move[] {
  const piece = b[from];
  const me = sideOf(piece);
  const king = Math.abs(piece) === 2;
  const out: Move[] = [];
  const walk = (pos: number, path: number[], taken: number[]) => {
    const [r, c] = rc(pos);
    let extended = false;
    for (const [dr, dc] of DIRS) {
      if (!king && !opts.backCapture && dr !== -me) continue; // white (1) moves up (dr = -1)
      if (king && opts.flyingKings) {
        let rr = r + dr, cc = c + dc;
        while (inside(rr, cc) && b[idx(rr, cc)] === 0) {
          rr += dr;
          cc += dc;
        }
        if (!inside(rr, cc)) continue;
        const enemy = idx(rr, cc);
        if (sideOf(b[enemy]) !== -me || taken.includes(enemy)) continue;
        rr += dr;
        cc += dc;
        while (inside(rr, cc) && (b[idx(rr, cc)] === 0 || idx(rr, cc) === from)) {
          extended = true;
          walk(idx(rr, cc), [...path, idx(rr, cc)], [...taken, enemy]);
          rr += dr;
          cc += dc;
        }
      } else {
        const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
        if (!inside(r2, c2)) continue;
        const enemy = idx(r1, c1), land = idx(r2, c2);
        if (sideOf(b[enemy]) !== -me || taken.includes(enemy)) continue;
        if (b[land] !== 0 && land !== from) continue;
        extended = true;
        walk(land, [...path, land], [...taken, enemy]);
      }
    }
    if (!extended && taken.length) out.push({ from, path, captures: taken });
  };
  walk(from, [], []);
  return out;
}

function steps(b: number[], from: number, opts: DamaOpts): Move[] {
  const piece = b[from];
  const me = sideOf(piece);
  const king = Math.abs(piece) === 2;
  const [r, c] = rc(from);
  const out: Move[] = [];
  for (const [dr, dc] of DIRS) {
    if (!king && dr !== -me) continue;
    let rr = r + dr, cc = c + dc;
    while (inside(rr, cc) && b[idx(rr, cc)] === 0) {
      out.push({ from, path: [idx(rr, cc)], captures: [] });
      if (!(king && opts.flyingKings)) break;
      rr += dr;
      cc += dc;
    }
  }
  return out;
}

/** Every capture sequence for a side, ignoring the maximum-capture rule. */
export function allCaptures(b: number[], side: 1 | -1, opts: DamaOpts): Move[] {
  return b.flatMap((v, i) => (sideOf(v) === side ? captures(b, i, opts) : []));
}

/**
 * Legal moves for a side (1 = white, -1 = black). Captures are compulsory; with `maxCapture`
 * only the sequences that take the most pieces are allowed.
 */
export function legalMoves(b: number[], side: 1 | -1, opts: DamaOpts): Move[] {
  const caps = allCaptures(b, side, opts);
  if (caps.length) {
    if (opts.maxCapture === false) return caps;
    const most = Math.max(...caps.map((m) => m.captures.length));
    return caps.filter((m) => m.captures.length === most);
  }
  return b.flatMap((v, i) => (sideOf(v) === side ? steps(b, i, opts) : []));
}

/**
 * The move to play when a player picks `from` → `to`: several sequences can end on the same square,
 * so take the one that captures the most pieces (then the most kings).
 */
export function pickMove(b: number[], options: Move[]): Move {
  const kings = (m: Move) => m.captures.filter((c) => Math.abs(b[c]) === 2).length;
  return options.slice().sort((x, y) => y.captures.length - x.captures.length || kings(y) - kings(x))[0];
}

export function applyMove(b: number[], m: Move): number[] {
  const nb = b.slice();
  const piece = nb[m.from];
  nb[m.from] = 0;
  for (const c of m.captures) nb[c] = 0;
  const to = m.path[m.path.length - 1];
  const [r] = rc(to);
  nb[to] = Math.abs(piece) === 1 && ((piece > 0 && r === 0) || (piece < 0 && r === 7)) ? piece * 2 : piece;
  return nb;
}

interface State {
  settings: DamaSettings;
  white: string;
  black: string;
  board: number[];
  turn: 1 | -1;
  lastMove: Move | null;
  quiet: number; // moves since the last capture or man move
  phase: DamaView['phase'];
  winner: DamaView['winner'];
  reason: DamaView['reason'];
  moves: number;
  score: Record<string, number>;
}

/** «لماما»، «للحسن»: a name after the preposition لـ (announcements never conjugate a verb for the player). */
const li = (n: string) => (/^[\u0621-\u064A]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

/** «قطعة», «قطعتان», «3 قطع»… */
const pieces = (n: number) => (n === 1 ? 'قطعة' : n === 2 ? 'قطعتان' : n <= 10 ? `${n} قطع` : `${n} قطعة`);

function finish(ctx: GameCtx, s: State, winner: 'white' | 'black', reason: DamaView['reason']) {
  s.phase = 'final';
  s.winner = winner;
  s.reason = reason;
  duelWin(ctx, s.score, s[winner]);
}

function finishIfOver(ctx: GameCtx, s: State) {
  const side = s.turn;
  const left = s.board.filter((v) => sideOf(v) === side).length;
  if (!left || !legalMoves(s.board, side, s.settings).length) finish(ctx, s, side === 1 ? 'black' : 'white', left ? 'blocked' : 'pieces');
  else if (s.quiet >= 50) {
    s.phase = 'final';
    s.winner = 'draw';
    s.reason = 'draw';
    ctx.fx('win');
  }
}

/** Bot: biggest capture, else a move that doesn't hang a piece, preferring promotion. */
export function botMove(b: number[], side: 1 | -1, opts: DamaOpts): Move | null {
  const moves = legalMoves(b, side, opts);
  if (!moves.length) return null;
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const m of moves) {
    const nb = applyMove(b, m);
    const reply = legalMoves(nb, side === 1 ? -1 : 1, opts);
    const loss = reply.reduce((mx, r) => Math.max(mx, r.captures.length), 0);
    const to = m.path[m.path.length - 1];
    const promoted = Math.abs(nb[to]) === 2 && Math.abs(b[m.from]) === 1 ? 1 : 0;
    const advance = side === 1 ? 7 - Math.floor(to / 8) : Math.floor(to / 8);
    const score = m.captures.length * 10 - loss * 8 + promoted * 6 + advance * 0.3 + Math.random();
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export const dama: GameModule<State, DamaSettings> = {
  turnOf: (s) => s.phase === 'play' ? [s.turn === 1 ? s.white : s.black] : [],
  id: 'dama',

  start(ctx, participants, settings) {
    if (participants.length !== 2) throw new GameError('الضامة للاعبَين فقط — أضف بوتاً إن كنت وحدك');
    const { first: white, second: black, score } = startDuel(ctx, 'dama', participants); // white moves first
    ctx.fx('start');
    return {
      settings,
      white,
      black,
      board: initialBoard(),
      turn: 1,
      lastMove: null,
      quiet: 0,
      phase: 'play',
      winner: null,
      reason: null,
      moves: 0,
      score,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play') return;
    const side = by === s.white ? 1 : by === s.black ? -1 : 0;
    if (!side) return;
    if (a.type === 'resign') {
      ctx.say?.(`استسلام من ${ctx.playerName(by)}`, by);
      return finish(ctx, s, side === 1 ? 'black' : 'white', 'resign');
    }
    if (a.type !== 'move') return;
    if (side !== s.turn) throw new GameError('ليس دورك');
    if (!isNum(a.from) || !isNum(a.to)) return;
    const legal = legalMoves(s.board, s.turn, s.settings);
    const ends = (m: Move) => m.from === a.from && m.path[m.path.length - 1] === a.to;
    const options = legal.filter(ends);
    if (!options.length) {
      if (allCaptures(s.board, s.turn, s.settings).some(ends)) throw new GameError('يجب أن تأكل أكبر عدد من القطع');
      throw new GameError(legal.some((m) => m.captures.length) ? 'الأكل إجباري — كُل قطعة' : 'حركة غير مسموحة');
    }
    const m = pickMove(s.board, options);
    const wasMan = Math.abs(s.board[m.from]) === 1;
    s.board = applyMove(s.board, m);
    s.lastMove = m;
    s.quiet = m.captures.length || wasMan ? 0 : s.quiet + 1;
    s.moves += 1;
    const crowned = wasMan && Math.abs(s.board[m.path[m.path.length - 1]]) === 2;
    ctx.say?.(`${m.captures.length ? `أكلٌ ${li(ctx.playerName(by))}: ${pieces(m.captures.length)}` : `حركة من ${ctx.playerName(by)}`}${crowned ? ' — وصارت القطعة ملكاً' : ''}`, by);
    ctx.fx(m.captures.length ? 'correct' : 'card', by);
    s.turn = s.turn === 1 ? -1 : 1;
    finishIfOver(ctx, s);
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play') return;
    const bot = s.turn === 1 ? s.white : s.black;
    if (!ctx.isBot(bot)) return;
    const m = botMove(s.board, s.turn, s.settings);
    if (m) ctx.bot(bot, `move:${s.moves}`, randDelay(900, 1700), { type: 'move', from: m.from, to: m.path[m.path.length - 1] });
  },

  view(ctx, s, me): DamaView {
    const myColor = me === s.white ? 'white' : me === s.black ? 'black' : null;
    const mySide = myColor === 'white' ? 1 : myColor === 'black' ? -1 : 0;
    return {
      game: 'dama',
      phase: s.phase,
      white: s.white,
      black: s.black,
      board: s.board,
      turn: s.turn === 1 ? 'white' : 'black',
      myColor,
      moves: s.phase === 'play' && mySide === s.turn ? legalMoves(s.board, s.turn, s.settings) : [],
      lastMove: s.lastMove,
      counts: { white: s.board.filter((v) => v > 0).length, black: s.board.filter((v) => v < 0).length },
      winner: s.winner,
      reason: s.reason,
      score: s.score,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'final' || (id !== s.white && id !== s.black)) return;
    finish(ctx, s, id === s.white ? 'black' : 'white', 'left');
  },
};
