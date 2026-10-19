/**
 * «الشطرنج» — the smart / expert bots: a small, fast engine of its own (the shared rules engine in
 * src/shared/chess.ts copies arrays of strings on every move, fine for the referee, too slow to search).
 *
 * 10×12 mailbox board, make / unmake with an undo stack, Zobrist keys, and an iterative-deepening
 * principal-variation search: transposition table, null-move pruning, late-move reductions, check
 * extensions, killer + history move ordering, MVV-LVA captures and a quiescence search over captures.
 * Evaluation: material and piece-square tables tapered between middlegame and endgame, pawn structure
 * (passed, doubled, isolated), bishop pair, rooks on open files, king shelter, and a mop-up term that
 * drives a lone king to the edge so won endgames are actually won. Repetitions and the 50-move rule
 * count as draws inside the search (game history included).
 */
import { fromFen, legalMoves as refLegal, type Move, type Pos } from '../../src/shared/chess';
import { BUDGET, zobrist } from './boards-search';

const EMPTY = 0, OFF = 7;
const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
const BLACK = 8;
const MATE = 30000;
const MATE_SOON = MATE - 500;
const INF = 1e9;

const CHAR: Record<string, number> = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6, p: 9, n: 10, b: 11, r: 12, q: 13, k: 14 };
const PROMO_CHAR = ['', '', 'n', 'b', 'r', 'q'] as const;

const toMb = (i: number) => 21 + (i >> 3) * 10 + (i & 7);
const fromMb = (sq: number) => (Math.floor(sq / 10) - 2) * 8 + (sq % 10) - 1;

const KN = [-21, -19, -12, -8, 8, 12, 19, 21];
const KG = [-11, -10, -9, -1, 1, 9, 10, 11];
const DIAG = [-11, -9, 9, 11];
const ORTH = [-10, -1, 1, 10];

const VAL_MG = [0, 82, 337, 365, 477, 1025, 0];
const VAL_EG = [0, 94, 281, 297, 512, 936, 0];
const SEE_VAL = [0, 100, 320, 330, 500, 900, 20000];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

// piece-square tables, white's view, index 0 = a8 (from the classic "simplified evaluation function")
const PST_MG: number[][] = [
  [],
  [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
];
const KING_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50,
];
const PAWN_EG_ROW = [0, 90, 60, 35, 18, 8, 0, 0]; // by row from white's view (row 1 = 7th rank)
const PST_EG: number[][] = PST_MG.map((t, p) => (p === KING ? KING_EG : p === PAWN ? t.map((_, i) => PAWN_EG_ROW[i >> 3]) : t.map((v) => v >> 1)));
const PASSED = [0, 110, 70, 40, 22, 12, 6, 0]; // passed pawn bonus by row from its own side's view (endgame weight)

/** Tables indexed [piece code][mailbox square] → value for that piece's owner. */
const MG = Array.from({ length: 15 }, () => new Int16Array(120));
const EG = Array.from({ length: 15 }, () => new Int16Array(120));
for (let t = 1; t <= 6; t++)
  for (let i = 0; i < 64; i++) {
    const sq = toMb(i);
    const mirror = (7 - (i >> 3)) * 8 + (i & 7);
    MG[t][sq] = VAL_MG[t] + PST_MG[t][i];
    EG[t][sq] = VAL_EG[t] + PST_EG[t][i];
    MG[t | BLACK][sq] = VAL_MG[t] + PST_MG[t][mirror];
    EG[t | BLACK][sq] = VAL_EG[t] + PST_EG[t][mirror];
  }

const Z1 = zobrist(15 * 120 + 16 + 120 + 1, 0x1234567);
const Z2 = zobrist(15 * 120 + 16 + 120 + 1, 0x7654321);
const ZC = 15 * 120, ZE = ZC + 16, ZS = ZE + 120;

const CASTLE_MASK = new Int8Array(120).fill(15);
CASTLE_MASK[95] = 15 & ~3;
CASTLE_MASK[98] = 15 & ~1;
CASTLE_MASK[91] = 15 & ~2;
CASTLE_MASK[25] = 15 & ~12;
CASTLE_MASK[28] = 15 & ~4;
CASTLE_MASK[21] = 15 & ~8;

