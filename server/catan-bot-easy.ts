/**
 * «المستوطنون» — the previous bots, kept as the room's «سهل» (easy) level (server/catan-bot.ts plays
 * «ذكي» and «خبير»). They place their opening settlements on rich, varied intersections, build in the
 * order city > settlement > development card / road (roads only to reach a new settlement spot), trade
 * with the bank toward their next build, offer a fair 1-for-1 to the players once a turn, accept offers
 * that bring them closer to a build (never from someone about to win), put the robber on the leader and
 * give back the cards they need least. They only use what a player could see (plus their own hand).
 */
import type { CatanDevKind, CatanRes, CatanResMap, CatanTrade } from '../src/shared/games/catan';
import { COST, EDGES, HEX_COUNT, HEX_VERTS, PORT_SLOTS, RES, VERT_COUNT, VERT_EDGES, VERT_HEXES, emptyRes, pips, resTotal } from '../src/shared/catan-board';
import { randDelay } from './cardkit';
import {
  activePlayers,
  canAfford,
  cardCount,
  isActive,
  legalCities,
  legalRoads,
  legalSettlements,
  missing,
  piecesLeft,
  publicVp,
  ratios,
  seatOf,
  spacedOk,
  victimsAt,
  type State,
} from './catan-rules';

type Action = { type: string; [k: string]: unknown };
export interface BotPlan {
  key: string;
  delay: number;
  action: Action;
}

/* ------------------------------------------------------------------ */
/* Evaluating the board                                                */
/* ------------------------------------------------------------------ */

/** Expected production of a seat per resource (sum of pips, cities double), robber ignored. */
function production(s: State, seat: number): CatanResMap {
  const out = emptyRes();
  s.buildings.forEach((b, v) => {
    if (!b || b.s !== seat) return;
    for (const h of VERT_HEXES[v]) {
      const t = s.hexes[h];
      if (t !== 'desert') out[t] += pips(s.nums[h]) * (b.city ? 2 : 1);
    }
  });
  return out;
}

/** How good an intersection is for `seat`: pips, plus new resources, plus a fitting harbour. */
function spotValue(s: State, seat: number, v: number): number {
  const prod = production(s, seat);
  let val = 0;
  const seen = new Set<CatanRes>();
  for (const h of VERT_HEXES[v]) {
    const t = s.hexes[h];
    if (t === 'desert') continue;
    const p = pips(s.nums[h]);
    val += p;
    // scarcer resources are worth a bit more (there are only 3 hills and 3 mountains)
    if (t === 'brick' || t === 'ore') val += p * 0.15;
    if (!seen.has(t) && prod[t] === 0) val += 2.2;
    seen.add(t);
  }
  const slot = PORT_SLOTS.findIndex((p) => p.verts.includes(v));
  if (slot >= 0) {
    const k = s.ports[slot];
    if (k === 'any') val += 1;
    else val += prod[k] >= 5 ? 2.5 : 0.6;
  }
  return val;
}

/** Small stable jitter so bots don't all play the same way (depends on the bot and the spot). */
function jitter(id: string, n: number) {
  let h = n * 7919;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

export function botSetupSettlement(s: State, id: string): number {
  const seat = seatOf(s, id);
  const spots = legalSettlements(s, seat, true);
  let best = spots[0];
  let bestV = -Infinity;
  const second = s.setupStep >= s.order.length;
  for (const v of spots) {
    let val = spotValue(s, seat, v) + jitter(id, v) * 0.8;
    if (!second) {
      // the first settlement favours wood and brick (roads early)
      for (const h of VERT_HEXES[v]) if (s.hexes[h] === 'wood' || s.hexes[h] === 'brick') val += pips(s.nums[h]) * 0.12;
    }
    if (val > bestV) {
      bestV = val;
      best = v;
    }
  }
  return best;
}

/** The free intersections reachable within a few paths of my network, with the first path to build. */
function roadTargets(s: State, seat: number, maxDepth = 3): { v: number; depth: number; first: number }[] {
  const blocked = (v: number) => {
    const b = s.buildings[v];
    return !!b && b.s !== seat;
  };
  const start: number[] = [];
  for (let v = 0; v < VERT_COUNT; v++) {
    if (blocked(v)) continue;
    if (s.buildings[v]?.s === seat || VERT_EDGES[v].some((e) => s.roads[e] === seat)) start.push(v);
  }
  const seen = new Map<number, { depth: number; first: number }>();
  let frontier = start.map((v) => ({ v, first: -1 }));
  for (const v of start) seen.set(v, { depth: 0, first: -1 });
  const out: { v: number; depth: number; first: number }[] = [];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const next: { v: number; first: number }[] = [];
    for (const { v, first } of frontier) {
      if (depth > 1 && blocked(v)) continue;
      for (const e of VERT_EDGES[v]) {
        if (s.roads[e] !== -1) continue;
        const [a, b] = EDGES[e];
        const w = a === v ? b : a;
        if (seen.has(w)) continue;
        const f = first < 0 ? e : first;
        seen.set(w, { depth, first: f });
        next.push({ v: w, first: f });
        if (!blocked(w) && spacedOk(s, w)) out.push({ v: w, depth, first: f });
      }
    }
    frontier = next;
  }
  return out;
}

