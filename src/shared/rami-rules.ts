/**
 * «الرامي» rules shared by the server, the bots and the app: the 108-card deck, card names, melds
 * (تيرسي = set, سويفي = run, فرانك = without a joker), adding to a meld on the table, swapping a joker
 * back, the value of a first laydown, and a solver that finds the best laydown in a hand.
 */
import type { RCard, RMeld, RMeldKind, RSlot, RSuit } from './games/rami';

export const R_SUITS: RSuit[] = ['S', 'H', 'D', 'C'];
/** The suits by the names families use at the table (from the French deck). */
export const SUIT_AR: Record<RSuit, string> = { S: 'بيك', H: 'كور', D: 'كارو', C: 'تريفل' };
export const SUIT_SYM: Record<RSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const isRedSuit = (s: RSuit | null) => s === 'H' || s === 'D';

export const isJoker = (c: RCard) => c.rank === 0;

/** Two French decks (a, b) of 52 cards and 4 jokers. */
export function makeRamiDeck(): RCard[] {
  const out: RCard[] = [];
  for (const d of ['a', 'b']) for (const suit of R_SUITS) for (let rank = 1; rank <= 13; rank++) out.push({ id: `${d}-${suit}-${rank}`, suit, rank });
  for (let k = 1; k <= 4; k++) out.push({ id: `J${k}`, suit: null, rank: 0 });
  return out;
}

/** The index printed on the card: A 2 … 10 J Q K (14 = the ace above the K). */
export const rankLabel = (r: number) => (r === 1 || r === 14 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : String(r));
const RANK_AR: Record<number, string> = { 1: 'آس', 11: 'ولد', 12: 'ملكة', 13: 'ملك', 14: 'آس' };

/** «7 كور», «ملكة بيك», «آس كارو», «جوكر» */
export function ramiCardName(c: RCard): string {
  if (isJoker(c) || !c.suit) return 'جوكر';
  return `${RANK_AR[c.rank] ?? c.rank} ${SUIT_AR[c.suit]}`;
}

/** «7♥» — what a slot stands for (a joker shows the card it replaces). */
export function slotLabel(s: RSlot): string {
  return `${rankLabel(s.rank)}${s.suit ? SUIT_SYM[s.suit] : ''}`;
}

/** Points of a card left in hand at the end of a round. */
export const handPoints = (c: RCard) => (isJoker(c) ? 20 : 10);

/** The value of a place in a meld, for a first laydown: 2–10 at face value, J Q K and the high ace 10, the ace before 2 = 1. */
export function slotValue(kind: RMeldKind, rank: number): number {
  if (kind === 'run' && rank === 1) return 1;
  if (rank === 1 || rank >= 11) return 10;
  return rank;
}

export interface Arranged {
  kind: RMeldKind;
  slots: RSlot[];
  /** no joker */
  frank: boolean;
  /** what it counts toward a first laydown (a meld with a joker counts nothing) */
  value: number;
}

const meldValue = (kind: RMeldKind, slots: RSlot[]) => slots.reduce((t, s) => t + slotValue(kind, s.rank), 0);

function finish(kind: RMeldKind, slots: RSlot[]): Arranged {
  const frank = slots.every((s) => !isJoker(s.card));
  return { kind, slots, frank, value: frank ? meldValue(kind, slots) : 0 };
}

/** The suit a joker in a set of four stands for (null while two suits are missing). */
function setJokerSuit(naturals: RCard[], total: number): RSuit | null {
  if (total < 4) return null;
  return R_SUITS.find((s) => !naturals.some((c) => c.suit === s)) ?? null;
}

function trySet(cards: RCard[]): Arranged | null {
  const nat = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);
  if (cards.length < 3 || cards.length > 4 || jokers.length > 1 || nat.length < 2) return null;
  const rank = nat[0].rank;
  if (!nat.every((c) => c.rank === rank)) return null;
  if (new Set(nat.map((c) => c.suit)).size !== nat.length) return null;
  const sorted = nat.slice().sort((a, b) => R_SUITS.indexOf(a.suit!) - R_SUITS.indexOf(b.suit!));
  const slots: RSlot[] = sorted.map((c) => ({ card: c, rank, suit: c.suit }));
  if (jokers.length) slots.push({ card: jokers[0], rank, suit: setJokerSuit(nat, cards.length) });
  return finish('set', slots);
}

/** Positions 1..14 of a run: not both aces (no K-A-2 and no A…A). */
const runOk = (lo: number, hi: number) => lo >= 1 && hi <= 14 && !(lo === 1 && hi === 14);

