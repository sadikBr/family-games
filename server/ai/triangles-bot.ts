/**
 * «المثلثات» — the bots. They work on a plain array of covered unit edges (1 = covered) and the
 * board's bands (every straight segment of 1…`band` units); a move is the set of NEW edges a band
 * covers, so two bands covering the same new edges are one move (the shortest band is played).
 *
 * With «دور إضافي عند الإكمال» the game is dots-and-boxes on triangles: a triangle with two covered
 * sides is a gift to the next player, and once no «safe» move is left (every free edge would give a
 * triangle its second side) the open triangles form chains and loops that someone has to open.
 * - easy: takes a triangle when it can, otherwise any band at random.
 * - smart: takes triangles (the band that completes most), never covers a triangle's second side while
 *   a safe band exists, otherwise opens what gives away least.
 * - expert: smart, plus the chain game of a strong dots-and-boxes player:
 *   · the safe phase is a fight over who must open the first chain: searched exactly (memoised over the
 *     safe edges left) when it is small enough, otherwise Monte-Carlo playouts of the safe phase scored
 *     with the chain endgame (so it steers the long-chain parity from the middle game on);
 *   · when it takes, it compares every completing band (including the longer ones that also cover a
 *     safe edge, which change that parity) by what the rest of the turn and the chain endgame give;
 *   · in the chain endgame it keeps control by declining the last two triangles of a chain (the
 *     «double-cross») when that wins more later, and opens the chain or loop that costs least;
 *   · near the end (and in the chain phase when it fits) an exact alpha-beta search with a
 *     transposition table decides, longer bands and declines included.
 * Without the extra turn there are no chains: expert looks two moves ahead (what it takes minus what
 * the next player can take) and searches the end exactly.
 *
 * Every decision is bounded (a deadline, ~120 ms at most), so the server never stalls.
 */
import { triGeometry, type TriGeometry, type TriSeg } from '../../src/shared/games/triangles';
import { BUDGET } from './boards-search';

export type TriLevel = 'easy' | 'smart' | 'expert';

type Cov = Uint8Array;

interface Board {
  g: TriGeometry;
  segs: TriSeg[];
  bonus: boolean;
  /** the longest band */
  max: number;
  /** per edge: the bands through it */
  edgeSegs: TriSeg[][];
}

function board(n: number, max: number, bonus: boolean): Board {
  const g = triGeometry(n);
  const segs = g.segs.filter((s) => s.edges.length <= max);
  const edgeSegs: TriSeg[][] = g.edges.map(() => []);
  for (const s of segs) for (const e of s.edges) edgeSegs[e].push(s);
  return { g, segs, bonus, max, edgeSegs };
}

interface Move {
  seg: TriSeg;
  /** the new edges it covers */
  news: number[];
}

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export function sidesOf(g: TriGeometry, cov: ArrayLike<number>): Int8Array {
  const s = new Int8Array(g.tris.length);
  g.tris.forEach((t, i) => {
    s[i] = (cov[t.edges[0]] ? 1 : 0) + (cov[t.edges[1]] ? 1 : 0) + (cov[t.edges[2]] ? 1 : 0);
  });
  return s;
}

/** Every distinct move (by the set of new edges it covers), the shortest band for each. */
export function movesOf(b: Board, cov: ArrayLike<number>): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const seg of b.segs) {
    const news = seg.edges.filter((e) => !cov[e]);
    if (!news.length) continue;
    const key = news.length === 1 ? String(news[0]) : news.slice().sort((x, y) => x - y).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ seg, news });
  }
  return out;
}

/** What covering `news` does now: triangles completed, triangles given their second side. */
function effect(g: TriGeometry, sides: Int8Array, news: number[]) {
  let k = 0, gives = 0;
  for (const e of news)
    for (const t of g.edgeTris[e]) {
      if (sides[t] === 2) k++;
      else if (sides[t] === 1) gives++;
    }
  return { k, gives };
}

function apply(g: TriGeometry, cov: Cov, sides: Int8Array, news: number[]) {
  let k = 0;
  for (const e of news) {
    cov[e] = 1;
    for (const t of g.edgeTris[e]) if (++sides[t] === 3) k++;
  }
  return k;
}

