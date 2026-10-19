/**
 * «شبكة الكلمات»: move generation for the bots. Classic anchor squares + cross-checks: for every empty
 * square next to a tile, build words through it letter by letter from the rack, keeping only strings
 * the dictionary can still complete (a binary-search prefix check in scrabble-dict.ts), and only
 * letters that also make a real word with the tiles above/below it. The search stops after `maxCalls`
 * steps (a fixed amount of work, so the result doesn't depend on how busy the machine is), after
 * `maxMoves` moves, or — a safety net — after `timeMs`, so a bot never holds the server up.
 */
import type { ScrabbleCell, ScrabblePlacement, ScrabbleTile } from '../src/shared/games/scrabble';
import { BINGO, CENTER, CELLS, LETTERS, PREMIUM, RACK, SIZE, VALUE, letterMult, wordMult } from '../src/shared/scrabble-rules';
import { botPrefix, botWordFast } from './scrabble-dict';

export interface BotMove {
  placements: ScrabblePlacement[];
  score: number;
  word: string;
}

interface Cross {
  ok: Set<string>;
  /** points of the tiles already above/below (left/right) */
  sum: number;
}

/** Search limits. Tests turn the clock off so a busy machine never changes what a bot finds. */
export const SCRABBLE_SEARCH = { clock: true };
/** Search steps for one bot move: ≈ 40 ms of CPU on a modest machine. */
export const BOT_CALLS = 20_000;
/** The steps the last findMoves call used (for tests and tuning). */
export let lastCalls = 0;

