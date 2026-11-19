/**
 * «قطار المغرب» — the bots. A bot sees only what its own phone would show (BotSee: the board, the
 * face-up cards, everyone's public counts, its own hand and tickets), never other hands, tickets or the
 * order of the deck.
 *
 * The plan: for each ticket still open (the most valuable first), the cheapest path over its own routes
 * (free) and the routes it may still claim; routes already in the plan are free for the next tickets, so
 * the paths share track. Tickets that can no longer be made, or don't fit the wagons left, are given up.
 * - claim: a planned route it can pay for, the one whose loss would hurt most first (the detour it would
 *   force), then the longest; grey routes are paid with the colour least needed elsewhere;
 * - draw: the face-up colours the plan lacks most, a face-up locomotive when much is missing, else the deck;
 * - long routes for points (4–6 wagons, next to its network, in colours it holds) with the wagons the
 *   tickets leave spare: the smart bot once its tickets are done, the expert as soon as 12+ are spare;
 * - all tickets done: more tickets while there is time (the expert: when ahead or with 22+ wagons);
 * - plans lean a little towards long routes for the expert (more points per wagon);
 * - near the end (the last round, or someone with few wagons left): points now.
 * The expert also blocks a little: a short route joining two separate pieces of a rival's network.
 * The easy bot plays slower and looser: random draws, forgets to hurry, keeps tickets at random.
 */
import type { BotLevel } from '../src/shared/protocol';
import { joined, payOptions, routeOpen, type PayOption, type TrainHand } from '../src/shared/games/train';
import { CITIES, ROUTES, ROUTE_POINTS, TICKETS, TRAIN_COLORS, type TrainCard, type TrainColor, type TrainRoute } from '../src/shared/train-map';

export interface BotSee {
  me: string;
  level: BotLevel;
  step: 'start' | 'second' | 'tickets';
  owners: (string | null)[];
  doubles: boolean;
  faceUp: (TrainCard | null)[];
  deck: number;
  ticketDeck: number;
  hand: TrainHand;
  wagons: number;
  points: number;
  tickets: number[];
  offer: number[] | null;
  keepMin: number;
  /** the last round has begun (this is the bot's final turn) */
  lastRound: boolean;
  others: { id: string; wagons: number; points: number }[];
  rnd: () => number;
}

export type BotAction =
  | { type: 'face'; i: number }
  | { type: 'deck' }
  | { type: 'claim'; route: number; color: TrainColor | 'loco' }
  | { type: 'tickets' }
  | { type: 'keep'; ids: number[] }
  | { type: 'pass' };

/* ------------------------------------------------------------------ */
/* Paths                                                               */
/* ------------------------------------------------------------------ */

const ADJ: Map<string, TrainRoute[]> = (() => {
  const m = new Map<string, TrainRoute[]>(CITIES.map((c) => [c.id, []]));
  for (const r of ROUTES) {
    m.get(r.a)!.push(r);
    m.get(r.b)!.push(r);
  }
  return m;
})();

/**
 * The cheapest path between two cities: own routes and `free` ones cost nothing, open routes their length,
 * the rest are walls. Returns the routes to claim on it (null: no way through).
 */
export function cheapest(see: Pick<BotSee, 'owners' | 'me' | 'doubles'>, a: string, b: string, free: Set<number>, banned?: number, longBias = 0): { cost: number; routes: TrainRoute[] } | null {
  const dist = new Map<string, number>([[a, 0]]);
  const via = new Map<string, TrainRoute>();
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    let best = Infinity;
    for (const [c, d] of dist) if (!done.has(c) && d < best) [cur, best] = [c, d];
    if (cur === null) return null;
    if (cur === b) break;
    done.add(cur);
    for (const r of ADJ.get(cur)!) {
      if (r.id === banned) continue;
      const mine = see.owners[r.id] === see.me;
      let w: number;
      if (mine || free.has(r.id)) w = 0;
      else if (routeOpen(see.owners, r, see.me, see.doubles)) w = r.len - longBias * (ROUTE_POINTS[r.len] - r.len);
      else continue;
      const n = r.a === cur ? r.b : r.a;
      const nd = best + w + 0.01; // a hair per hop: fewer, longer routes on a tie
      if (nd < (dist.get(n) ?? Infinity)) {
        dist.set(n, nd);
        via.set(n, r);
      }
    }
  }
  const routes: TrainRoute[] = [];
  for (let c = b; c !== a; ) {
    const r = via.get(c)!;
    if (see.owners[r.id] !== see.me) routes.push(r);
    c = r.a === c ? r.b : r.a;
  }
  return { cost: routes.filter((r) => !free.has(r.id)).reduce((s, r) => s + r.len, 0), routes };
}

/** how much a planned path leans towards long routes (more points per wagon) */
const LONG_BIAS: Record<BotLevel, number> = { easy: 0, smart: 0, expert: 0.1 };

