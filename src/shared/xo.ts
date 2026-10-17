/**
 * «إكس أو» on a board of any size: n×n cells ('' | 'x' | 'o'), win with `k` in a row (across, down or
 * diagonal). 3×3 → 3 in a row; 4×4 and 5×5 → 4; 6×6 and bigger → 5.
 */
export type Mark = '' | 'x' | 'o';

export const XO_SIZES = [3, 4, 5, 6, 7, 9] as const;
export type XoSize = (typeof XO_SIZES)[number];

/** How many in a row win on an n×n board. */
export const inRow = (n: number) => (n <= 3 ? 3 : n <= 5 ? 4 : 5);

const DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** The winning line (cell indexes) if someone has k in a row. */
export function xoWinner(b: Mark[], n = Math.round(Math.sqrt(b.length)), k = inRow(n)): { mark: 'x' | 'o'; line: number[] } | null {
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const m = b[r * n + c];
      if (!m) continue;
      for (const [dr, dc] of DIRS) {
        const line = [r * n + c];
        let rr = r + dr, cc = c + dc;
        while (line.length < k && rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === m) {
          line.push(rr * n + cc);
          rr += dr;
          cc += dc;
        }
        if (line.length === k) return { mark: m, line };
      }
    }
  return null;
}

/* ------------------------------------------------------------------ */
/* 3×3: perfect play (minimax)                                         */
/* ------------------------------------------------------------------ */

const memo = new Map<string, number>();

function minimax(b: Mark[], turn: 'x' | 'o', me: 'x' | 'o'): number {
  const key = `${b.map((v) => v || '-').join('')}${turn}${me}`;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  const v = search(b, turn, me);
  memo.set(key, v);
  return v;
}

function search(b: Mark[], turn: 'x' | 'o', me: 'x' | 'o'): number {
  const w = xoWinner(b, 3, 3);
  // faster wins score higher: the score depends only on the position, so it can be cached
  if (w) {
    const empty = b.filter((v) => !v).length;
    return w.mark === me ? 1 + empty : -1 - empty;
  }
  if (b.every(Boolean)) return 0;
  const scores: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = turn;
    scores.push(minimax(b, turn === 'x' ? 'o' : 'x', me));
    b[i] = '';
  }
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

/* ------------------------------------------------------------------ */
/* Bigger boards: threat scoring                                       */
/* ------------------------------------------------------------------ */

/**
 * How good is putting `m` at (r, c): for each direction, the run of `m` it would make and how many
 * open ends it has. Five-in-a-row style weights: a win ≫ an open run of k−1 ≫ a closed one…
 */
function lineValue(b: Mark[], n: number, k: number, r: number, c: number, m: 'x' | 'o'): number {
  let total = 0;
  for (const [dr, dc] of DIRS) {
    let run = 1, open = 0;
    for (const s of [1, -1]) {
      let rr = r + dr * s, cc = c + dc * s;
      while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === m) {
        run++;
        rr += dr * s;
        cc += dc * s;
      }
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && !b[rr * n + cc]) open++;
    }
    if (run >= k) total += 1_000_000;
    else if (open > 0) {
      const left = k - run; // stones still missing
      total += (open === 2 ? 4 : 1) * Math.pow(10, Math.max(0, 4 - left));
    }
  }
  return total;
}

function bigBest(b: Mark[], n: number, me: 'x' | 'o', level: 1 | 2): number {
  const k = inRow(n);
  const them = me === 'x' ? 'o' : 'x';
  const free: number[] = [];
  const near = (i: number) => {
    const r = Math.floor(i / n), c = i % n;
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc]) return true;
      }
    return false;
  };
  const empty = b.every((v) => !v);
  for (let i = 0; i < b.length; i++) if (!b[i] && (empty || near(i))) free.push(i);
  if (empty) return Math.floor(n / 2) * n + Math.floor(n / 2); // open in the middle
  const centre = (n - 1) / 2;
  const scored = free.map((i) => {
    const r = Math.floor(i / n), c = i % n;
    const attack = lineValue(b, n, k, r, c, me);
    const defend = lineValue(b, n, k, r, c, them);
    // win now > stop their win > build; a little pull toward the middle
    const v = attack * 1.15 + defend - (Math.abs(r - centre) + Math.abs(c - centre)) * 0.5;
    return { i, v, attack, defend };
  });
  scored.sort((a, z) => z.v - a.v);
  if (level === 1) {
    // the easy bot still takes a win and usually blocks one, otherwise it's loose
    const win = scored.find((s) => s.attack >= 1_000_000);
    if (win) return win.i;
    const block = scored.find((s) => s.defend >= 1_000_000);
    if (block && Math.random() < 0.8) return block.i;
    const pool = scored.slice(0, Math.min(6, scored.length));
    return pool[Math.floor(Math.random() * pool.length)].i;
  }
  const best = scored[0].v;
  const top = scored.filter((s) => s.v >= best - 1);
  return top[Math.floor(Math.random() * top.length)].i;
}

/** level 2 plays its best (never loses on 3×3); level 1 makes the odd mistake. */
export function xoBest(board: Mark[], me: 'x' | 'o', level: 1 | 2): number {
  const n = Math.round(Math.sqrt(board.length));
  if (n !== 3) return bigBest(board, n, me, level);
  const b = board.slice();
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (level === 1 && Math.random() < 0.35) return free[Math.floor(Math.random() * free.length)];
  const scored = free.map((i) => {
    b[i] = me;
    const v = minimax(b, me === 'x' ? 'o' : 'x', me);
    b[i] = '';
    return { i, v };
  });
  const best = Math.max(...scored.map((s) => s.v));
  const top = scored.filter((s) => s.v === best);
  return top[Math.floor(Math.random() * top.length)].i;
}