const freeEdgeOf = (g: TriGeometry, cov: Cov, t: number, not = -1) => g.tris[t].edges.find((e) => !cov[e] && e !== not) ?? -1;
const otherTri = (g: TriGeometry, e: number, t: number) => g.edgeTris[e].find((x) => x !== t);

/** Complete every triangle that can be completed, one after another (plain one-unit bands); returns how many. */
function feast(g: TriGeometry, cov: Cov, sides: Int8Array) {
  let taken = 0;
  const queue: number[] = [];
  for (let t = 0; t < sides.length; t++) if (sides[t] === 2) queue.push(t);
  while (queue.length) {
    const t = queue.pop()!;
    if (sides[t] !== 2) continue;
    const e = freeEdgeOf(g, cov, t);
    cov[e] = 1;
    for (const x of g.edgeTris[e]) {
      sides[x]++;
      if (sides[x] === 3) taken++;
      else if (sides[x] === 2) queue.push(x);
    }
  }
  return taken;
}

/**
 * Like `feast`, with the longer bands: each completing band may also cover more edges on its line, and
 * the one that hands the eater new triangles (a second side elsewhere) is preferred, so a player eating
 * a chain carries on into the next one. One-unit bands: the plain feast.
 */
function sweep(b: Board, cov: Cov, sides: Int8Array) {
  const { g } = b;
  if (b.max === 1) return feast(g, cov, sides);
  let taken = 0;
  for (;;) {
    let best: TriSeg | null = null;
    let bestScore = -Infinity;
    for (let t = 0; t < sides.length; t++) {
      if (sides[t] !== 2) continue;
      const e = freeEdgeOf(g, cov, t);
      for (const seg of b.edgeSegs[e]) {
        let k = 0, gift = 0, nw = 0;
        for (const x of seg.edges) {
          if (cov[x]) continue;
          nw++;
          for (const u of g.edgeTris[x]) {
            if (sides[u] === 2) k++;
            else if (sides[u] === 1) gift++;
          }
        }
        const score = k * 100 + gift * 10 - nw;
        if (score > bestScore) {
          bestScore = score;
          best = seg;
        }
      }
    }
    if (!best) return taken;
    taken += apply(g, cov, sides, best.edges.filter((x) => !cov[x]));
  }
}

const isSafeEdge = (g: TriGeometry, sides: Int8Array, e: number) => g.edgeTris[e].every((t) => sides[t] === 0);

function safeEdges(g: TriGeometry, cov: Cov, sides: Int8Array) {
  const out: number[] = [];
  for (let e = 0; e < cov.length; e++) if (!cov[e] && isSafeEdge(g, sides, e)) out.push(e);
  return out;
}

const allCovered = (cov: Cov) => cov.every((x) => x === 1);

/* —— the chain endgame (as in «المربعات») ————————————————————————————————————————————— */

type Comp = { len: number; loop: boolean; tris: number[] };

/** The open triangles grouped into chains and loops (joined through their free edges). */
function components(g: TriGeometry, cov: Cov, sides: Int8Array): Comp[] {
  const seen = new Uint8Array(sides.length);
  const comps: Comp[] = [];
  for (let t0 = 0; t0 < sides.length; t0++) {
    if (seen[t0] || sides[t0] === 3) continue;
    const tris: number[] = [];
    const stack = [t0];
    seen[t0] = 1;
    let loop = true;
    while (stack.length) {
      const t = stack.pop()!;
      tris.push(t);
      const free = g.tris[t].edges.filter((e) => !cov[e]);
      if (free.length !== 2) loop = false;
      for (const e of free) {
        const o = otherTri(g, e, t);
        if (o === undefined) loop = false; // the edge of the board
        else if (!seen[o]) {
          seen[o] = 1;
          stack.push(o);
        }
      }
    }
    comps.push({ len: tris.length, loop: loop && tris.length >= 3, tris });
  }
  return comps;
}

type CompShape = { len: number; loop: boolean };

/**
 * Net triangles (mine minus theirs) for the player who must open one of these chains/loops now, both
 * sides playing the classic way: the taker either eats everything or keeps control by leaving the last
 * 2 triangles of a chain (4 of a loop).
 */