export function findMoves(board: readonly (ScrabbleCell | null)[], rack: readonly ScrabbleTile[], timeMs = 300, maxMoves = 40000, maxCalls = Infinity): BotMove[] {
  const t0 = performance.now();
  const letters = board.map((c) => c?.l ?? '');
  const values = board.map((c) => c?.v ?? 0);
  const empty = letters.every((l) => !l);
  const moves: BotMove[] = [];
  let calls = 0;
  let stop = false;

  const prefixCache = new Map<string, boolean>();
  const pre = (p: string) => {
    let v = prefixCache.get(p);
    if (v === undefined) prefixCache.set(p, (v = botPrefix(p)));
    return v;
  };
  const wordCache = new Map<string, boolean>();
  const word = (w: string) => {
    let v = wordCache.get(w);
    if (v === undefined) wordCache.set(w, (v = botWordFast(w)));
    return v;
  };

  const counts = new Map<string, number>();
  let blanks = 0;
  for (const t of rack) {
    if (!t.l) blanks++;
    else counts.set(t.l, (counts.get(t.l) ?? 0) + 1);
  }
  const rackSize = rack.length;

  const occupied = (cell: number) => !!letters[cell];
  const isAnchor = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) {
    if (occupied(i)) continue;
    const r = Math.floor(i / SIZE), c = i % SIZE;
    if ((r > 0 && occupied(i - SIZE)) || (r < SIZE - 1 && occupied(i + SIZE)) || (c > 0 && occupied(i - 1)) || (c < SIZE - 1 && occupied(i + 1))) isAnchor[i] = 1;
  }
  if (empty) isAnchor[CENTER] = 1;

  const crossFor = (dir: 0 | 1): (Cross | null)[] => {
    // cross-checks: the perpendicular word through each empty square
    const cross: (Cross | null)[] = new Array(CELLS).fill(null);
    for (let i = 0; i < CELLS; i++) {
      if (occupied(i)) continue;
      const r = Math.floor(i / SIZE), c = i % SIZE;
      // perpendicular to an across move is vertical (step SIZE), to a down move horizontal (step 1)
      let before = '', after = '', sum = 0;
      if (dir === 0) {
        for (let rr = r - 1; rr >= 0 && occupied(rr * SIZE + c); rr--) (before = letters[rr * SIZE + c] + before), (sum += values[rr * SIZE + c]);
        for (let rr = r + 1; rr < SIZE && occupied(rr * SIZE + c); rr++) (after += letters[rr * SIZE + c]), (sum += values[rr * SIZE + c]);
      } else {
        for (let cc = c - 1; cc >= 0 && occupied(r * SIZE + cc); cc--) (before = letters[r * SIZE + cc] + before), (sum += values[r * SIZE + cc]);
        for (let cc = c + 1; cc < SIZE && occupied(r * SIZE + cc); cc++) (after += letters[r * SIZE + cc]), (sum += values[r * SIZE + cc]);
      }
      if (!before && !after) continue;
      const ok = new Set<string>();
      for (const L of LETTERS) if (word(before + L + after)) ok.add(L);
      cross[i] = { ok, sum };
    }
    return cross;
  };
  const crossOf = [crossFor(0), crossFor(1)];
  // position `pos` on line `line`: across lines are rows, down lines are columns
  const cellOn = (dir: 0 | 1, line: number, pos: number) => (dir === 0 ? line * SIZE + pos : pos * SIZE + line);
  /** Every move through one anchor square, along one direction. */
  const searchAnchor = (dir: 0 | 1, line: number, anchor: number) => {
    const cellAt = (l: number, pos: number) => cellOn(dir, l, pos);
    const cross = crossOf[dir];
    const placed: ScrabblePlacement[] = [];

    const record = (w: string, mainSum: number, mainMul: number, crossTotal: number) => {
      const score = mainSum * mainMul + crossTotal + (placed.length === RACK ? BINGO : 0);
      moves.push({ placements: placed.slice(), score, word: w });
      if (moves.length >= maxMoves) stop = true;
    };

    const extend = (partial: string, pos: number, mainSum: number, mainMul: number, crossTotal: number) => {
      if (stop) return;
      if (++calls > maxCalls || ((calls & 255) === 0 && SCRABBLE_SEARCH.clock && performance.now() - t0 > timeMs)) {
        stop = true;
        return;
      }
      const cell = pos < SIZE ? cellAt(line, pos) : -1;
      if (cell < 0 || !occupied(cell)) {
        if (pos > anchor && placed.length && partial.length >= 2 && word(partial)) record(partial, mainSum, mainMul, crossTotal);
        if (cell < 0) return;
      }
      if (occupied(cell)) {
        const np = partial + letters[cell];
        if (pre(np)) extend(np, pos + 1, mainSum + values[cell], mainMul, crossTotal);
        return;
      }
      if (placed.length >= rackSize) return;
      const cc = cross[cell];
      const lm = letterMult(PREMIUM[cell]), wm = wordMult(PREMIUM[cell]);
      const tryLetter = (L: string, blank: boolean) => {
        if (cc && !cc.ok.has(L)) return;
        const np = partial + L;
        if (!pre(np)) return;
        const v = blank ? 0 : VALUE[L];
        placed.push(blank ? { cell, l: L, blank: true } : { cell, l: L });
        extend(np, pos + 1, mainSum + v * lm, mainMul * wm, crossTotal + (cc ? (cc.sum + v * lm) * wm : 0));
        placed.pop();
      };
      for (const [L, n] of counts) {
        if (n <= 0) continue;
        counts.set(L, n - 1);
        tryLetter(L, false);
        counts.set(L, n);
      }
      if (blanks > 0) {
        blanks--;
        for (const L of LETTERS) if (!counts.get(L)) tryLetter(L, true);
        blanks++;
      }
    };

    // tiles already right before the anchor: they start the word
    if (anchor > 0 && occupied(cellAt(line, anchor - 1))) {
      let s = anchor - 1, partial = '', sum = 0;
      while (s >= 0 && occupied(cellAt(line, s))) {
        partial = letters[cellAt(line, s)] + partial;
        sum += values[cellAt(line, s)];
        s--;
      }
      if (pre(partial)) extend(partial, anchor, sum, 1, 0);
      return;
    }

    // otherwise grow a left part from the rack over the free squares before the anchor
    let room = 0;
    while (anchor - room - 1 >= 0 && !occupied(cellAt(line, anchor - room - 1)) && !isAnchor[cellAt(line, anchor - room - 1)]) room++;
    const limit = Math.min(room, rackSize - 1);
    const left: { l: string; blank: boolean }[] = [];
    const leftPart = (partial: string) => {
      if (stop) return;
      // the left part sits right before the anchor; those squares have no neighbours, so no cross words
      const start = anchor - left.length;
      let sum = 0, mul = 1;
      left.forEach((t, k) => {
        const cell = cellAt(line, start + k);
        sum += (t.blank ? 0 : VALUE[t.l]) * letterMult(PREMIUM[cell]);
        mul *= wordMult(PREMIUM[cell]);
        placed.push(t.blank ? { cell, l: t.l, blank: true } : { cell, l: t.l });
      });
      extend(partial, anchor, sum, mul, 0);
      placed.length = 0;
      if (left.length >= limit) return;
      const grow = (L: string, blank: boolean) => {
        const np = partial + L;
        if (!pre(np)) return;
        left.push({ l: L, blank });
        leftPart(np);
        left.pop();
      };
      for (const [L, n] of counts) {
        if (n <= 0) continue;
        counts.set(L, n - 1);
        grow(L, false);
        counts.set(L, n);
      }
      if (blanks > 0) {
        blanks--;
        for (const L of LETTERS) if (!counts.get(L)) grow(L, true);
        blanks++;
      }
    };
    leftPart('');
  };

  // the anchors in a random order: if the time runs out, what was searched is spread over the board
  const tasks: [0 | 1, number, number][] = [];
  for (const dir of [0, 1] as const)
    for (let line = 0; line < SIZE; line++) for (let anchor = 0; anchor < SIZE; anchor++) if (isAnchor[cellOn(dir, line, anchor)]) tasks.push([dir, line, anchor]);
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tasks[i], tasks[j]] = [tasks[j], tasks[i]];
  }
  for (const [dir, line, anchor] of tasks) {
    if (stop) break;
    searchAnchor(dir, line, anchor);
  }
  lastCalls = calls;
  return moves;
}

