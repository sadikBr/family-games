/**
 * «الضامة» — the smart / expert bots: negamax (./boards-search.ts) over the game's own move generator
 * (compulsory and chained captures, the maximum-capture rule, flying kings…), with a capture-resolving
 * quiescence (captures are compulsory, so a position with a capture pending is never scored as is),
 * Zobrist keys for the transposition table and an evaluation of material (kings worth far more with
 * flying kings), advancement, the back row, the centre, runaway men and — when ahead — kings closing in.
 */
import { applyMove, legalMoves, type DamaOpts, type Move } from '../games/dama';
import { BUDGET, WIN, search, zobrist, type SearchGame } from './boards-search';

const Z = zobrist(64 * 4 + 1, 0xda3a);
const zIdx = (v: number) => (v === 1 ? 0 : v === 2 ? 1 : v === -1 ? 2 : 3);
const CENTRE = new Set([27, 28, 35, 36, 18, 21, 42, 45, 26, 29, 34, 37]);

export class Dama implements SearchGame<Move> {
  boards: number[][];
  sides: (1 | -1)[];
  quiets: number[];
  cache: (Move[] | null)[] = [];
  opts: DamaOpts;
  king: number;

  constructor(board: number[], side: 1 | -1, opts: DamaOpts, quiet = 0) {
    this.boards = [board.slice()];
    this.sides = [side];
    this.quiets = [quiet];
    this.opts = opts;
    this.king = opts.flyingKings ? 320 : 170;
  }

  get b() {
    return this.boards[this.boards.length - 1];
  }

  side() {
    return this.sides[this.sides.length - 1];
  }

  moves(): Move[] {
    const d = this.boards.length - 1;
    let m = this.cache[d];
    if (!m) m = this.cache[d] = legalMoves(this.b, this.side(), this.opts);
    return m;
  }

  play(m: Move) {
    const b = this.b;
    const wasMan = Math.abs(b[m.from]) === 1;
    this.boards.push(applyMove(b, m));
    this.sides.push(this.side() === 1 ? -1 : 1);
    this.quiets.push(m.captures.length || wasMan ? 0 : this.quiets[this.quiets.length - 1] + 1);
    this.cache[this.boards.length - 1] = null;
  }

  undo() {
    this.boards.pop();
    this.sides.pop();
    this.quiets.pop();
  }

  over(ply: number) {
    if (!this.moves().length) return -(WIN - ply);
    if (this.quiets[this.quiets.length - 1] >= 50) return 0;
    return null;
  }

  /** Captures are compulsory: keep taking until the position is quiet, then score it. */
  quiesce(alpha: number, beta: number, ply: number, tick: () => void): number {
    tick();
    const over = this.over(ply);
    if (over !== null) return over;
    const moves = this.moves();
    if (!moves[0].captures.length || ply > 40) return this.evaluate();
    let best = -Infinity;
    for (const m of moves) {
      this.play(m);
      const v = -this.quiesce(-beta, -alpha, ply + 1, tick);
      this.undo();
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  evaluate(): number {
    const b = this.b;
    let s = 0;
    let wMen = 0, bMen = 0, wKings = 0, bKings = 0;
    const wK: number[] = [], bK: number[] = [], wAll: number[] = [], bAll: number[] = [];
    for (let i = 0; i < 64; i++) {
      const v = b[i];
      if (!v) continue;
      const r = i >> 3;
      if (v === 1) {
        wMen++;
        const adv = 7 - r; // rows climbed
        s += 100 + adv * adv * 1.2;
        if (r === 7) s += 8; // guards the back row
        if (CENTRE.has(i)) s += 6;
        wAll.push(i);
      } else if (v === -1) {
        bMen++;
        s -= 100 + r * r * 1.2;
        if (r === 0) s -= 8;
        if (CENTRE.has(i)) s -= 6;
        bAll.push(i);
      } else if (v === 2) {
        wKings++;
        s += this.king;
        wK.push(i);
        wAll.push(i);
      } else {
        bKings++;
        s -= this.king;
        bK.push(i);
        bAll.push(i);
      }
    }
    // when ahead in a thinned-out position, trade down and bring the kings to the enemy
    const wMat = wMen * 100 + wKings * this.king, bMat = bMen * 100 + bKings * this.king;
    const total = wMen + bMen + wKings + bKings;
    if (total <= 10 && wMat !== bMat) {
      const [kings, targets, sign] = wMat > bMat ? [wK, bAll, 1] : [bK, wAll, -1];
      let close = 0;
      for (const k of kings) {
        let d = 99;
        for (const t of targets) d = Math.min(d, Math.max(Math.abs((k >> 3) - (t >> 3)), Math.abs((k & 7) - (t & 7))));
        close += 8 - d;
      }
      s += sign * (close * 3 + (24 - total) * 4);
    }
    return this.side() === 1 ? s : -s;
  }

  hash() {
    const b = this.b;
    let h = this.side() === 1 ? 0 : Z[256];
    for (let i = 0; i < 64; i++) if (b[i]) h ^= Z[i * 4 + zIdx(b[i])];
    return h;
  }

  moveKey(m: Move) {
    return m.from | (m.path[m.path.length - 1] << 6) | (m.captures.length << 12) | (m.path.length << 17);
  }

  orderScore(m: Move) {
    const b = this.b;
    const to = m.path[m.path.length - 1];
    const v = b[m.from];
    const crown = Math.abs(v) === 1 && ((v > 0 && to >> 3 === 0) || (v < 0 && to >> 3 === 7)) ? 50 : 0;
    let kings = 0;
    for (const c of m.captures) if (Math.abs(b[c]) === 2) kings++;
    return m.captures.length * 100 + kings * 60 + crown;
  }
}

export type DamaLevel = 'smart' | 'expert';

export function damaBot(board: number[], side: 1 | -1, opts: DamaOpts, level: DamaLevel, o: { quiet?: number; timeMs?: number; maxNodes?: number; rng?: () => number } = {}): Move | null {
  const g = new Dama(board, side, opts, o.quiet ?? 0);
  const r = search(g, {
    maxDepth: level === 'expert' ? 40 : 3,
    timeMs: o.timeMs ?? BUDGET[level],
    maxNodes: o.maxNodes,
    noise: level === 'smart' ? 30 : 0,
    rng: o.rng,
  });
  return r ? r.move : null;
}