function openerValue(comps: CompShape[], memo = new Map<string, number>()): number {
  if (!comps.length) return 0;
  if (comps.length > 9) {
    // many pieces (bounded work): the short chains are opened first, smallest first, each handing the
    // next opening to the other side; the rest is searched
    const sorted = comps.slice().sort((x, y) => x.len - y.len);
    const keep = sorted.slice(-9);
    let v = 0, sign = 1;
    for (const c of sorted.slice(0, -9)) {
      v -= sign * c.len;
      sign = -sign;
    }
    return v + sign * openerValue(keep, memo);
  }
  const key = comps.map((c) => `${c.loop ? 'L' : 'C'}${c.len}`).sort().join(',');
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let best = -Infinity;
  const tried = new Set<string>();
  comps.forEach((c, i) => {
    const k = `${c.loop}${c.len}`;
    if (tried.has(k)) return;
    tried.add(k);
    best = Math.max(best, -takerValue(c, openerValue(comps.filter((_, j) => j !== i), memo)));
  });
  memo.set(key, best);
  return best;
}

function takerValue(c: CompShape, rest: number) {
  if (c.loop) return Math.max(c.len + rest, c.len - 8 - rest);
  if (c.len <= 2) return c.len + rest;
  return Math.max(c.len + rest, c.len - 4 - rest);
}

const chainValue = (g: TriGeometry, cov: Cov, sides: Int8Array, memo?: Map<string, number>) => openerValue(components(g, cov, sides), memo);

/** The opening (no capture, no safe band left) that hands the next player least, after their sweep. */
function cheapestOpening(b: Board, cov: Cov, sides: Int8Array, moves = movesOf(b, cov)) {
  let best: { m: Move; h: number; c: Cov; s: Int8Array } | null = null;
  for (const m of fewestGifts(b.g, sides, moves, 10)) {
    const c = cov.slice(), s = sides.slice();
    apply(b.g, c, s, m.news);
    const h = sweep(b, c, s);
    if (!best || h < best.h || (h === best.h && m.news.length < best.m.news.length)) best = { m, h, c, s };
  }
  return best;
}

/** The `k` moves that give fewest triangles their second side (bounded work before sweeping each). */
function fewestGifts(g: TriGeometry, sides: Int8Array, moves: Move[], k: number) {
  if (moves.length <= k) return moves;
  return moves
    .map((m) => ({ m, v: effect(g, sides, m.news).gives * 4 + m.news.length + Math.random() }))
    .sort((x, y) => x.v - y.v)
    .slice(0, k)
    .map((x) => x.m);
}

/**
 * Net triangles for the player who must open now (no capture, no safe band). One-unit bands: the
 * chain endgame of dots-and-boxes. Longer bands: whoever eats sweeps on into the next chains, so play it
 * out — each opener hands over the cheapest opening, the eater sweeps and must open next.
 */
function openerEval(b: Board, cov: Cov, sides: Int8Array, deadline: number): number {
  if (b.max === 1) return chainValue(b.g, cov, sides);
  let sign = 1, total = 0;
  let c = cov, s = sides;
  for (let guard = 0; guard < 40 && !allCovered(c); guard++) {
    if (performance.now() > deadline) return total + sign * chainValue(b.g, c, s);
    const o = cheapestOpening(b, c, s);
    if (!o) break;
    total -= sign * o.h;
    sign = -sign;
    c = o.c;
    s = o.s;
  }
  return total;
}

/* —— the safe phase ————————————————————————————————————————————————————————————————— */

/**
 * The bands made only of the given safe edges (and edges already covered): the safe edges they cover as
 * indices into `safe`, and as a bit mask when there are at most 30 safe edges.
 */
function safeSegs(b: Board, cov: Cov, safe: number[]) {
  const bit = new Map(safe.map((e, i) => [e, i]));
  const out: { seg: TriSeg; mask: number; bits: number[] }[] = [];
  const seen = new Set<string>();
  for (const seg of b.segs) {
    let mask = 0;
    const bits: number[] = [];
    let ok = true;
    for (const e of seg.edges) {
      if (cov[e]) continue;
      const i = bit.get(e);
      if (i === undefined) {
        ok = false;
        break;
      }
      if (i < 30) mask |= 1 << i;
      bits.push(i);
    }
    const key = bits.join(',');
    if (!ok || !bits.length || seen.has(key)) continue;
    seen.add(key);
    out.push({ seg, mask, bits });
  }
  return out;
}

