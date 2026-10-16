/**
 * A small, complete chess rules engine (shared by server and app).
 * Board: 64 squares, index 0 = a8 … 63 = h1 (FEN order). Pieces: "PNBRQK" white, "pnbrqk" black, "" empty.
 * Covers castling, en passant, promotion, check, mate, stalemate, the 50-move rule,
 * threefold repetition and insufficient material. Verified with standard perft counts (server/rules.test.ts).
 */

export type Color = 'w' | 'b';
export interface Pos {
  b: string[];
  turn: Color;
  castle: string; // subset of "KQkq"
  ep: number; // en-passant target square or -1
  half: number; // half-moves since the last capture or pawn move
  full: number;
}
export interface Move {
  from: number;
  to: number;
  promo?: 'q' | 'r' | 'b' | 'n';
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const colorOf = (pc: string): Color | null => (pc === '' ? null : pc === pc.toUpperCase() ? 'w' : 'b');
const R = (i: number) => i >> 3;
const Cc = (i: number) => i & 7;
const at = (r: number, c: number) => (r < 0 || r > 7 || c < 0 || c > 7 ? -1 : r * 8 + c);
export const sqName = (i: number) => 'abcdefgh'[Cc(i)] + (8 - R(i));

export function fromFen(fen: string): Pos {
  const [rows, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
  const b: string[] = [];
  for (const ch of rows.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let k = 0; k < Number(ch); k++) b.push('');
    else b.push(ch);
  }
  const epSq = ep && ep !== '-' ? (8 - Number(ep[1])) * 8 + 'abcdefgh'.indexOf(ep[0]) : -1;
  return { b, turn: turn as Color, castle: castle === '-' ? '' : castle, ep: epSq, half: Number(half ?? 0), full: Number(full ?? 1) };
}

export function toFen(p: Pos): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const pc = p.b[r * 8 + c];
      if (!pc) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += pc;
      }
    }
    rows.push(row + (empty || ''));
  }
  return `${rows.join('/')} ${p.turn} ${p.castle || '-'} ${p.ep >= 0 ? sqName(p.ep) : '-'} ${p.half} ${p.full}`;
}

/** Position key for repetition (pieces, side, castling, en passant). */
export const repKey = (p: Pos) => toFen(p).split(' ').slice(0, 4).join(' ');

const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

/** Is square `sq` attacked by side `by`? */
export function attacked(b: string[], sq: number, by: Color): boolean {
  const r = R(sq), c = Cc(sq);
  const own = (pc: string, t: string) => pc === (by === 'w' ? t.toUpperCase() : t);
  // pawns: a white pawn attacks upwards, so it sits one row below the square
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) {
    const i = at(pr, c + dc);
    if (i >= 0 && own(b[i], 'p')) return true;
  }
  for (const [dr, dc] of KN) {
    const i = at(r + dr, c + dc);
    if (i >= 0 && own(b[i], 'n')) return true;
  }
  for (const [dr, dc] of KG) {
    const i = at(r + dr, c + dc);
    if (i >= 0 && own(b[i], 'k')) return true;
  }
  for (const [dirs, kinds] of [[DIAG, 'bq'], [ORTH, 'rq']] as const) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
        const pc = b[rr * 8 + cc];
        if (pc) {
          if (colorOf(pc) === by && kinds.includes(pc.toLowerCase())) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }
  return false;
}

export const kingSq = (b: string[], side: Color) => b.indexOf(side === 'w' ? 'K' : 'k');
export const inCheck = (p: Pos, side: Color = p.turn) => attacked(p.b, kingSq(p.b, side), side === 'w' ? 'b' : 'w');

