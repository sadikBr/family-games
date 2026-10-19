/**
 * «المستوطنون» — the bots. «سهل» is the previous bot (server/catan-bot-easy.ts); «ذكي» and «خبير» plan:
 *
 * - Opening: every intersection is scored by its pips weighted by how scarce each resource is on this
 *   board, the spread of resources and numbers, and harbours that fit. The first settlement looks ahead:
 *   the other players' picks before our second one are simulated greedily, and the pair (first + best
 *   second left) is scored as a whole (wood+brick to expand, ore+grain for cities and cards).
 * - The turn: every project is listed (a city on each settlement, a settlement on every free spot within
 *   3 roads — discounted when another player is closer —, a development card, the longest road when a
 *   few roads take it) with its value in points (production counts more early) and its cost; the time to
 *   afford it is estimated from the expected production per round and the bank / harbour ratios. The bot
 *   works on the project with the best value per turn: builds its next piece, trades with the bank only
 *   when that completes the step, offers the players a 1-for-1 for the missing card, and spends spare cards
 *   only when that hardly delays the project (or a 7 threatens a big hand). A build that wins comes first.
 * - Development cards: knights early (always when the robber blocks the bot or the army is in reach),
 *   monopoly on the resource the others hold most (19 − bank − own hand: public knowledge), year of plenty
 *   when it completes a build, road building when a road project is on.
 * - The robber goes on the hex that hurts the leading players most (points, hidden cards), never on the
 *   bot's own, and steals from the strongest; discards keep what the projects need; offers are accepted
 *   only when they bring the bot closer to a project by a clear margin, never from someone close to winning.
 * Bots use only what their own phone shows: their hand and cards, the board, card counts, the bank.
 */
import type { CatanDevKind, CatanRes, CatanResMap, CatanTrade } from '../src/shared/games/catan';
import type { BotLevel } from '../src/shared/protocol';
import { COST, EDGES, HEX_COUNT, HEX_VERTS, PORT_SLOTS, RES, VERT_COUNT, VERT_EDGES, VERT_HEXES, emptyRes, pips, resTotal } from '../src/shared/catan-board';
import { randDelay } from './cardkit';
import * as easy from './catan-bot-easy';
import {
  activePlayers,
  canAfford,
  cardCount,
  isActive,
  legalCities,
  legalRoads,
  legalSettlements,
  longestRoad,
  missing,
  piecesLeft,
  publicVp,
  ratios,
  roadOk,
  seatOf,
  spacedOk,
  totalVp,
  victimsAt,
  type State,
} from './catan-rules';

type Action = { type: string; [k: string]: unknown };
export interface BotPlan {
  key: string;
  delay: number;
  action: Action;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sub = (a: CatanResMap, b: CatanResMap): CatanResMap => {
  const out = { ...a };
  for (const r of RES) out[r] -= b[r];
  return out;
};
const add = (a: CatanResMap, b: CatanResMap): CatanResMap => {
  const out = { ...a };
  for (const r of RES) out[r] += b[r];
  return out;
};
const times = (a: CatanResMap, n: number): CatanResMap => {
  const out = { ...a };
  for (const r of RES) out[r] *= n;
  return out;
};

/* ------------------------------------------------------------------ */
/* What the bot knows                                                  */
/* ------------------------------------------------------------------ */

interface Know {
  s: State;
  id: string;
  seat: number;
  level: BotLevel;
  hand: CatanResMap;
  /** expected cards per round (from one of my turns to the next) */
  rate: CatanResMap;
  /** my pips per resource (robber ignored) */
  pipsBy: CatanResMap;
  ratio: CatanResMap;
  /** my points, hidden victory cards included */
  vp: number;
  left: ReturnType<typeof piecesLeft>;
  /** board-wide weight of each resource (scarce ones count more) */
  scarce: CatanResMap;
  /** how much a pip of production is worth in points now */
  kappa: number;
  noise: number;
}

/** Board-wide scarcity: resources with fewer pips on this board are worth more. */
function scarcity(s: State): CatanResMap {
  const tot = emptyRes();
  for (let h = 0; h < HEX_COUNT; h++) {
    const t = s.hexes[h];
    if (t !== 'desert') tot[t] += pips(s.nums[h]);
  }
  const avg = RES.reduce((a, r) => a + tot[r], 0) / RES.length;
  const out = emptyRes();
  for (const r of RES) out[r] = clamp(Math.sqrt(avg / Math.max(1, tot[r])), 0.8, 1.4);
  return out;
}

function production(s: State, seat: number, n: number) {
  const rate = emptyRes();
  const pipsBy = emptyRes();
  s.buildings.forEach((b, v) => {
    if (!b || b.s !== seat) return;
    for (const h of VERT_HEXES[v]) {
      const t = s.hexes[h];
      if (t === 'desert') continue;
      const p = pips(s.nums[h]) * (b.city ? 2 : 1);
      pipsBy[t] += p;
      rate[t] += (p / 36) * n * (h === s.robber ? 0.25 : 1);
    }
  });
  return { rate, pipsBy };
}

function know(s: State, id: string, level: BotLevel): Know {
  const seat = seatOf(s, id);
  const n = Math.max(2, activePlayers(s).length);
  const { rate, pipsBy } = production(s, seat, n);
  const vp = totalVp(s, id);
  const togo = s.settings.target - vp;
  return {
    s,
    id,
    seat,
    level,
    hand: s.hands[id],
    rate,
    pipsBy,
    ratio: ratios(s, seat),
    vp,
    left: piecesLeft(s, id),
    scarce: scarcity(s),
    kappa: 0.1 * clamp(togo / 5, 0.15, 1.3),
    noise: level === 'smart' ? 0.35 : 0,
  };
}

/** How dangerous another player looks (points everyone sees, plus hidden development cards). */
function threat(s: State, o: string) {
  return publicVp(s, o) + 0.3 * s.devs[o].length;
}

/** Someone close to winning: bots don't trade with them. */
const nearWin = (s: State, id: string) => publicVp(s, id) >= s.settings.target - 2;

/**
 * Turns (rounds) until `hand` covers `cost`, counting the expected production and bank trades of the
 * surplus at my ratios. 0 = now; a little more when trades are needed now.
 */
function eta(k: Know, hand: CatanResMap, cost: CatanResMap): number {
  if (canAfford(hand, cost)) return 0;
  const ok = (t: number) => {
    let def = 0;
    let sur = 0;
    for (const r of RES) {
      const have = hand[r] + k.rate[r] * t;
      if (have < cost[r]) def += cost[r] - have;
      else sur += Math.floor((have - cost[r]) / k.ratio[r]);
    }
    return sur >= def - 1e-9;
  };
  if (ok(0)) return 0.15;
  const cap = 20;
  if (!ok(cap)) return cap + missing(hand, cost);
  let lo = 0;
  let hi = cap;
  for (let i = 0; i < 9; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) hi = m;
    else lo = m;
  }
  return hi;
}