// move = from | to << 7 | promo << 14 | flag << 17   (flag 1 = en passant, 2 = castle, 4 = double push)
const mFrom = (m: number) => m & 127;
const mTo = (m: number) => (m >> 7) & 127;
const mPromo = (m: number) => (m >> 14) & 7;
const mFlag = (m: number) => m >> 17;
const mk = (from: number, to: number, promo = 0, flag = 0) => from | (to << 7) | (promo << 14) | (flag << 17);

const TT_SIZE = 1 << 18;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 0, TT_LOWER = 1, TT_UPPER = 2;

class Abort extends Error {}

// one table and one set of move buffers for every search (the server is single-threaded)
const ttKeys = new Int32Array(TT_SIZE);
const ttMoves = new Int32Array(TT_SIZE);
const ttScores = new Int32Array(TT_SIZE);
const ttDepths = new Int8Array(TT_SIZE);
const ttFlags = new Int8Array(TT_SIZE);
const moveBuf: Int32Array[] = Array.from({ length: 128 }, () => new Int32Array(256));
const scoreBuf: Int32Array[] = Array.from({ length: 128 }, () => new Int32Array(256));

/** The Zobrist key (h1) of a position given as a repKey / FEN prefix. */
function keyOf(p: Pos): number {
  let h = 0;
  for (let i = 0; i < 64; i++) if (p.b[i]) h ^= Z1[CHAR[p.b[i]] * 120 + toMb(i)];
  const castle = (p.castle.includes('K') ? 1 : 0) | (p.castle.includes('Q') ? 2 : 0) | (p.castle.includes('k') ? 4 : 0) | (p.castle.includes('q') ? 8 : 0);
  return h ^ Z1[ZC + castle] ^ (p.ep >= 0 ? Z1[ZE + toMb(p.ep)] : 0) ^ (p.turn === 'b' ? Z1[ZS] : 0);
}

export class Engine {
  b = new Int8Array(120);
  side = 0; // 0 white, 1 black
  castle = 0; // 1 K, 2 Q, 4 k, 8 q
  ep = 0;
  half = 0;
  h1 = 0;
  h2 = 0;
  kings = [0, 0];
  mg = [0, 0];
  eg = [0, 0];
  phase = 0;
  count = new Int8Array(15);
  // undo stack
  private uCap: number[] = [];
  private uCastle: number[] = [];
  private uEp: number[] = [];
  private uHalf: number[] = [];
  private uH1: number[] = [];
  private uH2: number[] = [];
  private uMove: number[] = [];
  /** position keys since the game started (h1), for repetitions */
  path: number[] = [];
  seen = new Set<number>();

  // search state
  nodes = 0;
  deadline = 0;
  maxNodes = Infinity;
  private killers = new Int32Array(256);
  private history = new Int32Array(15 * 120);

  constructor(p: Pos, history: Iterable<string> = []) {
    this.load(p);
    for (const key of history) {
      try {
        this.seen.add(keyOf(fromFen(`${key} 0 1`)));
      } catch {
        /* not a position key */
      }
    }
    this.seen.delete(this.h1); // the current position is the root
  }

  load(p: Pos) {
    this.b.fill(OFF);
    this.count.fill(0);
    this.mg = [0, 0];
    this.eg = [0, 0];
    this.phase = 0;
    this.h1 = this.h2 = 0;
    for (let i = 0; i < 64; i++) {
      const sq = toMb(i);
      this.b[sq] = EMPTY;
      const pc = p.b[i] ? CHAR[p.b[i]] : 0;
      if (pc) this.add(pc, sq);
    }
    this.side = p.turn === 'w' ? 0 : 1;
    this.castle = (p.castle.includes('K') ? 1 : 0) | (p.castle.includes('Q') ? 2 : 0) | (p.castle.includes('k') ? 4 : 0) | (p.castle.includes('q') ? 8 : 0);
    this.ep = p.ep >= 0 ? toMb(p.ep) : 0;
    this.half = p.half;
    this.h1 ^= Z1[ZC + this.castle] ^ (this.ep ? Z1[ZE + this.ep] : 0) ^ (this.side ? Z1[ZS] : 0);
    this.h2 ^= Z2[ZC + this.castle] ^ (this.ep ? Z2[ZE + this.ep] : 0) ^ (this.side ? Z2[ZS] : 0);
  }

