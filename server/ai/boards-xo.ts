/**
 * «إكس أو» — the smart / expert bots. 3×3 is solved (perfect minimax in src/shared/xo.ts). Bigger boards
 * (k in a row on n×n) use negamax (./boards-search.ts) over the cells near the stones, with incremental
 * window counts: every line of k cells that only one side occupies is worth more the fuller it is, a
 * forced-move filter (win now, else block their win) and a beam of the most promising cells.
 */
import { inRow, xoBest, type Mark } from '../../src/shared/xo';
import { BUDGET, WIN, search, zobrist, type SearchGame } from './boards-search';

interface Geo {
  n: number;
  k: number;
  windows: number[][];
  byCell: number[][];
  near: number[][]; // cells within 2 steps
  z: Int32Array;
  w: number[]; // value of a window by how many stones it holds
}

const geos = new Map<number, Geo>();
function geo(n: number): Geo {
  let g = geos.get(n);
  if (g) return g;
  const k = inRow(n);
  const windows: number[][] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const re = r + (k - 1) * dr, ce = c + (k - 1) * dc;
        if (re < 0 || re >= n || ce < 0 || ce >= n) continue;
        windows.push(Array.from({ length: k }, (_, j) => (r + j * dr) * n + c + j * dc));
      }
  const byCell: number[][] = Array.from({ length: n * n }, () => []);
  windows.forEach((win, i) => win.forEach((cell) => byCell[cell].push(i)));
  const near: number[][] = Array.from({ length: n * n }, (_, i) => {
    const r = Math.floor(i / n), c = i % n;
    const out: number[] = [];
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < n && cc >= 0 && cc < n) out.push(rr * n + cc);
      }
    return out;
  });
  const w = k === 5 ? [0, 1, 12, 120, 1500, 0] : [0, 2, 25, 400, 0];
  g = { n, k, windows, byCell, near, z: zobrist(n * n * 2 + 1, 0x5a5a00 + n), w };
  geos.set(n, g);
  return g;
}

export class XoBig implements SearchGame<number> {
  g: Geo;
  b: Int8Array; // 0 empty, 1 = x, 2 = o
  cnt: [Int16Array, Int16Array];
  nearCount: Int16Array; // stones within 2 steps of each cell
  turn: 1 | 2;
  key = 0;
  hist: number[] = [];
  won = false;
  filled = 0;
  beam: number;
  /** Σ window values, from x's point of view (kept up to date by put / undo). */
  score = 0;
  /** Windows one stone short of k for x / o, with no enemy stone in them. */
  fours = [0, 0];

  constructor(board: readonly Mark[], me: 'x' | 'o', beam = 12) {
    const n = Math.round(Math.sqrt(board.length));
    this.g = geo(n);
    this.b = new Int8Array(n * n);
    this.cnt = [new Int16Array(this.g.windows.length), new Int16Array(this.g.windows.length)];
    this.nearCount = new Int16Array(n * n);
    this.turn = me === 'x' ? 1 : 2;
    this.beam = beam;
    board.forEach((m, i) => m && this.put(i, m === 'x' ? 1 : 2, 1));
    if (this.turn === 2) this.key ^= this.g.z[n * n * 2];
  }

  /** Window value from x's side, and whether it is a "four" for x / o. */
  private wv(x: number) {
    const a = this.cnt[0][x], b = this.cnt[1][x];
    return a && b ? 0 : a ? this.g.w[a] : b ? -this.g.w[b] : 0;
  }

  private fourOf(x: number) {
    const a = this.cnt[0][x], b = this.cnt[1][x], k1 = this.g.k - 1;
    return a === k1 && !b ? 0 : b === k1 && !a ? 1 : -1;
  }

  /** Add (d = 1) or remove (d = −1) a stone of p on cell i. */
  private put(i: number, p: 1 | 2, d: 1 | -1) {
    this.b[i] = d > 0 ? p : 0;
    this.filled += d;
    this.key ^= this.g.z[i * 2 + p - 1];
    const cnt = this.cnt[p - 1];
    const k = this.g.k;
    for (const x of this.g.byCell[i]) {
      const f0 = this.fourOf(x);
      this.score -= this.wv(x);
      cnt[x] += d;
      if (cnt[x] === k) this.won = true;
      this.score += this.wv(x);
      const f1 = this.fourOf(x);
      if (f0 !== f1) {
        if (f0 >= 0) this.fours[f0] -= 1;
        if (f1 >= 0) this.fours[f1] += 1;
      }
    }
    for (const j of this.g.near[i]) this.nearCount[j] += d;
  }