/* ------------------------------------------------------------------ */
/* Spots and paths                                                     */
/* ------------------------------------------------------------------ */

const portAt = (v: number) => PORT_SLOTS.findIndex((p) => p.verts.includes(v));

/** A new settlement at v for me, in weighted pips (new resources and fitting harbours count more). */
function spotPips(k: Know, v: number): number {
  const { s } = k;
  let val = 0;
  const here = emptyRes();
  for (const h of VERT_HEXES[v]) {
    const t = s.hexes[h];
    if (t === 'desert') continue;
    let p = pips(s.nums[h]);
    here[t] += p;
    if (h === s.robber) p *= 0.6;
    const w = k.scarce[t] * (k.pipsBy[t] === 0 ? 1.45 : k.pipsBy[t] < 4 ? 1.15 : 1);
    val += p * w;
  }
  const slot = portAt(v);
  if (slot >= 0) {
    const kind = s.ports[slot];
    if (kind === 'any') val += k.ratio.wood === 4 && k.ratio.ore === 4 ? 1.6 : 0.6;
    else if (k.ratio[kind] > 2) val += Math.min(7, k.pipsBy[kind] + here[kind]) * 0.4;
  }
  return val;
}

/** Upgrading the settlement at v: the pips it doubles. */
function cityPips(k: Know, v: number): number {
  const { s } = k;
  let val = 0;
  for (const h of VERT_HEXES[v]) {
    const t = s.hexes[h];
    if (t === 'desert') continue;
    val += pips(s.nums[h]) * k.scarce[t] * (h === s.robber ? 0.6 : 1) * (t === 'ore' || t === 'grain' ? 1.1 : 1);
  }
  return val;
}

/** Free intersections reachable from a seat's network within `maxDepth` new roads, with the path. */
function reach(s: State, seat: number, maxDepth: number): Map<number, number[]> {
  const blocked = (v: number) => {
    const b = s.buildings[v];
    return !!b && b.s !== seat;
  };
  const paths = new Map<number, number[]>();
  let frontier: number[] = [];
  for (let v = 0; v < VERT_COUNT; v++) {
    if (blocked(v)) continue;
    if (s.buildings[v]?.s === seat || VERT_EDGES[v].some((e) => s.roads[e] === seat)) {
      paths.set(v, []);
      frontier.push(v);
    }
  }
  for (let d = 1; d <= maxDepth && frontier.length; d++) {
    const next: number[] = [];
    for (const v of frontier) {
      const pv = paths.get(v)!;
      for (const e of VERT_EDGES[v]) {
        if (s.roads[e] !== -1) continue;
        const w = EDGES[e][0] === v ? EDGES[e][1] : EDGES[e][0];
        if (paths.has(w) || blocked(w)) continue;
        paths.set(w, [...pv, e]);
        next.push(w);
      }
    }
    frontier = next;
  }
  return paths;
}