  private add(pc: number, sq: number) {
    const c = pc >> 3 ? 1 : 0;
    this.b[sq] = pc;
    this.count[pc] += 1;
    this.mg[c] += MG[pc][sq];
    this.eg[c] += EG[pc][sq];
    this.phase += PHASE[pc & 7];
    this.h1 ^= Z1[pc * 120 + sq];
    this.h2 ^= Z2[pc * 120 + sq];
    if ((pc & 7) === KING) this.kings[c] = sq;
  }

  private remove(sq: number) {
    const pc = this.b[sq];
    const c = pc >> 3 ? 1 : 0;
    this.b[sq] = EMPTY;
    this.count[pc] -= 1;
    this.mg[c] -= MG[pc][sq];
    this.eg[c] -= EG[pc][sq];
    this.phase -= PHASE[pc & 7];
    this.h1 ^= Z1[pc * 120 + sq];
    this.h2 ^= Z2[pc * 120 + sq];
    return pc;
  }

  attacked(sq: number, by: number): boolean {
    const b = this.b;
    const col = by ? BLACK : 0;
    if (by) {
      if (b[sq - 9] === (PAWN | BLACK) || b[sq - 11] === (PAWN | BLACK)) return true;
    } else if (b[sq + 9] === PAWN || b[sq + 11] === PAWN) return true;
    for (let k = 0; k < 8; k++) if (b[sq + KN[k]] === (KNIGHT | col)) return true;
    for (let k = 0; k < 8; k++) if (b[sq + KG[k]] === (KING | col)) return true;
    for (let k = 0; k < 4; k++) {
      const d = DIAG[k];
      let t = sq + d;
      while (b[t] === EMPTY) t += d;
      const pc = b[t];
      if (pc === (BISHOP | col) || pc === (QUEEN | col)) return true;
    }
    for (let k = 0; k < 4; k++) {
      const d = ORTH[k];
      let t = sq + d;
      while (b[t] === EMPTY) t += d;
      const pc = b[t];
      if (pc === (ROOK | col) || pc === (QUEEN | col)) return true;
    }
    return false;
  }

  inCheck(side = this.side) {
    return this.attacked(this.kings[side], side ^ 1);
  }

  /** Pseudo-legal moves into `out`; returns how many. `capturesOnly` adds captures and queen promotions. */
  gen(out: Int32Array, capturesOnly: boolean): number {
    const b = this.b;
    const me = this.side;
    const col = me ? BLACK : 0;
    let n = 0;
    const enemy = (pc: number) => pc !== EMPTY && pc !== OFF && (pc & BLACK) !== col;
    for (let sq = 21; sq <= 98; sq++) {
      const pc = b[sq];
      if (pc === EMPTY || pc === OFF || (pc & BLACK) !== col) continue;
      const t = pc & 7;
      if (t === PAWN) {
        const dir = me ? 10 : -10;
        const row = Math.floor(sq / 10);
        const promoRow = me ? 8 : 3; // the row before the last
        const startRow = me ? 3 : 8;
        const one = sq + dir;
        if (b[one] === EMPTY) {
          if (row === promoRow) {
            out[n++] = mk(sq, one, QUEEN);
            if (!capturesOnly) {
              out[n++] = mk(sq, one, KNIGHT);
              out[n++] = mk(sq, one, ROOK);
              out[n++] = mk(sq, one, BISHOP);
            }
          } else if (!capturesOnly) {
            out[n++] = mk(sq, one);
            if (row === startRow && b[one + dir] === EMPTY) out[n++] = mk(sq, one + dir, 0, 4);
          }
        }
        for (let to = one - 1; to <= one + 1; to += 2) {
          if (enemy(b[to])) {
            if (row === promoRow) {
              out[n++] = mk(sq, to, QUEEN);
              if (!capturesOnly) {
                out[n++] = mk(sq, to, KNIGHT);
                out[n++] = mk(sq, to, ROOK);
                out[n++] = mk(sq, to, BISHOP);
              }
            } else out[n++] = mk(sq, to);
          } else if (to === this.ep && this.ep) out[n++] = mk(sq, to, 0, 1);
        }
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? KN : KG;
        for (let k = 0; k < 8; k++) {
          const to = sq + offs[k];
          const x = b[to];
          if (x === OFF) continue;
          if (x === EMPTY) {
            if (!capturesOnly) out[n++] = mk(sq, to);
          } else if ((x & BLACK) !== col) out[n++] = mk(sq, to);
        }
        if (t === KING && !capturesOnly) {
          const them = me ^ 1;
          if (me === 0 && sq === 95) {
            if (this.castle & 1 && b[96] === EMPTY && b[97] === EMPTY && b[98] === ROOK && !this.attacked(95, them) && !this.attacked(96, them) && !this.attacked(97, them)) out[n++] = mk(95, 97, 0, 2);
            if (this.castle & 2 && b[94] === EMPTY && b[93] === EMPTY && b[92] === EMPTY && b[91] === ROOK && !this.attacked(95, them) && !this.attacked(94, them) && !this.attacked(93, them)) out[n++] = mk(95, 93, 0, 2);
          } else if (me === 1 && sq === 25) {
            if (this.castle & 4 && b[26] === EMPTY && b[27] === EMPTY && b[28] === (ROOK | BLACK) && !this.attacked(25, them) && !this.attacked(26, them) && !this.attacked(27, them)) out[n++] = mk(25, 27, 0, 2);
            if (this.castle & 8 && b[24] === EMPTY && b[23] === EMPTY && b[22] === EMPTY && b[21] === (ROOK | BLACK) && !this.attacked(25, them) && !this.attacked(24, them) && !this.attacked(23, them)) out[n++] = mk(25, 23, 0, 2);
          }
        }
      } else {
        const dirs = t === BISHOP ? DIAG : t === ROOK ? ORTH : KG;
        for (let k = 0; k < dirs.length; k++) {
          const d = dirs[k];
          let to = sq + d;
          while (b[to] === EMPTY) {
            if (!capturesOnly) out[n++] = mk(sq, to);
            to += d;
          }
          const x = b[to];
          if (x !== OFF && (x & BLACK) !== col) out[n++] = mk(sq, to);
        }
      }
    }
    return n;
  }