class Late extends Error {}

/**
 * Who opens the first chain: search the rest of the safe phase exactly (memoised by which safe edges
 * are covered, node budget + deadline), each end scored with the chain endgame for the player who
 * must then open. Returns the best band and its value for the player to move, or null when too big.
 */
function safeSearch(b: Board, cov: Cov, sides: Int8Array, budget: number, limit: number, deadline: number): { seg: TriSeg; v: number } | null {
  const { g } = b;
  const safe = safeEdges(g, cov, sides);
  if (!safe.length || safe.length > limit) return null;
  const segs = safeSegs(b, cov, safe);
  const memo = new Map<number, number>();
  const chainMemo = new Map<string, number>();
  const c = cov.slice();
  const s = sides.slice();
  const tris = safe.map((e) => g.edgeTris[e]);
  let nodes = 0;
  const legal = (bits: number[], mask: number) => {
    let any = false;
    for (const i of bits) {
      if (mask & (1 << i)) continue;
      any = true;
      for (const t of tris[i]) if (s[t] !== 0) return false;
    }
    return any;
  };
  const put = (bits: number[], mask: number, d: number) => {
    for (const i of bits) {
      if (mask & (1 << i)) continue;
      c[safe[i]] = d > 0 ? 1 : 0;
      for (const t of tris[i]) s[t] += d;
    }
  };
  const val = (mask: number): number => {
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    if (++nodes > budget || ((nodes & 63) === 0 && performance.now() > deadline)) throw new Late();
    let best = -Infinity;
    const tried = new Set<number>();
    for (const m of segs) {
      const add = m.mask & ~mask;
      if (!add || tried.has(add) || !legal(m.bits, mask)) continue;
      tried.add(add);
      put(m.bits, mask, 1);
      best = Math.max(best, -val(mask | m.mask));
      put(m.bits, mask, -1);
    }
    if (best === -Infinity) best = chainValue(g, c, s, chainMemo);
    memo.set(mask, best);
    return best;
  };
  try {
    let best: TriSeg[] = [];
    let bestV = -Infinity;
    const tried = new Set<number>();
    for (const m of segs) {
      if (tried.has(m.mask) || !legal(m.bits, 0)) continue;
      tried.add(m.mask);
      put(m.bits, 0, 1);
      const v = -val(m.mask);
      put(m.bits, 0, -1);
      if (v > bestV) {
        bestV = v;
        best = [m.seg];
      } else if (v === bestV) best.push(m.seg);
    }
    return best.length ? { seg: pick(best), v: bestV } : null;
  } catch (e) {
    if (e instanceof Late) return null;
    throw e;
  }
}

/**
 * Too many safe edges to search: Monte-Carlo. For each safe move, play the rest of the safe phase out at
 * random a few times and score the chains and loops that result for the side that has to open one.
 */
