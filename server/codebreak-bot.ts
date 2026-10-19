/**
 * «فك الشيفرة»: every possible code, and how a bot picks its next guess. A bot only sees its own rows
 * (its guesses and their black / white marks), exactly like a person on their phone.
 *
 * easy   — the old «متوسط» bot: a random code that fits the clues, forgetting one clue now and then.
 * smart  — the old «صعب» bot: a random fitting code, the one that splits the rest best once few are left.
 * expert — information-maximizing play: the opening guess is the best one for the settings (worked out
 *          once by entropy over every code), then every guess is the one whose answer is expected to
 *          tell the most (Shannon entropy of the black/white split over every code still possible),
 *          searched among the possible codes and a sample of the others within a time budget; a
 *          possible code wins ties (it may be the answer).
 */
import { codebreakMarks, type CodebreakRow } from '../src/shared/games/codebreak';
import type { BotLevel } from '../src/shared/protocol';

const cache = new Map<string, number[][]>();

/** All codes of `pegs` pegs from `colors` colours (with or without repeats). At most 8⁵ = 32 768. */
export function allCodes(pegs: number, colors: number, repeats: boolean): number[][] {
  const key = `${pegs}|${colors}|${repeats}`;
  let out = cache.get(key);
  if (out) return out;
  out = [];
  const cur: number[] = [];
  const rec = () => {
    if (cur.length === pegs) {
      out!.push([...cur]);
      return;
    }
    for (let c = 0; c < colors; c++) {
      if (!repeats && cur.includes(c)) continue;
      cur.push(c);
      rec();
      cur.pop();
    }
  };
  rec();
  cache.set(key, out);
  return out;
}

export function randomCode(pegs: number, colors: number, repeats: boolean, rand: () => number = Math.random): number[] {
  const codes = allCodes(pegs, colors, repeats);
  return [...codes[Math.floor(rand() * codes.length)]];
}

const fits = (code: readonly number[], rows: readonly CodebreakRow[]) =>
  rows.every((r) => {
    const m = codebreakMarks(r.guess, code);
    return m.black === r.black && m.white === r.white;
  });

/** The codes that agree with every clue. */
export function consistent(codes: readonly number[][], rows: readonly CodebreakRow[]): number[][] {
  return codes.filter((c) => fits(c, rows));
}

/** Among `cands`, the guess whose worst answer leaves the fewest codes (only for small sets). */
function minimax(cands: number[][]): number[] {
  let best = cands[0];
  let bestWorst = Infinity;
  for (const g of cands) {
    const parts = new Map<number, number>();
    let worst = 0;
    for (const c of cands) {
      const m = codebreakMarks(g, c);
      const k = m.black * 10 + m.white;
      const n = (parts.get(k) ?? 0) + 1;
      parts.set(k, n);
      if (n > worst) worst = n;
      if (worst >= bestWorst) break;
    }
    if (worst < bestWorst) {
      bestWorst = worst;
      best = g;
    }
  }
  return best;
}

const pick = <T>(arr: readonly T[], rand: () => number) => arr[Math.floor(rand() * arr.length)];

/* ---------------- expert: packed codes and entropy ---------------- */

interface Packed {
  pegs: number;
  colors: number;
  n: number;
  /** n × pegs colour indexes */
  digits: Uint8Array;
  /** n × colors colour counts */
  counts: Uint8Array;
  /** "c0,c1,…" → index */
  index: Map<string, number>;
}

const packedCache = new Map<string, Packed>();

function packed(pegs: number, colors: number, repeats: boolean): Packed {
  const key = `${pegs}|${colors}|${repeats}`;
  let p = packedCache.get(key);
  if (p) return p;
  const codes = allCodes(pegs, colors, repeats);
  const n = codes.length;
  const digits = new Uint8Array(n * pegs);
  const counts = new Uint8Array(n * colors);
  codes.forEach((c, i) => {
    for (let k = 0; k < pegs; k++) {
      digits[i * pegs + k] = c[k];
      counts[i * colors + c[k]]++;
    }
  });
  p = { pegs, colors, n, digits, counts, index: new Map(codes.map((c, i) => [c.join(','), i])) };
  packedCache.set(key, p);
  return p;
}

/** black × 8 + white, for the codes at indexes `g` and `c`. */
function fb(P: Packed, g: number, c: number): number {
  const { pegs, colors, digits, counts } = P;
  let black = 0;
  for (let k = 0; k < pegs; k++) if (digits[g * pegs + k] === digits[c * pegs + k]) black++;
  let common = 0;
  for (let k = 0; k < colors; k++) {
    const a = counts[g * colors + k], b = counts[c * colors + k];
    common += a < b ? a : b;
  }
  return black * 8 + common - black;
}

const indexOf = (P: Packed, code: readonly number[]) => P.index.get(code.join(',')) ?? -1;

const buckets = new Int32Array(64);

/** Entropy (bits) of the split of `cands` by guess `g`; `isCand` adds the chance it is the answer. */
function entropy(P: Packed, g: number, cands: Int32Array, m: number): number {
  buckets.fill(0);
  for (let j = 0; j < m; j++) buckets[fb(P, g, cands[j])]++;
  let h = 0;
  for (let k = 0; k < 64; k++) {
    const b = buckets[k];
    if (b) h -= (b / m) * Math.log2(b / m);
  }
  return h;
}

/**
 * The best opening guess for the settings (entropy over every code), worked out once per settings.
 * The settings the lobby offers are filled in already (computed with opener() itself).
 */