  /** Make a pseudo-legal move; returns false (and takes it back) if it leaves the mover in check. */
  make(m: number): boolean {
    const from = mFrom(m), to = mTo(m), promo = mPromo(m), flag = mFlag(m);
    const me = this.side;
    this.uCastle.push(this.castle);
    this.uEp.push(this.ep);
    this.uHalf.push(this.half);
    this.uH1.push(this.h1);
    this.uH2.push(this.h2);
    this.uMove.push(m);
    this.path.push(this.h1);
    // clear castle / ep from the key
    this.h1 ^= Z1[ZC + this.castle] ^ (this.ep ? Z1[ZE + this.ep] : 0);
    this.h2 ^= Z2[ZC + this.castle] ^ (this.ep ? Z2[ZE + this.ep] : 0);
    let cap = 0;
    if (flag & 1) cap = this.remove(to + (me ? -10 : 10));
    else if (this.b[to] !== EMPTY) cap = this.remove(to);
    this.uCap.push(cap);
    const pc = this.remove(from);
    this.add(promo ? promo | (me ? BLACK : 0) : pc, to);
    if (flag & 2) {
      if (to === from + 2) this.add(this.remove(from + 3), from + 1);
      else this.add(this.remove(from - 4), from - 1);
    }
    this.castle &= CASTLE_MASK[from] & CASTLE_MASK[to];
    this.ep = flag & 4 ? from + (me ? 10 : -10) : 0;
    this.half = (pc & 7) === PAWN || cap ? 0 : this.half + 1;
    this.side ^= 1;
    this.h1 ^= Z1[ZC + this.castle] ^ (this.ep ? Z1[ZE + this.ep] : 0) ^ Z1[ZS];
    this.h2 ^= Z2[ZC + this.castle] ^ (this.ep ? Z2[ZE + this.ep] : 0) ^ Z2[ZS];
    if (this.attacked(this.kings[me], me ^ 1)) {
      this.unmake();
      return false;
    }
    return true;
  }