function mcSafe(b: Board, cov: Cov, sides: Int8Array, deadline: number): TriSeg {
  const { g } = b;
  const safe = safeEdges(g, cov, sides);
  const segs = safeSegs(b, cov, safe);
  const tris = safe.map((e) => g.edgeTris[e]);
  const sum = new Float64Array(segs.length);
  const runs = new Int32Array(segs.length);
  const c = new Uint8Array(cov.length);
  const s = new Int8Array(sides.length);
  const legal = (bits: number[]) => {
    let any = false;
    for (const i of bits) {
      if (c[safe[i]]) continue;
      any = true;
      for (const t of tris[i]) if (s[t] !== 0) return false;
    }
    return any;
  };
  const put = (bits: number[]) => {
    for (const i of bits) {
      if (c[safe[i]]) continue;
      c[safe[i]] = 1;
      for (const t of tris[i]) s[t]++;
    }
  };
  const chainMemo = new Map<string, number>();
  const pool: number[] = [];
  for (let round = 0; round < 40 && performance.now() < deadline; round++) {
    for (let k = 0; k < segs.length; k++) {
      c.set(cov);
      s.set(sides);
      put(segs[k].bits);
      let opener = 1; // 1 = the opponent moves next
      pool.length = 0;
      for (let j = 0; j < segs.length; j++) pool.push(j);
      while (pool.length) {
        const at = Math.floor(Math.random() * pool.length);
        const j = pool[at];
        if (!legal(segs[j].bits)) {
          pool[at] = pool[pool.length - 1];
          pool.pop();
          continue;
        }
        put(segs[j].bits);
        opener ^= 1;
      }
      const v = chainValue(g, c, s, chainMemo);
      sum[k] += opener ? -v : v;
      runs[k] += 1;
      if ((k & 7) === 7 && performance.now() > deadline) break;
    }
  }
  let best = 0, bestV = -Infinity;
  for (let k = 0; k < segs.length; k++) {
    const v = runs[k] ? sum[k] / runs[k] + Math.random() * 1e-6 : -Infinity;
    if (v > bestV) {
      bestV = v;
      best = k;
    }
  }
  return segs[best]?.seg ?? b.segs[0];
}

/**
 * What the player to move can expect from here (net triangles), quickly: take what can be taken, then
 * either the safe phase (searched when small, otherwise even) or the chain endgame as the opener.
 */
function evalTurn(b: Board, cov: Cov, sides: Int8Array, deadline: number): number {
  const c = cov.slice(), s = sides.slice();
  const taken = sweep(b, c, s);
  if (allCovered(c)) return taken;
  if (safeEdges(b.g, c, s).length) {
    const r = performance.now() < deadline ? safeSearch(b, c, s, 4000, 16, deadline) : null;
    return taken + (r ? r.v : 0);
  }
  return taken + openerEval(b, c, s, deadline);
}

/** The last two triangles of a chain being eaten, which can be declined (see the file comment). */
function doubleCrosses(g: TriGeometry, cov: Cov, sides: Int8Array) {
  const out: { e: number; f: number; tris: [number, number] }[] = [];
  for (let t = 0; t < sides.length; t++) {
    if (sides[t] !== 2) continue;
    const e = freeEdgeOf(g, cov, t);
    const nb = otherTri(g, e, t);
    if (nb === undefined || sides[nb] !== 1) continue;
    const f = freeEdgeOf(g, cov, nb, e);
    const m = otherTri(g, f, nb);
    if (m !== undefined && sides[m] >= 1) continue;
    out.push({ e, f, tris: [t, nb] });
  }
  return out;
}

const plain = (b: Board, e: number): TriSeg => b.segs.find((x) => x.edges.length === 1 && x.edges[0] === e)!;

function expertCapture(b: Board, cov: Cov, sides: Int8Array, moves: Move[], deadline: number): TriSeg {
  const { g } = b;
  const caps = moves.map((m) => ({ ...m, ...effect(g, sides, m.news) })).filter((m) => m.k > 0);
  const after = cov.slice(), afterS = sides.slice();
  sweep(b, after, afterS);
  const chain = !allCovered(after) && !safeEdges(g, after, afterS).length;
  const dcs = chain ? doubleCrosses(g, cov, sides) : [];
  const dcTris = new Set(dcs.flatMap((d) => d.tris));
  const completes = (m: Move) => m.news.flatMap((e) => g.edgeTris[e].filter((t) => sides[t] === 2));
  const free = dcs.length ? caps.filter((m) => m.k >= 2 || completes(m).some((t) => !dcTris.has(t))) : caps;
  type Cand = { seg: TriSeg; news: number[]; k: number };
  let cands: Cand[] = free.length ? free : caps;
  if (!free.length) {
    // only the last two triangles of chains are left to take: taking them or declining them
    for (const d of dcs) cands = cands.concat({ seg: plain(b, d.f), news: [d.f], k: 0 });
  }
  // the most completing first; never more than a handful of evaluations
  cands = cands.sort((x, y) => y.k - x.k).slice(0, 12);
  let best: Cand[] = [];
  let bestV = -Infinity;
  cands.forEach((m, i) => {
    const c = cov.slice(), s = sides.slice();
    const k = apply(g, c, s, m.news);
    // each candidate gets its share of the time left
    const now = performance.now();
    const until = Math.min(deadline, now + Math.max(0, deadline - now) / (cands.length - i));
    const v = k ? k + evalTurn(b, c, s, until) : -evalTurn(b, c, s, until);
    if (v > bestV + 1e-9) {
      bestV = v;
      best = [m];
    } else if (Math.abs(v - bestV) <= 1e-9) best.push(m);
  });
  // equal values: the band that completes most, then the shortest
  const top = Math.max(...best.map((m) => m.k));
  const pool = best.filter((m) => m.k === top);
  const short = Math.min(...pool.map((m) => m.seg.edges.length));
  return pick(pool.filter((m) => m.seg.edges.length === short)).seg;
}