export function botSetupRoad(s: State, id: string): number {
  const seat = seatOf(s, id);
  const roads = legalRoads(s, seat);
  let best = roads[0];
  let bestV = -Infinity;
  for (const e of roads) {
    const far = EDGES[e][0] === s.setupAt ? EDGES[e][1] : EDGES[e][0];
    // the best free spot one more path away from the far end
    let val = 0;
    for (const e2 of VERT_EDGES[far]) {
      const w = EDGES[e2][0] === far ? EDGES[e2][1] : EDGES[e2][0];
      if (w !== s.setupAt && spacedOk(s, w)) val = Math.max(val, spotValue(s, seat, w));
    }
    val += jitter(id, e) * 0.5;
    if (val > bestV) {
      bestV = val;
      best = e;
    }
  }
  return best;
}

/** The robber goes where it hurts the leaders most, never next to the bot's own buildings. */
export function botRobber(s: State, id: string): number {
  const seat = seatOf(s, id);
  const target = s.settings.target;
  let best = -1;
  let bestV = -Infinity;
  for (let h = 0; h < HEX_COUNT; h++) {
    if (h === s.robber) continue;
    let mine = false;
    let val = 0;
    for (const v of HEX_VERTS[h]) {
      const b = s.buildings[v];
      if (!b) continue;
      if (b.s === seat) mine = true;
      const owner = s.order[b.s];
      if (!isActive(s, owner)) continue;
      const lead = 1 + (publicVp(s, owner) / target) * 3;
      val += pips(s.nums[h]) * (b.city ? 2 : 1) * lead + (cardCount(s, owner) > 0 ? 0.5 : 0);
    }
    if (mine) val -= 100;
    if (s.hexes[h] === 'desert') val = Math.max(val, -50);
    if (val > bestV) {
      bestV = val;
      best = h;
    }
  }
  return best < 0 ? (s.robber + 1) % HEX_COUNT : best;
}

export function botVictim(s: State, id: string): string {
  const vs = s.victims.length ? s.victims : victimsAt(s, id, s.robber);
  return vs.slice().sort((a, b) => publicVp(s, b) - publicVp(s, a) || cardCount(s, b) - cardCount(s, a))[0];
}

/* ------------------------------------------------------------------ */
/* Goals and hands                                                     */
/* ------------------------------------------------------------------ */

type Goal = 'city' | 'settlement' | 'road' | 'dev';

function goalOf(s: State, id: string): Goal | null {
  const seat = seatOf(s, id);
  const hand = s.hands[id];
  const left = piecesLeft(s, id);
  const opts: { g: Goal; score: number }[] = [];
  if (left.city > 0 && legalCities(s, seat).length) opts.push({ g: 'city', score: missing(hand, COST.city) });
  if (left.settlement > 0 && legalSettlements(s, seat, false).length) opts.push({ g: 'settlement', score: missing(hand, COST.settlement) + 0.3 });
  else if (left.settlement > 0 && left.road > 0 && roadTargets(s, seat).length) opts.push({ g: 'road', score: missing(hand, COST.road) + 0.6 });
  if (s.deck.length) opts.push({ g: 'dev', score: missing(hand, COST.dev) + 1.2 });
  if (!opts.length) return null;
  opts.sort((a, b) => a.score - b.score);
  return opts[0].g;
}

const goalCost = (g: Goal | null): CatanResMap => (g ? COST[g] : emptyRes());

