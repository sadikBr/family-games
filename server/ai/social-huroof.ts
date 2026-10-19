/**
 * «حروف»: which hexagon a bot team picks. The board is a 5×5 Hex board (red joins right ↔ left, green
 * top ↔ bottom) where a picked hexagon goes to whichever team answers its question.
 *
 * Path planning: the shortest chain each team still needs (0-1 BFS over the hexagons: our own cost 0, a
 * free one 1, theirs is a wall). Each free hexagon is scored by the position after each outcome of its
 * question (we win it and pick again, they win it and pick, nobody does), weighted by how likely each
 * outcome is; a hexagon that wins on the spot is always taken, and the only one that would let them win
 * on the spot is always contested. Ties go to the hexagon closest to both teams' best chains, then the
 * centre.
 *
 * Note: when every hexagon goes to whoever answers, the order of the picks can't change who wins (a full
 * Hex board always has exactly one winner, and each hexagon's owner doesn't depend on when it was asked).
 * So planning makes the bots' chains short and their wins quick (about 8 hexagons instead of 11–12 with
 * random picks) and it never leaves a winning letter on the board; the wins themselves come from answering.
 * `depth` 2 looks one more pick ahead (an expectimax); it plays the same and costs far more, so 1 is used.
 */
import { HEX_N, hexNeighbors } from '../../src/shared/islamic';
import type { BotLevel, HuroofTeam } from '../../src/shared/protocol';

type Owner = HuroofTeam | null;

/**
 * Of the bots that know a question's answer, the share that already know it once `shown` (0–1) of the
 * question's words are on the screen. Bots never see the hidden words: they play a person who recognises
 * the question sooner or later. Easy waits for the whole question; smart needs about half of it before
 * anything clicks; expert can recognise it from about 40 % of it, more and more often as words come.
 */
export function huroofKnowShare(level: BotLevel, shown: number): number {
  if (shown >= 1) return 1;
  if (level === 'easy') return 0;
  const [from, to, curve] = level === 'expert' ? [0.4, 1, 1.5] : [0.6, 1, 2];
  if (shown <= from) return 0;
  return Math.min(1, ((shown - from) / (to - from)) ** curve);
}

const CELLS = HEX_N * HEX_N;
const FAR = 99;
const NEIGHBORS: number[][] = [...Array(CELLS).keys()].map((i) => hexNeighbors(i));

const isStart = (team: HuroofTeam, i: number) => (team === 'red' ? i % HEX_N === HEX_N - 1 : Math.floor(i / HEX_N) === 0);
const isEnd = (team: HuroofTeam, i: number) => (team === 'red' ? i % HEX_N === 0 : Math.floor(i / HEX_N) === HEX_N - 1);

/** Cost of entering a hexagon for `team` (FAR = a wall). */
const cost = (owners: readonly Owner[], team: HuroofTeam, i: number) => (owners[i] === team ? 0 : owners[i] === null ? 1 : FAR);

const dist = new Int32Array(CELLS);
const deque = new Int32Array(1024);

/** Distance (hexagons still to win) from `team`'s first side (or last, `fromEnd`) to every hexagon, entry cost included (0-1 BFS). */
function distFrom(owners: readonly Owner[], team: HuroofTeam, fromEnd: boolean, out: Int32Array = dist): Int32Array {
  out.fill(FAR);
  let head = 512;
  let tail = 512;
  for (let i = 0; i < CELLS; i++) {
    if (!(fromEnd ? isEnd(team, i) : isStart(team, i))) continue;
    const c = cost(owners, team, i);
    if (c >= FAR) continue;
    out[i] = c;
    if (c === 0) deque[--head] = i;
    else deque[tail++] = i;
  }
  while (head < tail) {
    const i = deque[head++];
    const nb = NEIGHBORS[i];
    for (let k = 0; k < nb.length; k++) {
      const n = nb[k];
      const c = cost(owners, team, n);
      if (c >= FAR || out[i] + c >= out[n]) continue;
      out[n] = out[i] + c;
      if (c === 0) deque[--head] = n;
      else deque[tail++] = n;
    }
  }
  return out;
}

/** Hexagons `team` still has to win to connect its sides (0 = connected, FAR = cut off). */
export function hexDistance(owners: readonly Owner[], team: HuroofTeam): number {
  const d = distFrom(owners, team, false);
  let best = FAR;
  for (let i = 0; i < CELLS; i++) if (isEnd(team, i) && d[i] < best) best = d[i];
  return best;
}

/** For every hexagon: the length of `team`'s shortest chain through it (FAR if none). */
function through(owners: readonly Owner[], team: HuroofTeam): number[] {
  const a = Array.from(distFrom(owners, team, false, new Int32Array(CELLS)));
  const b = distFrom(owners, team, true, new Int32Array(CELLS));
  return a.map((x, i) => (x >= FAR || b[i] >= FAR ? FAR : x + b[i] - cost(owners, team, i)));
}

const other = (t: HuroofTeam): HuroofTeam => (t === 'red' ? 'green' : 'red');

/**
 * Chances that we / they win a hexagon's question (nobody: the rest), whoever picked it. Set for each
 * search: a team that knows its subject expects to win more of them.
 */
let pMe = 0.45;
let pThem = 0.45;
const pNone = () => Math.max(0, 1 - pMe - pThem);

/**
 * Static value of a position for `me` with `mover` to pick next: how much shorter my remaining chain is
 * than theirs, a little for having the pick, and the threat of a hexagon that wins on the spot (the mover
 * takes it, or has to try to block it).
 */