/** Map a generated move back to rack tiles: real letters first, blanks for the rest. */
export function tilesFor(move: BotMove, rack: readonly ScrabbleTile[]): { id: number; cell: number; l: string }[] | null {
  const free = rack.slice();
  const out: { id: number; cell: number; l: string }[] = [];
  for (const p of move.placements) {
    const i = free.findIndex((t) => (p.blank ? t.l === '' : t.l === p.l));
    if (i < 0) return null;
    out.push({ id: free[i].id, cell: p.cell, l: p.l });
    free.splice(i, 1);
  }
  return out;
}

/* ---------------- choosing a move ---------------- */

/** Letters most words need: a rack without any of them is hard to play. */
const VOWELS = new Set(['ا', 'و', 'ي']);
/** Cheap letters that go with nearly everything. */
const EASY = new Set(['ا', 'ل', 'ن', 'م', 'ت', 'ر', 'ي', 'و', 'ه']);

/**
 * What the tiles a move keeps are worth for the next turns (in points): a blank is gold, «ا» + «ل» make
 * the article, a balance of vowels and consonants keeps words possible; duplicates and hard letters
 * (ظ، ث، ذ…) clog the rack. Once the bag is empty every tile kept costs its value (and going out ends
 * the game with the others' tiles as a bonus).
 */
export function leaveValue(leave: readonly ScrabbleTile[], bag: number): number {
  if (bag === 0) {
    if (!leave.length) return 12;
    return -2 * leave.reduce((t, x) => t + x.v, 0) - 3;
  }
  let v = 0;
  const n = new Map<string, number>();
  let blanks = 0, vowels = 0;
  for (const t of leave) {
    if (!t.l) {
      blanks++;
      continue;
    }
    n.set(t.l, (n.get(t.l) ?? 0) + 1);
    if (VOWELS.has(t.l)) vowels++;
    if (EASY.has(t.l)) v += 0.8;
    if (t.v >= 4) v -= 0.8 * (t.v - 3);
  }
  v += blanks === 1 ? 9 : blanks === 2 ? 15 : 0;
  for (const [l, k] of n) if (k > 1) v -= (l === 'ا' ? 1 : 3) * (k - (l === 'ا' ? 2 : 1));
  if (n.has('ا') && n.has('ل')) v += 2;
  const consonants = leave.length - blanks - vowels;
  if (leave.length >= 2 && vowels === 0 && !blanks) v -= 4;
  if (vowels >= 3) v -= 2.5 * (vowels - 2);
  if (consonants >= 5) v -= 2 * (consonants - 4);
  return v;
}

/** The tiles left on the rack after a move. */
export function leaveAfter(move: BotMove, rack: readonly ScrabbleTile[]): ScrabbleTile[] {
  const free = rack.slice();
  for (const p of move.placements) {
    const i = free.findIndex((t) => (p.blank ? t.l === '' : t.l === p.l));
    if (i >= 0) free.splice(i, 1);
  }
  return free;
}

/**
 * Every move found within `calls` search steps: first without the blanks (usually complete), then with
 * them on what is left. `timeMs` is only a safety net (see SCRABBLE_SEARCH).
 */
export function searchMoves(board: readonly (ScrabbleCell | null)[], rack: readonly ScrabbleTile[], timeMs: number, calls = BOT_CALLS): BotMove[] {
  const t0 = performance.now();
  const plain = rack.filter((t) => t.l);
  const moves = findMoves(board, plain, timeMs * 0.6, 40000, calls * 0.6);
  if (plain.length < rack.length) {
    const used = lastCalls;
    const left = Math.max(5, timeMs - (performance.now() - t0));
    for (const m of findMoves(board, rack, left, 40000, Math.max(calls * 0.2, calls - used))) if (m.placements.some((p) => p.blank)) moves.push(m);
  }
  return moves;
}

/** The expert's pick: the best points now plus what the kept tiles are worth. */
export function bestByLeave(moves: readonly BotMove[], rack: readonly ScrabbleTile[], bag: number): { move: BotMove; value: number } | null {
  let best: BotMove | null = null, bestV = -Infinity;
  // only the strongest few hundred are worth a closer look
  const top = [...moves].sort((a, b) => b.score - a.score).slice(0, 300);
  for (const m of top) {
    const v = m.score + leaveValue(leaveAfter(m, rack), bag);
    if (v > bestV) (bestV = v), (best = m);
  }
  return best ? { move: best, value: bestV } : null;
}

/** The tiles a bot keeps when it swaps: blanks, one «ا» and one «ل», and up to two other cheap letters. */
export function keepOnSwap(rack: readonly ScrabbleTile[]): Set<number> {
  const keep = new Set<number>();
  const seen = new Set<string>();
  let others = 0;
  for (const t of [...rack].sort((a, b) => a.v - b.v)) {
    if (!t.l) keep.add(t.id);
    else if ((t.l === 'ا' || t.l === 'ل') && !seen.has(t.l)) keep.add(t.id);
    else if (EASY.has(t.l) && !seen.has(t.l) && others < 2) {
      keep.add(t.id);
      others++;
    }
    if (t.l) seen.add(t.l);
  }
  return keep;
}