function pseudo(p: Pos): Move[] {
  const out: Move[] = [];
  const me = p.turn;
  const them: Color = me === 'w' ? 'b' : 'w';
  const b = p.b;
  for (let i = 0; i < 64; i++) {
    const pc = b[i];
    if (!pc || colorOf(pc) !== me) continue;
    const r = R(i), c = Cc(i);
    const t = pc.toLowerCase();
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1;
      const start = me === 'w' ? 6 : 1;
      const last = me === 'w' ? 0 : 7;
      const push = (to: number) => {
        if (R(to) === last) for (const promo of ['q', 'r', 'b', 'n'] as const) out.push({ from: i, to, promo });
        else out.push({ from: i, to });
      };
      const one = at(r + dir, c);
      if (one >= 0 && !b[one]) {
        push(one);
        const two = at(r + 2 * dir, c);
        if (r === start && !b[two]) out.push({ from: i, to: two });
      }
      for (const dc of [-1, 1]) {
        const to = at(r + dir, c + dc);
        if (to < 0) continue;
        if ((b[to] && colorOf(b[to]) === them) || to === p.ep) push(to);
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, dc] of t === 'n' ? KN : KG) {
        const to = at(r + dr, c + dc);
        if (to >= 0 && colorOf(b[to]) !== me) out.push({ from: i, to });
      }
      if (t === 'k') {
        const home = me === 'w' ? 60 : 4;
        if (i === home && !attacked(b, home, them)) {
          const K = me === 'w' ? 'K' : 'k', Q = me === 'w' ? 'Q' : 'q', rook = me === 'w' ? 'R' : 'r';
          if (p.castle.includes(K) && !b[home + 1] && !b[home + 2] && b[home + 3] === rook && !attacked(b, home + 1, them) && !attacked(b, home + 2, them))
            out.push({ from: i, to: home + 2 });
          if (p.castle.includes(Q) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook && !attacked(b, home - 1, them) && !attacked(b, home - 2, them))
            out.push({ from: i, to: home - 2 });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
          const to = rr * 8 + cc;
          if (b[to]) {
            if (colorOf(b[to]) === them) out.push({ from: i, to });
            break;
          }
          out.push({ from: i, to });
          rr += dr;
          cc += dc;
        }
      }
    }
  }
  return out;
}

export function makeMove(p: Pos, m: Move): Pos {
  const b = p.b.slice();
  const pc = b[m.from];
  const t = pc.toLowerCase();
  const me = p.turn;
  const captured = b[m.to];
  let castle = p.castle;
  let ep = -1;
  b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : pc;
  b[m.from] = '';
  if (t === 'p') {
    if (m.to === p.ep && !captured) b[m.to + (me === 'w' ? 8 : -8)] = ''; // en passant
    if (Math.abs(m.to - m.from) === 16) ep = (m.from + m.to) / 2;
  }
  if (t === 'k') {
    if (m.to - m.from === 2) {
      b[m.from + 1] = b[m.from + 3];
      b[m.from + 3] = '';
    } else if (m.from - m.to === 2) {
      b[m.from - 1] = b[m.from - 4];
      b[m.from - 4] = '';
    }
    castle = castle.replace(me === 'w' ? /[KQ]/g : /[kq]/g, '');
  }
  const strip = (sq: number) => {
    if (sq === 63) castle = castle.replace('K', '');
    if (sq === 56) castle = castle.replace('Q', '');
    if (sq === 7) castle = castle.replace('k', '');
    if (sq === 0) castle = castle.replace('q', '');
  };
  strip(m.from);
  strip(m.to);
  return {
    b,
    turn: me === 'w' ? 'b' : 'w',
    castle,
    ep,
    half: t === 'p' || captured ? 0 : p.half + 1,
    full: me === 'b' ? p.full + 1 : p.full,
  };
}

export function legalMoves(p: Pos): Move[] {
  return pseudo(p).filter((m) => !inCheck(makeMove(p, m), p.turn));
}

export function perft(p: Pos, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(p);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) n += perft(makeMove(p, m), depth - 1);
  return n;
}