function leaf(owners: readonly Owner[], me: HuroofTeam, mover: HuroofTeam): number {
  const mine = hexDistance(owners, me);
  const theirs = hexDistance(owners, other(me));
  if (mine === 0) return 1000;
  if (theirs === 0) return -1000;
  const flat = 10 * (Math.min(theirs, 12) - Math.min(mine, 12)) + (mover === me ? 4 : -4);
  const dMover = mover === me ? mine : theirs;
  const dOther = mover === me ? theirs : mine;
  const sign = mover === me ? 1 : -1;
  const pMover = mover === me ? pMe : pThem;
  const pOther = mover === me ? pThem : pMe;
  if (dMover === 1) return sign * pMover * 1000 + (1 - pMover) * flat;
  if (dOther === 1) return -sign * pOther * 1000 + (1 - pOther) * flat;
  return flat;
}

/** The free hexagons worth looking at deeper: those on or next to either team's best chains (at most `k`). */
function candidates(owners: readonly Owner[], k: number): number[] {
  const thR = through(owners, 'red');
  const thG = through(owners, 'green');
  const dR = hexDistance(owners, 'red');
  const dG = hexDistance(owners, 'green');
  const free: { i: number; v: number }[] = [];
  for (let i = 0; i < CELLS; i++) if (owners[i] === null) free.push({ i, v: Math.min(thR[i] - dR, thG[i] - dG) * 10 + Math.max(thR[i] - dR, thG[i] - dG) });
  return free.sort((a, b) => a.v - b.v).slice(0, k).map((x) => x.i);
}

/**
 * Expectimax: `mover` picks a hexagon (maximising my value if it's me, minimising it if it's them), then
 * the question decides who gets it — the winner picks next, or the other team if nobody answered.
 */
function search(owners: Owner[], me: HuroofTeam, mover: HuroofTeam, depth: number): number {
  if (depth === 0) return leaf(owners, me, mover);
  if (hexDistance(owners, me) === 0) return 1000;
  if (hexDistance(owners, other(me)) === 0) return -1000;
  const opp = other(mover);
  const none = search(owners, me, opp, depth - 1);
  let best = mover === me ? -Infinity : Infinity;
  for (const i of candidates(owners, 8)) {
    owners[i] = me;
    const a = search(owners, me, me, depth - 1);
    owners[i] = other(me);
    const b = search(owners, me, other(me), depth - 1);
    owners[i] = null;
    const v = pMe * a + pThem * b + pNone() * none;
    best = mover === me ? Math.max(best, v) : Math.min(best, v);
  }
  return best === Infinity || best === -Infinity ? leaf(owners, me, mover) : best;
}

/**
 * Score of every free hexagon when `me` picks (higher = better): the expected value `depth` picks deep, then
 * how close the hexagon is to both teams' best chains (it keeps the most ways open), then the centre.
 */
export function huroofScores(owners: readonly Owner[], me: HuroofTeam, depth = 1, odds: [number, number] = [0.45, 0.45]): Map<number, number> {
  [pMe, pThem] = odds;
  const out = new Map<number, number>();
  const opp = other(me);
  const board = owners.slice();
  const thMe = through(owners, me);
  const thOpp = through(owners, opp);
  const dMe = hexDistance(owners, me);
  const dOpp = hexDistance(owners, opp);
  const centre = (HEX_N - 1) / 2;
  const none = search(board, me, opp, depth - 1);
  for (let i = 0; i < CELLS; i++) {
    if (owners[i] !== null) continue;
    board[i] = me;
    const a = search(board, me, me, depth - 1);
    board[i] = opp;
    const b = search(board, me, opp, depth - 1);
    board[i] = null;
    const slackMe = Math.min(thMe[i] - dMe, 6);
    const slackOpp = Math.min(thOpp[i] - dOpp, 6);
    const r = Math.floor(i / HEX_N);
    const c = i % HEX_N;
    const off = Math.abs(r - centre) + Math.abs(c - centre);
    out.set(i, pMe * a + pThem * b + pNone() * none - 0.8 * slackMe - 0.6 * slackOpp - 0.05 * off);
  }
  return out;
}

/** The hexagon a bot team picks, by the room's bot strength (easy: any free one, like the old bots). */
export function huroofPick(
  owners: readonly Owner[],
  me: HuroofTeam,
  level: BotLevel,
  rnd: () => number = Math.random,
  depth = 1,
  odds: [number, number] = [0.5, 0.4],
): number {
  const free = owners.map((o, i) => (o ? -1 : i)).filter((i) => i >= 0);
  if (level === 'easy' || free.length <= 1) return free[Math.floor(rnd() * free.length)];
  // tactics first: a hexagon that wins on the spot; else the only one that would let them win on the spot
  const winsFor = (team: HuroofTeam) =>
    free.filter((i) => {
      const next = owners.slice();
      next[i] = team;
      return hexDistance(next, team) === 0;
    });
  const mine = winsFor(me);
  if (mine.length) return mine[Math.floor(rnd() * mine.length)];
  const theirs = winsFor(other(me));
  if (theirs.length === 1) return theirs[0];
  const scores = huroofScores(owners, me, depth, odds);
  const ranked = free.map((i) => ({ i, v: (scores.get(i) ?? -FAR) + rnd() * 0.01 })).sort((a, b) => b.v - a.v);
  if (level === 'smart') {
    // a good pick, not always the best: one of the top three
    const top = ranked.filter((x) => x.v >= ranked[0].v - 6).slice(0, 3);
    return top[Math.floor(rnd() * top.length)].i;
  }
  return ranked[0].i;
}
