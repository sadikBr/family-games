/** «أربعة في صف» — 7 columns × 6 rows; discs drop to the lowest free cell. Board index = row * 7 + col, row 0 on top. */

export const COLS = 7;
export const ROWS = 6;
export type Disc = 0 | 1 | 2;

export function dropRow(b: Disc[], col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + col]) return r;
  return -1;
}

/** The four (or more) winning cells through the last move, or null. */
export function winLine(b: Disc[], at: number): number[] | null {
  const who = b[at];
  if (!who) return null;
  const r0 = Math.floor(at / COLS), c0 = at % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [at];
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r * COLS + c] === who) {
        line.push(r * COLS + c);
        r += dr * s;
        c += dc * s;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

/* ---------------- bot: alpha-beta with a window heuristic ---------------- */

/** Every line of four cells on the board, computed once. */
const WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const r3 = r + 3 * dr, c3 = c + 3 * dc;
        if (r3 < 0 || r3 >= ROWS || c3 < 0 || c3 >= COLS) continue;
        out.push([0, 1, 2, 3].map((k) => (r + k * dr) * COLS + c + k * dc));
      }
  return out;
})();

/** Score for `me` minus score for the other side. */
function heuristic(b: Disc[], me: Disc): number {
  let s = 0;
  for (let r = 0; r < ROWS; r++) {
    const v = b[r * COLS + 3];
    if (v) s += v === me ? 3 : -3; // centre column
  }
  for (const w of WINDOWS) {
    let mine = 0, theirs = 0;
    for (const i of w) {
      const v = b[i];
      if (v === me) mine++;
      else if (v) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) s += 6;
    else if (mine === 2) s += 2;
    else if (theirs === 3) s -= 8;
    else if (theirs === 2) s -= 2;
  }
  return s;
}

const ORDER = [3, 2, 4, 1, 5, 0, 6];

function negamax(b: Disc[], toMove: Disc, depth: number, alpha: number, beta: number): number {
  const other: Disc = toMove === 1 ? 2 : 1;
  const cols = ORDER.filter((c) => dropRow(b, c) >= 0);
  if (!cols.length) return 0;
  if (depth === 0) return heuristic(b, toMove);
  let best = -Infinity;
  for (const c of cols) {
    const r = dropRow(b, c);
    const i = r * COLS + c;
    b[i] = toMove;
    const v = winLine(b, i) ? 100000 + depth : -negamax(b, other, depth - 1, -beta, -alpha);
    b[i] = 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** level 1 = casual, 2 = strong. */
export function bestColumn(board: Disc[], me: Disc, level: 1 | 2 = 2): number {
  const b = board.slice();
  const other: Disc = me === 1 ? 2 : 1;
  const depth = level === 1 ? 2 : 6;
  const cols = ORDER.filter((c) => dropRow(b, c) >= 0);
  const scored = cols.map((c) => {
    const i = dropRow(b, c) * COLS + c;
    b[i] = me;
    const v = winLine(b, i) ? 1e6 : -negamax(b, other, depth - 1, -Infinity, Infinity);
    b[i] = 0;
    return { c, v };
  });
  scored.sort((x, y) => y.v - x.v);
  const slack = level === 1 ? 6 : 0;
  const top = scored.filter((x) => x.v >= scored[0].v - slack);
  return top[Math.floor(Math.random() * top.length)].c;
}
