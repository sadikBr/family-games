/**
 * «المربعات» — the bots. Every function works on a plain array of drawn lines (true = drawn) and
 * stays cheap: at most a few greedy simulations per line (a 6×6 grid has 84 lines and 36 boxes).
 *
 * - easy: takes any box it can close, otherwise draws a random line.
 * - medium: takes boxes, never draws a box's third side while a safe line exists, otherwise gives
 *   away the smallest chain.
 * - hard: the same, plus the chain endgame: with few safe lines left it searches them so the
 *   opponent has to open the first chain; it keeps control by declining the last two boxes of a
 *   chain (the "double-cross") when that wins more later, and it opens the chain or loop that
 *   costs least, opening two-box chains in the middle so they can't be double-crossed back.
 * - expert (the room's «خبير»): hard, plus an exact search of the safe-line phase while up to 26 safe
 *   lines are left (with a deadline) and Monte-Carlo playouts of that phase before then, each scored
 *   with the chain endgame — so it fights for the long-chain parity from the middle game on — and an
 *   exact alpha-beta solver for the chain phase itself (branching chains included).
 */
import { dotsBoxLines, dotsLineBoxes, dotsLineCount, type DotsLevel } from '../src/shared/games/dots';
import { BUDGET } from './ai/boards-search';

type Lines = boolean[];

export function boxSides(n: number, lines: Lines, b: number) {
  let k = 0;
  for (const e of dotsBoxLines(n, b)) if (lines[e]) k += 1;
  return k;
}

/** How many boxes drawing line e would close right now. */
export function closesCount(n: number, lines: Lines, e: number) {
  if (lines[e]) return 0;
  return dotsLineBoxes(n, e).filter((b) => boxSides(n, lines, b) === 3).length;
}

const undrawn = (lines: Lines) => lines.flatMap((d, e) => (d ? [] : [e]));

/** Lines that close at least one box. */
export function captureLines(n: number, lines: Lines) {
  return undrawn(lines).filter((e) => closesCount(n, lines, e) > 0);
}

/** Lines that close nothing and give no box its third side. */
export function safeLines(n: number, lines: Lines) {
  return undrawn(lines).filter((e) => dotsLineBoxes(n, e).every((b) => boxSides(n, lines, b) <= 1));
}

/** Close every box that can be closed, one after another (mutates `lines`); returns how many. */
function greedyTake(n: number, lines: Lines) {
  let taken = 0;
  for (let again = true; again; ) {
    again = false;
    for (let b = 0; b < n * n; b++) {
      if (boxSides(n, lines, b) !== 3) continue;
      const e = dotsBoxLines(n, b).find((x) => !lines[x])!;
      taken += closesCount(n, lines, e);
      lines[e] = true;
      again = true;
    }
  }
  return taken;
}

/** Boxes the opponent can take in a row after we draw e. */
function giveaway(n: number, lines: Lines, e: number) {
  const copy = lines.slice();
  copy[e] = true;
  return greedyTake(n, copy);
}

/** The open boxes grouped into chains and loops (for a position where every line gives something away). */
function components(n: number, lines: Lines) {
  const open = (b: number) => boxSides(n, lines, b) < 4;
  const seen = new Set<number>();
  const comps: { boxes: number[]; loop: boolean }[] = [];
  for (let b0 = 0; b0 < n * n; b0++) {
    if (seen.has(b0) || !open(b0)) continue;
    const boxes: number[] = [];
    const stack = [b0];
    seen.add(b0);
    let loop = true;
    while (stack.length) {
      const b = stack.pop()!;
      boxes.push(b);
      const free = dotsBoxLines(n, b).filter((e) => !lines[e]);
      if (free.length !== 2) loop = false;
      for (const e of free) {
        const other = dotsLineBoxes(n, e).find((x) => x !== b);
        if (other === undefined) loop = false; // reaches the edge of the grid
        else if (!seen.has(other)) {
          seen.add(other);
          stack.push(other);
        }
      }
    }
    comps.push({ boxes, loop: loop && boxes.length >= 4 });
  }
  return comps;
}

type Comp = { len: number; loop: boolean };

/**
 * Net boxes (mine minus theirs) for the player who must open one of these chains/loops now, both
 * sides playing the classic way: the taker either eats everything or keeps control by leaving the
 * last 2 boxes of a chain (4 of a loop).
 */
