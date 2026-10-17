/**
 * «مشوار الحياة» — the board: a winding road of spaces from school (top right) to retirement
 * (bottom right), with two forks. Positions are in board units: the board is LIFE_W units wide.
 * The same road is used for both lengths; the short game just has fewer spaces on it.
 */
import type { LifeLength } from './games/life';

export type LifeKind = 'start' | 'event' | 'payday' | 'family' | 'house' | 'insure' | 'risk' | 'fork' | 'grad' | 'raise' | 'retire';
export type LifeZone = 'school' | 'uni' | 'work' | 'career' | 'adventure' | 'quiet' | 'final';

export interface LifeNode {
  i: number;
  kind: LifeKind;
  zone: LifeZone;
  x: number;
  y: number;
  /** the spaces that follow (two at a fork: [first branch, second branch]) */
  next: number[];
}

export interface LifeBoard {
  nodes: LifeNode[];
  width: number;
  height: number;
  /** zone names written on the board */
  labels: { text: string; x: number; y: number; zone: LifeZone }[];
  /** node index of the two forks */
  fork1: number;
  fork2: number;
}

export const LIFE_W = 7;
export const LIFE_H = 9.95;

/** Spaces where the pawn always stops, whatever the die said. */
export const LIFE_STOPS: readonly LifeKind[] = ['fork', 'grad', 'house', 'retire'];

type Pt = [number, number];

/** `n` points evenly spaced along a polyline, strictly between its first and last points. */
function spread(pts: Pt[], n: number): Pt[] {
  const seg: number[] = [];
  let total = 0;
  for (let k = 1; k < pts.length; k++) {
    const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    seg.push(d);
    total += d;
  }
  const out: Pt[] = [];
  for (let j = 1; j <= n; j++) {
    let t = (total * j) / (n + 1);
    let k = 0;
    while (k < seg.length - 1 && t > seg[k]) t -= seg[k++];
    const f = seg[k] ? t / seg[k] : 0;
    const [ax, ay] = pts[k];
    const [bx, by] = pts[k + 1];
    out.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
  }
  return out;
}

/* ---------------- the road ---------------- */

const START: Pt = [6.4, 0.6];
const FORK1: Pt = [0.6, 1.7];
const MERGE1: Pt = [5.8, 1.7];
const FORK2: Pt = [6.4, 6.6];
const MERGE2: Pt = [1.2, 6.6];
const RETIRE: Pt = [6.4, 9.3];

const ROADS: Record<LifeZone, Pt[]> = {
  school: [START, [0.6, 0.6], FORK1],
  work: [FORK1, MERGE1],
  // the graduation space ends the university road; a plain stretch of road leads on to the merge
  uni: [FORK1, [0.6, 2.75], [1.15, 3.25], [5.0, 3.25]],
  career: [MERGE1, [6.4, 2.45], [6.4, 3.75], [5.85, 4.35], [1.15, 4.35], [0.6, 4.95], [1.15, 5.55], [5.85, 5.55], [6.4, 6.15], FORK2],
  adventure: [FORK2, MERGE2],
  quiet: [FORK2, [6.4, 7.65], [5.85, 8.15], [2.3, 8.15]],
  final: [MERGE2, [0.6, 7.35], [0.6, 8.7], [1.15, 9.3], RETIRE],
};

/** What is on each stretch of road (in walking order). `final` ends with the retirement space. */
const SPACES: Record<LifeLength, Record<LifeZone, LifeKind[]>> = {
  normal: {
    school: ['event', 'family', 'event', 'event'],
    work: ['payday', 'event', 'payday', 'event'],
    uni: ['event', 'event', 'family', 'event', 'event', 'event', 'grad'],
    career: ['event', 'insure', 'family', 'event', 'payday', 'event', 'house', 'event', 'raise', 'payday', 'event', 'family'],
    adventure: ['risk', 'event', 'risk', 'payday', 'risk'],
    quiet: ['event', 'family', 'payday', 'event', 'raise', 'event', 'payday'],
    final: ['event', 'family', 'event', 'payday', 'event', 'retire'],
  },
  short: {
    school: ['event', 'family'],
    work: ['payday', 'event'],
    uni: ['event', 'family', 'event', 'grad'],
    career: ['event', 'insure', 'payday', 'house', 'family', 'raise', 'event'],
    adventure: ['risk', 'payday', 'risk'],
    quiet: ['event', 'family', 'payday', 'raise', 'event'],
    final: ['event', 'payday', 'retire'],
  },
};