/** Triangles the next player takes in a row after this move (plain bands). */
function giveaway(g: TriGeometry, cov: Cov, sides: Int8Array, news: number[]) {
  const c = cov.slice(), s = sides.slice();
  apply(g, c, s, news);
  return feast(g, c, s);
}

function cheapest(g: TriGeometry, cov: Cov, sides: Int8Array, moves: Move[], middleFirst: boolean): TriSeg {
  let best: Move[] = [];
  let bestCost = Infinity;
  for (const m of moves) {
    const middle = middleFirst && m.news.every((e) => g.edgeTris[e].length === 2 && g.edgeTris[e].every((t) => sides[t] === 1));
    const cost = giveaway(g, cov, sides, m.news) * 2 - (middle ? 1 : 0) + (m.news.length - 1) * 0.1;
    if (cost < bestCost) {
      bestCost = cost;
      best = [m];
    } else if (cost === bestCost) best.push(m);
  }
  return pick(best).seg;
}

function expertOpen(b: Board, cov: Cov, sides: Int8Array, moves: Move[], deadline: number): TriSeg {
  const { g } = b;
  if (b.max > 1) {
    // the eater sweeps on: rank the openings by what the sweep takes, then play the best few out
    const ranked = fewestGifts(g, sides, moves, 16)
      .map((m) => {
        const c = cov.slice(), s = sides.slice();
        apply(g, c, s, m.news);
        // out of time: the triangles it gives their second side stand in for the sweep
        return { m, h: performance.now() < deadline ? sweep(b, c, s) : 50 + effect(g, sides, m.news).gives, c, s };
      })
      .sort((x, y) => x.h - y.h || x.m.news.length - y.m.news.length)
      .slice(0, 8);
    let best = ranked[0];
    let bestV = -Infinity;
    for (const r of ranked) {
      const v = -r.h - (allCovered(r.c) ? 0 : openerEval(b, r.c, r.s, deadline)) + Math.random() * 0.01;
      if (v > bestV) {
        bestV = v;
        best = r;
      }
    }
    return best.m.seg;
  }
  const comps = components(g, cov, sides);
  const memo = new Map<string, number>();
  let best = comps[0];
  let bestVal = -Infinity;
  comps.forEach((c, i) => {
    const val = -takerValue(c, openerValue(comps.filter((_, j) => j !== i), memo)) + Math.random() * 0.01;
    if (val > bestVal) {
      bestVal = val;
      best = c;
    }
  });
  const inComp = new Set(best?.tris ?? []);
  const cands = moves.filter((m) => m.news.every((e) => g.edgeTris[e].every((t) => inComp.has(t) || sides[t] === 3)));
  return cheapest(g, cov, sides, cands.length ? cands : moves, true);
}

/* —— exact search ———————————————————————————————————————————————————————————————————— */

/**
 * Alpha-beta over the rest of the game (net triangles for the side to move) with a transposition table
 * keyed by the free edges left (at most 30, one bit each). With the extra turn, a triangle that can be
 * taken without any choice is taken first (with any longer band through its edge), and the one real
 * choice of the chain endgame (declining the last two triangles) is searched too. Null when it doesn't
 * finish before the deadline.
 */