function openerValue(comps: Comp[], memo = new Map<string, number>()): number {
  if (!comps.length) return 0;
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

/** What the taker nets from an opened chain/loop, given the opener's value of what is left. */
function takerValue(c: Comp, rest: number) {
  if (c.loop) return Math.max(c.len + rest, c.len - 8 - rest);
  if (c.len <= 2) return c.len + rest;
  return Math.max(c.len + rest, c.len - 4 - rest);
}

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

/** Prefer the line that closes two boxes at once. */
function bestCapture(n: number, lines: Lines, caps: number[]) {
  const two = caps.filter((e) => closesCount(n, lines, e) === 2);
  return pick(two.length ? two : caps);
}

/** The cheapest line to hand over (fewest boxes the opponent can then take). */
function cheapest(n: number, lines: Lines, cands: number[], middleFirst: boolean) {
  let best: number[] = [];
  let bestCost = Infinity;
  for (const e of cands) {
    const cost = giveaway(n, lines, e) * 2 - (middleFirst && dotsLineBoxes(n, e).every((b) => boxSides(n, lines, b) === 2) ? 1 : 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = [e];
    } else if (cost === bestCost) best.push(e);
  }
  return pick(best);
}

/**
 * The last two boxes of a chain being eaten: a 3-sided box B whose open line e leads to a 2-sided
 * box N whose other open line f leads nowhere dangerous (the border or a box with ≤1 side).
 * Drawing f instead of e hands B+N to the opponent, who must then open the next chain.
 */
function doubleCrosses(n: number, lines: Lines) {
  const out: { e: number; f: number; boxes: number[] }[] = [];
  for (let b = 0; b < n * n; b++) {
    if (boxSides(n, lines, b) !== 3) continue;
    const e = dotsBoxLines(n, b).find((x) => !lines[x])!;
    const nb = dotsLineBoxes(n, e).find((x) => x !== b);
    if (nb === undefined || boxSides(n, lines, nb) !== 2) continue;
    const f = dotsBoxLines(n, nb).find((x) => !lines[x] && x !== e)!;
    const m = dotsLineBoxes(n, f).find((x) => x !== nb);
    if (m !== undefined && boxSides(n, lines, m) >= 2) continue;
    out.push({ e, f, boxes: [b, nb] });
  }
  return out;
}

function hardCapture(n: number, lines: Lines, caps: number[]) {
  const after = lines.slice();
  greedyTake(n, after);
  if (safeLines(n, after).length || after.every(Boolean)) return bestCapture(n, lines, caps);
  // the chain endgame: eat everything except a possible double-cross pair, then decide
  const dcs = doubleCrosses(n, lines);
  const dcBoxes = new Set(dcs.flatMap((d) => d.boxes));
  const others = caps.filter((e) => dotsLineBoxes(n, e).some((b) => boxSides(n, lines, b) === 3 && !dcBoxes.has(b)));
  if (others.length) return bestCapture(n, lines, others);
  if (dcs.length !== 1) return bestCapture(n, lines, caps);
  const { e, f } = dcs[0];
  const rest = lines.slice();
  rest[e] = rest[f] = true;
  if (rest.every(Boolean) || safeLines(n, rest).length) return e;
  const v = openerValue(components(n, rest).map((c) => ({ len: c.boxes.length, loop: c.loop })));
  // take both, then open next (2 + v)  vs  hand them over, they open next (-2 - v)
  return -2 - v > 2 + v ? f : e;
}

function hardOpen(n: number, lines: Lines) {
  const comps = components(n, lines).map((c) => ({ ...c, len: c.boxes.length }));
  let best = comps[0];
  let bestVal = -Infinity;
  const memo = new Map<string, number>();
  comps.forEach((c, i) => {
    const rest = openerValue(comps.filter((_, j) => j !== i), memo);
    const val = -takerValue(c, rest) + Math.random() * 0.01;
    if (val > bestVal) {
      bestVal = val;
      best = c;
    }
  });
  const inComp = new Set(best?.boxes ?? []);
  const cands = undrawn(lines).filter((e) => dotsLineBoxes(n, e).some((b) => inComp.has(b)));
  return cheapest(n, lines, cands.length ? cands : undrawn(lines), true);
}

/**
 * Late in the game, with few safe lines left, whoever draws the last safe line makes the other
 * open the first chain. Search the safe lines (memoised by which of them are drawn, with a node
 * budget and an optional deadline) and score each end position with the chain endgame. Null when
 * it's too big to search.
 */
function safeSearch(n: number, lines: Lines, safe: number[], budget = 20000, limit = 14, deadline = Infinity): number | null {
  if (safe.length > limit) return null;
  const memo = new Map<number, number>();
  const ls = lines.slice();
  let nodes = 0;
  const val = (mask: number): number => {
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    if (++nodes > budget || ((nodes & 1023) === 0 && performance.now() > deadline)) throw new Error('budget');
    let best = -Infinity;
    safe.forEach((e, i) => {
      if (mask & (1 << i) || !dotsLineBoxes(n, e).every((b) => boxSides(n, ls, b) <= 1)) return;
      ls[e] = true;
      best = Math.max(best, -val(mask | (1 << i)));
      ls[e] = false;
    });
    if (best === -Infinity) best = openerValue(components(n, ls).map((c) => ({ len: c.boxes.length, loop: c.loop })));
    memo.set(mask, best);
    return best;
  };
  try {
    let best: number[] = [];
    let bestVal = -Infinity;
    safe.forEach((e, i) => {
      ls[e] = true;
      const v = -val(1 << i);
      ls[e] = false;
      if (v > bestVal) {
        bestVal = v;
        best = [e];
      } else if (v === bestVal) best.push(e);
    });
    return pick(best);
  } catch {
    return null;
  }
}

/**
 * Too many safe lines to search: Monte-Carlo. For each safe line, play the rest of the safe phase out
 * at random a few times (both sides drawing safe lines until none is left) and score the chains and
 * loops that result with the chain endgame, for the side that then has to open one. Pick the line
 * with the best average — it steers the long-chain parity our way.
 */
function mcSafe(n: number, lines: Lines, safe: number[], deadline: number): number {
  const boxes = n * n;
  const sides0 = new Int8Array(boxes);
  for (let b = 0; b < boxes; b++) sides0[b] = boxSides(n, lines, b);
  const lineBoxes = lines.map((_, e) => dotsLineBoxes(n, e));
  const sum = new Float64Array(safe.length);
  const runs = new Int32Array(safe.length);
  const ls = lines.slice();
  const sides = new Int8Array(boxes);
  const isSafe = (e: number) => !ls[e] && lineBoxes[e].every((b) => sides[b] <= 1);
  const draw = (e: number) => {
    ls[e] = true;
    for (const b of lineBoxes[e]) sides[b] += 1;
  };
  for (let round = 0; round < 32 && performance.now() < deadline; round++) {
    for (let k = 0; k < safe.length; k++) {
      for (let e = 0; e < ls.length; e++) ls[e] = lines[e];
      sides.set(sides0);
      draw(safe[k]);
      let opener = 1; // 1 = the opponent must move next
      let pool = safe.filter((e) => isSafe(e));
      while (pool.length) {
        draw(pool[Math.floor(Math.random() * pool.length)]);
        opener ^= 1;
        pool = pool.filter((e) => isSafe(e));
      }
      // opener 1: the opponent opens first (good for us when their opener value is negative)
      const v = openerValue(components(n, ls).map((c) => ({ len: c.boxes.length, loop: c.loop })));
      sum[k] += opener ? -v : v;
      runs[k] += 1;
    }
  }
  let best = safe[0], bestV = -Infinity;
  for (let k = 0; k < safe.length; k++) {
    const v = runs[k] ? sum[k] / runs[k] : -Infinity;
    if (v > bestV) {
      bestV = v;
      best = safe[k];
    }
  }
  return best;
}

/**
 * Exact endgame: alpha-beta over the remaining lines (net boxes for the side to move), with a
 * transposition table keyed by the set of undrawn lines. Captures are always taken first, except the
 * one real choice of the chain endgame: declining the last two boxes of a chain (drawing the far line
 * instead), which hands them over and keeps control. Null when it doesn't finish before the deadline.
 */
function endgame(n: number, lines: Lines, deadline: number): number | null {
  const free = undrawn(lines);
  if (free.length > 52) return null;
  const bit = new Map<number, number>();
  free.forEach((e, k) => bit.set(e, 2 ** k));
  const ls = lines.slice();
  const boxes = n * n;
  const sides = new Int8Array(boxes);
  for (let b = 0; b < boxes; b++) sides[b] = boxSides(n, lines, b);
  const lineBoxes = new Map(free.map((e) => [e, dotsLineBoxes(n, e)]));
  const boxLines = Array.from({ length: boxes }, (_, b) => dotsBoxLines(n, b));
  let key = free.reduce((a, e) => a + bit.get(e)!, 0);
  const tt = new Map<number, { v: number; f: 0 | 1 | 2 }>();
  let nodes = 0;
  class Late extends Error {}
  const draw = (e: number) => {
    ls[e] = true;
    key -= bit.get(e)!;
    let k = 0;
    for (const b of lineBoxes.get(e)!) if (++sides[b] === 4) k++;
    return k;
  };
  const erase = (e: number) => {
    ls[e] = false;
    key += bit.get(e)!;
    for (const b of lineBoxes.get(e)!) sides[b]--;
  };
  const openLine = (b: number, not = -1) => boxLines[b].find((x) => !ls[x] && x !== not)!;
  const options = (): number[] => {
    const caps: number[] = [];
    const declines: number[] = [];
    for (let b = 0; b < boxes; b++) {
      if (sides[b] !== 3) continue;
      const e = openLine(b);
      const nb = lineBoxes.get(e)!.find((x) => x !== b);
      if (nb !== undefined && sides[nb] === 2) {
        const f = openLine(nb, e);
        if (!declines.includes(f)) declines.push(f);
        caps.push(e);
      } else return [e]; // a box that can be taken without any choice: take it
    }
    if (caps.length) return [...new Set(caps)].concat(declines.filter((f) => !caps.includes(f)));
    // no capture: every line, the ones giving away least first
    const out = free.filter((e) => !ls[e]);
    const cost = (e: number) => lineBoxes.get(e)!.reduce((a, b) => a + (sides[b] === 2 ? 1 : 0), 0);
    return out.sort((a, z) => cost(a) - cost(z));
  };
  const neg = (alpha: number, beta: number, left: number): number => {
    if (!left) return 0;
    if ((++nodes & 1023) === 0 && (performance.now() > deadline || nodes > (BUDGET.maxNodes ?? Infinity) * 4)) throw new Late();
    const hit = tt.get(key);
    if (hit) {
      if (hit.f === 0) return hit.v;
      if (hit.f === 1 && hit.v >= beta) return hit.v;
      if (hit.f === 2 && hit.v <= alpha) return hit.v;
    }
    const a0 = alpha;
    let best = -Infinity;
    for (const e of options()) {
      const k = draw(e);
      const v = k ? k + neg(alpha - k, beta - k, left - 1) : -neg(-beta, -alpha, left - 1);
      erase(e);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    tt.set(key, { v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 });
    return best;
  };
  try {
    let best = -1, bestV = -Infinity;
    for (const e of options()) {
      const k = draw(e);
      const v = k ? k + neg(bestV - k, Infinity, free.length - 1) : -neg(-Infinity, -bestV, free.length - 1);
      erase(e);
      if (v > bestV) {
        bestV = v;
        best = e;
      }
    }
    return best;
  } catch (e) {
    if (e instanceof Late) return null;
    throw e;
  }
}

/** The line a bot draws. `lines` must have at least one undrawn line. */
export function dotsBotLine(n: number, lines: Lines, level: DotsLevel | 'expert', timeMs = BUDGET.expert): number {
  const caps = captureLines(n, lines);
  if (level === 'easy') return caps.length ? bestCapture(n, lines, caps) : pick(undrawn(lines));
  const strong = level === 'hard' || level === 'expert';
  const safe = safeLines(n, lines);
  const t0 = performance.now();
  if (level === 'expert' && (!safe.length || undrawn(lines).length <= 22)) {
    // the chain endgame (or a nearly full grid): solve it exactly when there is time
    const e = endgame(n, lines, t0 + timeMs * (safe.length ? 0.5 : 0.8));
    if (e !== null) return e;
  }
  if (caps.length) return strong ? hardCapture(n, lines, caps) : bestCapture(n, lines, caps);
  if (safe.length) {
    if (level === 'expert') {
      // search the end of the safe phase exactly when it fits, otherwise sample it
      const deadline = t0 + timeMs;
      const nodes = Math.min(400000, (BUDGET.maxNodes ?? Infinity) * 20);
      return safeSearch(n, lines, safe, nodes, 26, deadline) ?? (safe.length > 1 ? mcSafe(n, lines, safe, deadline) : safe[0]);
    }
    return (level === 'hard' ? safeSearch(n, lines, safe) : null) ?? pick(safe);
  }
  return strong ? hardOpen(n, lines) : cheapest(n, lines, undrawn(lines), false);
}

export const emptyLines = (n: number): Lines => Array(dotsLineCount(n)).fill(false);
