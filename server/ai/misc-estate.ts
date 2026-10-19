/**
 * «ملك العقار» expert bot: a valuation of the whole table, used for every decision. Everything here
 * is public on every phone (cash, positions, deeds, houses), so nothing hidden is used.
 *
 * · A deed is worth its price, more when it is part of a colour set (owning a full set doubles the
 *   rent and allows houses: about ×2.2), more for a second / third station, plus its houses; a deed
 *   that would finish a rival's set is worth extra to whoever can keep it from them.
 * · A player's strength = cash + the value of their deeds. Trades are judged by what they do to the
 *   bot's strength minus what they do to the other side's: a trade that hands a rival a colour set
 *   needs a set (or a lot of money) in return.
 * · Cash reserve = what the bot may have to pay soon: the rents of the rivals' squares 2–12 steps
 *   ahead, weighted by the dice, plus a margin; the reserve grows as the table gets built up.
 * · Buying: almost every deed early on (unowned deeds are cheap power), keeping the reserve; a deed
 *   that finishes our set or blocks a rival's is bought even by mortgaging lone deeds.
 * · Auctions: bid up to the deed's value to us (or to keep a rival from a set), +10 at a time.
 * · Building: on our sets, evenly, three houses first everywhere (the best return), the groups with
 *   the best rent per house first; lone deeds are mortgaged to fund houses on a set.
 * · Jail: get out early (deeds to buy, cheap rents), stay in (roll for doubles) once rivals have
 *   houses on the board.
 * · Near the round limit (the richest wins), no mortgaging or unmortgaging that loses worth, and the
 *   set premium fades (a set bought on the last turn earns nothing).
 */
import { BOARD, JAIL_FINE, STATION_RENT, groupSquares, isOwnable, priceOf, type EstateGroup } from '../../src/shared/estate';
import type { EstatePlayer, EstateTrade } from '../../src/shared/protocol';

export interface EProp {
  owner: string;
  houses: number;
  mortgaged: boolean;
}

export interface ETable {
  players: EstatePlayer[];
  props: Record<number, EProp>;
  round: number;
  settings: { rounds: number };
}

type Action = { type: string; [k: string]: unknown };

/** Rounds over which the set premium fades out before a round limit (the richest wins then). */
const LATE_ROUNDS = 8;

/**
 * How much the other side's gain counts against a trade. Fully, as a rule (a rival is a rival); but a
 * game without a round limit only ends once colour sets get built, so after round 20 deals that help
 * both sides become acceptable little by little — otherwise strong bots would never trade with each
 * other and the game would go on forever.
 */
function rivalWeight(t: ETable): number {
  if (t.settings.rounds > 0) return 1;
  return Math.max(0.2, 1 - Math.max(0, t.round - 20) * 0.02);
}

const groupOf = (i: number): EstateGroup | null => {
  const sq = BOARD[i];
  return sq.kind === 'city' ? sq.group : null;
};
const ownable = BOARD.map((_, i) => i).filter((i) => isOwnable(BOARD[i]));
const STATIONS = ownable.filter((i) => BOARD[i].kind === 'station');
const UTILITIES = ownable.filter((i) => BOARD[i].kind === 'utility');

/** Probability of each dice sum 2…12. */
const DICE = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((n) => n / 36);

const P = (t: ETable, id: string) => t.players.find((p) => p.id === id)!;
const ownsAll = (props: Record<number, EProp>, id: string, g: EstateGroup) => groupSquares(g).every((j) => props[j]?.owner === id);

/** Rent a visitor pays on square i (dice sum `roll` for utilities). */
export function rentAt(props: Record<number, EProp>, i: number, roll = 7): number {
  const p = props[i];
  if (!p || p.mortgaged) return 0;
  const sq = BOARD[i];
  if (sq.kind === 'city') {
    if (p.houses > 0) return sq.rent[p.houses];
    return ownsAll(props, p.owner, sq.group) ? sq.rent[0] * 2 : sq.rent[0];
  }
  if (sq.kind === 'station') return STATION_RENT[STATIONS.filter((j) => props[j]?.owner === p.owner).length - 1];
  if (sq.kind === 'utility') return roll * (UTILITIES.filter((j) => props[j]?.owner === p.owner).length === 2 ? 10 : 4);
  return 0;
}