/** For every intersection, the fewest roads another player needs to reach it (within 3). */
function rivalDepth(k: Know): number[] {
  const out = new Array<number>(VERT_COUNT).fill(99);
  for (const o of activePlayers(k.s)) {
    if (o === k.id) continue;
    if (piecesLeft(k.s, o).settlement <= 0) continue;
    for (const [v, p] of reach(k.s, seatOf(k.s, o), 3)) out[v] = Math.min(out[v], p.length);
  }
  return out;
}

/** My longest road if I also had these roads. */
function roadWith(s: State, seat: number, extra: number[]): number {
  for (const e of extra) s.roads[e] = seat;
  const n = longestRoad(s, seat);
  for (const e of extra) s.roads[e] = -1;
  return n;
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

interface Project {
  kind: 'city' | 'settle' | 'dev' | 'longest';
  v: number;
  /** roads still to build first (settlements further away, the longest road) */
  path: number[];
  cost: CatanResMap;
  value: number;
  u: number;
}

function devValue(k: Know): number {
  const { s, id } = k;
  const held = s.devs[id].filter((d) => d.k === 'knight').length;
  const mine = s.knights[id] + held + 1;
  const holder = s.army && s.army !== id ? s.knights[s.army] : 2;
  let v = 1;
  if (s.army !== id && mine >= 3 && mine > holder && mine <= holder + 2) v += 0.35;
  if (!k.left.settlement && !k.left.city) v += 0.6;
  return v;
}

function projects(k: Know, rnd: () => number = Math.random): Project[] {
  const { s, id, seat, left } = k;
  const out: Project[] = [];
  const target = s.settings.target;
  const push = (p: Omit<Project, 'u'>) => {
    let u = p.value / (1 + eta(k, k.hand, p.cost));
    if (k.noise) u *= 1 + k.noise * (rnd() - 0.5);
    out.push({ ...p, u });
  };
  if (left.city > 0) {
    for (const v of legalCities(s, seat)) {
      push({ kind: 'city', v, path: [], cost: { ...COST.city }, value: 1 + k.kappa * cityPips(k, v) + (left.settlement === 0 ? 0.5 : 0) + (k.vp + 1 >= target ? 5 : 0) });
    }
  }
  if (left.settlement > 0) {
    const rival = rivalDepth(k);
    for (const [v, path] of reach(s, seat, Math.min(3, left.road))) {
      if (!spacedOk(s, v)) continue;
      if (!path.length && !VERT_EDGES[v].some((e) => s.roads[e] === seat)) continue;
      const d = path.length;
      let f = 1 - 0.06 * d;
      if (rival[v] < d) f *= 0.4;
      else if (rival[v] === d && d > 0) f *= 0.7;
      const win = !d && k.vp + 1 >= target ? 5 : 0;
      const cost = add(COST.settlement, times(COST.road, d));
      push({ kind: 'settle', v, path, cost, value: (1 + k.kappa * spotPips(k, v)) * f + win });
    }
  }
  if (s.deck.length) push({ kind: 'dev', v: -1, path: [], cost: { ...COST.dev }, value: devValue(k) });
  // the longest road: a few roads that take (or keep) it
  if (left.road > 0) {
    const others = activePlayers(s).filter((o) => o !== id);
    const best = Math.max(0, ...others.map((o) => longestRoad(s, seatOf(s, o))));
    const mine = longestRoad(s, seat);
    const goal = Math.max(5, best + 1);
    const need = goal - mine;
    const holding = s.longest === id;
    if ((!holding && need >= 1 && need <= Math.min(3, left.road) && mine >= 2) || (holding && best >= mine - 1)) {
      const path: number[] = [];
      const steps = holding ? 1 : need;
      for (let i = 0; i < steps; i++) {
        for (const e of path) s.roads[e] = seat;
        const legal = legalRoads(s, seat);
        for (const e of path) s.roads[e] = -1;
        let pick = -1;
        let len = -1;
        for (const e of legal) {
          if (path.includes(e)) continue;
          const l = roadWith(s, seat, [...path, e]);
          if (l > len) {
            len = l;
            pick = e;
          }
        }
        if (pick < 0) break;
        path.push(pick);
      }
      const got = path.length ? roadWith(s, seat, path) : mine;
      if (path.length && (holding ? got > mine : got >= goal)) {
        const leader = others.length ? others.reduce((a, b) => (threat(s, a) >= threat(s, b) ? a : b)) : null;
        let value = holding ? 0.9 : 1 + (s.longest && s.longest === leader ? 0.6 : 0);
        if (!holding && k.vp + 2 >= target) value += 5;
        push({ kind: 'longest', v: -1, path, cost: times(COST.road, path.length), value });
      }
    }
  }
  return out.sort((a, b) => b.u - a.u);
}

/** The next piece of a project: what to send and what it costs. */
function nextStep(p: Project): { action: Action; cost: CatanResMap } {
  if (p.path.length) return { action: { type: 'road', e: p.path[0] }, cost: { ...COST.road } };
  if (p.kind === 'city') return { action: { type: 'city', v: p.v }, cost: { ...COST.city } };
  if (p.kind === 'settle') return { action: { type: 'settle', v: p.v }, cost: { ...COST.settlement } };
  return { action: { type: 'buy' }, cost: { ...COST.dev } };
}

function stepLegal(k: Know, a: Action): boolean {
  const { s, seat, left } = k;
  switch (a.type) {
    case 'road':
      return left.road > 0 && roadOk(s, seat, a.e as number);
    case 'settle':
      return left.settlement > 0 && legalSettlements(s, seat, false).includes(a.v as number);
    case 'city':
      return left.city > 0 && legalCities(s, seat).includes(a.v as number);
    case 'buy':
      return s.deck.length > 0;
  }
  return false;
}

/** How well a hand serves the projects (the best value per turn). */
function handScore(k: Know, list: Project[], hand: CatanResMap): number {
  let best = 0;
  for (const p of list) best = Math.max(best, p.value / (1 + eta(k, hand, p.cost)));
  return best + 0.01 * resTotal(hand);
}

/* ------------------------------------------------------------------ */
/* Trading                                                             */
/* ------------------------------------------------------------------ */

function bankTradesThisTurn(s: State, id: string): number {
  let n = 0;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (e.t === 'roll') break;
    if (e.t === 'bank' && e.p === id) n++;
  }
  return n;
}