/** Cards to give back: the ones furthest beyond what the next build needs. */
export function autoDiscard(s: State, id: string, n: number): CatanResMap {
  const hand = { ...s.hands[id] };
  const need = goalCost(goalOf(s, id));
  const out = emptyRes();
  for (let i = 0; i < n; i++) {
    let pick: CatanRes | null = null;
    let bestV = -Infinity;
    for (const r of RES) {
      if (hand[r] <= 0) continue;
      const v = hand[r] - need[r] * 1.5 + hand[r] * 0.01;
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

/** Someone close to winning: bots don't trade with them. */
const nearWin = (s: State, id: string) => publicVp(s, id) >= s.settings.target - 2;

/** Would this bot accept an offer (it gives `want`, it gets `give`)? */
export function wouldAccept(s: State, id: string, t: CatanTrade): boolean {
  if (nearWin(s, t.from)) return false;
  const hand = s.hands[id];
  if (!canAfford(hand, t.want)) return false;
  const after = { ...hand };
  for (const r of RES) after[r] += t.give[r] - t.want[r];
  const goal = goalOf(s, id);
  const cost = goalCost(goal);
  const before = missing(hand, cost);
  const now = missing(after, cost);
  const gives = resTotal(t.want);
  const gets = resTotal(t.give);
  if (gives > gets + 1) return false;
  if (now < before) return gives <= gets || now === 0;
  if (now > before) return false;
  // no closer to the goal: take it only for a fair swap of a surplus card for one it lacks
  return gives <= gets && RES.every((r) => !t.want[r] || hand[r] - t.want[r] >= cost[r] + 1) && RES.some((r) => t.give[r] && hand[r] === 0);
}

/** The bot that offered a trade picks the accepter with the fewest points. */
export function pickAccepter(s: State, t: CatanTrade): string | null {
  const yes = Object.keys(t.answers).filter((id) => t.answers[id] && isActive(s, id) && canAfford(s.hands[id], t.want) && !nearWin(s, id));
  if (!yes.length) return null;
  return yes.sort((a, b) => publicVp(s, a) - publicVp(s, b))[0];
}

/* ------------------------------------------------------------------ */
/* One decision                                                        */
/* ------------------------------------------------------------------ */

function playable(s: State, id: string, k: CatanDevKind) {
  return !s.devPlayed && s.devs[id].some((d) => d.k === k && d.turn < s.turnNo);
}

/** Is the robber sitting on one of my producing hexes? */
function robbed(s: State, seat: number) {
  return HEX_VERTS[s.robber].some((v) => s.buildings[v]?.s === seat) && s.nums[s.robber] !== null;
}

/** Would one more knight win (or keep) the largest army? */
function armyChance(s: State, id: string) {
  const k = s.knights[id] + 1;
  if (k < 3 || s.army === id) return false;
  return !s.army || s.knights[s.army] < k;
}

/** The best settlement spot I can build on now. */
function bestSpot(s: State, seat: number, spots: number[], id: string) {
  return spots.slice().sort((a, b) => spotValue(s, seat, b) + jitter(id, b) * 0.3 - (spotValue(s, seat, a) + jitter(id, a) * 0.3))[0];
}

function bestRoad(s: State, seat: number, id: string): number | null {
  const targets = roadTargets(s, seat);
  if (!targets.length) return null;
  const legal = new Set(legalRoads(s, seat));
  let best: number | null = null;
  let bestV = -Infinity;
  for (const t of targets) {
    if (!legal.has(t.first)) continue;
    const v = spotValue(s, seat, t.v) / t.depth + jitter(id, t.v) * 0.2;
    if (v > bestV) {
      bestV = v;
      best = t.first;
    }
  }
  return best;
}

function mainAction(s: State, id: string): Action {
  const seat = seatOf(s, id);
  const hand = s.hands[id];
  const left = piecesLeft(s, id);

  if (s.phase === 'roads') {
    const e = bestRoad(s, seat, id) ?? legalRoads(s, seat)[0];
    return e === undefined ? { type: 'stopRoads' } : { type: 'road', e };
  }

  // development cards
  if (playable(s, id, 'knight') && (robbed(s, seat) || armyChance(s, id))) return { type: 'play', k: 'knight' };
  const goal = goalOf(s, id);
  const cost = goalCost(goal);
  if (playable(s, id, 'roads') && left.road >= 2 && bestRoad(s, seat, id) !== null) return { type: 'play', k: 'roads' };
  if (playable(s, id, 'plenty')) {
    const lack = RES.flatMap((r) => Array<CatanRes>(Math.max(0, cost[r] - hand[r])).fill(r));
    if (lack.length && lack.length <= 2) {
      const r1 = lack[0];
      const r2 = lack[1] ?? (['ore', 'grain', 'sheep', 'brick', 'wood'] as CatanRes[]).find((r) => s.bank[r] > (r === r1 ? 1 : 0));
      if (r2) {
        const want = emptyRes();
        want[r1]++;
        want[r2]++;
        if (canAfford(s.bank, want)) return { type: 'play', k: 'plenty', r: r1, r2 };
      }
    }
  }
  if (playable(s, id, 'monopoly')) {
    // the resource the others produce most among those my next build lacks
    const theirs = emptyRes();
    for (const o of activePlayers(s)) {
      if (o === id) continue;
      const p = production(s, seatOf(s, o));
      for (const r of RES) theirs[r] += p[r];
    }
    const lack = RES.filter((r) => cost[r] > hand[r]).sort((a, b) => theirs[b] - theirs[a]);
    if (lack.length && theirs[lack[0]] >= 8) return { type: 'play', k: 'monopoly', r: lack[0] };
  }

  // build: city > settlement > development card / road
  const cities = left.city > 0 ? legalCities(s, seat) : [];
  if (cities.length && canAfford(hand, COST.city)) {
    const v = cities.sort((a, b) => spotValue(s, seat, b) - spotValue(s, seat, a))[0];
    return { type: 'city', v };
  }
  const spots = left.settlement > 0 ? legalSettlements(s, seat, false) : [];
  if (spots.length && canAfford(hand, COST.settlement)) return { type: 'settle', v: bestSpot(s, seat, spots, id) };
  const saving = goal === 'city' || goal === 'settlement';
  if (left.road > 0 && !spots.length && left.settlement > 0 && canAfford(hand, COST.road)) {
    const e = bestRoad(s, seat, id);
    if (e !== null) return { type: 'road', e };
  }
  if (s.deck.length && canAfford(hand, COST.dev)) {
    const after = { ...hand };
    for (const r of RES) after[r] -= COST.dev[r];
    // buy when it doesn't set the next build back (or when the hand is big enough to fear a 7)
    if (goal === 'dev' || !saving || missing(after, cost) <= missing(hand, cost) || cardCount(s, id) > 7) return { type: 'buy' };
  }

  // trade with the bank toward the goal
  if (goal && !canAfford(hand, cost)) {
    const rt = ratios(s, seat);
    const lack = RES.filter((r) => cost[r] > hand[r] && s.bank[r] > 0);
    if (lack.length) {
      const give = RES.filter((r) => !lack.includes(r) && hand[r] - cost[r] >= rt[r]).sort((a, b) => hand[b] - cost[b] - (hand[a] - cost[a]))[0];
      if (give) return { type: 'bank', give, get: lack[0] };
    }
    // one card short of the build: offer the players a surplus card for it (not two turns in a row)
    if (s.turnNo - (s.botOffered[id] ?? -99) > s.order.length && missing(hand, cost) === 1) {
      const give = RES.filter((r) => !lack.includes(r) && hand[r] - cost[r] >= 1).sort((a, b) => hand[b] - cost[b] - (hand[a] - cost[a]))[0];
      if (give) {
        return { type: 'offer', give: { [give]: 1 }, want: { [lack[0]]: 1 } };
      }
    }
  }
  // too many cards with nothing to build: spend some at the bank rather than lose half to a 7
  if (cardCount(s, id) > 7 && goal) {
    const rt = ratios(s, seat);
    const lack = RES.filter((r) => cost[r] > hand[r] && s.bank[r] > 0);
    const give = RES.filter((r) => hand[r] >= rt[r]).sort((a, b) => hand[b] - hand[a])[0];
    const get = lack[0] ?? RES.find((r) => r !== give && s.bank[r] > 0);
    if (give && get && give !== get) return { type: 'bank', give, get };
  }
  return { type: 'end' };
}

/** What a bot does now (null: nothing to do). */
export function botAction(s: State, id: string): BotPlan | null {
  if (!isActive(s, id)) return null;
  // discards and answers to offers come from anyone
  if (s.phase === 'discard') {
    const n = s.discard[id];
    return n ? { key: 'discard', delay: randDelay(900, 1800), action: { type: 'discard', cards: autoDiscard(s, id, n) } } : null;
  }
  const t = s.trade;
  if (t && t.from !== id) {
    if (id in t.answers) return null;
    return { key: `answer${t.id}`, delay: randDelay(1200, 2600), action: { type: 'answer', id: t.id, yes: wouldAccept(s, id, t) } };
  }
  if (s.turn !== id) return null;
  if (t && t.from === id) return null; // waiting for answers (see botPlan)
  const seat = seatOf(s, id);
  switch (s.phase) {
    case 'setup':
      return s.setupNeed === 'settlement'
        ? { key: 'setup', delay: randDelay(900, 1600), action: { type: 'settle', v: botSetupSettlement(s, id) } }
        : { key: 'setupRoad', delay: randDelay(600, 1100), action: { type: 'road', e: botSetupRoad(s, id) } };
    case 'roll':
      if (playable(s, id, 'knight') && (robbed(s, seat) || armyChance(s, id))) return { key: 'knight', delay: randDelay(700, 1200), action: { type: 'play', k: 'knight' } };
      return { key: 'roll', delay: randDelay(700, 1300), action: { type: 'roll' } };
    case 'robber':
      return { key: 'robber', delay: randDelay(900, 1500), action: { type: 'robber', h: botRobber(s, id) } };
    case 'steal':
      return { key: 'steal', delay: randDelay(600, 1100), action: { type: 'steal', p: botVictim(s, id) } };
    case 'main':
    case 'roads': {
      const action = mainAction(s, id);
      return { key: `main${action.type}`, delay: action.type === 'end' ? randDelay(800, 1300) : randDelay(700, 1200), action };
    }
    default:
      return null;
  }
}
