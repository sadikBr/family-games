/**
 * «المستوطنون» — the server state and the pure rule helpers (legal spots, longest road, points, ports),
 * shared by the game module (server/games/catan.ts) and the bots (server/catan-bot.ts).
 */
import type {
  CatanDevKind,
  CatanHexType,
  CatanLog,
  CatanPhase,
  CatanPortKind,
  CatanRes,
  CatanResMap,
  CatanSettings,
  CatanTrade,
  CatanView,
} from '../src/shared/games/catan';
import {
  BANK_EACH,
  BEGINNER,
  DEV_DECK,
  EDGES,
  EDGE_COUNT,
  HEX_COUNT,
  HEX_TYPES,
  HEX_VERTS,
  NUMBERS,
  PIECES,
  PORT_KINDS,
  PORT_SLOTS,
  RES,
  VERT_COUNT,
  VERT_EDGES,
  VERT_HEXES,
  VERT_NEIGHBORS,
  emptyRes,
  redsApart,
  resTotal,
} from '../src/shared/catan-board';
import { shuffle } from './util';

export interface DevCard {
  k: CatanDevKind;
  /** the turn it was bought (it can't be played on that turn) */
  turn: number;
}

export interface State {
  settings: CatanSettings;
  order: string[];
  names: Record<string, string>;
  /** players who left the room: pieces stay, turns are skipped */
  gone: string[];
  phase: CatanPhase;
  hexes: CatanHexType[];
  nums: (number | null)[];
  ports: CatanPortKind[];
  robber: number;
  buildings: ({ s: number; city: boolean } | null)[];
  roads: number[];
  hands: Record<string, CatanResMap>;
  devs: Record<string, DevCard[]>;
  knights: Record<string, number>;
  deck: CatanDevKind[];
  bank: CatanResMap;
  turn: string;
  turnNo: number;
  dice: [number, number] | null;
  rollId: number;
  /** setup: the snake order, the step in it, what is placed now and the settlement just placed */
  setupList: string[];
  setupStep: number;
  setupNeed: 'settlement' | 'road';
  setupAt: number | null;
  discard: Record<string, number>;
  victims: string[];
  /** the phase to go back to after the robber / free roads (a card can be played before rolling) */
  resume: 'roll' | 'main';
  freeRoads: number;
  devPlayed: boolean;
  trade: CatanTrade | null;
  tradeSeq: number;
  longest: string | null;
  army: string | null;
  log: CatanLog[];
  logSeq: number;
  endsAt: number | null;
  /** bumps on every change: bot moves planned for an older state are dropped */
  seq: number;
  final: CatanView['final'];
  /** the turn each bot last offered a trade to the players */
  botOffered: Record<string, number>;
  /** tests: dice to roll next */
  rig?: [number, number][];
}

export const LOG_KEEP = 40;

/* ------------------------------------------------------------------ */
/* Board set-up                                                        */
/* ------------------------------------------------------------------ */

export function makeBoard(layout: CatanSettings['layout']): { hexes: CatanHexType[]; nums: (number | null)[]; ports: CatanPortKind[] } {
  if (layout === 'beginner') return { hexes: BEGINNER.hexes.slice(), nums: BEGINNER.nums.slice(), ports: BEGINNER.ports.slice() };
  const hexes = shuffle(HEX_TYPES);
  for (let tries = 0; tries < 5000; tries++) {
    const tokens = shuffle(NUMBERS);
    const nums = hexes.map((t) => (t === 'desert' ? null : tokens.pop()!));
    if (redsApart(nums)) return { hexes, nums, ports: shuffle(PORT_KINDS) };
  }
  // practically unreachable: fall back on the beginners' board
  return { hexes: BEGINNER.hexes.slice(), nums: BEGINNER.nums.slice(), ports: BEGINNER.ports.slice() };
}