/** One bank trade that helps cover `step` now (all of it, with the surplus beyond `keep`). */
function bankToward(k: Know, step: CatanResMap, keep: CatanResMap): Action | null {
  const { s, hand, ratio } = k;
  if (bankTradesThisTurn(s, k.id) >= 5) return null;
  const lack = RES.filter((r) => hand[r] < step[r]);
  if (!lack.length || lack.some((r) => s.bank[r] < step[r] - hand[r])) return null;
  const short = lack.reduce((a, r) => a + step[r] - hand[r], 0);
  const reserve = (r: CatanRes) => Math.max(step[r], keep[r]);
  let trades = 0;
  for (const r of RES) trades += Math.floor(Math.max(0, hand[r] - reserve(r)) / ratio[r]);
  if (trades < short) return null;
  const give = RES.filter((r) => hand[r] - reserve(r) >= ratio[r]).sort((a, b) => (hand[b] - reserve(b)) / ratio[b] - (hand[a] - reserve(a)) / ratio[a] || k.rate[b] - k.rate[a])[0];
  const get = lack.sort((a, b) => step[b] - hand[b] - (step[a] - hand[a]))[0];
  return give ? { type: 'bank', give, get } : null;
}

/** Offer the players a 1-for-1 for the missing cards (once a turn). */
function offerToward(k: Know, step: CatanResMap, keep: CatanResMap, big = false): Action | null {
  const { s, hand, id } = k;
  if (s.botOffered[id] === s.turnNo) return null;
  const partners = activePlayers(s).filter((o) => o !== id && !nearWin(s, o) && cardCount(s, o) > 0);
  if (!partners.length) return null;
  const want = emptyRes();
  for (const r of RES) want[r] = Math.max(0, step[r] - hand[r]);
  const n = resTotal(want);
  if (!n || n > 2) return null;
  // what the others produce least is what they are most likely to want (production is public)
  const theirs = emptyRes();
  for (const o of partners) {
    const p = production(s, seatOf(s, o), 1).pipsBy;
    for (const r of RES) theirs[r] += p[r];
  }
  const give = emptyRes();
  const spare = RES.map((r) => ({ r, n: hand[r] - Math.max(step[r], keep[r]) })).filter((x) => x.n > 0 && !want[x.r]);
  // one card short of a city or a settlement: offer two for it (cheaper than the bank's 3 or 4)
  let left = n === 1 && big && spare.reduce((a, x) => a + x.n, 0) >= 2 && RES.every((r) => !want[r] || k.ratio[r] >= 3) ? 2 : n;
  while (left > 0) {
    spare.sort((a, b) => (b.n > 0 ? 1 : 0) - (a.n > 0 ? 1 : 0) || theirs[a.r] - theirs[b.r] || b.n - a.n);
    if (!spare.length || spare[0].n <= 0) return null;
    give[spare[0].r]++;
    spare[0].n--;
    left--;
  }
  return { type: 'offer', give, want };
}