const LABELS: LifeBoard['labels'] = [
  { text: 'المدرسة', x: 3.6, y: 1.15, zone: 'school' },
  { text: 'العمل مباشرة', x: 3.2, y: 2.2, zone: 'work' },
  { text: 'الجامعة', x: 2.6, y: 2.75, zone: 'uni' },
  { text: 'الحياة المهنية', x: 3.5, y: 4.95, zone: 'career' },
  { text: 'طريق المغامرة', x: 3.8, y: 7.1, zone: 'adventure' },
  { text: 'الطريق الهادئ', x: 4.3, y: 7.65, zone: 'quiet' },
  { text: 'التقاعد', x: 3.8, y: 8.75, zone: 'final' },
];

const cache = new Map<LifeLength, LifeBoard>();

export function lifeBoard(length: LifeLength): LifeBoard {
  const hit = cache.get(length);
  if (hit) return hit;
  const sp = SPACES[length];
  const nodes: LifeNode[] = [];
  const add = (kind: LifeKind, zone: LifeZone, p: Pt) => {
    nodes.push({ i: nodes.length, kind, zone, x: p[0], y: p[1], next: [] });
    return nodes.length - 1;
  };
  /** lay a stretch of road; returns [first, last] node index */
  const lay = (zone: LifeZone, kinds: LifeKind[], from: number) => {
    const road = ROADS[zone];
    // roads that stop short of the next junction put their last space at the very end
    const open = zone === 'uni' || zone === 'quiet';
    const pts = open ? [...spread(road, kinds.length - 1), road[road.length - 1]] : spread(road, kinds.length);
    let prev = from;
    let first = -1;
    kinds.forEach((k, j) => {
      const i = add(k, zone, pts[j]);
      nodes[prev].next.push(i);
      if (first < 0) first = i;
      prev = i;
    });
    return [first, prev];
  };

  const start = add('start', 'school', START);
  const [, school] = lay('school', sp.school, start);
  const fork1 = add('fork', 'school', FORK1);
  nodes[school].next.push(fork1);
  // fork order: [university, work]
  const [, uni] = lay('uni', sp.uni, fork1);
  const [, work] = lay('work', sp.work, fork1);
  const merge1 = add('payday', 'career', MERGE1);
  nodes[uni].next.push(merge1);
  nodes[work].next.push(merge1);
  const [, career] = lay('career', sp.career, merge1);
  const fork2 = add('fork', 'career', FORK2);
  nodes[career].next.push(fork2);
  // fork order: [adventure, quiet]
  const [, adv] = lay('adventure', sp.adventure, fork2);
  const [, quiet] = lay('quiet', sp.quiet, fork2);
  const merge2 = add('payday', 'final', MERGE2);
  nodes[adv].next.push(merge2);
  nodes[quiet].next.push(merge2);
  // the retirement space sits exactly at the end of the road
  const [, last] = lay('final', sp.final.slice(0, -1), merge2);
  const retire = add('retire', 'final', RETIRE);
  nodes[last].next.push(retire);

  const board: LifeBoard = { nodes, width: LIFE_W, height: LIFE_H, labels: LABELS, fork1, fork2 };
  cache.set(length, board);
  return board;
}

/** Spaces left from `pos` to retirement, along the shortest way. */
export function lifeStepsLeft(board: LifeBoard, pos: number): number {
  const nx = board.nodes[pos].next;
  if (!nx.length) return 0;
  return 1 + Math.min(...nx.map((i) => lifeStepsLeft(board, i)));
}

/** How many paydays are still ahead of `pos` (counting the fewest on any way). */
export function lifePaydaysLeft(board: LifeBoard, pos: number): number {
  const nx = board.nodes[pos].next;
  if (!nx.length) return 0;
  return Math.min(...nx.map((i) => (board.nodes[i].kind === 'payday' ? 1 : 0) + lifePaydaysLeft(board, i)));
}
