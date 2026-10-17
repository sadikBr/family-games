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
 */
import { dotsBoxLines, dotsLineBoxes, dotsLineCount, type DotsLevel } from '../src/shared/games/dots';

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
 * budget) and score each end position with the chain endgame. Null when it's too big to search.
 */
function safeSearch(n: number, lines: Lines, safe: number[], budget = 20000): number | null {
  if (safe.length > 14) return null;
  const memo = new Map<number, number>();
  const ls = lines.slice();
  let nodes = 0;
  const val = (mask: number): number => {
    const hit = memo.get(mask);
    if (hit !== undefined) return hit;
    if (++nodes > budget) throw new Error('budget');
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

/** The line a bot draws. `lines` must have at least one undrawn line. */
export function dotsBotLine(n: number, lines: Lines, level: DotsLevel): number {
  const caps = captureLines(n, lines);
  if (level === 'easy') return caps.length ? bestCapture(n, lines, caps) : pick(undrawn(lines));
  if (caps.length) return level === 'hard' ? hardCapture(n, lines, caps) : bestCapture(n, lines, caps);
  const safe = safeLines(n, lines);
  if (safe.length) return (level === 'hard' ? safeSearch(n, lines, safe) : null) ?? pick(safe);
  return level === 'hard' ? hardOpen(n, lines) : cheapest(n, lines, undrawn(lines), false);
}

export const emptyLines = (n: number): Lines => Array(dotsLineCount(n)).fill(false);
