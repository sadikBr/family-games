/**
 * «القنبلة» — what the bots decide. Every function here gets a `BombBotInfo`: only what that bot may know (its own
 * hand, the public counts, the discard pile, and what its own «نظرة» or its own bomb placement told it about the
 * top of the deck). The deck order and the other hands never reach these functions.
 *
 * - easy: plays an action card now and then, at random; draws otherwise; gives a random card; puts the bomb back
 *   anywhere; plays «لا!» at random.
 * - smart: remembers what its «نظرة» showed: a bomb on top → «هجوم» / «تخطٍّ» / «خلط»; peeks when it doesn't
 *   know; steals when it has no defuse; keeps its defuse when asked; puts the bomb on top for the next player
 *   when few players are left; «لا!» against what aims at it, now and then.
 * - expert: all of that, plus it counts: the chance of a bomb = bombs left / cards in the deck. It peeks when that
 *   chance matters, dodges a likely bomb without a defuse, saves its defuse with a «تخطٍّ» when the bomb is likely,
 *   steals from the richest hand, and always plays «لا!» against an attack, a «طلب» or a theft aimed at it (and
 *   restores its own dodge when someone cancels it while it knows a bomb is on top).
 */
import type { BotLevel } from '../src/shared/protocol';
import { isPairKind, type BombCard, type BombKind, type BombPending, type BombPlace } from '../src/shared/games/bomb';

export type Rnd = () => number;

export interface BombBotInfo {
  me: string;
  hand: BombCard[];
  /** players still in, in seat order */
  alive: string[];
  /** cards in each player's hand (public) */
  counts: Record<string, number>;
  /** the next player still in after me */
  next: string | null;
  deck: number;
  bombs: number;
  /** what this bot knows about the top of the deck (index 0 = next card) */
  known: (BombKind | null)[];
  /** turns I still have to take, this one included */
  turns: number;
  /** action cards I played this turn already */
  plays: number;
}

export type BotMove = { type: 'draw' } | { type: 'play'; cards: string[]; target?: string };

const pickOne = <T>(a: readonly T[], rnd: Rnd): T => a[Math.floor(rnd() * a.length) % a.length];
const has = (info: BombBotInfo, k: BombKind) => info.hand.find((c) => c.kind === k) ?? null;

