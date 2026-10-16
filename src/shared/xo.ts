/** «إكس أو» — tic-tac-toe. Board of 9: '' | 'x' | 'o'. */
export type Mark = '' | 'x' | 'o';
export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function xoWinner(b: Mark[]): { mark: 'x' | 'o'; line: number[] } | null {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { mark: b[l[0]] as 'x' | 'o', line: l };
  return null;
}

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
  const w = xoWinner(b);
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

/** level 2 never loses; level 1 makes the odd mistake. */
export function xoBest(board: Mark[], me: 'x' | 'o', level: 1 | 2): number {
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