/** What player `id` expects to pay rivals on its next roll from `pos`, and the worst single rent. */
export function exposure(t: ETable, id: string, pos: number): { expected: number; worst: number } {
  let expected = 0, worst = 0;
  for (let s = 2; s <= 12; s++) {
    const i = (pos + s) % 40;
    const p = t.props[i];
    if (!p || p.owner === id || P(t, p.owner)?.bankrupt) continue;
    const r = rentAt(t.props, i, s);
    expected += DICE[s] * r;
    worst = Math.max(worst, r);
  }
  return { expected, worst };
}

/** Rounds left before the richest wins (Infinity without a limit). */
const roundsLeft = (t: ETable) => (t.settings.rounds > 0 ? t.settings.rounds - t.round + 1 : Infinity);

/** How much cash the bot keeps in hand. */
export function reserve(t: ETable, id: string): number {
  const me = P(t, id);
  const ex = exposure(t, id, me.pos);
  // a rough look further ahead: the average rent on the rivals' built squares
  let built = 0;
  for (const [k, p] of Object.entries(t.props)) if (p.owner !== id && p.houses > 0) built = Math.max(built, rentAt(t.props, Number(k)));
  return Math.round(Math.max(60, ex.expected * 2.5 + ex.worst * 0.35 + built * 0.25));
}

/**
 * The value of deed i to `id` (who owns it or would own it), with the table as it is otherwise.
 * `owner` lets us ask "what if X owned it".
 */
export function deedValue(props: Record<number, EProp>, i: number, owner: string, late = 1): number {
  const sq = BOARD[i];
  const p = props[i];
  const price = priceOf(i);
  let v = price;
  if (sq.kind === 'city') {
    const g = groupSquares(sq.group);
    const mine = g.filter((j) => j === i || props[j]?.owner === owner).length;
    const others = g.filter((j) => j !== i && props[j] && props[j].owner !== owner).length;
    if (mine === g.length) v = price * 2.2 * late + (1 - late) * price;
    else if (others === 0) v = price * (1 + 0.25 * (mine - 1)); // the set is still possible
    else v = price * (mine > 1 ? 1.05 : 0.95); // blocked
    if (p && p.owner === owner) v += p.houses * sq.house * 1.1;
  } else if (sq.kind === 'station') {
    const n = STATIONS.filter((j) => j === i || props[j]?.owner === owner).length;
    v = price * [1, 1.15, 1.4, 1.75][n - 1];
  } else if (sq.kind === 'utility') {
    const n = UTILITIES.filter((j) => j === i || props[j]?.owner === owner).length;
    v = price * (n === 2 ? 1.1 : 0.8);
  }
  if (p && p.owner === owner && p.mortgaged) v -= price * 0.55;
  return v;
}

/** A player's strength: cash plus what their deeds are worth to them. */
export function strength(t: ETable, id: string, props: Record<number, EProp> = t.props): number {
  const late = Math.min(1, roundsLeft(t) / LATE_ROUNDS); // sets matter less when the game is about to stop
  let v = P(t, id).cash;
  for (const [k, p] of Object.entries(props)) if (p.owner === id) v += deedValue(props, Number(k), id, late);
  return v;
}

/** The bot's view of a trade, from `me`'s side: my gain minus (weighted) the other side's. */
export function tradeScore(t: ETable, tr: Pick<EstateTrade, 'from' | 'to' | 'give' | 'get'>, me: string): number {
  const other = tr.from === me ? tr.to : tr.from;
  const after: Record<number, EProp> = {};
  for (const [k, p] of Object.entries(t.props)) after[Number(k)] = { ...p };
  for (const i of tr.give.props) after[i].owner = tr.to;
  for (const i of tr.get.props) after[i].owner = tr.from;
  const cashMe = tr.from === me ? tr.get.cash - tr.give.cash : tr.give.cash - tr.get.cash;
  const before = { me: strength(t, me), other: strength(t, other) };
  const meNow = strength(t, me, after) + cashMe;
  const otherNow = strength(t, other, after) - cashMe;
  return meNow - before.me - rivalWeight(t) * (otherNow - before.other);
}

/** Would the expert accept this offer? */
export function expertAccepts(t: ETable, tr: EstateTrade): boolean {
  return tradeScore(t, tr, tr.to) > 25;
}

