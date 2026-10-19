/**
 * Shared game-tree search for the board-game bots (connect4, xo, dama, kharbga, mancala…):
 * iterative-deepening negamax with alpha-beta, a transposition table, move ordering (TT move, killer
 * moves, the game's own ordering) and a deadline, so a decision never blocks the server for long.
 *
 * A game plugs in through `SearchGame`: make / unmake moves on its own mutable state. Games where the
 * same side may move again (an extra turn in mancala, a capture chain in kharbga) are handled: after
 * `play` the search compares `side()` before and after and only negates when the turn passed.
 */

export const WIN = 1_000_000;
/** Scores at or beyond this are wins / losses found by the search (WIN − plies to get there). */
export const WIN_SOON = WIN - 1000;

export interface SearchGame<M> {
  /** Who is to move (any id; only compared for equality). */
  side(): number;
  /** Legal moves for the side to move. Only called when `over()` is null. */
  moves(): M[];
  play(m: M): void;
  undo(): void;
  /** Score for the side to move when the game is over (use ±(WIN − ply) for a win/loss, 0 for a draw), else null. */
  over(ply: number): number | null;
  /** Static evaluation from the side to move's point of view. */
  evaluate(): number;
  /** Optional quiescence: a score for the side to move at the search horizon (e.g. resolve pending captures). */
  quiesce?(alpha: number, beta: number, ply: number, tick: () => void): number;
  /** Optional 32-bit position key (side to move included) for the transposition table. */
  hash?(): number;
  /** A small integer identifying a move (TT move, killers). Needed with `hash`. */
  moveKey?(m: M): number;
  /** Optional ordering hint: higher first (captures, threats…). */
  orderScore?(m: M): number;
}

export interface SearchOpts {
  /** Deepest iteration. */
  maxDepth: number;
  /** Time budget in ms (wall clock, performance.now). */
  timeMs: number;
  /** Hard cap on visited nodes (keeps tests deterministic-ish and protects slow machines). */
  maxNodes?: number;
  /**
   * 'smart' play: pick at random among root moves that score within `noise` of the best
   * (found with a lowered root window, so those scores are exact enough).
   */
  noise?: number;
  rng?: () => number;
}

export interface SearchResult<M> {
  move: M;
  score: number;
  depth: number;
  nodes: number;
  ms: number;
}

class Abort extends Error {}

const TT_BITS = 16;
const TT_SIZE = 1 << TT_BITS;
const EXACT = 0, LOWER = 1, UPPER = 2;

/** A fixed-size table, reused between searches of the same kind (cleared per search). */
class TT {
  keys = new Int32Array(TT_SIZE);
  depth = new Int8Array(TT_SIZE);
  flag = new Int8Array(TT_SIZE);
  score = new Float64Array(TT_SIZE);
  move = new Int32Array(TT_SIZE);
  used = new Uint8Array(TT_SIZE);
  clear() {
    this.used.fill(0);
  }
}
const tables: TT[] = [];
const takeTable = () => tables.pop() ?? new TT();

/** Mate scores are stored relative to the node, not the root. */
const toTT = (v: number, ply: number) => (v >= WIN_SOON ? v + ply : v <= -WIN_SOON ? v - ply : v);
const fromTT = (v: number, ply: number) => (v >= WIN_SOON ? v - ply : v <= -WIN_SOON ? v + ply : v);