export function newState(participants: string[], settings: CatanSettings, names: Record<string, string>): State {
  const order = shuffle(participants);
  const board = makeBoard(settings.layout);
  const bank = emptyRes();
  for (const r of RES) bank[r] = BANK_EACH;
  return {
    settings: { ...settings },
    order,
    names,
    gone: [],
    phase: 'setup',
    ...board,
    robber: board.hexes.indexOf('desert'),
    buildings: new Array(VERT_COUNT).fill(null),
    roads: new Array(EDGE_COUNT).fill(-1),
    hands: Object.fromEntries(order.map((id) => [id, emptyRes()])),
    devs: Object.fromEntries(order.map((id) => [id, []])),
    knights: Object.fromEntries(order.map((id) => [id, 0])),
    deck: shuffle(DEV_DECK),
    bank,
    turn: order[0],
    turnNo: 0,
    dice: null,
    rollId: 0,
    setupList: [...order, ...order.slice().reverse()],
    setupStep: 0,
    setupNeed: 'settlement',
    setupAt: null,
    discard: {},
    victims: [],
    resume: 'main',
    freeRoads: 0,
    devPlayed: false,
    trade: null,
    tradeSeq: 0,
    longest: null,
    army: null,
    log: [],
    logSeq: 0,
    endsAt: null,
    seq: 0,
    final: null,
    botOffered: {},
  };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export const seatOf = (s: State, id: string) => s.order.indexOf(id);
export const isActive = (s: State, id: string) => s.order.includes(id) && !s.gone.includes(id);
export const activePlayers = (s: State) => s.order.filter((id) => !s.gone.includes(id));

type LogEntry = CatanLog extends infer T ? (T extends unknown ? Omit<T, 'id'> : never) : never;

export function addLog(s: State, e: LogEntry) {
  s.log.push({ ...e, id: ++s.logSeq } as CatanLog);
  if (s.log.length > LOG_KEEP) s.log.shift();
}

export const canAfford = (hand: CatanResMap, cost: CatanResMap) => RES.every((r) => hand[r] >= cost[r]);
export const missing = (hand: CatanResMap, cost: CatanResMap) => RES.reduce((a, r) => a + Math.max(0, cost[r] - hand[r]), 0);

export function pay(s: State, id: string, cost: CatanResMap) {
  for (const r of RES) {
    s.hands[id][r] -= cost[r];
    s.bank[r] += cost[r];
  }
}

export const cardCount = (s: State, id: string) => resTotal(s.hands[id]);

export function piecesLeft(s: State, id: string) {
  const seat = seatOf(s, id);
  let settlement = 0;
  let city = 0;
  for (const b of s.buildings) {
    if (!b || b.s !== seat) continue;
    if (b.city) city++;
    else settlement++;
  }
  const road = s.roads.filter((r) => r === seat).length;
  return { road: PIECES.road - road, settlement: PIECES.settlement - settlement, city: PIECES.city - city, built: { road, settlement, city } };
}

/** Points everyone can see. */
export function publicVp(s: State, id: string) {
  const { built } = piecesLeft(s, id);
  return built.settlement + 2 * built.city + (s.longest === id ? 2 : 0) + (s.army === id ? 2 : 0);
}

export const vpCards = (s: State, id: string) => s.devs[id].filter((d) => d.k === 'vp').length;
export const totalVp = (s: State, id: string) => publicVp(s, id) + vpCards(s, id);

/** Is intersection v free for a settlement (empty, and no building on a neighbouring intersection)? */
export function spacedOk(s: State, v: number) {
  return !s.buildings[v] && VERT_NEIGHBORS[v].every((n) => !s.buildings[n]);
}

export function legalSettlements(s: State, seat: number, setup: boolean): number[] {
  const out: number[] = [];
  for (let v = 0; v < VERT_COUNT; v++) {
    if (!spacedOk(s, v)) continue;
    if (!setup && !VERT_EDGES[v].some((e) => s.roads[e] === seat)) continue;
    out.push(v);
  }
  return out;
}

export function legalCities(s: State, seat: number): number[] {
  const out: number[] = [];
  s.buildings.forEach((b, v) => {
    if (b && b.s === seat && !b.city) out.push(v);
  });
  return out;
}

/** Can `seat` build a road on path e (connected to its own building or road, not through an opponent's building)? */
export function roadOk(s: State, seat: number, e: number) {
  if (s.roads[e] !== -1) return false;
  return EDGES[e].some((v) => {
    const b = s.buildings[v];
    if (b) return b.s === seat;
    return VERT_EDGES[v].some((x) => x !== e && s.roads[x] === seat);
  });
}

export function legalRoads(s: State, seat: number): number[] {
  if (s.phase === 'setup') {
    if (s.setupNeed !== 'road' || s.setupAt === null) return [];
    return VERT_EDGES[s.setupAt].filter((e) => s.roads[e] === -1);
  }
  const out: number[] = [];
  for (let e = 0; e < EDGE_COUNT; e++) if (roadOk(s, seat, e)) out.push(e);
  return out;
}

/** The longest continuous road of a seat (a road is broken by another player's building). */
export function longestRoad(s: State, seat: number): number {
  const used = new Set<number>();
  let best = 0;
  const blocked = (v: number) => {
    const b = s.buildings[v];
    return !!b && b.s !== seat;
  };
  const dfs = (v: number, len: number) => {
    if (len > best) best = len;
    if (len > 0 && blocked(v)) return;
    for (const e of VERT_EDGES[v]) {
      if (s.roads[e] !== seat || used.has(e)) continue;
      used.add(e);
      const [a, b] = EDGES[e];
      dfs(a === v ? b : a, len + 1);
      used.delete(e);
    }
  };
  const starts = new Set<number>();
  s.roads.forEach((r, e) => {
    if (r === seat) for (const v of EDGES[e]) starts.add(v);
  });
  for (const v of starts) dfs(v, 0);
  return best;
}

/** Bank trade ratio per resource for a seat (harbours it has a building on). */
export function ratios(s: State, seat: number): CatanResMap {
  const out = emptyRes();
  for (const r of RES) out[r] = 4;
  PORT_SLOTS.forEach((p, i) => {
    if (!p.verts.some((v) => s.buildings[v]?.s === seat)) return;
    const k = s.ports[i];
    if (k === 'any') {
      for (const r of RES) out[r] = Math.min(out[r], 3);
    } else out[k] = 2;
  });
  return out;
}

/** Hexes touching an intersection that produce something. */
export const vertResources = (s: State, v: number) => VERT_HEXES[v].map((h) => s.hexes[h]).filter((t): t is CatanRes => t !== 'desert');

/** Players (other than `by`, still in the game, with cards) who have a building on hex h. */
export function victimsAt(s: State, by: string, h: number): string[] {
  const seats = new Set<number>();
  for (const v of HEX_VERTS[h]) {
    const b = s.buildings[v];
    if (b) seats.add(b.s);
  }
  return [...seats]
    .map((i) => s.order[i])
    .filter((id) => id !== by && isActive(s, id) && cardCount(s, id) > 0);
}

export const HEX_IDS = Array.from({ length: HEX_COUNT }, (_, i) => i);