interface Plan {
  /** routes still to claim, with how much a detour would cost if each were lost */
  need: { r: TrainRoute; risk: number }[];
  wagons: number;
  /** tickets kept but not done and still in the plan */
  open: number[];
}

const ownRoutes = (see: BotSee) => ROUTES.filter((r) => see.owners[r.id] === see.me);

export function plan(see: BotSee, tickets = see.tickets): Plan {
  const mine = ownRoutes(see);
  const todo = tickets.filter((t) => !joined(mine, TICKETS[t].a, TICKETS[t].b)).sort((x, y) => TICKETS[y].value - TICKETS[x].value);
  const free = new Set<number>();
  const kept: number[] = [];
  let wagons = 0;
  for (const t of todo) {
    const p = cheapest(see, TICKETS[t].a, TICKETS[t].b, free, undefined, LONG_BIAS[see.level]);
    if (!p) continue; // cut off: given up
    if (wagons + p.cost > see.wagons) continue; // no longer fits
    wagons += p.cost;
    kept.push(t);
    for (const r of p.routes) free.add(r.id);
  }
  // the risk of each planned route: the extra wagons of the best detour without it
  const need = [...free].map((id) => {
    const r = ROUTES[id];
    let risk = 0;
    for (const t of kept) {
      const base = cheapest(see, TICKETS[t].a, TICKETS[t].b, new Set());
      const alt = cheapest(see, TICKETS[t].a, TICKETS[t].b, new Set(), id);
      // the twin lane is a fine detour when it is open
      if (base && base.routes.some((x) => x.id === id)) risk = Math.max(risk, alt ? alt.cost - base.cost : 30);
    }
    return { r, risk };
  });
  return { need, wagons, open: kept };
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

/** How many more cards of each colour the plan needs (grey routes: the colour held most, after the others). */
function deficits(see: BotSee, need: TrainRoute[]): Record<TrainColor, number> {
  const want: Record<TrainColor, number> = { red: 0, orange: 0, yellow: 0, green: 0, blue: 0, purple: 0, black: 0, white: 0 };
  for (const r of need) if (r.color !== 'grey') want[r.color] += r.len;
  const spare = (c: TrainColor) => see.hand[c] - want[c];
  for (const r of need.filter((x) => x.color === 'grey').sort((x, y) => y.len - x.len)) {
    const c = TRAIN_COLORS.slice().sort((x, y) => spare(y) - spare(x))[0];
    want[c] += r.len;
  }
  const out = { ...want };
  let locos = see.hand.loco;
  for (const c of TRAIN_COLORS) {
    out[c] = Math.max(0, want[c] - see.hand[c]);
  }
  // locomotives cover the smallest gaps first
  for (const c of TRAIN_COLORS.slice().sort((x, y) => out[x] - out[y])) {
    const use = Math.min(locos, out[c]);
    out[c] -= use;
    locos -= use;
  }
  return out;
}

function chooseDraw(see: BotSee, need: TrainRoute[]): BotAction {
  const second = see.step === 'second';
  const faces = see.faceUp.map((c, i) => ({ c, i })).filter((f) => f.c && !(second && f.c === 'loco'));
  const canDeck = see.deck > 0;
  if (!faces.length) return canDeck ? { type: 'deck' } : { type: 'pass' };
  if (see.level === 'easy' && see.rnd() < 0.35) {
    if (canDeck && see.rnd() < 0.5) return { type: 'deck' };
    const f = faces[Math.floor(see.rnd() * faces.length)];
    return { type: 'face', i: f.i };
  }
  const gap = deficits(see, need);
  const total = TRAIN_COLORS.reduce((s, c) => s + gap[c], 0);
  const coloured = faces.filter((f) => f.c !== 'loco' && gap[f.c as TrainColor] > 0).sort((x, y) => gap[y.c as TrainColor] - gap[x.c as TrainColor]);
  const loco = faces.find((f) => f.c === 'loco');
  // a locomotive is worth the whole turn when a lot is missing and nothing face up helps much
  if (!second && loco && total >= (see.level === 'expert' ? 5 : 5) && (!coloured.length || gap[coloured[0].c as TrainColor] <= 1)) return { type: 'face', i: loco.i };
  if (coloured.length) return { type: 'face', i: coloured[0].i };
  if (canDeck) return { type: 'deck' };
  // only colours nobody needs: take what helps the longest-route game later (the colour held most)
  const any = faces.filter((f) => f.c !== 'loco').sort((x, y) => see.hand[y.c as TrainColor] - see.hand[x.c as TrainColor])[0] ?? faces[0];
  return { type: 'face', i: any.i };
}

/* ------------------------------------------------------------------ */
/* Claims                                                              */
/* ------------------------------------------------------------------ */

/** The way to pay that spares the colours the rest of the plan needs, and locomotives. */
function bestPay(see: BotSee, r: TrainRoute, rest: TrainRoute[]): PayOption | null {
  const opts = payOptions(see.hand, r);
  if (!opts.length) return null;
  const want: Record<string, number> = {};
  for (const x of rest) if (x.color !== 'grey') want[x.color] = (want[x.color] ?? 0) + x.len;
  const cost = (o: PayOption) => o.locos * 3 + (o.color === 'loco' ? 0 : Math.max(0, Math.min(o.n, (want[o.color] ?? 0) - (see.hand[o.color] - o.n))) * 2);
  return opts.sort((a, b) => cost(a) - cost(b))[0];
}

const canTake = (see: BotSee, r: TrainRoute) => routeOpen(see.owners, r, see.me, see.doubles) && see.wagons >= r.len;

/** The cities my routes touch, by piece of network. */
function pieces(owners: (string | null)[], id: string): Map<string, number> {
  const mine = ROUTES.filter((r) => owners[r.id] === id);
  const comp = new Map<string, number>();
  let k = 0;
  for (const r of mine) {
    for (const start of [r.a, r.b]) {
      if (comp.has(start)) continue;
      const todo = [start];
      comp.set(start, k);
      while (todo.length) {
        const c = todo.pop()!;
        for (const x of mine) {
          if (x.a !== c && x.b !== c) continue;
          const n = x.a === c ? x.b : x.a;
          if (!comp.has(n)) {
            comp.set(n, k);
            todo.push(n);
          }
        }
      }
      k++;
    }
  }
  return comp;
}

/** A short open route joining two separate pieces of a rival's network (they likely need it). */
function blockMove(see: BotSee): BotAction | null {
  for (const o of see.others) {
    const comp = pieces(see.owners, o.id);
    for (const r of ROUTES) {
      if (r.len > 2 || !canTake(see, r)) continue;
      const ca = comp.get(r.a);
      const cb = comp.get(r.b);
      if (ca === undefined || cb === undefined || ca === cb) continue;
      const pay = bestPay(see, r, []);
      if (pay) return { type: 'claim', route: r.id, color: pay.color };
    }
  }
  return null;
}

/** The most points for the cards in hand: the longest route it can pay for, next to its own network if it can. */
function pointsMove(see: BotSee): BotAction | null {
  const mine = new Set(ownRoutes(see).flatMap((r) => [r.a, r.b]));
  let best: { r: TrainRoute; pay: PayOption; score: number } | null = null;
  for (const r of ROUTES) {
    if (!canTake(see, r)) continue;
    const pay = bestPay(see, r, []);
    if (!pay) continue;
    const score = ROUTE_POINTS[r.len] + (mine.has(r.a) || mine.has(r.b) ? 1.5 : 0) - pay.locos * 0.8;
    if (!best || score > best.score) best = { r, pay, score };
  }
  return best ? { type: 'claim', route: best.r.id, color: best.pay.color } : null;
}

/**
 * Long routes worth collecting for with the wagons the tickets leave spare: the most points per wagon,
 * next to its own network (the longest path), in colours already in hand. The smart bot only once its
 * tickets are done; the expert all along.
 */
function pointTargets(see: BotSee, p: Plan): TrainRoute[] {
  if (see.level === 'easy' || (see.level === 'smart' && p.need.length)) return [];
  let spare = see.wagons - p.wagons - 2;
  // the expert while its tickets are still open: only with plenty to spare
  if (see.level === 'expert' && p.need.length && spare < 12) return [];
  const near = new Set([...ownRoutes(see), ...p.need.map((n) => n.r)].flatMap((r) => [r.a, r.b]));
  const planned = new Set(p.need.map((n) => n.r.id));
  const cand = ROUTES.filter((r) => r.len >= 4 && !planned.has(r.id) && canTake(see, r))
    .map((r) => {
      const held = r.color === 'grey' ? Math.max(...TRAIN_COLORS.map((c) => see.hand[c])) : see.hand[r.color];
      return { r, score: ROUTE_POINTS[r.len] / r.len + (near.has(r.a) || near.has(r.b) ? 0.6 : 0) + Math.min(1, (held + see.hand.loco) / r.len) };
    })
    .sort((x, y) => y.score - x.score);
  const out: TrainRoute[] = [];
  for (const c of cand) {
    if (out.length >= 2) break;
    if (c.r.len > spare) continue;
    // never both lanes of a double route
    if (c.r.twin !== undefined && out.some((o) => o.id === c.r.twin)) continue;
    out.push(c.r);
    spare -= c.r.len;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */

function chooseTickets(see: BotSee): number[] {
  const offer = see.offer ?? [];
  if (see.level === 'easy' && see.rnd() < 0.6) {
    const n = see.keepMin + (see.rnd() < 0.3 ? 1 : 0);
    return offer
      .slice()
      .sort(() => see.rnd() - 0.5)
      .slice(0, Math.max(see.keepMin, Math.min(n, offer.length)));
  }
  const base = plan(see).wagons;
  // each offered ticket on top of what is planned: its extra wagons against its value
  const scored = offer
    .map((t) => {
      const p = plan(see, [...see.tickets, t]);
      const extra = p.open.includes(t) ? p.wagons - base : Infinity;
      return { t, extra, value: TICKETS[t].value };
    })
    .sort((x, y) => x.extra - x.value * 0.35 - (y.extra - y.value * 0.35));
  const keep: number[] = [];
  let used = base;
  const room = see.wagons - (see.level === 'expert' ? 7 : 7);
  for (const s of scored) {
    if (keep.length < see.keepMin) {
      keep.push(s.t);
      used += Number.isFinite(s.extra) ? s.extra : 0;
      continue;
    }
    // another one only when it rides mostly on the same track
    const cheapEnough = s.extra <= Math.max(3, s.value * 0.5);
    if (Number.isFinite(s.extra) && used + s.extra <= room && cheapEnough) {
      keep.push(s.t);
      used += s.extra;
    }
  }
  return keep;
}

/* ------------------------------------------------------------------ */
/* The move                                                            */
/* ------------------------------------------------------------------ */

export function botDecide(see: BotSee): BotAction {
  if (see.offer) return { type: 'keep', ids: chooseTickets(see) };
  const p = plan(see);
  const targets = pointTargets(see, p);
  const need = [...p.need.map((n) => n.r), ...targets];
  if (see.step === 'second') return chooseDraw(see, need);

  const minOther = Math.min(99, ...see.others.map((o) => o.wagons));
  const hurry = see.lastRound || minOther <= (see.level === 'easy' ? 3 : 6) || see.wagons <= 6;
  const easySlack = see.level === 'easy' && see.rnd() < 0.25;

  // the routes I can pay for now: the tickets' (the riskiest, then the longest, first), then the long ones for points
  const ready = [...p.need, ...targets.map((r) => ({ r, risk: -1 }))]
    .filter((n) => canTake(see, n.r))
    .map((n) => ({ ...n, pay: bestPay(see, n.r, need.filter((x) => x.id !== n.r.id)) }))
    .filter((n) => n.pay)
    .sort((x, y) => (see.level === 'easy' ? y.r.len - x.r.len : y.risk - x.risk || y.r.len - x.r.len));
  if (ready.length && !easySlack) {
    const n = ready[0];
    // an unhurried bot keeps collecting while nothing is at risk and the hand is still small
    const handSize = Object.values(see.hand).reduce((a, b) => a + b, 0);
    const wait = !hurry && n.risk === 0 && n.r.len <= 2 && handSize < 6 && see.level === 'smart' && see.rnd() < 0.3;
    if (!wait) return { type: 'claim', route: n.r.id, color: n.pay!.color };
  }

  if (hurry) {
    // points now: the best route the hand pays for
    const pm = pointsMove(see);
    if (pm && (see.lastRound || see.level !== 'easy')) return pm;
  }

  if (!p.need.length) {
    // every ticket done (or given up)
    const lead = see.points - Math.max(0, ...see.others.map((o) => o.points));
    const moreTickets =
      see.ticketDeck > 0 &&
      !hurry &&
      see.wagons >= 14 &&
      (see.level === 'expert' ? lead >= -5 || see.wagons >= 22 : see.level === 'smart' ? true : see.rnd() < 0.5);
    if (moreTickets) return { type: 'tickets' };
    if (see.level === 'expert' && see.rnd() < 0.1) {
      const b = blockMove(see);
      if (b) return b;
    }
    if (!targets.length) {
      const pm = pointsMove(see);
      // big routes are worth it at once; small ones wait for a fuller hand
      if (pm && pm.type === 'claim' && (ROUTES[pm.route].len >= 4 || see.wagons <= 12)) return pm;
    }
  }

  if (see.deck > 0 || see.faceUp.some((c) => c)) return chooseDraw(see, need);
  // nothing to draw: any route, then tickets, then pass
  const pm = pointsMove(see);
  if (pm) return pm;
  if (see.ticketDeck > 0) return { type: 'tickets' };
  return { type: 'pass' };
}

/** A bot's thinking time for a move (ms), by strength. */
export function botDelay(level: BotLevel, a: BotAction, rnd: () => number): number {
  const slow = level === 'easy' ? 1.35 : level === 'smart' ? 1.1 : 1;
  const [lo, hi] = a.type === 'claim' ? [2200, 3600] : a.type === 'keep' ? [2800, 4800] : a.type === 'tickets' ? [2000, 3200] : [1300, 2600];
  return Math.round((lo + rnd() * (hi - lo)) * slow);
}

