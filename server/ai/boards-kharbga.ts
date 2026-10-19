/**
 * «الخربقة» — the smart / expert bots.
 * Moving: negamax (./boards-search.ts) that follows the server's turn rules exactly — a capture chain
 * keeps the same piece moving, a blocked side passes, 80 quiet moves end the game on piece count — with
 * a quiescence over captures and an evaluation of material, pieces left hanging (an enemy piece next to
 * them with an empty square behind), capture threats and mobility.
 * Setting: a placement heuristic around the centre (الملحة), where the first captures happen: the
 * attacker wants pieces next to it and two squares away (to enter with a capture), the defender covers
 * those squares; elsewhere pieces go in solid pairs and lines that can't be sandwiched.
 */
import { CENTER, N, capturesAt, movesFor, other, type KMove, type Side } from '../../src/shared/kharbga';
import { BUDGET, WIN, search, zobrist, type SearchGame } from './boards-search';

const QUIET_LIMIT = 80;
const CELLS = N * N;
const DIRS = [-N, N, -1, 1];
const step = (i: number, d: number) => {
  const j = i + d;
  if (j < 0 || j >= CELLS) return -1;
  if ((d === -1 || d === 1) && Math.floor(j / N) !== Math.floor(i / N)) return -1;
  return j;
};
const NB: number[][] = Array.from({ length: CELLS }, (_, i) => DIRS.map((d) => step(i, d)));
const Z = zobrist(CELLS * 2 + 2 + CELLS + 1, 0x6b6b);

interface Frame {
  b: number[];
  turn: Side;
  chain: number | null;
  first: boolean;
  quiet: number;
  /** 0 = still playing, 1 / 2 = that side won, 3 = draw */
  end: 0 | 1 | 2 | 3;
  moves: KMove[] | null;
}

const count = (b: number[], s: Side) => {
  let k = 0;
  for (let i = 0; i < CELLS; i++) if (b[i] === s) k++;
  return k;
};

export class Kharbga implements SearchGame<KMove> {
  st: Frame[];

  constructor(board: number[], turn: Side, chainFrom: number | null, firstMove: boolean, quiet = 0) {
    this.st = [{ b: board.slice(), turn, chain: chainFrom, first: firstMove, quiet, end: 0, moves: null }];
  }

  get f() {
    return this.st[this.st.length - 1];
  }

  side() {
    return this.f.turn;
  }

  moves(): KMove[] {
    const f = this.f;
    return (f.moves ??= movesFor(f.b, f.turn, f.chain, f.first));
  }

  /** The server's act() + passTurn(), on a copy. */
  play(m: KMove) {
    const f = this.f;
    const side = f.turn;
    const b = f.b.slice();
    b[m.from] = 0;
    b[m.to] = side;
    const cap = capturesAt(b, m.to, side);
    for (const c of cap) b[c] = 0;
    const nf: Frame = { b, turn: side, chain: null, first: false, quiet: f.quiet, end: 0, moves: null };
    const finish = () => {
      const a = count(b, 1), d = count(b, 2);
      nf.end = a === d ? 3 : a > d ? 1 : 2;
    };
    if (cap.length) {
      nf.quiet = 0;
      if (!count(b, other(side))) nf.end = side;
      else {
        const more = movesFor(b, side, m.to);
        if (more.length) {
          nf.chain = m.to;
          nf.moves = more;
        }
      }
    } else {
      nf.quiet += 1;
      if (nf.quiet >= QUIET_LIMIT) finish();
    }
    if (!nf.end && nf.chain === null) {
      const next = other(side);
      const theirs = movesFor(b, next);
      if (theirs.length) {
        nf.turn = next;
        nf.moves = theirs;
      } else if (!movesFor(b, side).length) finish();
      // else: they are blocked, the same side plays again
    }
    this.st.push(nf);
  }

  undo() {
    this.st.pop();
  }

  over(ply: number) {
    const f = this.f;
    if (!f.end) return this.moves().length ? null : 0;
    if (f.end === 3) return 0;
    return f.end === f.turn ? WIN - ply : -(WIN - ply);
  }

