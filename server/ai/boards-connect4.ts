/**
 * «أربعة في صف» — the expert / smart bots: negamax (see ./boards-search.ts) on a make/unmake board with
 * Zobrist hashing, forced-move pruning (win now, block their win, never play under their threat) and an
 * evaluation of open windows that knows the odd/even threat rule (the first player's threats on odd rows
 * from the bottom, the second player's on even rows, are the ones that win the endgame).
 */
import { COLS, ROWS, type Disc } from '../../src/shared/connect4';
import { BUDGET, WIN, search, zobrist, type SearchGame } from './boards-search';

const N = COLS * ROWS;

/** Every window of four cells, and the windows through each cell. */
const WINDOWS: number[][] = [];
for (let r = 0; r < ROWS; r++)
  for (let c = 0; c < COLS; c++)
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const r3 = r + 3 * dr, c3 = c + 3 * dc;
      if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
      WINDOWS.push([0, 1, 2, 3].map((k) => (r + k * dr) * COLS + c + k * dc));
    }
const BY_CELL: number[][] = Array.from({ length: N }, () => []);
WINDOWS.forEach((w, i) => w.forEach((cell) => BY_CELL[cell].push(i)));
const Z = zobrist(N * 2 + 1, 0xc4c4c4);
const CENTRE = [0, 1, 2, 3, 2, 1, 0];
const ORDER = [3, 2, 4, 1, 5, 0, 6];

export class C4 implements SearchGame<number> {
  b = new Int8Array(N);
  h = new Int8Array(COLS); // discs in each column
  cnt = [new Int8Array(WINDOWS.length), new Int8Array(WINDOWS.length)]; // discs of player 1 / 2 per window
  turn: 1 | 2;
  key = 0;
  hist: number[] = [];
  won = false;
  filled = 0;

  constructor(board: readonly Disc[], turn: 1 | 2) {
    this.turn = turn;
    for (let c = 0; c < COLS; c++)
      for (let r = ROWS - 1; r >= 0; r--) {
        const v = board[r * COLS + c];
        if (!v) break;
        this.put(r * COLS + c, v as 1 | 2);
        this.h[c] += 1;
      }
    if (turn === 2) this.key ^= Z[2 * N];
  }

  private put(i: number, p: 1 | 2) {
    this.b[i] = p;
    this.filled += 1;
    this.key ^= Z[i * 2 + p - 1];
    const cnt = this.cnt[p - 1];
    for (const w of BY_CELL[i]) if (++cnt[w] === 4) this.won = true;
  }

  side() {
    return this.turn;
  }

  cellOf(c: number) {
    return (ROWS - 1 - this.h[c]) * COLS + c;
  }

  /** Would `p` complete four by playing cell i? */
  wins(i: number, p: 1 | 2) {
    const cnt = this.cnt[p - 1];
    for (const w of BY_CELL[i]) if (cnt[w] === 3) return true;
    return false;
  }

  moves(): number[] {
    const me = this.turn, them: 1 | 2 = me === 1 ? 2 : 1;
    let block = -1;
    for (let c = 0; c < COLS; c++) {
      if (this.h[c] >= ROWS) continue;
      const i = this.cellOf(c);
      if (this.wins(i, me)) return [c];
      if (block < 0 && this.wins(i, them)) block = c;
    }
    if (block >= 0) return [block]; // two of them: lost anyway
    // never play right under a cell where they would win
    const safe: number[] = [];
    const open: number[] = [];
    for (const c of ORDER) {
      if (this.h[c] >= ROWS) continue;
      open.push(c);
      if (this.h[c] + 1 >= ROWS || !this.wins(this.cellOf(c) - COLS, them)) safe.push(c);
    }
    return safe.length ? safe : open;
  }

  play(c: number) {
    const i = this.cellOf(c);
    this.put(i, this.turn);
    this.h[c] += 1;
    this.hist.push(i);
    this.turn = this.turn === 1 ? 2 : 1;
    this.key ^= Z[2 * N];
  }

  undo() {
    const i = this.hist.pop()!;
    const c = i % COLS;
    this.h[c] -= 1;
    const p = this.b[i] as 1 | 2;
    this.b[i] = 0;
    this.filled -= 1;
    this.key ^= Z[i * 2 + p - 1] ^ Z[2 * N];
    const cnt = this.cnt[p - 1];
    for (const w of BY_CELL[i]) cnt[w] -= 1;
    this.won = false; // the position before a win was not won
    this.turn = p;
  }

  over(ply: number) {
    if (this.won) return -(WIN - ply); // the last move made four
    if (this.filled === N) return 0;
    return null;
  }

  /**
   * Windows that only one side occupies; three of four is a threat on the empty cell. Threats count
   * more on the row parity that wins the endgame for their owner (player 1: odd rows from the bottom).
   */
  evaluate() {
    let s = 0;
    const c1 = this.cnt[0], c2 = this.cnt[1];
    for (let w = 0; w < WINDOWS.length; w++) {
      const a = c1[w], b = c2[w];
      if (a && b) continue;
      if (a === 3 || b === 3) {
        const p = a === 3 ? 1 : 2;
        const cell = WINDOWS[w].find((i) => !this.b[i])!;
        const rowFromBottom = ROWS - Math.floor(cell / COLS); // 1..6
        const good = p === 1 ? rowFromBottom % 2 === 1 : rowFromBottom % 2 === 0;
        const v = good ? 60 : 25;
        s += p === 1 ? v : -v;
      } else if (a === 2) s += 5;
      else if (b === 2) s -= 5;
      else if (a === 1) s += 1;
      else if (b === 1) s -= 1;
    }
    for (let i = 0; i < N; i++) if (this.b[i]) s += (this.b[i] === 1 ? 3 : -3) * CENTRE[i % COLS];
    return this.turn === 1 ? s : -s;
  }

  hash() {
    return this.key;
  }

  moveKey(c: number) {
    return c;
  }

  /** Moves that build on own windows (and spoil theirs) first; the centre breaks ties. */
  orderScore(c: number) {
    const i = this.cellOf(c);
    const me = this.cnt[this.turn - 1], them = this.cnt[2 - this.turn];
    let s = 0;
    for (const w of BY_CELL[i]) {
      if (!them[w]) s += me[w] * me[w] + 1;
      if (!me[w]) s += them[w] * them[w];
    }
    return s * 4 + CENTRE[c];
  }
}

export type C4Level = 'smart' | 'expert';

/** The column the bot drops into. `opts.timeMs` overrides the budget (tests). */
export function c4Bot(board: readonly Disc[], me: 1 | 2, level: C4Level, opts: { timeMs?: number; maxNodes?: number; rng?: () => number } = {}): number {
  const g = new C4(board, me);
  const r = search(g, {
    maxDepth: level === 'expert' ? 42 : 6,
    timeMs: opts.timeMs ?? BUDGET[level],
    maxNodes: opts.maxNodes,
    noise: level === 'smart' ? 12 : 0,
    rng: opts.rng,
  });
  if (r) return r.move;
  for (const c of [3, 2, 4, 1, 5, 0, 6]) if (g.h[c] < ROWS) return c;
  return 0;
}
