/**
 * «ملك العقار» — roll, move, buy cities and stations, collect rent, build houses and hotels.
 * Full colour groups double the base rent and allow building (evenly). Mortgage to raise money.
 * Three doubles in a row, «إلى السجن» or a card sends you to jail (pay 50, use a card or roll doubles).
 * A property the player declines goes to a short auction for everyone (7 s, restarting on every bid).
 * Can't pay? Sell houses / mortgage, or go bankrupt. Last player standing wins
 * (or the richest after the round limit).
 */
import {
  BOARD,
  FAMILY_CARDS,
  GO_BONUS,
  JAIL,
  JAIL_FINE,
  LUCK_CARDS,
  STATION_RENT,
  groupSquares,
  isOwnable,
  priceOf,
  type EstateCard,
  type EstateGroup,
} from '../../src/shared/estate';
import type { EstateAuction, EstatePlayer, EstateSettings, EstateTrade, EstateView } from '../../src/shared/protocol';
import { Feed, randDelay as rand } from '../cardkit';
import { expertAccepts, expertAuctionMax, expertBuy, expertLeaveJail, expertManage, expertOffer, spareDeeds } from '../ai/misc-estate';
import { GameError, botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { VB, voiceAnd, voiceWinner } from '../voice-calls-boards';

interface Prop {
  owner: string;
  houses: number; // 5 = hotel
  mortgaged: boolean;
}

interface State {
  settings: EstateSettings;
  players: EstatePlayer[];
  turnIdx: number;
  phase: EstateView['phase'];
  dice: number[] | null;
  rollId: number;
  doubles: number;
  extraRoll: boolean;
  props: Record<number, Prop>;
  buy: number | null;
  card: EstateView['card'];
  cardN: number;
  luck: EstateCard[];
  family: EstateCard[];
  debt: { amount: number; to: string | null } | null;
  trade: EstateTrade | null;
  tradeN: number;
  auction: (EstateAuction & { n: number; bids: number }) | null;
  auctionN: number;
  /** bot trade proposals already made: `${from}:${square}` → round */
  asked: Record<string, number>;
  round: number;
  winner: string | null;
  feed: Feed;
  moves: number;
  /** the last roll: when, and how many squares the token hops (bots wait for it to land) */
  rolledAt: number;
  rollSteps: number;
}

/** Tests set BOT_SPEED to speed bots up; auction countdowns follow so test games stay short. */
const SPEED = Number(process.env.BOT_SPEED ?? 1) || 1;
export const AUCTION_MS = 7000 * SPEED;
export const AUCTION_STEPS = [10, 50, 100];
/** How long an offer waits for an answer. */
export const BOT_TRADE_MS = 15_000;
export const HUMAN_TRADE_MS = 30_000;

/** Add a line to the game's log and tell everyone (the line under the turn bar); `voice` = its call read aloud. */
function log(ctx: GameCtx, s: State, text: string, extra: { by?: string; points?: number } = {}, voice?: string) {
  s.feed.push(text, extra);
  ctx.say?.(text, extra.by, voice);
}

const lastLogId = (s: State) => s.feed.list().at(-1)?.id ?? 0;

/**
 * How long the dice and the hopping token take on the phones (190 ms a square: estate-board.tsx), plus
 * `look`, a moment to see where it landed (the bots pass it at the room's pace).
 */
export const rollShowMs = (steps: number, look = 700) => 1100 + 190 * Math.min(12, steps) + look;

const cur = (s: State) => s.players[s.turnIdx];
const P = (s: State, id: string) => s.players.find((p) => p.id === id)!;
const name = (ctx: GameCtx, id: string) => ctx.playerName(id);
const groupOf = (i: number): EstateGroup | null => {
  const sq = BOARD[i];
  return sq.kind === 'city' ? sq.group : null;
};
const owns = (s: State, id: string, i: number) => s.props[i]?.owner === id;
export const ownsGroup = (props: Record<number, Prop>, id: string, g: EstateGroup) => groupSquares(g).every((i) => props[i]?.owner === id);

export function rentOf(s: Pick<State, 'props'>, i: number, diceSum: number): number {
  const p = s.props[i];
  if (!p || p.mortgaged) return 0;
  const sq = BOARD[i];
  if (sq.kind === 'city') {
    if (p.houses > 0) return sq.rent[p.houses];
    return ownsGroup(s.props, p.owner, sq.group) ? sq.rent[0] * 2 : sq.rent[0];
  }
  if (sq.kind === 'station') {
    const n = BOARD.filter((b, j) => b.kind === 'station' && s.props[j]?.owner === p.owner).length;
    return STATION_RENT[n - 1];
  }
  if (sq.kind === 'utility') {
    const n = BOARD.filter((b, j) => b.kind === 'utility' && s.props[j]?.owner === p.owner).length;
    return diceSum * (n === 2 ? 10 : 4);
  }
  return 0;
}

export function worthOf(s: Pick<State, 'props' | 'players'>, id: string): number {
  let w = s.players.find((p) => p.id === id)?.cash ?? 0;
  for (const [k, p] of Object.entries(s.props)) {
    if (p.owner !== id) continue;
    const i = Number(k);
    w += p.mortgaged ? priceOf(i) / 2 : priceOf(i);
    const sq = BOARD[i];
    if (sq.kind === 'city') w += p.houses * sq.house;
  }
  return w;
}

/* ---------------- money ---------------- */

function sellValue(s: State, id: string): number {
  // what the player could raise right now (houses back at half, then mortgages)
  let v = 0;
  for (const [k, p] of Object.entries(s.props)) {
    if (p.owner !== id) continue;
    const i = Number(k);
    const sq = BOARD[i];
    if (sq.kind === 'city') v += (p.houses * sq.house) / 2;
    if (!p.mortgaged) v += priceOf(i) / 2;
  }
  return v;
}

/** Raise cash automatically (bots, or players who owe money outside their turn). */
function liquidate(ctx: GameCtx, s: State, id: string, need: number) {
  const pl = P(s, id);
  // a strong bot mortgages its lone deeds before selling houses back at half price
  if (need !== Infinity && ctx.isBot(id) && botLevel(ctx) !== 'easy') {
    for (const i of spareDeeds(s, id)) {
      if (pl.cash >= need) return;
      s.props[i].mortgaged = true;
      pl.cash += priceOf(i) / 2;
      log(ctx, s, `رهن: ${BOARD[i].name} (${name(ctx, id)})`, { by: id });
    }
  }
  const mine = Object.keys(s.props).map(Number).filter((i) => owns(s, id, i));
  // sell houses, most expensive groups last
  const built = mine.filter((i) => s.props[i].houses > 0).sort((a, b) => priceOf(a) - priceOf(b));
  while (pl.cash < need && built.some((i) => s.props[i].houses > 0)) {
    // keep building even: sell from the most built square of the cheapest group
    const i = built.filter((j) => s.props[j].houses > 0).sort((a, b) => s.props[b].houses - s.props[a].houses || priceOf(a) - priceOf(b))[0];
    const sq = BOARD[i];
    if (sq.kind !== 'city') break;
    s.props[i].houses -= 1;
    pl.cash += sq.house / 2;
  }
  for (const i of mine.sort((a, b) => priceOf(a) - priceOf(b))) {
    if (pl.cash >= need) break;
    const p = s.props[i];
    const g = groupOf(i);
    if (p.mortgaged || (g && groupSquares(g).some((j) => s.props[j]?.houses))) continue;
    p.mortgaged = true;
    pl.cash += priceOf(i) / 2;
    log(ctx, s, `رهن: ${BOARD[i].name} (${name(ctx, id)})`, { by: id });
  }
}

function bankrupt(ctx: GameCtx, s: State, id: string, to: string | null) {
  const pl = P(s, id);
  liquidate(ctx, s, id, Infinity); // houses go back to the bank
  pl.bankrupt = true;
  pl.jail = null;
  for (const [k, p] of Object.entries(s.props)) {
    if (p.owner !== id) continue;
    if (to) {
      p.owner = to;
    } else delete s.props[Number(k)];
  }
  if (to) P(s, to).cash += pl.cash;
  pl.cash = 0;
  // read aloud: «إفلاس», and the winner when only one player is left
  const left = s.players.filter((p) => !p.bankrupt);
  log(ctx, s, `إفلاس ${name(ctx, id)}${to ? ` لصالح ${name(ctx, to)}` : ''}`, { by: id }, voiceAnd(VB.bankrupt, left.length === 1 && voiceWinner(name(ctx, left[0].id))));
  ctx.fx('boom', id);
  if (s.trade && (s.trade.from === id || s.trade.to === id)) s.trade = null;
  if (s.auction) {
    if (!s.auction.out.includes(id)) s.auction.out.push(id);
    if (s.auction.leader === id) s.auction.leader = null;
  }
  checkEnd(ctx, s);
}

/** Make `id` pay `amount` to `to` (null = bank). Returns false if the payer is now in debt. */
function charge(ctx: GameCtx, s: State, id: string, amount: number, to: string | null): boolean {
  const pl = P(s, id);
  if (pl.cash >= amount) {
    pl.cash -= amount;
    if (to) P(s, to).cash += amount;
    return true;
  }
  const isTurn = cur(s).id === id;
  if (!isTurn || ctx.isBot(id)) {
    liquidate(ctx, s, id, amount);
    if (pl.cash >= amount) {
      pl.cash -= amount;
      if (to) P(s, to).cash += amount;
      return true;
    }
    bankrupt(ctx, s, id, to);
    return false;
  }
  if (pl.cash + sellValue(s, id) < amount) {
    // can't possibly pay: the creditor gets what there is
    bankrupt(ctx, s, id, to);
    return false;
  }
  s.debt = { amount, to };
  s.phase = 'debt';
  return false;
}

/* ---------------- turns ---------------- */

function checkEnd(ctx: GameCtx, s: State) {
  const left = s.players.filter((p) => !p.bankrupt);
  if (left.length <= 1) {
    s.phase = 'final';
    s.winner = left[0]?.id ?? null;
    ctx.fx('win', s.winner ?? undefined);
  }
}

function endByRounds(ctx: GameCtx, s: State) {
  const left = s.players.filter((p) => !p.bankrupt);
  s.winner = left.sort((a, b) => worthOf(s, b.id) - worthOf(s, a.id))[0]?.id ?? null;
  s.phase = 'final';
  ctx.fx('win', s.winner ?? undefined);
  // the only line of this move: it carries the winner's call
  if (s.winner) ctx.say?.(`انتهت الجولات — الفوز لـ${name(ctx, s.winner)}`, s.winner, voiceWinner(name(ctx, s.winner)));
}

function nextTurn(ctx: GameCtx, s: State) {
  if (s.phase === 'final') return;
  s.doubles = 0;
  s.extraRoll = false;
  s.buy = null;
  s.debt = null;
  s.auction = null;
  for (let k = 0; k < s.players.length; k++) {
    s.turnIdx = (s.turnIdx + 1) % s.players.length;
    if (s.turnIdx === 0) s.round += 1;
    if (!cur(s).bankrupt) break;
  }
  if (s.settings.rounds > 0 && s.round > s.settings.rounds) return endByRounds(ctx, s);
  s.phase = 'roll';
}

/** After a square is resolved: roll again on doubles, otherwise let the player manage / end. */
function afterResolve(ctx: GameCtx, s: State) {
  if (s.phase === 'final') return;
  if (cur(s).bankrupt) return nextTurn(ctx, s);
  if (s.phase === 'debt' || s.phase === 'buy') return;
  s.phase = s.extraRoll && cur(s).jail === null ? 'roll' : 'manage';
}

function sendToJail(ctx: GameCtx, s: State, id: string) {
  const pl = P(s, id);
  pl.pos = JAIL;
  pl.jail = 0;
  s.extraRoll = false;
  s.doubles = 0;
  log(ctx, s, `إلى السجن: ${name(ctx, id)}`, { by: id }, VB.jail);
  ctx.fx('buzz', id);
}

function moveTo(ctx: GameCtx, s: State, id: string, to: number, passGo = true) {
  const pl = P(s, id);
  if (passGo && to < pl.pos) {
    pl.cash += GO_BONUS;
    log(ctx, s, `+${GO_BONUS} لـ${name(ctx, id)} من «انطلاق»`, { by: id, points: GO_BONUS });
  }
  pl.pos = to;
}

function drawCard(ctx: GameCtx, s: State, id: string, deck: 'luck' | 'family') {
  const pile = deck === 'luck' ? s.luck : s.family;
  const card = pile.shift()!;
  pile.push(card);
  s.card = { id: ++s.cardN, deck, text: card.text, by: id };
  log(ctx, s, `${name(ctx, id)}: ${card.text}`, { by: id });
  ctx.fx('reveal', id);
  const pl = P(s, id);
  const a = card.act;
  switch (a.t) {
    case 'money':
      if (a.amount >= 0) pl.cash += a.amount;
      else charge(ctx, s, id, -a.amount, null);
      break;
    case 'goto':
      moveTo(ctx, s, id, a.to);
      land(ctx, s, id);
      return;
    case 'back':
      pl.pos = (pl.pos - a.n + 40) % 40;
      land(ctx, s, id);
      return;
    case 'jail':
      sendToJail(ctx, s, id);
      break;
    case 'free':
      pl.jailCards += 1;
      break;
    case 'repairs': {
      let cost = 0;
      for (const p of Object.values(s.props)) if (p.owner === id) cost += p.houses === 5 ? a.hotel : p.houses * a.house;
      if (cost) charge(ctx, s, id, cost, null);
      break;
    }
    case 'each': {
      for (const other of s.players) {
        if (other.id === id || other.bankrupt) continue;
        if (a.amount > 0) charge(ctx, s, other.id, a.amount, id);
        else if (!charge(ctx, s, id, -a.amount, other.id)) break;
      }
      break;
    }
    case 'nearest': {
      let to = pl.pos;
      do to = (to + 1) % 40;
      while (BOARD[to].kind !== a.kind);
      moveTo(ctx, s, id, to);
      land(ctx, s, id);
      return;
    }
  }
}

/** Resolve the square the player stands on. */
function land(ctx: GameCtx, s: State, id: string) {
  const pl = P(s, id);
  const i = pl.pos;
  const sq = BOARD[i];
  if (isOwnable(sq)) {
    const p = s.props[i];
    if (!p) {
      s.buy = i;
      s.phase = 'buy';
      return;
    }
    if (p.owner !== id && !p.mortgaged) {
      const owner = P(s, p.owner);
      if (owner.bankrupt) return;
      const rent = rentOf(s, i, (s.dice ?? [0, 0]).reduce((a, b) => a + b, 0));
      if (charge(ctx, s, id, rent, p.owner)) {
        log(ctx, s, `كراء ${sq.name}: ${rent} من ${name(ctx, id)} لـ${name(ctx, p.owner)}`, { by: id });
        ctx.fx('throw', p.owner);
      }
    }
    return;
  }
  switch (sq.kind) {
    case 'tax':
      if (charge(ctx, s, id, sq.amount, null)) log(ctx, s, `${sq.name}: ${sq.amount} من ${name(ctx, id)}`, { by: id });
      break;
    case 'luck':
      drawCard(ctx, s, id, 'luck');
      break;
    case 'family':
      drawCard(ctx, s, id, 'family');
      break;
    case 'gotojail':
      sendToJail(ctx, s, id);
      break;
    default:
      break;
  }
}

function canBuild(s: State, id: string, i: number): string | null {
  const sq = BOARD[i];
  if (sq.kind !== 'city') return 'لا يمكن البناء هنا';
  if (!owns(s, id, i)) return 'ليست ملكك';
  if (!ownsGroup(s.props, id, sq.group)) return 'تحتاج كل مدن هذا اللون';
  const g = groupSquares(sq.group);
  if (g.some((j) => s.props[j].mortgaged)) return 'فُكّ رهن مدن هذا اللون أولاً';
  if (s.props[i].houses >= 5) return 'فيها فندق';
  if (s.props[i].houses > Math.min(...g.map((j) => s.props[j].houses))) return 'ابنِ بالتساوي على مدن اللون';
  if (P(s, id).cash < sq.house) return 'لا يكفي المال';
  return null;
}

/* ---------------- auction ---------------- */

function startAuction(ctx: GameCtx, s: State, i: number) {
  s.buy = null;
  s.phase = 'auction';
  s.auction = { n: ++s.auctionN, sq: i, price: 0, leader: null, endsAt: ctx.now + AUCTION_MS, out: [], bids: 0 };
  log(ctx, s, `مزاد على ${BOARD[i].name}!`, {}, VB.auction);
  ctx.fx('reveal');
}

/** Everyone except the highest bidder has withdrawn. */
function auctionDone(s: State): boolean {
  const a = s.auction;
  if (!a) return false;
  return s.players.every((p) => p.bankrupt || p.id === a.leader || a.out.includes(p.id));
}

function endAuction(ctx: GameCtx, s: State) {
  const a = s.auction;
  if (!a) return;
  s.auction = null;
  const sq = BOARD[a.sq];
  const winner = a.leader ? P(s, a.leader) : null;
  if (winner && !winner.bankrupt && winner.cash >= a.price && !s.props[a.sq]) {
    winner.cash -= a.price;
    s.props[a.sq] = { owner: winner.id, houses: 0, mortgaged: false };
    log(ctx, s, `المزاد لـ${name(ctx, winner.id)}: ${sq.name} بـ ${a.price}`, { by: winner.id });
    ctx.fx('correct', winner.id);
  } else log(ctx, s, `لم يشترِ أحدٌ ${sq.name} — يبقى للبنك`);
  s.moves += 1;
  s.phase = 'manage';
  afterResolve(ctx, s);
}

/** The most a bot pays at auction: a share of the price depending on its cash and its colour sets. */
export function botAuctionMax(s: Pick<State, 'props' | 'players'>, id: string, i: number): number {
  const pl = s.players.find((p) => p.id === id);
  if (!pl) return 0;
  const sq = BOARD[i];
  const price = priceOf(i);
  let f = 0.7;
  if (sq.kind === 'city') {
    const others = groupSquares(sq.group).filter((j) => j !== i);
    if (others.every((j) => s.props[j]?.owner === id)) f = 1.3; // finishes my set
    else if (others.some((j) => s.props[j]?.owner === id)) f = 1;
    else if (others.every((j) => s.props[j]) && new Set(others.map((j) => s.props[j].owner)).size === 1) f = 0.95; // stops a rival finishing the set
  } else if (BOARD.some((b, j) => j !== i && b.kind === sq.kind && s.props[j]?.owner === id)) f = 1;
  const reserve = pl.cash < 500 ? 200 : 150;
  return Math.max(0, Math.min(Math.round((price * f) / 10) * 10, pl.cash - reserve));
}

/* ---------------- bots ---------------- */

function botManage(s: State, id: string): { type: string; [k: string]: unknown } | null {
  const pl = P(s, id);
  // unmortgage when rich
  for (const k of Object.keys(s.props).map(Number)) {
    const p = s.props[k];
    if (p.owner === id && p.mortgaged && pl.cash - Math.ceil((priceOf(k) / 2) * 1.1) > 500) return { type: 'unmortgage', sq: k };
  }
  // build on the most valuable group we can, keeping a reserve
  const cands = Object.keys(s.props)
    .map(Number)
    .filter((k) => !canBuild(s, id, k))
    .sort((a, b) => priceOf(b) - priceOf(a) || s.props[a].houses - s.props[b].houses);
  for (const k of cands) {
    const sq = BOARD[k];
    if (sq.kind === 'city' && pl.cash - sq.house >= 250) return { type: 'build', sq: k };
  }
  return null;
}

function tradeValue(s: State, side: { props: number[]; cash: number }) {
  return side.cash + side.props.reduce((t, i) => t + (s.props[i]?.mortgaged ? priceOf(i) / 2 : priceOf(i)), 0);
}

const completesFor = (s: State, id: string, gets: number[], loses: number[] = []) =>
  gets.some((i) => {
    const g = groupOf(i);
    return g && groupSquares(g).every((j) => gets.includes(j) || (owns(s, id, j) && !loses.includes(j)));
  });

/** Would a bot accept this offer? */
function botLikes(s: State, t: EstateTrade): boolean {
  const gain = tradeValue(s, t.give); // what the bot receives
  const cost = tradeValue(s, t.get);
  if (completesFor(s, t.to, t.give.props, t.get.props)) return gain >= cost * 0.8;
  if (completesFor(s, t.from, t.get.props, t.give.props)) return gain >= cost * 1.6;
  return gain >= cost * 1.2;
}

/** A bot looks for a city that would finish one of its colour sets and makes an offer for it. */
function botOffer(s: State, id: string): { to: string; give: { props: number[]; cash: number }; get: { props: number[]; cash: number } } | null {
  const me = P(s, id);
  const groups = [...new Set(Object.keys(s.props).map(Number).filter((i) => owns(s, id, i)).map(groupOf).filter(Boolean))] as EstateGroup[];
  for (const g of groups) {
    const sq = groupSquares(g);
    const missing = sq.filter((j) => !owns(s, id, j));
    if (missing.length !== 1) continue;
    const j = missing[0];
    const p = s.props[j];
    if (!p || P(s, p.owner).bankrupt || sq.some((k) => s.props[k]?.houses)) continue;
    const last = s.asked[`${id}:${j}`];
    if (last !== undefined && s.round - last < 6) continue;
    const other = p.owner;
    // a swap that finishes a set for both of us?
    for (const k of Object.keys(s.props).map(Number)) {
      if (!owns(s, id, k) || groupOf(k) === g || s.props[k].houses) continue;
      const gk = groupOf(k);
      if (gk && groupSquares(gk).some((x) => s.props[x]?.houses)) continue;
      if (completesFor(s, other, [k], [j])) {
        const diff = priceOf(j) - priceOf(k);
        const cash = Math.max(0, Math.min(diff, me.cash - 200));
        return { to: other, give: { props: [k], cash }, get: { props: [j], cash: 0 } };
      }
    }
    const cash = Math.round((priceOf(j) * 1.7) / 10) * 10;
    if (me.cash - cash >= 300) return { to: other, give: { props: [], cash }, get: { props: [j], cash: 0 } };
  }
  return null;
}

/* ---------------- module ---------------- */

export const estate: GameModule<State, EstateSettings> = {
  turnOf: (s) => ['roll', 'buy', 'manage', 'debt'].includes(s.phase) ? [cur(s).id] : [],
  id: 'estate',

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    ctx.fx('start');
    return {
      settings,
      players: order.map((id) => ({ id, pos: 0, cash: settings.startCash, jail: null, jailCards: 0, bankrupt: false })),
      turnIdx: 0,
      phase: 'roll',
      dice: null,
      rollId: 0,
      doubles: 0,
      extraRoll: false,
      props: {},
      buy: null,
      card: null,
      cardN: 0,
      luck: shuffle(LUCK_CARDS),
      family: shuffle(FAMILY_CARDS),
      debt: null,
      trade: null,
      tradeN: 0,
      auction: null,
      auctionN: 0,
      asked: {},
      round: 1,
      winner: null,
      feed: new Feed(),
      moves: 0,
      rolledAt: 0,
      rollSteps: 0,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    const me = s.players.find((p) => p.id === by);
    if (!me || me.bankrupt) return;
    const myTurn = cur(s).id === by;

    /* ---- trades (answered by the other player at any time) ---- */
    if (a.type === 'tradeAccept' || a.type === 'tradeDecline') {
      const t = s.trade;
      if (!t || t.to !== by) return;
      s.trade = null;
      if (a.type === 'tradeDecline') {
        log(ctx, s, `العرض مرفوض (${name(ctx, by)})`, { by });
        return;
      }
      const A = P(s, t.from), B = P(s, t.to);
      const ok =
        t.give.props.every((i) => owns(s, A.id, i)) &&
        t.get.props.every((i) => owns(s, B.id, i)) &&
        A.cash >= t.give.cash &&
        B.cash >= t.get.cash;
      if (!ok) throw new GameError('العرض لم يعد صالحاً');
      for (const i of t.give.props) s.props[i].owner = B.id;
      for (const i of t.get.props) s.props[i].owner = A.id;
      A.cash += t.get.cash - t.give.cash;
      B.cash += t.give.cash - t.get.cash;
      log(ctx, s, `صفقة بين ${name(ctx, A.id)} و ${name(ctx, B.id)}`, { by: A.id }, VB.deal);
      ctx.fx('correct', A.id);
      s.moves += 1;
      return;
    }
    if (a.type === 'tradeCancel') {
      if (s.trade?.from === by) s.trade = null;
      return;
    }

    /* ---- auction (everyone bids, the decliner too) ---- */
    if (a.type === 'bid' || a.type === 'pass') {
      const au = s.auction;
      if (s.phase !== 'auction' || !au) return;
      if (isNum(a.at) && a.at !== au.bids) return; // a bot reacting to an outdated price
      if (au.out.includes(by)) throw new GameError('انسحبت من هذا المزاد');
      if (au.leader === by) throw new GameError('عرضك هو الأعلى');
      if (a.type === 'pass') {
        au.out.push(by);
      } else {
        if (!isNum(a.add) || !AUCTION_STEPS.includes(a.add)) return;
        const price = au.price + a.add;
        if (me.cash < price) throw new GameError('لا يكفي المال');
        au.price = price;
        au.leader = by;
        au.bids += 1;
        au.endsAt = ctx.now + AUCTION_MS;
        ctx.fx('tick', by);
      }
      if (auctionDone(s)) endAuction(ctx, s);
      return;
    }

    // a bot's turn move planned before something else changed the table (a trade it was offered was
    // answered meanwhile…): it plans again, this one is dropped
    if (isNum(a.v) && a.v !== s.moves) return;
    if (!myTurn) throw new GameError('ليس دورك');

    if (a.type === 'trade') {
      if (s.trade) throw new GameError('هناك عرض ينتظر الرد');
      if (s.phase !== 'roll' && s.phase !== 'manage') return;
      const to = isStr(a.to) ? s.players.find((p) => p.id === a.to && !p.bankrupt && p.id !== by) : null;
      const side = (v: unknown) => {
        const o = (v ?? {}) as { props?: unknown; cash?: unknown };
        const props = Array.isArray(o.props) ? [...new Set(o.props.filter(isNum))] : [];
        const cash = isNum(o.cash) ? Math.max(0, Math.round(o.cash)) : 0;
        return { props, cash };
      };
      const give = side(a.give), get = side(a.get);
      if (!to) return;
      if (!give.props.length && !get.props.length && !give.cash && !get.cash) throw new GameError('العرض فارغ');
      if (!give.props.every((i) => owns(s, by, i)) || !get.props.every((i) => owns(s, to.id, i))) throw new GameError('عقارات غير صحيحة');
      const built = [...give.props, ...get.props].some((i) => {
        const g = groupOf(i);
        return g && groupSquares(g).some((j) => s.props[j]?.houses);
      });
      if (built) throw new GameError('بِع المنازل أولاً قبل مبادلة مدن هذا اللون');
      if (give.cash > me.cash || get.cash > to.cash) throw new GameError('المبلغ أكبر من المتوفر');
      s.trade = { id: ++s.tradeN, from: by, to: to.id, give, get, endsAt: ctx.now + (ctx.isBot(by) ? BOT_TRADE_MS : HUMAN_TRADE_MS) };
      log(ctx, s, `عرض صفقة من ${name(ctx, by)} على ${name(ctx, to.id)}`, { by });
      return;
    }

    /* ---- managing (own turn) ---- */
    if (['build', 'sell', 'mortgage', 'unmortgage'].includes(a.type)) {
      if (!['roll', 'manage', 'debt', 'buy'].includes(s.phase) || !isNum(a.sq)) return;
      const i = a.sq;
      const p = s.props[i];
      if (!p || p.owner !== by) throw new GameError('ليست ملكك');
      const sq = BOARD[i];
      if (a.type === 'build') {
        if (s.phase === 'debt') return;
        const why = canBuild(s, by, i);
        if (why) throw new GameError(why);
        if (sq.kind !== 'city') return;
        p.houses += 1;
        me.cash -= sq.house;
        log(ctx, s, `${p.houses === 5 ? 'فندق جديد' : 'منزل جديد'} لـ${name(ctx, by)} في ${sq.name}`, { by }, p.houses === 5 ? VB.hotel : undefined);
        ctx.fx('card', by);
      } else if (a.type === 'sell') {
        if (sq.kind !== 'city' || p.houses === 0) return;
        const g = groupSquares(sq.group);
        if (p.houses < Math.max(...g.map((j) => s.props[j].houses))) throw new GameError('بِع بالتساوي من مدن اللون');
        p.houses -= 1;
        me.cash += sq.house / 2;
      } else if (a.type === 'mortgage') {
        const g = groupOf(i);
        if (p.mortgaged) return;
        if (g && groupSquares(g).some((j) => s.props[j]?.houses)) throw new GameError('بِع المنازل أولاً');
        p.mortgaged = true;
        me.cash += priceOf(i) / 2;
        log(ctx, s, `رهن: ${sq.name} (${name(ctx, by)})`, { by });
      } else {
        if (!p.mortgaged || s.phase === 'debt') return;
        const cost = Math.ceil((priceOf(i) / 2) * 1.1);
        if (me.cash < cost) throw new GameError('لا يكفي المال');
        p.mortgaged = false;
        me.cash -= cost;
      }
      s.moves += 1;
      if (s.phase === 'debt' && s.debt && me.cash >= s.debt.amount) {
        const d = s.debt;
        me.cash -= d.amount;
        if (d.to) P(s, d.to).cash += d.amount;
        log(ctx, s, `سداد ${d.amount} من ${name(ctx, by)}`, { by });
        s.debt = null;
        s.phase = 'manage';
        afterResolve(ctx, s);
      }
      return;
    }

    if (a.type === 'settle') {
      if (s.phase !== 'debt' || !s.debt) return;
      const d = s.debt;
      if (ctx.isBot(by)) liquidate(ctx, s, by, d.amount);
      if (me.cash < d.amount) {
        if (!ctx.isBot(by)) throw new GameError('ما زال المال لا يكفي');
        s.debt = null;
        bankrupt(ctx, s, by, d.to);
        if ((s.phase as EstateView['phase']) !== 'final') nextTurn(ctx, s);
        return;
      }
      me.cash -= d.amount;
      if (d.to) P(s, d.to).cash += d.amount;
      s.debt = null;
      s.phase = 'manage';
      afterResolve(ctx, s);
      return;
    }

    if (a.type === 'bankrupt') {
      if (s.phase !== 'debt') return;
      const to = s.debt?.to ?? null;
      s.debt = null;
      bankrupt(ctx, s, by, to);
      if ((s.phase as EstateView['phase']) !== 'final') nextTurn(ctx, s);
      return;
    }

    if (a.type === 'payJail' || a.type === 'useCard') {
      if (s.phase !== 'roll' || me.jail === null) return;
      if (a.type === 'useCard') {
        if (!me.jailCards) return;
        me.jailCards -= 1;
      } else {
        if (me.cash < JAIL_FINE) throw new GameError('لا يكفي المال');
        me.cash -= JAIL_FINE;
      }
      me.jail = null;
      log(ctx, s, `خروج ${name(ctx, by)} من السجن`, { by }, VB.jailOut);
      return;
    }

    if (a.type === 'roll') {
      if (s.phase !== 'roll') return;
      const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      s.dice = d;
      s.rollId += 1;
      s.moves += 1;
      s.card = null;
      const dbl = d[0] === d[1];
      const sum = d[0] + d[1];
      if (me.jail !== null) {
        if (dbl) {
          me.jail = null;
          log(ctx, s, `زوج لـ${name(ctx, by)}: خروج من السجن`, { by }, voiceAnd(VB.doubles, VB.jailOut));
        } else {
          me.jail += 1;
          if (me.jail < 3) {
            log(ctx, s, `لا زوج: السجن مستمر لـ${name(ctx, by)}`, { by });
            s.phase = 'manage';
            return;
          }
          // third try: pay and go
          me.jail = null;
          if (!charge(ctx, s, by, JAIL_FINE, null)) return afterResolve(ctx, s);
          log(ctx, s, `خروج ${name(ctx, by)} من السجن مقابل ${JAIL_FINE}`, { by }, VB.jailOut);
        }
        s.extraRoll = false;
      } else if (dbl) {
        s.doubles += 1;
        if (s.doubles === 3) {
          sendToJail(ctx, s, by);
          s.phase = 'manage';
          return;
        }
        s.extraRoll = true;
      } else s.extraRoll = false;
      s.rolledAt = ctx.now;
      s.rollSteps = sum;
      const from = me.pos;
      moveTo(ctx, s, by, (me.pos + sum) % 40);
      ctx.fx('tick', by);
      const mark = lastLogId(s);
      land(ctx, s, by);
      if (lastLogId(s) === mark) {
        // nothing to pay or draw: say the roll and where the token stopped
        const sq = BOARD[me.pos];
        const free = isOwnable(sq) && !s.props[me.pos] ? ' (للبيع)' : '';
        const go = me.pos < from ? ` · +${GO_BONUS} من الانطلاق` : '';
        ctx.say?.(`رمية ${name(ctx, by)} ${d[0]}+${d[1]}: ${sq.name}${free}${go}${dbl ? ' · زوج!' : ''}`, by, dbl ? VB.doubles : undefined);
      }
      afterResolve(ctx, s);
      return;
    }

    if (a.type === 'buy' || a.type === 'skip') {
      if (s.phase !== 'buy' || s.buy === null) return;
      const i = s.buy;
      if (a.type === 'buy') {
        const price = priceOf(i);
        if (me.cash < price) throw new GameError('لا يكفي المال — ارهن عقاراً أو اطرحه في المزاد');
        me.cash -= price;
        s.props[i] = { owner: by, houses: 0, mortgaged: false };
        log(ctx, s, `شراء لـ${name(ctx, by)}: ${BOARD[i].name} بـ ${price}`, { by }, VB.buy);
        ctx.fx('correct', by);
      } else return startAuction(ctx, s, i);
      s.buy = null;
      s.phase = 'manage';
      afterResolve(ctx, s);
      return;
    }

    if (a.type === 'end') {
      if (s.phase !== 'manage') return;
      // a human's offer ends with their turn; a bot's offer keeps waiting (it expires on its own)
      if (s.trade?.from === by && !ctx.isBot(by)) s.trade = null;
      nextTurn(ctx, s);
    }
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    // answer trades offered to a bot
    const level = botLevel(ctx);
    const strong = level !== 'easy';
    const t = s.trade;
    if (t && ctx.isBot(t.to)) {
      const accept = strong ? expertAccepts(s, t) : botLikes(s, t);
      ctx.bot(t.to, `trade:${t.id}`, rand(800, 1300), { type: accept ? 'tradeAccept' : 'tradeDecline' });
    }
    const au = s.auction;
    if (s.phase === 'auction' && au) {
      for (const id of bots) {
        const pl = s.players.find((x) => x.id === id);
        if (!pl || pl.bankrupt || au.out.includes(id) || au.leader === id) continue;
        const gap = (strong ? expertAuctionMax(s, id, au.sq) : botAuctionMax(s, id, au.sq)) - au.price;
        const key = `auc:${au.n}:${au.bids}`;
        if (gap < 10) ctx.bot(id, key, rand(600, 1200), { type: 'pass', at: au.bids });
        // the expert raises by the smallest step (never pays more than needed)
        else ctx.bot(id, key, rand(700, 1500), { type: 'bid', add: strong ? (gap >= 400 && au.price < 50 ? 50 : 10) : gap >= 150 ? 100 : gap >= 60 ? 50 : 10, at: au.bids });
      }
      return;
    }
    const p = cur(s);
    if (!ctx.isBot(p.id)) return;
    const key = `${s.moves}:${s.phase}`;
    const moves = s.moves;
    // every turn move carries the table version it was planned for (see act)
    const turnBot = ctx.bot;
    ctx = { ...ctx, bot: (id, k, d, a) => turnBot(id, k, d, { ...a, v: moves }) };
    // after a roll, wait until the dice and the token have landed on the phones (the room stretches
    // a bot's delay a little, hence ×0.75)
    const landed = Math.max(0, s.rolledAt + rollShowMs(s.rollSteps, paced(ctx, 700)) - ctx.now) * 0.75;
    const randDelay = (min: number, max: number) => Math.max(landed, rand(min, max));
    if (s.phase === 'debt') {
      ctx.bot(p.id, `bk:${key}`, randDelay(600, 1000), { type: 'settle' });
      return;
    }
    if (s.phase === 'roll') {
      if (p.jail !== null) {
        if (strong) {
          if (expertLeaveJail(s, p.id)) {
            if (p.jailCards) return void ctx.bot(p.id, `jail:${key}`, randDelay(600, 1000), { type: 'useCard' });
            if (p.cash >= JAIL_FINE) return void ctx.bot(p.id, `jail:${key}`, randDelay(600, 1000), { type: 'payJail' });
          }
        } else {
          if (p.jailCards) return void ctx.bot(p.id, `jail:${key}`, randDelay(600, 1000), { type: 'useCard' });
          if (p.cash > 400) return void ctx.bot(p.id, `jail:${key}`, randDelay(600, 1000), { type: 'payJail' });
        }
      }
      const m = strong ? expertManage(s, p.id) : botManage(s, p.id);
      if (m) return void ctx.bot(p.id, `m:${key}`, randDelay(500, 900), m);
      ctx.bot(p.id, `roll:${key}`, randDelay(750, 1050), { type: 'roll' });
      return;
    }
    if (s.phase === 'buy' && s.buy !== null) {
      const i = s.buy;
      if (strong) return void ctx.bot(p.id, `buy:${key}`, randDelay(1100, 1400), expertBuy(s, p.id, i));
      const price = priceOf(i);
      const g = groupOf(i);
      const completes = g ? groupSquares(g).every((j) => j === i || owns(s, p.id, j)) : false;
      const want = p.cash >= price && (p.cash - price >= 150 || completes);
      ctx.bot(p.id, `buy:${key}`, randDelay(1100, 1400), { type: want ? 'buy' : 'skip' });
      return;
    }
    if (s.phase === 'manage') {
      const m = strong ? expertManage(s, p.id) : botManage(s, p.id);
      if (m) return void ctx.bot(p.id, `m:${key}`, randDelay(500, 900), m);
      if (!s.trade) {
        const offer = level === 'expert' ? expertOffer(s, p.id, s.asked) : level === 'easy' ? botOffer(s, p.id) : null;
        if (offer) {
          s.asked[`${p.id}:${offer.get.props[0]}`] = s.round;
          return void ctx.bot(p.id, `tr:${key}`, randDelay(800, 1300), { type: 'trade', ...offer });
        }
      }
      ctx.bot(p.id, `end:${key}`, randDelay(1000, 1300), { type: 'end' });
    }
  },

  tick(ctx, s) {
    let changed = false;
    if (s.trade && ctx.now > s.trade.endsAt) {
      log(ctx, s, `انتهت مهلة العرض`, { by: s.trade.from });
      s.trade = null;
      changed = true;
    }
    if (s.phase === 'auction' && s.auction && (ctx.now >= s.auction.endsAt || auctionDone(s))) {
      endAuction(ctx, s);
      changed = true;
    }
    return changed;
  },

  view(ctx, s): EstateView {
    return {
      game: 'estate',
      phase: s.phase,
      players: s.players,
      turn: cur(s).id,
      dice: s.dice,
      rollId: s.rollId,
      props: s.props,
      buy: s.buy,
      card: s.card,
      debt: s.debt,
      trade: s.trade,
      auction: s.auction ? { sq: s.auction.sq, price: s.auction.price, leader: s.auction.leader, endsAt: s.auction.endsAt, out: s.auction.out } : null,
      round: s.round,
      maxRounds: s.settings.rounds,
      worth: Object.fromEntries(s.players.map((p) => [p.id, worthOf(s, p.id)])),
      winner: s.winner,
      feed: s.feed.list(),
    };
  },

  onLeave(ctx, s, id) {
    const pl = s.players.find((p) => p.id === id);
    if (!pl || pl.bankrupt || s.phase === 'final') return;
    const wasTurn = cur(s).id === id;
    bankrupt(ctx, s, id, null);
    if (wasTurn && (s.phase as EstateView['phase']) !== 'final') nextTurn(ctx, s);
  },

  /** The winner, then the other players still standing by worth, then the bankrupt ones (and leavers) together. */
  result(s) {
    const winner = s.winner;
    if (s.phase !== 'final' || !winner) return null;
    const rest = s.players.filter((p) => !p.bankrupt && p.id !== winner).map((p) => p.id);
    const worth = (id: string) => worthOf(s, id);
    const vals = [...new Set(rest.map(worth))].sort((a, b) => b - a);
    const broke = s.players.filter((p) => p.bankrupt && p.id !== winner).map((p) => p.id);
    const places = [[winner], ...vals.map((v) => rest.filter((id) => worth(id) === v))];
    return { places: broke.length ? [...places, broke] : places };
  },
};