/** Every way to read the aces of `cards` as low (1) or high (14). */
function acePositions(cards: RCard[]): number[][] {
  let out: number[][] = [[]];
  for (const c of cards) {
    const opts = c.rank === 1 ? [1, 14] : [c.rank];
    out = out.flatMap((p) => opts.map((o) => [...p, o]));
  }
  return out;
}

/**
 * Place natural cards (and maybe one joker) around `fixed` positions of a run. Returns the slots
 * (fixed ones included) or null. A joker with no gap to fill goes on the high end when it can.
 */
function placeRun(suit: RSuit, fixed: RSlot[], nat: RCard[], joker: RCard | null): RSlot[] | null {
  for (const pos of acePositions(nat)) {
    const all = [...fixed.map((s) => s.rank), ...pos];
    if (new Set(all).size !== all.length) continue;
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    if (!runOk(lo, hi)) continue;
    const holes: number[] = [];
    for (let p = lo; p <= hi; p++) if (!all.includes(p)) holes.push(p);
    if (holes.length > (joker ? 1 : 0)) continue;
    const slots: RSlot[] = [...fixed, ...nat.map((c, i) => ({ card: c, rank: pos[i], suit }))];
    if (joker) {
      let at: number | null = holes[0] ?? null;
      if (at === null) at = runOk(lo, hi + 1) ? hi + 1 : runOk(lo - 1, hi) ? lo - 1 : null;
      if (at === null) continue;
      slots.push({ card: joker, rank: at, suit });
    }
    return slots.sort((a, b) => a.rank - b.rank);
  }
  return null;
}

function tryRun(cards: RCard[]): Arranged | null {
  const nat = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);
  if (cards.length < 3 || jokers.length > 1 || nat.length < 2) return null;
  const suit = nat[0].suit!;
  if (!nat.every((c) => c.suit === suit)) return null;
  const slots = placeRun(suit, [], nat, jokers[0] ?? null);
  return slots ? finish('run', slots) : null;
}

/** Read cards as a meld (a set or a run, at most one joker), or null. */
export function arrange(cards: RCard[]): Arranged | null {
  if (new Set(cards.map((c) => c.id)).size !== cards.length) return null;
  return trySet(cards) ?? tryRun(cards);
}

export const meldSuit = (m: { slots: RSlot[] }): RSuit | null => m.slots.find((s) => !isJoker(s.card))?.card.suit ?? null;

/** The meld with `cards` added to it (jokers already there keep what they stand for), or null. */
export function addToMeld(m: { kind: RMeldKind; slots: RSlot[] }, cards: RCard[]): RSlot[] | null {
  if (!cards.length) return null;
  const jokers = cards.filter(isJoker);
  const nat = cards.filter((c) => !isJoker(c));
  const hasJoker = m.slots.some((s) => isJoker(s.card));
  if (jokers.length > 1 || (jokers.length && hasJoker)) return null;
  if (m.kind === 'set') {
    const got = trySet([...m.slots.map((s) => s.card), ...cards]);
    return got ? got.slots : null;
  }
  const suit = meldSuit(m);
  if (!suit || !nat.every((c) => c.suit === suit)) return null;
  const slots = placeRun(suit, m.slots, nat, jokers[0] ?? null);
  // the new cards must extend the run, not leave a hole inside it
  return slots && slots.length === m.slots.length + cards.length ? slots : null;
}

/** The joker a natural card can take the place of in this meld (its index), or -1. */
export function swapIndex(m: { kind: RMeldKind; slots: RSlot[] }, card: RCard): number {
  if (isJoker(card)) return -1;
  const i = m.slots.findIndex((s) => isJoker(s.card));
  if (i < 0) return -1;
  const j = m.slots[i];
  if (m.kind === 'run') {
    const ok = card.suit === j.suit && (card.rank === j.rank || (card.rank === 1 && j.rank === 14));
    return ok ? i : -1;
  }
  const nat = m.slots.filter((s) => !isJoker(s.card));
  if (card.rank !== j.rank || nat.some((s) => s.card.suit === card.suit)) return -1;
  return j.suit === null || j.suit === card.suit ? i : -1;
}

/** The meld after swapping: the natural card takes the joker's place. */
export function swapped(m: { kind: RMeldKind; slots: RSlot[] }, card: RCard): RSlot[] | null {
  const i = swapIndex(m, card);
  if (i < 0) return null;
  return m.slots.map((s, k) => (k === i ? { card, rank: s.rank, suit: card.suit } : s));
}