/** Would this bot accept an offer (it gives `want`, it gets `give`)? */
export function wouldAccept(s: State, id: string, t: CatanTrade, level: BotLevel = 'expert'): boolean {
  if (level === 'easy') return easy.wouldAccept(s, id, t);
  if (nearWin(s, t.from)) return false;
  const hand = s.hands[id];
  if (!canAfford(hand, t.want)) return false;
  const gives = resTotal(t.want);
  const gets = resTotal(t.give);
  if (gives > gets + 1) return false;
  const k = know(s, id, level);
  const list = projects(k, () => 0.5);
  const before = handScore(k, list, hand);
  const after = handScore(k, list, add(sub(hand, t.want), t.give));
  // don't feed the leader: ask more from the strongest player
  const others = activePlayers(s).filter((o) => o !== id);
  const top = Math.max(...others.map((o) => threat(s, o)));
  let margin = 0.05 + 0.06 * Math.max(0, gives - gets);
  if (threat(s, t.from) >= top && threat(s, t.from) >= k.vp) margin += 0.1;
  return after > before + margin;
}

/** The bot that offered a trade takes the accepter who looks the least dangerous. */
export function pickAccepter(s: State, t: CatanTrade, level: BotLevel = 'expert'): string | null {
  if (level === 'easy') return easy.pickAccepter(s, t);
  const yes = Object.keys(t.answers).filter((id) => t.answers[id] && isActive(s, id) && canAfford(s.hands[id], t.want) && !nearWin(s, id));
  if (!yes.length) return null;
  return yes.sort((a, b) => threat(s, a) - threat(s, b))[0];
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

/** pips per resource at an intersection */
function pipsAt(s: State, v: number): CatanResMap {
  const out = emptyRes();
  for (const h of VERT_HEXES[v]) {
    const t = s.hexes[h];
    if (t !== 'desert') out[t] += pips(s.nums[h]);
  }
  return out;
}

/** A whole opening (one or two settlements) for one player. */
function openingValue(s: State, sc: CatanResMap, verts: number[]): number {
  const prod = emptyRes();
  const nums = new Map<number, number>();
  const ports: number[] = [];
  for (const v of verts) {
    const p = pipsAt(s, v);
    for (const r of RES) prod[r] += p[r];
    for (const h of VERT_HEXES[v]) if (s.nums[h]) nums.set(s.nums[h]!, (nums.get(s.nums[h]!) ?? 0) + 1);
    const slot = portAt(v);
    if (slot >= 0) ports.push(slot);
  }
  let val = 0;
  for (const r of RES) {
    const x = prod[r];
    val += sc[r] * (x <= 8 ? x : 8 + 0.45 * (x - 8));
  }
  const kinds = RES.filter((r) => prod[r] > 0).length;
  val += kinds * 1.1;
  if (prod.wood && prod.brick) val += 1.6;
  if (prod.ore && prod.grain) val += 1.4;
  if (prod.sheep && prod.grain && prod.ore) val += 0.6;
  // the same number twice: lumpier income
  for (const c of nums.values()) if (c > 1) val -= 0.35 * (c - 1);
  for (const slot of ports) {
    const kind = s.ports[slot];
    if (kind === 'any') val += 0.9;
    else if (prod[kind] >= 5) val += 1 + 0.25 * (prod[kind] - 5);
    else val += 0.2;
  }
  return val;
}

function setupSettlement(s: State, id: string, level: BotLevel, rnd: () => number): number {
  const seat = seatOf(s, id);
  const spots = legalSettlements(s, seat, true);
  const sc = scarcity(s);
  const mine = s.buildings.map((b, v) => (b?.s === seat ? v : -1)).filter((v) => v >= 0);
  const noise = level === 'smart' ? 1.2 : 0;
  const jit = () => (noise ? (rnd() - 0.5) * noise : 0);
  if (mine.length) {
    // the second settlement: the best pair, plus the starting cards it pays (wood and brick to start)
    let best = spots[0];
    let bestV = -Infinity;
    for (const v of spots) {
      const p = pipsAt(s, v);
      const start = VERT_HEXES[v].reduce((a, h) => a + (s.hexes[h] === 'wood' || s.hexes[h] === 'brick' ? 0.25 : s.hexes[h] === 'desert' ? 0 : 0.1), 0);
      const val = openingValue(s, sc, [...mine, v]) + start + 0.02 * (p.wood + p.brick) + jit();
      if (val > bestV) {
        bestV = val;
        best = v;
      }
    }
    return best;
  }
  const alone = spots.map((v) => ({ v, val: openingValue(s, sc, [v]) })).sort((a, b) => b.val - a.val);
  if (level !== 'expert') return alone[0].v;
  // look ahead: the others pick greedily until our second turn
  const step = s.setupStep;
  const between = Math.max(0, s.setupList.length - 1 - step - step - 1);
  let best = alone[0].v;
  let bestV = -Infinity;
  for (const { v, val } of alone.slice(0, 10)) {
    const taken = new Set<number>([v]);
    const free = (w: number) => !taken.has(w) && spacedOk(s, w) && !VERT_NEIGHBORS_OF(w).some((n) => taken.has(n));
    const pool = alone.filter((x) => x.v !== v);
    for (let i = 0; i < between; i++) {
      const pick = pool.find((x) => free(x.v));
      if (!pick) break;
      taken.add(pick.v);
    }
    let pair = 0;
    for (const x of pool) {
      if (!free(x.v)) continue;
      pair = Math.max(pair, openingValue(s, sc, [v, x.v]));
    }
    const total = pair + 0.15 * val;
    if (total > bestV) {
      bestV = total;
      best = v;
    }
  }
  return best;
}

const VERT_NEIGHBORS_OF = (v: number) => VERT_EDGES[v].map((e) => (EDGES[e][0] === v ? EDGES[e][1] : EDGES[e][0]));

export function botSetupSettlement(s: State, id: string, level: BotLevel = 'expert', rnd: () => number = Math.random): number {
  if (level === 'easy') return easy.botSetupSettlement(s, id);
  return setupSettlement(s, id, level, rnd);
}

/** The opening road heads for the best free spot two paths away (measured best of the variants tried). */
export function botSetupRoad(s: State, id: string, _level: BotLevel = 'expert'): number {
  return easy.botSetupRoad(s, id);
}

/* ------------------------------------------------------------------ */
/* The robber                                                          */
/* ------------------------------------------------------------------ */

function threatWeight(s: State, id: string, o: string): number {
  const others = activePlayers(s).filter((x) => x !== id);
  const top = Math.max(...others.map((x) => threat(s, x)));
  const t = threat(s, o);
  return 0.6 + (t / s.settings.target) * 2.4 + (t >= top ? 0.6 : 0) + (publicVp(s, o) >= s.settings.target - 2 ? 1.5 : 0);
}

function robberValue(s: State, id: string, h: number, sc: CatanResMap): number {
  const seat = seatOf(s, id);
  let dmg = 0;
  let mine = 0;
  let steal = 0;
  const t = s.hexes[h];
  const p = pips(s.nums[h]);
  for (const v of HEX_VERTS[h]) {
    const b = s.buildings[v];
    if (!b) continue;
    const mult = b.city ? 2 : 1;
    if (b.s === seat) {
      mine += p * mult;
      continue;
    }
    const o = s.order[b.s];
    if (!isActive(s, o)) continue;
    const w = threatWeight(s, id, o);
    dmg += p * mult * w * (t === 'desert' ? 0 : sc[t]);
    if (cardCount(s, o) > 0) steal = Math.max(steal, w * (1 + Math.min(cardCount(s, o), 8) * 0.05));
  }
  return dmg + 2 * steal - 6 * mine;
}

export function botRobber(s: State, id: string, level: BotLevel = 'expert'): number {
  if (level === 'easy') return easy.botRobber(s, id);
  const sc = scarcity(s);
  let best = -1;
  let bestV = -Infinity;
  for (let h = 0; h < HEX_COUNT; h++) {
    if (h === s.robber) continue;
    const v = robberValue(s, id, h, sc);
    if (v > bestV) {
      bestV = v;
      best = h;
    }
  }
  return best < 0 ? (s.robber + 1) % HEX_COUNT : best;
}

export function botVictim(s: State, id: string, level: BotLevel = 'expert'): string {
  if (level === 'easy') return easy.botVictim(s, id);
  const vs = s.victims.length ? s.victims : victimsAt(s, id, s.robber);
  const val = (o: string) => threatWeight(s, id, o) + 0.06 * Math.min(cardCount(s, o), 10);
  return vs.slice().sort((a, b) => val(b) - val(a))[0];
}

/* ------------------------------------------------------------------ */
/* Discards                                                            */
/* ------------------------------------------------------------------ */

/** Cards to give back: the ones whose loss hurts the projects least. */
export function autoDiscard(s: State, id: string, n: number, level: BotLevel = 'expert'): CatanResMap {
  if (level === 'easy') return easy.autoDiscard(s, id, n);
  const k = know(s, id, level);
  const list = projects(k, () => 0.5).slice(0, 12);
  const hand = { ...s.hands[id] };
  const out = emptyRes();
  for (let i = 0; i < n; i++) {
    let pick: CatanRes | null = null;
    let bestV = -Infinity;
    for (const r of RES) {
      if (hand[r] <= 0) continue;
      hand[r]--;
      const v = handScore(k, list, hand) + 0.002 * k.rate[r] + 0.0005 * hand[r];
      hand[r]++;
      if (v > bestV) {
        bestV = v;
        pick = r;
      }
    }
    if (!pick) break;
    hand[pick]--;
    out[pick]++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Development cards                                                   */
/* ------------------------------------------------------------------ */

function playable(s: State, id: string, k: CatanDevKind) {
  return !s.devPlayed && s.devs[id].some((d) => d.k === k && d.turn < s.turnNo);
}

/** My pips under the robber. */
function robbedPips(k: Know): number {
  const { s, seat } = k;
  if (s.nums[s.robber] === null) return 0;
  let n = 0;
  for (const v of HEX_VERTS[s.robber]) {
    const b = s.buildings[v];
    if (b?.s === seat) n += pips(s.nums[s.robber]) * (b.city ? 2 : 1);
  }
  return n;
}

/** Would one more knight win (or take) the largest army? */
function armyChance(s: State, id: string) {
  const k = s.knights[id] + 1;
  if (k < 3 || s.army === id) return false;
  return !s.army || s.knights[s.army] < k;
}

/** Someone else is close to taking the army from me / ahead of me. */
function armyRace(s: State, id: string) {
  const mine = s.knights[id];
  return activePlayers(s).some((o) => o !== id && s.knights[o] >= mine && s.knights[o] >= 1);
}

function knightNow(k: Know, phase: 'roll' | 'main'): boolean {
  const { s, id } = k;
  if (!playable(s, id, 'knight')) return false;
  if (armyChance(s, id)) return true;
  const robbed = robbedPips(k);
  if (phase === 'roll') return robbed >= 3;
  if (robbed >= 2) return true;
  const sc = scarcity(s);
  const here = robberValue(s, id, s.robber, sc);
  let best = -Infinity;
  for (let h = 0; h < HEX_COUNT; h++) if (h !== s.robber) best = Math.max(best, robberValue(s, id, h, sc));
  const held = s.devs[id].filter((d) => d.k === 'knight' && d.turn < s.turnNo).length;
  return best - here >= 6 || held >= 2 || (armyRace(s, id) && best - here >= 2);
}

function devPlay(k: Know, list: Project[]): Action | null {
  const { s, id, hand, seat } = k;
  if (s.devPlayed) return null;
  const target = s.settings.target;
  // a knight that takes the army and wins
  if (playable(s, id, 'knight') && armyChance(s, id) && k.vp + 2 >= target) return { type: 'play', k: 'knight' };
  const top = list[0];
  // year of plenty: two cards that complete a project
  if (playable(s, id, 'plenty')) {
    for (const p of list.slice(0, 4)) {
      const lack = RES.flatMap((r) => Array<CatanRes>(Math.max(0, p.cost[r] - hand[r])).fill(r));
      if (!lack.length || lack.length > 2) continue;
      const r1 = lack[0];
      const r2 = lack[1] ?? RES.filter((r) => s.bank[r] > (r === r1 ? 1 : 0)).sort((a, b) => k.rate[a] * k.ratio[a] - k.rate[b] * k.ratio[b] || b.localeCompare(a))[0];
      if (!r2) continue;
      const want = emptyRes();
      want[r1]++;
      want[r2]++;
      if (canAfford(s.bank, want)) return { type: 'play', k: 'plenty', r: r1, r2 };
    }
  }
  // monopoly: what the others hold is public (19 minus the bank minus my hand)
  if (playable(s, id, 'monopoly') && top) {
    let bestR: CatanRes | null = null;
    let bestG = 0;
    for (const r of RES) {
      const held = Math.max(0, 19 - s.bank[r] - hand[r]);
      const need = Math.max(0, top.cost[r] - hand[r]);
      const g = Math.min(held, need) + Math.max(0, held - need) * (1 / k.ratio[r]) * 0.9;
      if (g > bestG) {
        bestG = g;
        bestR = r;
      }
    }
    if (bestR && (bestG >= 3.5 || (bestG >= 2 && k.vp >= target - 2))) return { type: 'play', k: 'monopoly', r: bestR };
  }
  // road building: a road project is on
  if (playable(s, id, 'roads') && k.left.road > 0 && legalRoads(s, seat).length) {
    const roadsP = list.slice(0, 3).find((p) => p.path.length > 0 && (p.path.length >= 2 || !canAfford(hand, COST.road)));
    if (roadsP) return { type: 'play', k: 'roads' };
  }
  if (knightNow(k, 'main')) return { type: 'play', k: 'knight' };
  return null;
}

/* ------------------------------------------------------------------ */
/* One decision                                                        */
/* ------------------------------------------------------------------ */

function freeRoad(k: Know, list: Project[]): Action {
  const { s, seat } = k;
  const legal = legalRoads(s, seat);
  for (const p of list) if (p.path.length && legal.includes(p.path[0])) return { type: 'road', e: p.path[0] };
  // no project needs a road: the one that reaches the best spots or lengthens my road
  let best = -1;
  let bestV = -Infinity;
  for (const e of legal) {
    const far = EDGES[e].find((v) => !VERT_EDGES[v].some((x) => x !== e && s.roads[x] === seat) && s.buildings[v]?.s !== seat) ?? EDGES[e][1];
    let v = roadWith(s, seat, [e]) * 0.5;
    for (const w of [far, ...VERT_NEIGHBORS_OF(far)]) if (spacedOk(s, w)) v = Math.max(v, spotPips(k, w) * (w === far ? 1 : 0.8));
    if (v > bestV) {
      bestV = v;
      best = e;
    }
  }
  return best < 0 ? { type: 'stopRoads' } : { type: 'road', e: best };
}

function mainAction(k: Know, rnd: () => number): Action {
  const { s, hand } = k;
  const list = projects(k, rnd);
  if (s.phase === 'roads') return freeRoad(k, list);

  const dev = devPlay(k, list);
  if (dev) return dev;

  const top = list[0];
  if (top) {
    const step = nextStep(top);
    if (stepLegal(k, step.action)) {
      if (canAfford(hand, step.cost)) return step.action;
      const trade = bankToward(k, step.cost, top.cost);
      if (trade) return trade;
      const offer = k.level === 'expert' || rnd() < 0.5 ? offerToward(k, step.cost, top.cost, top.kind === 'city' || (top.kind === 'settle' && !top.path.length)) : null;
      if (offer) return offer;
    }
    // something else affordable now that hardly delays the main project
    const base = eta(k, hand, top.cost);
    for (const p of list.slice(1)) {
      const st = nextStep(p);
      if (!canAfford(hand, st.cost) || !stepLegal(k, st.action)) continue;
      const delay = eta(k, sub(hand, st.cost), top.cost) - base;
      if (delay <= 0.6 * (p.value / Math.max(0.3, top.value)) || cardCount(s, k.id) > 7) return st.action;
    }
  }
  // a big hand fears the 7: spend the surplus at the bank toward the project
  if (cardCount(s, k.id) > 7) {
    const keep = top ? top.cost : emptyRes();
    const give = RES.filter((r) => hand[r] - keep[r] >= k.ratio[r]).sort((a, b) => hand[b] - keep[b] - (hand[a] - keep[a]))[0];
    const get = RES.filter((r) => r !== give && s.bank[r] > 0).sort((a, b) => keep[b] - hand[b] - (keep[a] - hand[a]) || k.rate[a] - k.rate[b])[0];
    if (give && get && bankTradesThisTurn(s, k.id) < 5) return { type: 'bank', give, get };
  }
  return { type: 'end' };
}

/** What a bot does now (null: nothing to do). */
export function botAction(s: State, id: string, level: BotLevel = 'expert', rnd: () => number = Math.random): BotPlan | null {
  if (level === 'easy') return easy.botAction(s, id);
  if (!isActive(s, id)) return null;
  // discards and answers to offers come from anyone
  if (s.phase === 'discard') {
    const n = s.discard[id];
    return n ? { key: 'discard', delay: randDelay(900, 1800), action: { type: 'discard', cards: autoDiscard(s, id, n, level) } } : null;
  }
  const t = s.trade;
  if (t && t.from !== id) {
    if (id in t.answers) return null;
    return { key: `answer${t.id}`, delay: randDelay(1200, 2600), action: { type: 'answer', id: t.id, yes: wouldAccept(s, id, t, level) } };
  }
  if (s.turn !== id) return null;
  if (t && t.from === id) return null; // waiting for answers (see botPlan)
  switch (s.phase) {
    case 'setup':
      return s.setupNeed === 'settlement'
        ? { key: 'setup', delay: randDelay(900, 1600), action: { type: 'settle', v: botSetupSettlement(s, id, level, rnd) } }
        : { key: 'setupRoad', delay: randDelay(600, 1100), action: { type: 'road', e: botSetupRoad(s, id, level) } };
    case 'roll': {
      const k = know(s, id, level);
      if (!s.devPlayed && playable(s, id, 'knight') && ((armyChance(s, id) && k.vp + 2 >= s.settings.target) || knightNow(k, 'roll'))) {
        return { key: 'knight', delay: randDelay(700, 1200), action: { type: 'play', k: 'knight' } };
      }
      return { key: 'roll', delay: randDelay(700, 1300), action: { type: 'roll' } };
    }
    case 'robber':
      return { key: 'robber', delay: randDelay(900, 1500), action: { type: 'robber', h: botRobber(s, id, level) } };
    case 'steal':
      return { key: 'steal', delay: randDelay(600, 1100), action: { type: 'steal', p: botVictim(s, id, level) } };
    case 'main':
    case 'roads': {
      const action = mainAction(know(s, id, level), rnd);
      return { key: `main${action.type}`, delay: action.type === 'end' ? randDelay(800, 1300) : randDelay(700, 1200), action };
    }
    default:
      return null;
  }
}