const openers = new Map<string, number[]>([
  ['4|6|true', [0, 1, 2, 3]],
  ['4|8|true', [0, 1, 2, 3]],
  ['5|6|true', [0, 0, 1, 1, 2]],
  ['5|8|true', [0, 0, 1, 2, 3]],
]);

function opener(P: Packed, pegs: number, colors: number, repeats: boolean): number[] {
  const key = `${pegs}|${colors}|${repeats}`;
  let o = openers.get(key);
  if (o) return o;
  if (!repeats) {
    // every guess of distinct colours is the same up to renaming the colours
    o = Array.from({ length: pegs }, (_, i) => i);
  } else {
    // one guess per pattern of repeats (AABB, AABC, ABCD…), colours in order of first use
    const all = new Int32Array(P.n).map((_, i) => i);
    const patterns: number[][] = [];
    const rec = (cur: number[], used: number) => {
      if (cur.length === pegs) return void patterns.push([...cur]);
      for (let c = 0; c <= Math.min(used, colors - 1); c++) rec([...cur, c], Math.max(used, c + 1));
    };
    rec([], 0);
    let best = -1;
    for (const pt of patterns) {
      const h = entropy(P, indexOf(P, pt), all, P.n);
      if (h > best) (best = h), (o = pt);
    }
  }
  openers.set(key, o!);
  return o!;
}

/**
 * Budget for one expert guess (the server serves every room on one thread): a fixed amount of work
 * (pairs of codes compared, ≈ 35 ms of CPU on a modest machine), and a wall-clock safety net that
 * tests switch off so a busy machine never changes the guess.
 */
export const EXPERT_MS = 35;
export const CODEBREAK_SEARCH = { clock: true, pairs: 900_000 };

function expertGuess(rows: readonly CodebreakRow[], pegs: number, colors: number, repeats: boolean, rand: () => number): number[] {
  const P = packed(pegs, colors, repeats);
  const codes = allCodes(pegs, colors, repeats);
  if (!rows.length) return [...opener(P, pegs, colors, repeats)];
  const t0 = performance.now();
  // the codes still possible
  const rowIdx = rows.map((r) => ({ g: indexOf(P, r.guess), k: r.black * 8 + r.white }));
  const cands = new Int32Array(P.n);
  let m = 0;
  for (let c = 0; c < P.n; c++) if (rowIdx.every((r) => fb(P, r.g, c) === r.k)) cands[m++] = c;
  const tried = new Set(rows.map((r) => r.guess.join(',')));
  if (m === 0) return [...pick(codes.filter((c) => !tried.has(c.join(','))), rand)];
  if (m <= 2) return [...codes[cands[0]]];
  // guesses to try: the possible codes first (in a random order), then a sample of all codes
  const order: number[] = [];
  const candList = Array.from(cands.subarray(0, m));
  for (let i = candList.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [candList[i], candList[j]] = [candList[j], candList[i]];
  }
  const isCand = new Uint8Array(P.n);
  for (const c of candList) isCand[c] = 1;
  // keep the mix balanced: with many candidates, half of the budget goes to outside guesses
  const outside: number[] = [];
  for (let k = 0; k < Math.min(P.n, 1500); k++) {
    const c = Math.floor(rand() * P.n);
    if (!isCand[c]) outside.push(c);
  }
  for (let i = 0, j = 0; i < candList.length || j < outside.length; ) {
    if (i < candList.length) order.push(candList[i++]);
    if (j < outside.length && (m > 20 || i >= candList.length)) order.push(outside[j++]);
  }
  let best = candList[0], bestScore = -Infinity;
  const pairBudget = CODEBREAK_SEARCH.pairs;
  let pairs = 0;
  for (let i = 0; i < order.length; i++) {
    const g = order[i];
    if (pairs > pairBudget || (CODEBREAK_SEARCH.clock && performance.now() - t0 > EXPERT_MS)) break;
    if (tried.has(codes[g].join(','))) continue;
    // a possible code may simply be the answer: worth a little more than its split alone
    const score = entropy(P, g, cands, m) + (isCand[g] ? 1 / m : 0);
    if (score > bestScore) (bestScore = score), (best = g);
    pairs += m;
  }
  return [...codes[best]];
}

/** The bot's next guess (never one it already tried). `level` is the room's bot level. */
export function botGuess(
  rows: readonly CodebreakRow[],
  opts: { pegs: number; colors: number; repeats: boolean; level: BotLevel },
  rand: () => number = Math.random,
): number[] {
  if (opts.level === 'expert') return expertGuess(rows, opts.pegs, opts.colors, opts.repeats, rand);
  // the room's levels on the old ones: easy = the old «متوسط», smart = the old «صعب»
  const lv = opts.level === 'easy' ? 'medium' : 'hard';
  const codes = allCodes(opts.pegs, opts.colors, opts.repeats);
  const tried = new Set(rows.map((r) => r.guess.join(',')));
  const fresh = (cs: number[][]) => cs.filter((c) => !tried.has(c.join(',')));
  // the easy bot forgets one of its clues now and then
  const slip = lv === 'medium' ? 0.12 : 0;
  if (rows.length >= 1 && rand() < slip) {
    const forget = Math.floor(rand() * rows.length);
    const loose = fresh(consistent(codes, rows.filter((_, i) => i !== forget)));
    if (loose.length) return [...pick(loose, rand)];
  }
  const ok = fresh(consistent(codes, rows));
  if (!ok.length) return [...pick(fresh(codes), rand)];
  if (lv === 'hard' && ok.length > 2 && ok.length <= 400) return [...minimax(ok)];
  return [...pick(ok, rand)];
}