/** Hand order: by suit then rank (jokers last), or by rank then suit. */
export function sortRami(cards: RCard[], by: 'suit' | 'rank' = 'suit'): RCard[] {
  const r = (c: RCard) => (isJoker(c) ? 99 : c.rank);
  const s = (c: RCard) => (c.suit ? R_SUITS.indexOf(c.suit) : 9);
  return cards.slice().sort((a, b) => (by === 'suit' ? s(a) - s(b) || r(a) - r(b) : r(a) - r(b) || s(a) - s(b)) || a.id.localeCompare(b.id));
}

/* ------------------------------------------------------------------ */
/* A laydown made of several melds                                     */
/* ------------------------------------------------------------------ */

export interface LayCheck {
  melds: Arranged[];
  /** what the frank melds are worth */
  value: number;
  frankSet: boolean;
  frankRun: boolean;
}

/** Check each group of a laydown; null when one of them is not a meld. */
export function checkLay(groups: RCard[][]): LayCheck | null {
  const melds: Arranged[] = [];
  for (const g of groups) {
    const a = arrange(g);
    if (!a) return null;
    melds.push(a);
  }
  return {
    melds,
    value: melds.reduce((t, m) => t + m.value, 0),
    frankSet: melds.some((m) => m.frank && m.kind === 'set'),
    frankRun: melds.some((m) => m.frank && m.kind === 'run'),
  };
}

/* ------------------------------------------------------------------ */
/* Solver: the best laydown in a hand                                  */
/* ------------------------------------------------------------------ */

export interface LayGoal {
  /** already laid down this round (التلّاج): any melds will do */
  opened: boolean;
  /** least value of a first laydown (Infinity: only going out counts, as in سامبل) */
  need: number;
  /** this card must be in the laydown (the card taken from the discard pile) */
  mustInclude?: string | null;
}

type Cand = { keys: string[]; joker: boolean; kind: RMeldKind; value: number };
const keyOf = (c: RCard) => (isJoker(c) ? 'J' : `${c.suit}${c.rank}`);
const NODE_LIMIT = 30_000;

/** All melds that can be built from these counts (keys like "H7"; "J" = jokers). */
function candidates(count: Map<string, number>): Cand[] {
  const jokers = count.get('J') ?? 0;
  const out: Cand[] = [];
  const has = (k: string) => (count.get(k) ?? 0) > 0;
  // sets
  for (let r = 1; r <= 13; r++) {
    const suits = R_SUITS.filter((s) => has(`${s}${r}`));
    const subsets = (k: number, from = 0, acc: RSuit[] = []): RSuit[][] =>
      acc.length === k ? [acc] : suits.slice(from).flatMap((s, i) => subsets(k, from + i + 1, [...acc, s]));
    for (const k of [3, 4]) for (const sub of subsets(k)) out.push({ keys: sub.map((s) => `${s}${r}`), joker: false, kind: 'set', value: k * slotValue('set', r) });
    if (jokers) for (const k of [2, 3]) for (const sub of subsets(k)) out.push({ keys: sub.map((s) => `${s}${r}`), joker: true, kind: 'set', value: 0 });
  }
  // runs (position 14 = the ace above the K)
  for (const s of R_SUITS) {
    const at = (p: number) => has(`${s}${p === 14 ? 1 : p}`);
    const key = (p: number) => `${s}${p === 14 ? 1 : p}`;
    for (let lo = 1; lo <= 12; lo++) {
      for (let hi = lo + 2; hi <= 14; hi++) {
        if (!runOk(lo, hi)) continue;
        const missing: number[] = [];
        for (let p = lo; p <= hi; p++) if (!at(p)) missing.push(p);
        if (missing.length > 1) break; // longer runs only miss more
        const pos = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
        if (!missing.length) {
          out.push({ keys: pos.map(key), joker: false, kind: 'run', value: pos.reduce((t, p) => t + slotValue('run', p), 0) });
          // a joker may also stand in for a card that is in the hand, when that card could make a frank set
          if (jokers && pos.length >= 3) {
            for (const p of pos) {
              const r = p === 14 ? 1 : p;
              if (R_SUITS.filter((x) => x !== s && has(`${x}${r}`)).length >= 2) out.push({ keys: pos.filter((x) => x !== p).map(key), joker: true, kind: 'run', value: 0 });
            }
          }
        } else if (jokers && pos.length - 1 >= 2) {
          out.push({ keys: pos.filter((p) => p !== missing[0]).map(key), joker: true, kind: 'run', value: 0 });
        }
      }
    }
  }
  // long melds first: good laydowns are found early, before the search budget runs out
  return out.sort((a, b) => b.keys.length - a.keys.length);
}