  unmake() {
    const m = this.uMove.pop()!;
    const from = mFrom(m), to = mTo(m), promo = mPromo(m), flag = mFlag(m);
    this.side ^= 1;
    const me = this.side;
    if (flag & 2) {
      if (to === from + 2) this.add(this.remove(from + 1), from + 3);
      else this.add(this.remove(from - 1), from - 4);
    }
    const moved = this.remove(to);
    this.add(promo ? PAWN | (me ? BLACK : 0) : moved, from);
    const cap = this.uCap.pop()!;
    if (cap) this.add(cap, flag & 1 ? to + (me ? -10 : 10) : to);
    this.castle = this.uCastle.pop()!;
    this.ep = this.uEp.pop()!;
    this.half = this.uHalf.pop()!;
    this.h1 = this.uH1.pop()!;
    this.h2 = this.uH2.pop()!;
    this.path.pop();
  }

  private makeNull() {
    this.uEp.push(this.ep);
    this.uH1.push(this.h1);
    this.uH2.push(this.h2);
    this.path.push(this.h1);
    this.h1 ^= (this.ep ? Z1[ZE + this.ep] : 0) ^ Z1[ZS];
    this.h2 ^= (this.ep ? Z2[ZE + this.ep] : 0) ^ Z2[ZS];
    this.ep = 0;
    this.side ^= 1;
  }

  private unmakeNull() {
    this.side ^= 1;
    this.ep = this.uEp.pop()!;
    this.h1 = this.uH1.pop()!;
    this.h2 = this.uH2.pop()!;
    this.path.pop();
  }

  /** Legal moves in the current position. */
  legal(): number[] {
    const buf = new Int32Array(256);
    const n = this.gen(buf, false);
    const out: number[] = [];
    for (let i = 0; i < n; i++)
      if (this.make(buf[i])) {
        this.unmake();
        out.push(buf[i]);
      }
    return out;
  }

  perft(depth: number): number {
    if (depth === 0) return 1;
    const buf = new Int32Array(256);
    const n = this.gen(buf, false);
    let total = 0;
    for (let i = 0; i < n; i++)
      if (this.make(buf[i])) {
        total += this.perft(depth - 1);
        this.unmake();
      }
    return total;
  }

  /** Repetition (in the search path or the game) or the 50-move rule. */
  private isDraw(): boolean {
    if (this.half >= 100) return true;
    const h = this.h1;
    const path = this.path;
    for (let i = path.length - 2, k = 2; i >= 0 && k <= this.half; i -= 2, k += 2) if (path[i] === h) return true;
    return this.seen.has(h);
  }

  /** Not enough material for anyone to mate (bare kings, a lone minor). */
  private deadDraw(): boolean {
    const c = this.count;
    if (c[1] || c[9] || c[4] || c[12] || c[5] || c[13]) return false;
    return c[2] + c[3] <= 1 && c[10] + c[11] <= 1;
  }