/** What the expert bids at most for deed i at auction. */
export function expertAuctionMax(t: ETable, id: string, i: number): number {
  const me = P(t, id);
  if (!me) return 0;
  const late = Math.min(1, roundsLeft(t) / LATE_ROUNDS);
  let v = deedValue(t.props, i, id, late);
  // keeping a rival from finishing a set is worth something too
  const g = groupOf(i);
  if (g) {
    const owners = new Set(groupSquares(g).filter((j) => j !== i && t.props[j]).map((j) => t.props[j].owner));
    const rest = groupSquares(g).filter((j) => j !== i);
    if (owners.size === 1 && !owners.has(id) && rest.every((j) => t.props[j])) v = Math.max(v, priceOf(i) * 1.5);
  }
  // money spare: a reserve, but liquid deeds count a little (they can be mortgaged)
  const spare = me.cash - reserve(t, id) * 0.6;
  return Math.max(0, Math.min(Math.round(v / 10) * 10, Math.floor(spare / 10) * 10));
}

/** Lone deeds the bot could mortgage without hurting a set (cheapest value lost first). */
export function spareDeeds(t: ETable, id: string, keep: number[] = []): number[] {
  return Object.keys(t.props)
    .map(Number)
    .filter((i) => {
      const p = t.props[i];
      if (p.owner !== id || p.mortgaged || keep.includes(i)) return false;
      const g = groupOf(i);
      if (g && groupSquares(g).some((j) => t.props[j]?.houses)) return false;
      if (g && ownsAll(t.props, id, g)) return false; // our set: keep it earning
      return true;
    })
    .sort((a, b) => deedValue(t.props, a, id) / priceOf(a) - deedValue(t.props, b, id) / priceOf(b) || priceOf(a) - priceOf(b));
}

/** Buy the deed the bot stands on? Returns the actions to take (mortgages first, then buy / skip). */
export function expertBuy(t: ETable, id: string, i: number): Action {
  const me = P(t, id);
  const price = priceOf(i);
  const late = Math.min(1, roundsLeft(t) / LATE_ROUNDS);
  const value = deedValue(t.props, i, id, late);
  const res = reserve(t, id);
  const g = groupOf(i);
  const key = g ? groupSquares(g).every((j) => j === i || t.props[j]?.owner === id) || blocks(t, id, i) : false;
  if (me.cash - price >= res * 0.5 || (me.cash >= price && (key || value >= price))) return { type: me.cash >= price ? 'buy' : 'skip' };
  // a key deed: raise the money from lone deeds (not near the end: a mortgage costs worth)
  if (key && roundsLeft(t) > 3 && me.cash < price) {
    const spare = spareDeeds(t, id, [i]);
    const raise = spare.reduce((a, j) => a + priceOf(j) / 2, 0);
    if (spare.length && me.cash + raise >= price) return { type: 'mortgage', sq: spare[0] };
  }
  return { type: me.cash >= price && me.cash - price >= res * 0.25 ? 'buy' : 'skip' };
}

/** Does deed i keep a rival from finishing a colour set (they own all the other ones)? */
function blocks(t: ETable, id: string, i: number): boolean {
  const g = groupOf(i);
  if (!g) return false;
  const rest = groupSquares(g).filter((j) => j !== i);
  const owners = new Set(rest.map((j) => t.props[j]?.owner));
  return owners.size === 1 && !owners.has(undefined as unknown as string) && !owners.has(id);
}

/** Can the bot build on city i now (the game's own rules)? */
function canBuild(t: ETable, id: string, i: number): boolean {
  const sq = BOARD[i];
  if (sq.kind !== 'city') return false;
  const p = t.props[i];
  if (!p || p.owner !== id || p.houses >= 5) return false;
  if (!ownsAll(t.props, id, sq.group)) return false;
  const g = groupSquares(sq.group);
  if (g.some((j) => t.props[j].mortgaged)) return false;
  if (p.houses > Math.min(...g.map((j) => t.props[j].houses))) return false;
  return P(t, id).cash >= sq.house;
}