/** A pair in my hand (the character I have most of first). */
function aPair(info: BombBotInfo): BombCard[] | null {
  const by: Record<string, BombCard[]> = {};
  for (const c of info.hand) if (isPairKind(c.kind)) (by[c.kind] ??= []).push(c);
  const best = Object.values(by)
    .filter((l) => l.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  return best ? best.slice(0, 2) : null;
}

/** Players I could take a card from. */
const victims = (info: BombBotInfo) => info.alive.filter((p) => p !== info.me && (info.counts[p] ?? 0) > 0);

function stealTarget(level: BotLevel, info: BombBotInfo, rnd: Rnd): string | null {
  const v = victims(info);
  if (!v.length) return null;
  if (level !== 'expert') return pickOne(v, rnd);
  const most = Math.max(...v.map((p) => info.counts[p] ?? 0));
  return pickOne(
    v.filter((p) => (info.counts[p] ?? 0) === most),
    rnd,
  );
}

/** A steal (a pair, else «طلب») if I can. */
function steal(level: BotLevel, info: BombBotInfo, rnd: Rnd): BotMove | null {
  const target = stealTarget(level, info, rnd);
  if (!target) return null;
  const pair = aPair(info);
  if (pair) return { type: 'play', cards: pair.map((c) => c.id), target };
  const favor = has(info, 'favor');
  if (favor) return { type: 'play', cards: [favor.id], target };
  return null;
}

const play = (c: BombCard | null): BotMove | null => (c ? { type: 'play', cards: [c.id] } : null);

/** The chance that the next card is a bomb, as far as this bot knows. */
export function bombChance(info: BombBotInfo): number {
  const top = info.known[0];
  if (top === 'bomb') return 1;
  if (top) return 0;
  // the bombs I know of deeper down are not on top
  const knownBombs = info.known.filter((k) => k === 'bomb').length;
  const unknown = info.deck - info.known.filter((k) => k !== null).length;
  return unknown > 0 ? Math.max(0, info.bombs - knownBombs) / unknown : 0;
}

/** One step of the bot's turn: an action card to play, or the draw that ends the turn. */
export function botTurn(level: BotLevel, info: BombBotInfo, rnd: Rnd): BotMove {
  const draw: BotMove = { type: 'draw' };
  const top = info.known[0];
  const defuse = !!has(info, 'defuse');
  if (info.plays >= 5) return draw;

  if (level === 'easy') {
    if (info.plays >= 2 || rnd() > 0.35) return draw;
    const options: BotMove[] = [];
    for (const k of ['skip', 'attack', 'peek', 'shuffle'] as const) {
      const c = has(info, k);
      if (c) options.push({ type: 'play', cards: [c.id] });
    }
    const v = victims(info);
    if (v.length) {
      const favor = has(info, 'favor');
      if (favor) options.push({ type: 'play', cards: [favor.id], target: pickOne(v, rnd) });
      const pair = aPair(info);
      if (pair) options.push({ type: 'play', cards: pair.map((c) => c.id), target: pickOne(v, rnd) });
    }
    return options.length ? pickOne(options, rnd) : draw;
  }

  // a bomb on top (from my «نظرة», or the one I put back): dodge it
  if (top === 'bomb') {
    // «هجوم» first (under attack, «تخطٍّ» only ends one of the turns; «هجوم» passes them all on)
    const order: BombKind[] = ['attack', 'skip', 'shuffle'];
    if (level === 'smart' && info.turns === 1 && rnd() < 0.3) order.reverse();
    for (const k of order) {
      const m = play(has(info, k));
      if (m) return m;
    }
    return draw;
  }
  // the next card is known and safe: take it
  if (top) {
    if (!defuse && info.plays === 0 && rnd() < (level === 'expert' ? 0.6 : 0.3)) return steal(level, info, rnd) ?? draw;
    return draw;
  }

  const p = bombChance(info);
  const peek = has(info, 'peek');
  if (level === 'smart') {
    if (peek && info.bombs > 0 && rnd() < 0.7) return play(peek)!;
    if (!defuse && rnd() < 0.6) {
      const m = steal(level, info, rnd);
      if (m) return m;
    }
    if (!defuse && p > 0.3 && rnd() < 0.5) return play(has(info, 'skip')) ?? draw;
    return draw;
  }

  // expert: count the cards
  if (peek && p >= 0.08) return play(peek)!;
  if (!defuse) {
    if (info.plays < 3) {
      const m = steal(level, info, rnd);
      if (m) return m;
    }
    if (p >= 0.25) return play(has(info, 'attack')) ?? play(has(info, 'skip')) ?? (p >= 0.4 ? play(has(info, 'shuffle')) : null) ?? draw;
  } else if (p >= 0.45) {
    // a likely bomb: save the defuse if a dodge is in hand
    return play(has(info, 'skip')) ?? play(has(info, 'attack')) ?? draw;
  }
  return draw;
}

/** The card to give when asked («طلب»): the least useful one (a smart bot keeps its defuse and «لا!»). */
const KEEP: Record<BombKind, number> = { defuse: 100, nope: 60, attack: 50, skip: 45, peek: 30, favor: 28, shuffle: 25, bomb: 0, tajine: 10, teapot: 10, ladle: 10, sieve: 10, bread: 10 };

export function botGive(level: BotLevel, hand: BombCard[], rnd: Rnd): string {
  if (!hand.length) return '';
  if (level === 'easy') return pickOne(hand, rnd).id;
  const count = (k: BombKind) => hand.filter((c) => c.kind === k).length;
  // a lone character is worth less than one that makes a pair
  const value = (c: BombCard) => KEEP[c.kind] + (isPairKind(c.kind) && count(c.kind) >= 2 ? 15 : 0);
  const min = Math.min(...hand.map(value));
  return pickOne(
    hand.filter((c) => value(c) === min),
    rnd,
  ).id;
}

/**
 * Where to put the defused bomb back. `deck` = cards in the deck now; `turnsAfter` = turns I still take after
 * this one; `alive` = players still in.
 */
export function botPlace(level: BotLevel, deck: number, turnsAfter: number, alive: number, rnd: Rnd): BombPlace {
  if (level === 'easy') return Math.floor(rnd() * (deck + 1));
  // I draw again myself: far from the top
  if (turnsAfter > 0) return deck >= 4 ? Math.floor(deck / 2 + rnd() * (deck / 2 + 1)) : 'bottom';
  // few players: right on top, for the next one
  if (alive <= 3) return level === 'expert' || rnd() < 0.7 ? 0 : 1;
  if (level === 'expert') return rnd() < 0.5 ? 0 : Math.min(deck, alive - 1);
  return 'random';
}

/**
 * Does this bot play «لا!» on the pending action (as it stands now)? `stands` = the action will happen if nothing
 * more is played (an even number of «لا!» on it).
 */
export function botNope(level: BotLevel, info: BombBotInfo, p: BombPending, rnd: Rnd): boolean {
  const stands = p.nopes.length % 2 === 0;
  const mine = p.by === info.me;
  const aimed = p.target === info.me;
  if (level === 'easy') return !mine && stands ? rnd() < 0.2 : false;
  if (stands) {
    if (mine) return false;
    // what aims at me: an attack on me, a «طلب» or a theft from me
    if (aimed && (p.kind === 'attack' || p.kind === 'favor' || p.kind === 'pair')) return level === 'expert' ? true : rnd() < 0.55;
    return level === 'smart' ? rnd() < 0.05 : false;
  }
  // my own action was cancelled: bring it back when it matters (dodging a bomb I know of)
  if (mine && (p.kind === 'skip' || p.kind === 'attack') && info.known[0] === 'bomb') return level === 'expert' ? true : rnd() < 0.5;
  if (mine) return level === 'expert' ? rnd() < 0.3 : false;
  return false;
}
