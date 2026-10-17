/**
 * «شبكة الكلمات»: move generation for the bots. Classic anchor squares + cross-checks: for every empty
 * square next to a tile, build words through it letter by letter from the rack, keeping only strings
 * the dictionary can still complete (a binary-search prefix check in scrabble-dict.ts), and only
 * letters that also make a real word with the tiles above/below it. The search stops after `timeMs`
 * (≈300 ms) or `maxMoves` moves, so a bot never holds the server up.
 */
import type { ScrabbleCell, ScrabblePlacement, ScrabbleTile } from '../src/shared/games/scrabble';
import { BINGO, CENTER, CELLS, LETTERS, PREMIUM, RACK, SIZE, VALUE, letterMult, wordMult } from '../src/shared/scrabble-rules';
import { botWord, isPrefix } from './scrabble-dict';

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

export function findMoves(board: readonly (ScrabbleCell | null)[], rack: readonly ScrabbleTile[], timeMs = 300, maxMoves = 40000): BotMove[] {
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
    if (v === undefined) prefixCache.set(p, (v = isPrefix(p)));
    return v;
  };
  const wordCache = new Map<string, boolean>();
  const word = (w: string) => {
    let v = wordCache.get(w);
    if (v === undefined) wordCache.set(w, (v = botWord(w)));
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

  for (const dir of [0, 1] as const) {
    if (stop) break;
    // position `pos` on line `line`: across lines are rows, down lines are columns
    const cellAt = (line: number, pos: number) => (dir === 0 ? line * SIZE + pos : pos * SIZE + line);
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

    for (let line = 0; line < SIZE && !stop; line++) {
      for (let anchor = 0; anchor < SIZE && !stop; anchor++) {
        if (!isAnchor[cellAt(line, anchor)]) continue;
        const placed: ScrabblePlacement[] = [];

        const record = (w: string, mainSum: number, mainMul: number, crossTotal: number) => {
          const score = mainSum * mainMul + crossTotal + (placed.length === RACK ? BINGO : 0);
          moves.push({ placements: placed.slice(), score, word: w });
          if (moves.length >= maxMoves) stop = true;
        };

        const extend = (partial: string, pos: number, mainSum: number, mainMul: number, crossTotal: number) => {
          if (stop) return;
          if ((++calls & 255) === 0 && performance.now() - t0 > timeMs) {
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
          continue;
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
      }
    }
  }
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