/**
 * The best laydown for `goal` in `hand` (groups of cards), or null if there is none. Prefers going
 * out (at most one card left to throw), then the most cards laid, then the highest value.
 */
export function findLay(hand: RCard[], goal: LayGoal): RCard[][] | null {
  const count = new Map<string, number>();
  for (const c of hand) count.set(keyOf(c), (count.get(keyOf(c)) ?? 0) + 1);
  const must = goal.mustInclude ? hand.find((c) => c.id === goal.mustInclude) : null;
  if (goal.mustInclude && !must) return null;
  const mustKey = must ? keyOf(must) : null;
  const cands = candidates(count);
  // keys → small integers, so the search runs on a plain array of counts
  const keys = [...count.keys()];
  const idx = new Map(keys.map((k, i) => [k, i]));
  const left = keys.map((k) => count.get(k)!);
  const plan = cands.map((c) => {
    const need = new Map<number, number>();
    for (const k of [...c.keys, ...(c.joker ? ['J'] : [])]) need.set(idx.get(k)!, (need.get(idx.get(k)!) ?? 0) + 1);
    const usesMust = mustKey !== null && (mustKey === 'J' ? c.joker : c.keys.includes(mustKey));
    return { c, need: [...need.entries()], size: c.keys.length + (c.joker ? 1 : 0), usesMust, frankSet: !c.joker && c.kind === 'set', frankRun: !c.joker && c.kind === 'run' };
  });
  const n = hand.length;
  let best: { score: number[]; picks: Cand[] } | null = null;
  let nodes = 0;
  const picks: Cand[] = [];
  const better = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };
  const dfs = (from: number, used: number, value: number, fSet: boolean, fRun: boolean, mustUsed: boolean) => {
    if (++nodes > NODE_LIMIT) return;
    if (picks.length && (!mustKey || mustUsed)) {
      const out = n - used <= 1;
      if (goal.opened || (fSet && fRun && (out || value >= goal.need))) {
        const score = [out ? 1 : 0, used, value];
        if (!best || better(score, best.score)) best = { score, picks: picks.slice() };
      }
    }
    // nothing can beat laying every card
    if (best && best.score[1] === n) return;
    for (let i = from; i < plan.length; i++) {
      const p = plan[i];
      if (p.size > n - used) continue;
      let ok = true;
      for (const [k, v] of p.need) if (left[k] < v) { ok = false; break; }
      if (!ok) continue;
      for (const [k, v] of p.need) left[k] -= v;
      picks.push(p.c);
      dfs(i, used + p.size, value + p.c.value, fSet || p.frankSet, fRun || p.frankRun, mustUsed || p.usesMust);
      picks.pop();
      for (const [k, v] of p.need) left[k] += v;
      if (nodes > NODE_LIMIT || (best && best.score[1] === n)) return;
    }
  };
  dfs(0, 0, 0, false, false, false);
  const found = best as { score: number[]; picks: Cand[] } | null;
  if (!found) return null;
  // turn keys into real cards (the card that must go down is used first for its key)
  const pool = new Map<string, RCard[]>();
  for (const c of hand) pool.set(keyOf(c), [...(pool.get(keyOf(c)) ?? []), c]);
  if (must && mustKey) pool.set(mustKey, [must, ...pool.get(mustKey)!.filter((c) => c !== must)]);
  return found.picks.map((p) => [...p.keys, ...(p.joker ? ['J'] : [])].map((k) => pool.get(k)!.shift()!));
}

/**
 * Can `card` (taken from the discard pile) go down this turn? Once down: onto a meld, in place of a
 * joker, or in a new meld with cards of the hand; before: in a first laydown worth `need` (or going out).
 */
export function canUseCard(hand: RCard[], card: RCard, o: { opened: boolean; need: number; melds: RMeld[] }): boolean {
  const all = [...hand.filter((c) => c.id !== card.id), card];
  if (o.opened) {
    if (fitsTable(card, o.melds)) return true;
    return findLay(all, { opened: true, need: 0, mustInclude: card.id }) !== null;
  }
  return findLay(all, { opened: false, need: o.need, mustInclude: card.id }) !== null;
}

/** Can this card join or replace a joker in any of the melds? */
export function fitsTable(card: RCard, melds: RMeld[]): boolean {
  return melds.some((m) => addToMeld(m, [card]) !== null || swapIndex(m, card) >= 0);
}