export function search<M>(g: SearchGame<M>, opts: SearchOpts): SearchResult<M> | null {
  const t0 = performance.now();
  const deadline = t0 + opts.timeMs;
  const maxNodes = opts.maxNodes ?? BUDGET.maxNodes ?? Infinity;
  const rng = opts.rng ?? Math.random;
  const rootMoves = g.over(0) === null ? g.moves() : [];
  if (!rootMoves.length) return null;
  if (rootMoves.length === 1 && !opts.noise) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0, ms: 0 };

  const tt = g.hash && g.moveKey ? takeTable() : null;
  tt?.clear();
  const key = g.moveKey;
  const killers: number[][] = [];
  let nodes = 0;
  const tick = () => {
    if (++nodes >= maxNodes || ((nodes & 255) === 0 && performance.now() > deadline)) throw new Abort();
  };

  const ordered = (moves: M[], ttMove: number, ply: number): M[] => {
    const k = killers[ply];
    const n = moves.length;
    if (n < 2) return moves;
    const sc = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      let s = g.orderScore ? g.orderScore(m) : 0;
      if (key) {
        const mk = key(m);
        if (mk === ttMove) s += 1e9;
        else if (k && (mk === k[0] || mk === k[1])) s += 1e6;
      }
      sc[i] = s;
    }
    // insertion sort, stable: move lists are short
    for (let i = 1; i < n; i++) {
      const m = moves[i], s = sc[i];
      let j = i - 1;
      while (j >= 0 && sc[j] < s) {
        moves[j + 1] = moves[j];
        sc[j + 1] = sc[j];
        j--;
      }
      moves[j + 1] = m;
      sc[j + 1] = s;
    }
    return moves;
  };

  const negamax = (depth: number, alpha: number, beta: number, ply: number): number => {
    tick();
    const done = g.over(ply);
    if (done !== null) return done;
    if (depth <= 0) return g.quiesce ? g.quiesce(alpha, beta, ply, tick) : g.evaluate();
    const alpha0 = alpha;
    let ttMove = -1;
    let h = 0, slot = 0;
    if (tt) {
      h = g.hash!() | 0;
      slot = h & (TT_SIZE - 1);
      if (tt.used[slot] && tt.keys[slot] === h) {
        ttMove = tt.move[slot];
        if (tt.depth[slot] >= depth) {
          const v = fromTT(tt.score[slot], ply);
          const f = tt.flag[slot];
          if (f === EXACT) return v;
          if (f === LOWER && v >= beta) return v;
          if (f === UPPER && v <= alpha) return v;
        }
      }
    }
    const moves = ordered(g.moves(), ttMove, ply);
    let best = -Infinity;
    let bestKey = -1;
    for (const m of moves) {
      const s0 = g.side();
      g.play(m);
      // (an abort leaves the game mid-search: the caller throws it away)
      const v = g.side() === s0 ? negamax(depth - 1, alpha, beta, ply + 1) : -negamax(depth - 1, -beta, -alpha, ply + 1);
      g.undo();
      if (v > best) {
        best = v;
        if (key) bestKey = key(m);
      }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (key) {
          const k = (killers[ply] ??= [-1, -1]);
          const mk = key(m);
          if (k[0] !== mk) {
            k[1] = k[0];
            k[0] = mk;
          }
        }
        break;
      }
    }
    if (tt) {
      tt.keys[slot] = h;
      tt.used[slot] = 1;
      tt.depth[slot] = depth;
      tt.score[slot] = toTT(best, ply);
      tt.flag[slot] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
      tt.move[slot] = bestKey;
    }
    return best;
  };

  let order = ordered(rootMoves, -1, 0);
  let best: { m: M; v: number } = { m: order[0], v: -Infinity };
  let scores: { m: M; v: number }[] = [];
  let depthDone = 0;
  try {
    for (let depth = 1; depth <= opts.maxDepth; depth++) {
      const here: { m: M; v: number }[] = [];
      let alpha = -Infinity;
      for (const m of order) {
        const s0 = g.side();
        g.play(m);
        // with noise, keep the window low enough that the near-best moves get exact scores
        const a = opts.noise && alpha > -Infinity ? alpha - opts.noise - 1 : alpha;
        const v = g.side() === s0 ? negamax(depth - 1, a, Infinity, 1) : -negamax(depth - 1, -Infinity, -a, 1);
        g.undo();
        here.push({ m, v });
        if (v > alpha) alpha = v;
      }
      here.sort((x, y) => y.v - x.v);
      scores = here;
      best = here[0];
      depthDone = depth;
      order = here.map((x) => x.m);
      if (Math.abs(best.v) >= WIN_SOON) break; // a forced result: deeper won't change it
    }
  } catch (e) {
    if (!(e instanceof Abort)) throw e;
  }
  if (tt) tables.push(tt);
  if (!depthDone) return { move: order[0], score: 0, depth: 0, nodes, ms: performance.now() - t0 };
  let move = best.m;
  if (opts.noise && scores.length > 1 && Math.abs(best.v) < WIN_SOON) {
    const near = scores.filter((x) => x.v >= best.v - opts.noise!);
    move = near[Math.floor(rng() * near.length)].m;
  }
  return { move, score: best.v, depth: depthDone, nodes, ms: performance.now() - t0 };
}

/** 32-bit random keys for Zobrist hashing, from a fixed seed (the same on every run). */
export function zobrist(n: number, seed = 0x9e3779b9): Int32Array {
  const out = new Int32Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out[i] = s | 0;
  }
  return out;
}

/** A small seeded PRNG (mulberry32) for tests and reproducible play. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Bot time budgets (ms per decision), by level. `maxNodes` optionally caps every search by work instead
 * (tests set it, with long time budgets, so a series plays the same however busy the machine is).
 */
export const BUDGET: { smart: number; expert: number; maxNodes?: number } = { smart: 25, expert: 50 };