  /** Captures (and forced chain moves) until quiet; the side to move may also stand pat outside a chain. */
  quiesce(alpha: number, beta: number, ply: number, tick: () => void): number {
    tick();
    const over = this.over(ply);
    if (over !== null) return over;
    const f = this.f;
    const forced = f.chain !== null;
    let best = -Infinity;
    if (!forced) {
      best = this.evaluate();
      if (best >= beta || ply > 30) return best;
      if (best > alpha) alpha = best;
    }
    for (const m of this.moves()) {
      if (!forced && !this.captures(m)) continue;
      const s0 = f.turn;
      this.play(m);
      const v = this.side() === s0 ? this.quiesce(alpha, beta, ply + 1, tick) : -this.quiesce(-beta, -alpha, ply + 1, tick);
      this.undo();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best === -Infinity ? this.evaluate() : best;
  }

  /** How many pieces this move takes right away. */
  captures(m: KMove) {
    const f = this.f;
    const side = f.turn;
    const b = f.b;
    let k = 0;
    for (const d of DIRS) {
      const n1 = step(m.to, d);
      if (n1 < 0 || b[n1] !== other(side)) continue;
      const n2 = step(n1, d);
      if (n2 >= 0 && n2 !== m.from && b[n2] === side) k++;
    }
    return k;
  }

  /**
   * Material, then pieces that the other side could take next (an enemy piece beside them and an empty
   * square on the far side that an enemy can step into), and a little mobility.
   */
  evaluate(): number {
    const f = this.f;
    const b = f.b;
    const me = f.turn, them = other(me);
    let mat = 0, hangMe = 0, hangThem = 0, mobMe = 0, mobThem = 0;
    for (let i = 0; i < CELLS; i++) {
      const v = b[i];
      if (!v) {
        // an empty square: who can step in, and what would it take?
        for (const s of [1, 2] as const) {
          let canEnter = false;
          for (const j of NB[i]) if (j >= 0 && b[j] === s) canEnter = true;
          if (!canEnter) continue;
          if (s === me) mobMe++;
          else mobThem++;
          for (let k = 0; k < 4; k++) {
            const n1 = NB[i][k];
            if (n1 < 0 || b[n1] !== other(s)) continue;
            const n2 = NB[n1][k];
            if (n2 >= 0 && b[n2] === s) {
              // s can capture n1 by moving into i (if the piece entering isn't the one at n2 itself)
              let entrant = false;
              for (const j of NB[i]) if (j >= 0 && j !== n1 && b[j] === s) entrant = true;
              if (entrant) {
                if (s === me) hangThem++;
                else hangMe++;
              }
            }
          }
        }
        continue;
      }
      mat += v === me ? 1 : -1;
    }
    // the side to move cashes one threat; the other side's threats are only a danger
    return mat * 100 + (hangThem ? 70 + 10 * Math.min(hangThem, 4) : 0) - hangMe * 25 + (mobMe - mobThem) * 2;
  }

  hash() {
    const f = this.f;
    let h = f.turn === 1 ? 0 : Z[CELLS * 2];
    for (let i = 0; i < CELLS; i++) if (f.b[i]) h ^= Z[i * 2 + f.b[i] - 1];
    if (f.chain !== null) h ^= Z[CELLS * 2 + 2 + f.chain];
    if (f.first) h ^= Z[CELLS * 2 + 1];
    return h;
  }

  moveKey(m: KMove) {
    return m.from * 64 + m.to;
  }

  orderScore(m: KMove) {
    return this.captures(m) * 100;
  }
}

export type KharbgaLevel = 'smart' | 'expert';

export function kharbgaBot(board: number[], side: Side, chainFrom: number | null, firstMove: boolean, level: KharbgaLevel, o: { quiet?: number; timeMs?: number; maxNodes?: number; rng?: () => number } = {}): KMove | null {
  const g = new Kharbga(board, side, chainFrom, firstMove, o.quiet ?? 0);
  if (!g.moves().length) return null;
  const r = search(g, {
    maxDepth: level === 'expert' ? 40 : 2,
    timeMs: o.timeMs ?? BUDGET[level],
    maxNodes: o.maxNodes,
    noise: level === 'smart' ? 40 : 0,
    rng: o.rng,
  });
  return r ? r.move : g.moves()[0];
}

/* ---------------- setting the pieces ---------------- */

const RING1 = [CENTER - N, CENTER + N, CENTER - 1, CENTER + 1]; // next to the centre
const RING2 = [CENTER - 2 * N, CENTER + 2 * N, CENTER - 2, CENTER + 2]; // two squares away, in line
const DIAG1 = [CENTER - N - 1, CENTER - N + 1, CENTER + N - 1, CENTER + N + 1];

/** Where to put the next piece while setting up. */
export function kharbgaPlace(board: number[], side: Side, level: KharbgaLevel, rng: () => number = Math.random): number {
  const them = other(side);
  let best = -1, bestV = -Infinity;
  for (let i = 0; i < CELLS; i++) {
    if (board[i] !== 0 || i === CENTER) continue;
    let v = 0;
    // around the centre, where the game opens
    const r1 = RING1.indexOf(i), r2 = RING2.indexOf(i);
    if (r1 >= 0) {
      v += side === 1 ? 9 : 6;
      // a piece next to the centre with an enemy two away behind it can be taken by an entry
      const behind = RING2[r1];
      if (board[behind] === them) v -= side === 2 ? 6 : 2;
      if (board[behind] === side) v += 4;
    } else if (r2 >= 0) {
      v += side === 1 ? 7 : 8;
      const front = RING1[r2];
      if (board[front] === them) v += side === 1 ? 6 : 2; // an entry next to it would capture
      if (board[front] === side) v += side === 2 ? 5 : 2; // covers our piece in front
    } else if (DIAG1.includes(i)) v += 4;
    // solid shapes: own neighbours protect an axis from being sandwiched
    let own = 0, foe = 0;
    for (let k = 0; k < 4; k++) {
      const j = NB[i][k];
      if (j < 0) {
        own += 0.5; // the edge also protects that side
        continue;
      }
      if (board[j] === side) own++;
      else if (board[j] === them) foe++;
    }
    v += own * 2.5 - foe * 0.8;
    // don't fill a hole between two enemy pieces only to be stuck there... but it's safe: mild bonus
    for (const [a, z] of [[0, 1], [2, 3]]) {
      const ja = NB[i][a], jz = NB[i][z];
      if (ja >= 0 && jz >= 0 && board[ja] === them && board[jz] === them) v += 1;
      // an enemy piece next to ours with our piece beyond: it is pinned in a sandwich line
      if (ja >= 0 && board[ja] === them && NB[ja][a] >= 0 && board[NB[ja][a]] === side) v += 1.5;
      if (jz >= 0 && board[jz] === them && NB[jz][z] >= 0 && board[NB[jz][z]] === side) v += 1.5;
    }
    v += rng() * (level === 'expert' ? 1.5 : 4);
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  }
  return best;
}