/** Manage before rolling / after moving: build, fund building, unmortgage. One action at a time. */
export function expertManage(t: ETable, id: string): Action | null {
  const me = P(t, id);
  const res = reserve(t, id);
  const left = roundsLeft(t);
  const mine = Object.keys(t.props).map(Number).filter((i) => t.props[i].owner === id);
  // build: three houses everywhere first, best rent gained per house cost first
  const cands = mine.filter((i) => canBuild(t, id, i));
  if (cands.length) {
    const gain = (i: number) => {
      const sq = BOARD[i];
      if (sq.kind !== 'city') return 0;
      const h = t.props[i].houses;
      const now = h ? sq.rent[h] : sq.rent[0] * 2;
      const per = (sq.rent[h + 1] - now) / sq.house;
      return per * (h < 3 ? 2 : 1); // the third house is the big jump
    };
    cands.sort((a, b) => gain(b) - gain(a));
    for (const i of cands) {
      const sq = BOARD[i];
      if (sq.kind !== 'city') continue;
      // a house still pays off in the last rounds when the rent it adds beats nothing; worth is kept
      if (me.cash - sq.house >= res) return { type: 'build', sq: i };
    }
    // money short: mortgage a lone deed to fund the houses (not near the end)
    const want = cands[0];
    const sq = BOARD[want];
    if (sq.kind === 'city' && left > 4 && t.props[want].houses < 3) {
      const spare = spareDeeds(t, id);
      if (spare.length && me.cash + priceOf(spare[0]) / 2 - sq.house >= res) return { type: 'mortgage', sq: spare[0] };
    }
  }
  // nothing to build: unmortgage (members of a set first, lone deeds only when well off)
  for (const i of mine) {
    const p = t.props[i];
    if (!p.mortgaged || left <= 3) continue;
    const cost = Math.ceil((priceOf(i) / 2) * 1.1);
    const g = groupOf(i);
    const setMember = g ? ownsAll(t.props, id, g) : false;
    if (me.cash - cost >= res + (setMember ? 0 : 250)) return { type: 'unmortgage', sq: i };
  }
  return null;
}

/** In jail with the choice: pay / use the card (true) or roll for doubles (false). */
export function expertLeaveJail(t: ETable, id: string): boolean {
  const me = P(t, id);
  const unowned = ownable.filter((i) => !t.props[i]).length;
  // what staying in saves: the rents a walk around the board would cost
  let danger = 0;
  for (const [k, p] of Object.entries(t.props)) if (p.owner !== id && !p.mortgaged) danger += rentAt(t.props, Number(k));
  const early = unowned >= 6;
  if (early) return me.jailCards > 0 || me.cash >= JAIL_FINE + 150;
  return danger < 400 && (me.jailCards > 0 || me.cash >= JAIL_FINE + reserve(t, id));
}

/** A trade the expert proposes: a set-finishing deal that leaves it better off (or null). */
export function expertOffer(t: ETable, id: string, asked: Record<string, number>): { to: string; give: { props: number[]; cash: number }; get: { props: number[]; cash: number } } | null {
  const me = P(t, id);
  if (roundsLeft(t) <= 2) return null;
  const groups = [...new Set(Object.keys(t.props).map(Number).filter((i) => t.props[i].owner === id).map(groupOf).filter(Boolean))] as EstateGroup[];
  const free = (i: number) => {
    const g = groupOf(i);
    return !g || !groupSquares(g).some((j) => t.props[j]?.houses);
  };
  let best: ReturnType<typeof expertOffer> = null, bestScore = 30;
  for (const g of groups) {
    const sq = groupSquares(g);
    const missing = sq.filter((j) => t.props[j]?.owner !== id);
    if (missing.length !== 1 || !t.props[missing[0]] || !free(missing[0])) continue;
    const j = missing[0];
    const other = t.props[j].owner;
    if (P(t, other).bankrupt) continue;
    const last = asked[`${id}:${j}`];
    if (last !== undefined && t.round - last < 4) continue;
    // swaps: one of my deeds (maybe finishing their set) plus cash either way
    const mine = Object.keys(t.props).map(Number).filter((k) => t.props[k].owner === id && groupOf(k) !== g && free(k));
    const options: { give: number[]; cash: number }[] = [{ give: [], cash: 0 }, ...mine.map((k) => ({ give: [k], cash: 0 }))];
    for (const o of options) {
      // the cash that makes it fair for them by our own measure, a little in our favour
      const base = { from: id, to: other, give: { props: o.give, cash: 0 }, get: { props: [j], cash: 0 } };
      const theirs = -tradeScore(t, base, other); // what they lose without cash
      const cash = Math.max(0, Math.round((theirs * 0.6 + priceOf(j) * 0.2) / 10) * 10);
      if (cash > me.cash - reserve(t, id) * 0.5) continue;
      const tr = { ...base, give: { props: o.give, cash } };
      const sc = tradeScore(t, tr, id);
      if (sc > bestScore) {
        bestScore = sc;
        best = { to: other, give: tr.give, get: tr.get };
      }
    }
  }
  return best;
}