  /** Static evaluation from the side to move's point of view. */
  evaluate(): number {
    const ph = Math.min(24, this.phase);
    let mg = this.mg[0] - this.mg[1];
    let eg = this.eg[0] - this.eg[1];
    const b = this.b;
    // pawn files: lowest / highest row of each side's pawns per file (rows 0..7 from the top)
    const wMin = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9], wMax = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    const bMin = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9], bMax = [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1];
    const wCnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bCnt = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let sq = 21; sq <= 98; sq++) {
      const pc = b[sq];
      if (pc === PAWN || pc === (PAWN | BLACK)) {
        const f = sq % 10, r = Math.floor(sq / 10) - 2;
        if (pc === PAWN) {
          wCnt[f]++;
          if (r < wMin[f]) wMin[f] = r;
          if (r > wMax[f]) wMax[f] = r;
        } else {
          bCnt[f]++;
          if (r < bMin[f]) bMin[f] = r;
          if (r > bMax[f]) bMax[f] = r;
        }
      }
    }
    for (let f = 1; f <= 8; f++) {
      if (wCnt[f]) {
        if (wCnt[f] > 1) {
          mg -= 10 * (wCnt[f] - 1);
          eg -= 20 * (wCnt[f] - 1);
        }
        if (!wCnt[f - 1] && !wCnt[f + 1]) {
          mg -= 10 * wCnt[f];
          eg -= 15 * wCnt[f];
        }
        // passed: no black pawn in front (smaller rows) on this or the next files
        const r = wMin[f];
        if (bMin[f - 1] >= r && bMin[f] >= r && bMin[f + 1] >= r) {
          eg += PASSED[r];
          mg += PASSED[r] >> 2;
        }
      }
      if (bCnt[f]) {
        if (bCnt[f] > 1) {
          mg += 10 * (bCnt[f] - 1);
          eg += 20 * (bCnt[f] - 1);
        }
        if (!bCnt[f - 1] && !bCnt[f + 1]) {
          mg += 10 * bCnt[f];
          eg += 15 * bCnt[f];
        }
        const r = bMax[f];
        if (wMax[f - 1] <= r && wMax[f] <= r && wMax[f + 1] <= r) {
          eg -= PASSED[7 - r];
          mg -= PASSED[7 - r] >> 2;
        }
      }
    }
    // rooks on open / half-open files
    for (let sq = 21; sq <= 98; sq++) {
      const pc = b[sq];
      if (pc === ROOK) {
        const f = sq % 10;
        if (!wCnt[f]) mg += bCnt[f] ? 10 : 20;
      } else if (pc === (ROOK | BLACK)) {
        const f = sq % 10;
        if (!bCnt[f]) mg -= wCnt[f] ? 10 : 20;
      }
    }
    // bishop pair
    if (this.count[BISHOP] >= 2) {
      mg += 30;
      eg += 45;
    }
    if (this.count[BISHOP | BLACK] >= 2) {
      mg -= 30;
      eg -= 45;
    }
    // king shelter (middlegame): own pawns in front of a castled king
    const shelter = (ksq: number, pawn: number, dir: number) => {
      const f = ksq % 10;
      if (f >= 4 && f <= 5) return -15; // king in the centre
      let s = 0;
      for (const df of [-1, 0, 1]) {
        if (b[ksq + dir + df] === pawn) s += 12;
        else if (b[ksq + 2 * dir + df] === pawn) s += 6;
        else s -= 10;
      }
      return s;
    };
    mg += shelter(this.kings[0], PAWN, -10) - shelter(this.kings[1], PAWN | BLACK, 10);
    let score = (mg * ph + eg * (24 - ph)) / 24;
    // mop-up: a lone king (or nearly) goes to the edge, our king walks up to it
    const matW = this.eg[0], matB = this.eg[1];
    if (!this.count[PAWN | BLACK] && matW - matB > 350 && ph < 10) score += this.mopUp(this.kings[0], this.kings[1]);
    if (!this.count[PAWN] && matB - matW > 350 && ph < 10) score -= this.mopUp(this.kings[1], this.kings[0]);
    // without pawns, being only a minor piece up is not enough to win
    if (!this.count[PAWN] && score > 0 && matW - matB < 400) score /= 4;
    if (!this.count[PAWN | BLACK] && score < 0 && matB - matW < 400) score /= 4;
    score = Math.round(score);
    return (this.side ? -score : score) + 10;
  }

  private mopUp(strongK: number, weakK: number) {
    const wr = Math.floor(weakK / 10) - 2, wf = (weakK % 10) - 1;
    const sr = Math.floor(strongK / 10) - 2, sf = (strongK % 10) - 1;
    const centre = Math.max(3 - wr, wr - 4) + Math.max(3 - wf, wf - 4);
    const dist = Math.abs(wr - sr) + Math.abs(wf - sf);
    return centre * 12 + (14 - dist) * 5;
  }

  private tick() {
    if (++this.nodes >= this.maxNodes || ((this.nodes & 1023) === 0 && performance.now() > this.deadline)) throw new Abort();
  }

  private scoreMoves(moves: Int32Array, scores: Int32Array, n: number, ttMove: number, ply: number) {
    const b = this.b;
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      if (m === ttMove) {
        scores[i] = 1 << 30;
        continue;
      }
      const to = mTo(m), from = mFrom(m);
      const victim = mFlag(m) & 1 ? PAWN : b[to] & 7;
      if (victim) scores[i] = 1_000_000 + SEE_VAL[victim] * 10 - SEE_VAL[b[from] & 7] / 10;
      else if (mPromo(m) === QUEEN) scores[i] = 999_000;
      else if (m === this.killers[ply * 2]) scores[i] = 900_000;
      else if (m === this.killers[ply * 2 + 1]) scores[i] = 899_000;
      else scores[i] = this.history[b[from] * 120 + to];
    }
  }

  private pick(moves: Int32Array, scores: Int32Array, n: number, i: number) {
    let best = i;
    for (let j = i + 1; j < n; j++) if (scores[j] > scores[best]) best = j;
    if (best !== i) {
      const m = moves[i], s = scores[i];
      moves[i] = moves[best];
      scores[i] = scores[best];
      moves[best] = m;
      scores[best] = s;
    }
    return moves[i];
  }

  private quiesce(alpha: number, beta: number, ply: number): number {
    this.tick();
    if (this.deadDraw()) return 0;
    const stand = this.evaluate();
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply >= 120) return stand;
    const moves = moveBuf[Math.min(ply, 127)], scores = scoreBuf[Math.min(ply, 127)];
    const n = this.gen(moves, true);
    this.scoreMoves(moves, scores, n, 0, Math.min(ply, 127));
    let best = stand;
    for (let i = 0; i < n; i++) {
      const m = this.pick(moves, scores, n, i);
      const victim = mFlag(m) & 1 ? PAWN : this.b[mTo(m)] & 7;
      // delta pruning: even winning this piece can't lift the score to alpha
      if (!mPromo(m) && stand + SEE_VAL[victim] + 200 < alpha) continue;
      if (!this.make(m)) continue;
      const v = -this.quiesce(-beta, -alpha, ply + 1);
      this.unmake();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  private hasPieces(side: number) {
    const c = side ? BLACK : 0;
    return this.count[KNIGHT | c] + this.count[BISHOP | c] + this.count[ROOK | c] + this.count[QUEEN | c] > 0;
  }

  private negamax(depth: number, alpha: number, beta: number, ply: number, nullOk: boolean): number {
    this.tick();
    if (ply > 0 && (this.isDraw() || this.deadDraw())) return 0;
    if (ply >= 100) return this.evaluate();
    const check = this.inCheck();
    if (check) depth += 1;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    const pv = beta - alpha > 1;
    // transposition table
    const slot = this.h1 & TT_MASK;
    let ttMove = 0;
    if (ttKeys[slot] === this.h2) {
      ttMove = ttMoves[slot];
      if (!pv && ttDepths[slot] >= depth) {
        let v = ttScores[slot];
        if (v >= MATE_SOON) v -= ply;
        else if (v <= -MATE_SOON) v += ply;
        const f = ttFlags[slot];
        if (f === TT_EXACT || (f === TT_LOWER && v >= beta) || (f === TT_UPPER && v <= alpha)) return v;
      }
    }
    // null move: if passing still beats beta, this line is too good to need a real move
    if (nullOk && !pv && !check && depth >= 3 && this.hasPieces(this.side) && this.evaluate() >= beta) {
      this.makeNull();
      const v = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      this.unmakeNull();
      if (v >= beta && v < MATE_SOON) return v;
    }
    const buf = Math.min(ply, 127);
    const moves = moveBuf[buf], scores = scoreBuf[buf];
    const n = this.gen(moves, false);
    this.scoreMoves(moves, scores, n, ttMove, buf);
    const alpha0 = alpha;
    let best = -INF, bestMove = 0, legal = 0;
    for (let i = 0; i < n; i++) {
      const m = this.pick(moves, scores, n, i);
      const quiet = !(this.b[mTo(m)] & 7) && !(mFlag(m) & 1) && !mPromo(m);
      const from = mFrom(m), piece = this.b[from];
      if (!this.make(m)) continue;
      legal += 1;
      let v: number;
      if (legal === 1) v = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // late quiet moves are searched shallower first
        let r = 0;
        if (depth >= 3 && legal > 3 && quiet && !check && !this.inCheck()) r = legal > 8 ? 2 : 1;
        v = -this.negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && r) v = -this.negamax(depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && v < beta) v = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      this.unmake();
      if (v > best) {
        best = v;
        bestMove = m;
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (quiet) {
          if (this.killers[buf * 2] !== m) {
            this.killers[buf * 2 + 1] = this.killers[buf * 2];
            this.killers[buf * 2] = m;
          }
          this.history[piece * 120 + mTo(m)] += depth * depth;
        }
        break;
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    ttKeys[slot] = this.h2;
    ttMoves[slot] = bestMove;
    ttScores[slot] = best >= MATE_SOON ? best + ply : best <= -MATE_SOON ? best - ply : best;
    ttDepths[slot] = depth;
    ttFlags[slot] = best <= alpha0 ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;
    return best;
  }

  /**
   * Iterative deepening from the root. With `noise`, every root move gets a score at least down to
   * best − noise and one of those is picked at random (the 'smart' bot).
   */
  think(opts: { timeMs: number; maxDepth: number; maxNodes?: number; noise?: number; rng?: () => number }): { move: number; score: number; depth: number; nodes: number } | null {
    const root = this.legal();
    if (!root.length) return null;
    this.nodes = 0;
    this.deadline = performance.now() + opts.timeMs;
    this.maxNodes = opts.maxNodes ?? BUDGET.maxNodes ?? Infinity;
    this.killers.fill(0);
    this.history.fill(0);
    const rng = opts.rng ?? Math.random;
    // first guess: captures first
    const tmpS = new Int32Array(256), tmpM = Int32Array.from(root);
    this.scoreMoves(tmpM, tmpS, root.length, 0, 0);
    let order = root.map((m, i) => ({ m, s: tmpS[i] })).sort((a, z) => z.s - a.s).map((x) => x.m);
    let best = { move: order[0], score: 0 };
    let scored: { m: number; v: number }[] = [];
    let depthDone = 0;
    if (root.length === 1 && !opts.noise) return { move: root[0], score: 0, depth: 0, nodes: 0 };
    try {
      for (let depth = 1; depth <= opts.maxDepth; depth++) {
        const here: { m: number; v: number }[] = [];
        let alpha = -INF;
        for (const m of order) {
          this.make(m);
          const a = opts.noise && alpha > -INF ? alpha - opts.noise - 1 : alpha;
          let v: number;
          if (here.length === 0 || opts.noise) v = -this.negamax(depth - 1, -INF, -a, 1, true);
          else {
            v = -this.negamax(depth - 1, -a - 1, -a, 1, true);
            if (v > a) v = -this.negamax(depth - 1, -INF, -a, 1, true);
          }
          this.unmake();
          here.push({ m, v });
          if (v > alpha) {
            alpha = v;
            // a new best found in an unfinished iteration is still trustworthy
            if (depth > 1) best = { move: m, score: v };
          }
        }
        here.sort((x, y) => y.v - x.v);
        scored = here;
        best = { move: here[0].m, score: here[0].v };
        depthDone = depth;
        order = here.map((x) => x.m);
        if (Math.abs(best.score) >= MATE_SOON) break;
      }
    } catch (e) {
      if (!(e instanceof Abort)) throw e;
      // (an abort leaves the board mid-search: this engine is thrown away after the decision)
    }
    let move = best.move;
    if (opts.noise && scored.length > 1 && Math.abs(best.score) < MATE_SOON) {
      // (with noise the root window was lowered, so these scores are exact down to best − noise)
      const near = scored.filter((x) => x.v >= scored[0].v - opts.noise!);
      move = near[Math.floor(rng() * near.length)].m;
    }
    return { move, score: best.score, depth: depthDone, nodes: this.nodes };
  }

  toMove(m: number): Move {
    const promo = mPromo(m);
    const out: Move = { from: fromMb(mFrom(m)), to: fromMb(mTo(m)) };
    if (promo) out.promo = PROMO_CHAR[promo] as Move['promo'];
    return out;
  }
}

export type ChessLevel = 'smart' | 'expert';

/**
 * The bot's move. `reps` = the game's position keys (repKey → count) so the search avoids (or, when
 * worse, seeks) repetitions. Opening variety: the first moves pick among equally good ones.
 */
export function chessBot(pos: Pos, reps: Record<string, number>, level: ChessLevel, opts: { timeMs?: number; maxNodes?: number; rng?: () => number } = {}): Move | null {
  const e = new Engine(pos, Object.keys(reps));
  // the expert varies its first moves a little among (nearly) equal ones; the smart bot is looser
  const early = pos.full <= 4;
  const r = e.think({
    timeMs: opts.timeMs ?? BUDGET[level],
    maxDepth: level === 'expert' ? 64 : 3,
    maxNodes: opts.maxNodes,
    noise: level === 'smart' ? 40 : early ? 8 : 0,
    rng: opts.rng,
  });
  if (!r) return null;
  const m = e.toMove(r.move);
  // belt and braces: only ever return a move the referee accepts
  const legal = refLegal(pos);
  return legal.find((x) => x.from === m.from && x.to === m.to && (x.promo ?? '') === (m.promo ?? '')) ?? legal[0] ?? null;
}