export function insufficient(b: string[]): boolean {
  const pcs = b.map((pc, i) => ({ pc, i })).filter((x) => x.pc && x.pc.toLowerCase() !== 'k');
  if (!pcs.length) return true;
  if (pcs.length === 1 && 'nb'.includes(pcs[0].pc.toLowerCase())) return true;
  if (pcs.every((x) => x.pc.toLowerCase() === 'b')) {
    const shade = (i: number) => (R(i) + Cc(i)) % 2;
    return pcs.every((x) => shade(x.i) === shade(pcs[0].i));
  }
  return false;
}

export type ChessResult = { winner: Color | 'draw'; reason: 'mate' | 'stalemate' | 'fifty' | 'repetition' | 'material' } | null;

/** Game result for the side to move, given how many times each position has occurred. */
export function resultOf(p: Pos, reps: Record<string, number>): ChessResult {
  if (!legalMoves(p).length) return inCheck(p) ? { winner: p.turn === 'w' ? 'b' : 'w', reason: 'mate' } : { winner: 'draw', reason: 'stalemate' };
  if (insufficient(p.b)) return { winner: 'draw', reason: 'material' };
  if (p.half >= 100) return { winner: 'draw', reason: 'fifty' };
  if ((reps[repKey(p)] ?? 0) >= 3) return { winner: 'draw', reason: 'repetition' };
  return null;
}

/* ---------------- a simple bot: alpha-beta over material + piece-square tables ---------------- */

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// piece-square tables from white's point of view, index 0 = a8
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

/** Static evaluation from white's point of view. */
export function evaluate(b: string[]): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const pc = b[i];
    if (!pc) continue;
    const t = pc.toLowerCase();
    if (pc === t) s -= VAL[t] + PST[t][(7 - R(i)) * 8 + Cc(i)]; // black: mirror the table
    else s += VAL[t] + PST[t][i];
  }
  return s;
}

const order = (p: Pos, moves: Move[]) =>
  moves
    .map((m) => ({ m, k: (p.b[m.to] ? 10 * VAL[p.b[m.to].toLowerCase()] - VAL[p.b[m.from].toLowerCase()] : 0) + (m.promo === 'q' ? 800 : 0) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.m);

let nodes = 0;
let budget = Infinity;
class OutOfTime extends Error {}

function search(p: Pos, depth: number, alpha: number, beta: number): number {
  if (++nodes > budget) throw new OutOfTime();
  const sign = p.turn === 'w' ? 1 : -1;
  if (depth === 0) return sign * evaluate(p.b); // leaf: score only (no move generation)
  const moves = legalMoves(p);
  if (!moves.length) return inCheck(p) ? -100000 - depth : 0;
  let best = -Infinity;
  for (const m of order(p, moves)) {
    const v = -search(makeMove(p, m), depth - 1, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function rootScores(p: Pos, moves: Move[], depth: number) {
  return moves.map((m) => ({ m, v: -search(makeMove(p, m), depth - 1, -Infinity, Infinity) }));
}

/**
 * Pick a move: level 1 = casual (shallow, some randomness), level 2 = stronger (looks 3 moves ahead).
 * The deeper search has a work budget so a complicated position never stalls the server.
 */
export function botMove(p: Pos, level: 1 | 2 = 2): Move | null {
  const moves = order(p, legalMoves(p));
  if (!moves.length) return null;
  nodes = 0;
  budget = Infinity;
  let scored = rootScores(p, moves, level === 1 ? 1 : 2);
  if (level === 2) {
    nodes = 0;
    budget = 25000;
    try {
      scored = rootScores(p, moves, 3);
    } catch (e) {
      if (!(e instanceof OutOfTime)) throw e;
    }
    budget = Infinity;
  }
  scored.sort((a, b) => b.v - a.v);
  const slack = level === 1 ? 120 : 15;
  const top = scored.filter((x) => x.v >= scored[0].v - slack);
  return top[Math.floor(Math.random() * top.length)].m;
}