  side() {
    return this.turn;
  }

  /** A cell where `p` completes k in a row (−1: none). */
  winningCell(p: 1 | 2): number {
    if (!this.fours[p - 1]) return -1;
    const cnt = this.cnt[p - 1], other = this.cnt[2 - p];
    const { windows, k } = this.g;
    for (let w = 0; w < windows.length; w++) {
      if (cnt[w] !== k - 1 || other[w]) continue;
      for (const i of windows[w]) if (!this.b[i]) return i;
    }
    return -1;
  }

  /** How much a stone on cell i does for the side to move (own windows grown) and against the other (theirs spoiled). */
  cellValue(i: number) {
    const { byCell, w } = this.g;
    const me = this.cnt[this.turn - 1], them = this.cnt[2 - this.turn];
    let v = 0;
    for (const x of byCell[i]) {
      if (!them[x]) v += w[me[x] + 1] - w[me[x]];
      if (!me[x]) v += (w[them[x] + 1] - w[them[x]]) * 0.9;
    }
    return v;
  }

  moves(): number[] {
    const me = this.turn, them: 1 | 2 = me === 1 ? 2 : 1;
    const win = this.winningCell(me);
    if (win >= 0) return [win];
    const block = this.winningCell(them);
    if (block >= 0) return [block]; // two of them: lost anyway, block one
    const n = this.g.n;
    if (!this.filled) return [Math.floor(n / 2) * n + Math.floor(n / 2)];
    const cells: number[] = [];
    const vals: number[] = [];
    for (let i = 0; i < n * n; i++) {
      if (this.b[i] || !this.nearCount[i]) continue;
      const v = this.cellValue(i);
      // keep the best `beam` cells, sorted (insertion)
      let j = cells.length;
      if (j >= this.beam && v <= vals[j - 1]) continue;
      if (j >= this.beam) j -= 1;
      while (j > 0 && vals[j - 1] < v) {
        cells[j] = cells[j - 1];
        vals[j] = vals[j - 1];
        j--;
      }
      cells[j] = i;
      vals[j] = v;
    }
    return cells;
  }

  play(i: number) {
    this.put(i, this.turn, 1);
    this.hist.push(i);
    this.turn = this.turn === 1 ? 2 : 1;
    this.key ^= this.g.z[this.g.n * this.g.n * 2];
  }

  undo() {
    const i = this.hist.pop()!;
    const p = this.b[i] as 1 | 2;
    this.put(i, p, -1);
    this.key ^= this.g.z[this.g.n * this.g.n * 2];
    this.won = false;
    this.turn = p;
  }

  over(ply: number) {
    if (this.won) return -(WIN - ply);
    if (this.filled === this.b.length) return 0;
    return null;
  }

  evaluate() {
    const w4 = this.g.w[this.g.k - 1];
    const me = this.turn - 1;
    // the side to move cashes a four next move; two fours of theirs can't both be blocked
    if (this.fours[me]) return w4 * 20;
    let v = me === 0 ? this.score : -this.score;
    if (this.fours[1 - me] >= 2) v -= w4 * 6;
    return v;
  }

  hash() {
    return this.key;
  }

  moveKey(i: number) {
    return i;
  }
}

export type XoLevel = 'smart' | 'expert';

/** The cell the bot marks. 3×3: perfect play (smart slips now and then). */
export function xoBot(board: readonly Mark[], me: 'x' | 'o', level: XoLevel, opts: { timeMs?: number; maxNodes?: number; rng?: () => number } = {}): number {
  const rng = opts.rng ?? Math.random;
  const n = Math.round(Math.sqrt(board.length));
  if (n === 3) {
    if (level === 'smart' && rng() < 0.2) {
      const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
      return free[Math.floor(rng() * free.length)];
    }
    return xoBest(board as Mark[], me, 2);
  }
  const g = new XoBig(board, me, level === 'expert' ? 12 : 8);
  const r = search(g, {
    maxDepth: level === 'expert' ? 30 : 2,
    timeMs: opts.timeMs ?? BUDGET[level],
    maxNodes: opts.maxNodes,
    noise: level === 'smart' ? 30 : 0,
    rng,
  });
  if (r) return r.move;
  return board.findIndex((v) => !v);
}