export function exactSearch(b: Board, cov: Cov, deadline: number): { seg: TriSeg; v: number } | null {
  const { g, bonus } = b;
  const free: number[] = [];
  for (let e = 0; e < cov.length; e++) if (!cov[e]) free.push(e);
  if (!free.length || free.length > 30) return null;
  const bit = new Map(free.map((e, i) => [e, i]));
  const sides = sidesOf(g, cov);
  const segs: { seg: TriSeg; mask: number }[] = [];
  for (const seg of b.segs) {
    let mask = 0;
    for (const e of seg.edges) if (!cov[e]) mask |= 1 << bit.get(e)!;
    if (mask) segs.push({ seg, mask });
  }
  const bitTris = free.map((e) => g.edgeTris[e]);
  // per open triangle: its free edges as bits
  const triBits = g.tris.map((t) => t.edges.filter((e) => !cov[e]).map((e) => bit.get(e)!));
  let cur = free.reduce((a, _, i) => a | (1 << i), 0);
  const tt = new Map<number, { v: number; f: 0 | 1 | 2 }>();
  let nodes = 0;
  const maxNodes = (BUDGET.maxNodes ?? Infinity) * 6;
  const put = (m: number) => {
    let k = 0;
    for (let i = 0, x = m; x; i++, x >>>= 1) {
      if (!(x & 1)) continue;
      for (const t of bitTris[i]) if (++sides[t] === 3) k++;
    }
    cur &= ~m;
    return k;
  };
  const take = (m: number) => {
    for (let i = 0, x = m; x; i++, x >>>= 1) {
      if (!(x & 1)) continue;
      for (const t of bitTris[i]) sides[t]--;
    }
    cur |= m;
  };
  const freeBit = (t: number, not = -1) => triBits[t].find((i) => cur & (1 << i) && i !== not) ?? -1;
  const through = (i: number) => {
    const out = [1 << i];
    for (const s of segs) {
      const m = s.mask & cur;
      if (m & (1 << i) && m !== 1 << i && !out.includes(m)) out.push(m);
    }
    return out;
  };
  const gives = (m: number) => {
    let n = 0, k = 0;
    for (let i = 0, x = m; x; i++, x >>>= 1) {
      if (!(x & 1)) continue;
      for (const t of bitTris[i]) {
        if (sides[t] === 2) k++;
        else if (sides[t] === 1) n++;
      }
    }
    return k ? -10 * k : n;
  };
  const options = (): number[] => {
    if (bonus) {
      const caps: number[] = [];
      for (let t = 0; t < sides.length; t++) {
        if (sides[t] !== 2) continue;
        const i = freeBit(t);
        const e = free[i];
        const nb = g.edgeTris[e].find((x) => x !== t);
        if (nb !== undefined && sides[nb] === 1) {
          for (const m of through(i)) if (!caps.includes(m)) caps.push(m);
          const f = freeBit(nb, i);
          if (f >= 0 && !caps.includes(1 << f)) caps.push(1 << f);
        } else return through(i); // a triangle that can be taken without any choice: take it
      }
      if (caps.length) return caps;
    }
    const out: number[] = [];
    const seen = new Set<number>();
    for (const s of segs) {
      const m = s.mask & cur;
      if (m && !seen.has(m)) {
        seen.add(m);
        out.push(m);
      }
    }
    const cost = new Map(out.map((m) => [m, gives(m)]));
    return out.sort((x, y) => cost.get(x)! - cost.get(y)!);
  };
  const neg = (alpha: number, beta: number): number => {
    if (!cur) return 0;
    if ((++nodes & 127) === 0 && (performance.now() > deadline || nodes > maxNodes)) throw new Late();
    const hit = tt.get(cur);
    if (hit) {
      if (hit.f === 0) return hit.v;
      if (hit.f === 1 && hit.v >= beta) return hit.v;
      if (hit.f === 2 && hit.v <= alpha) return hit.v;
    }
    const a0 = alpha;
    let best = -Infinity;
    for (const m of options()) {
      const k = put(m);
      const v = k && bonus ? k + neg(alpha - k, beta - k) : k - neg(k - beta, k - alpha);
      take(m);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    tt.set(cur, { v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 });
    return best;
  };
  try {
    let best = 0, bestV = -Infinity;
    for (const m of options()) {
      const k = put(m);
      const v = k && bonus ? k + neg(bestV - k, Infinity) : k - neg(-Infinity, k - bestV);
      take(m);
      if (v > bestV) {
        bestV = v;
        best = m;
      }
    }
    const seg = segs.filter((s) => (s.mask & cur) === best).sort((x, y) => x.seg.edges.length - y.seg.edges.length)[0]?.seg;
    return seg ? { seg, v: bestV } : null;
  } catch (e) {
    if (e instanceof Late) return null;
    throw e;
  }
}

/* —— without the extra turn ———————————————————————————————————————————————————————————— */

/** Two moves ahead: what this band takes minus the most the next player can then take in one band. */
function twoPly(b: Board, cov: Cov, sides: Int8Array, moves: Move[], deadline: number): TriSeg {
  const { g } = b;
  let best: Move[] = [];
  let bestV = -Infinity;
  for (const m of moves) {
    const c = cov.slice(), s = sides.slice();
    const k = apply(g, c, s, m.news);
    let reply = 0;
    let gift = 0;
    if (performance.now() < deadline)
      for (const r of movesOf(b, c)) {
        const ef = effect(g, s, r.news);
        if (ef.k > reply) reply = ef.k;
      }
    else gift = effect(g, sides, m.news).gives;
    const v = k * 2 - reply * 2 - gift - (m.news.length - 1) * 0.01;
    if (v > bestV) {
      bestV = v;
      best = [m];
    } else if (v === bestV) best.push(m);
  }
  return pick(best).seg;
}

/* —— the bot ——————————————————————————————————————————————————————————————————————————— */

/** The band a bot stretches. `covered[e]` truthy = edge e covered; at least one edge must be free. */
export function trianglesBotBand(
  n: number,
  maxBand: number,
  bonus: boolean,
  covered: ArrayLike<number | boolean>,
  level: TriLevel,
  timeMs = Math.min(110, BUDGET.expert * 2.2),
): { a: number; b: number } {
  const b = board(n, maxBand, bonus);
  const { g } = b;
  const cov = Uint8Array.from(Array.from(covered, (x) => (x ? 1 : 0)));
  const sides = sidesOf(g, cov);
  const moves = movesOf(b, cov);
  const out = (s: TriSeg) => ({ a: s.a, b: s.b });
  const scored = moves.map((m) => ({ m, ...effect(g, sides, m.news) }));
  const caps = scored.filter((x) => x.k > 0);
  const most = (xs: typeof scored) => {
    const top = Math.max(...xs.map((x) => x.k));
    return pick(xs.filter((x) => x.k === top)).m.seg;
  };
  if (level === 'easy') return out(caps.length ? most(caps) : pick(moves).seg);
  const safe = scored.filter((x) => x.k === 0 && x.gives === 0).map((x) => x.m);
  if (level === 'smart') {
    if (caps.length) return out(most(caps));
    if (safe.length) return out(pick(safe).seg);
    if (!bonus) return out(most(scored.map((x) => ({ ...x, k: -x.gives }))));
    return out(cheapest(g, cov, sides, moves, false));
  }
  // expert
  const t0 = performance.now();
  const deadline = t0 + timeMs;
  let free = 0;
  for (const x of cov) if (!x) free++;
  if (free <= 18 || (!safe.length && free <= 30)) {
    const r = exactSearch(b, cov, t0 + timeMs * (safe.length ? 0.45 : 0.6));
    if (r) return out(r.seg);
  }
  if (!bonus) return out(twoPly(b, cov, sides, moves, deadline));
  if (caps.length) return out(expertCapture(b, cov, sides, moves, deadline));
  if (safe.length) {
    const nodes = Math.min(300000, (BUDGET.maxNodes ?? Infinity) * 20);
    const r = safeSearch(b, cov, sides, nodes, 24, deadline);
    if (r) return out(r.seg);
    // the opening moves (a lot of safe edges left) are all alike: any safe band
    if (safeEdges(g, cov, sides).length > 64) return out(pick(safe).seg);
    return out(safe.length > 1 ? mcSafe(b, cov, sides, deadline) : safe[0].seg);
  }
  return out(expertOpen(b, cov, sides, moves, deadline));
}
