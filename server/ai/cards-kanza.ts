/**
 * الكانزة — the strong bot. For every legal play (a card and the table cards it takes, or a drop) it
 * samples the unseen cards (not in its hand, on the table or already captured — captured cards were all
 * shown) into the other hands and the stock, plays the rest of this deal with a 2-ply
 * greedy policy (each player takes the most points, minus the best answer of the next player), and keeps
 * the play with the best average point difference (golds count their number, the ace of golds 20).
 * Sees only what its own phone shows.
 */
import { RANKS, SUITS, type Card } from '../../src/shared/cards';
import { sampling } from './cards-tuning';
import type { BotLevel, CardSide } from '../../src/shared/protocol';

const TARGET = 15;

export interface KanzaKnowledge {
  me: string;
  seats: string[];
  sides: CardSide[];
  turnIdx: number;
  dealerIdx: number;
  hand: Card[];
  table: Card[];
  seen: Card[];
  handCounts: Record<string, number>;
  deckLeft: number;
}

export interface KanzaMove {
  card: Card;
  take: Card[];
}

/** A card in the simulation: its number and its points. */
interface C {
  id: number;
  r: number;
  v: number;
}

const points = (suit: string, rank: number) => (suit !== 'coins' ? 1 : rank === 1 ? 20 : rank);

interface Sim {
  n: number;
  side: number[];
  sides: number;
  hands: C[][];
  table: C[];
  deck: C[];
  turn: number;
  dealer: number;
  gain: number[];
  lastCapturer: number;
  /** stop after this many more deals (0 = at the end of the current one) */
  deals: number;
}

function clone(s: Sim): Sim {
  return { ...s, hands: s.hands.map((h) => h.slice()), table: s.table.slice(), gain: s.gain.slice() };
}

/** Every table combination (1–2 cards) that makes 15 with a card of number r. */
function combos(table: C[], r: number): C[][] {
  const need = TARGET - r;
  const out: C[][] = [];
  for (let i = 0; i < table.length; i++) {
    if (table[i].r === need) out.push([table[i]]);
    for (let j = i + 1; j < table.length; j++) if (table[i].r + table[j].r === need) out.push([table[i], table[j]]);
  }
  return out;
}

function apply(s: Sim, card: C, take: C[]) {
  const p = s.turn;
  const h = s.hands[p];
  h.splice(h.indexOf(card), 1);
  if (take.length) {
    s.table = s.table.filter((c) => !take.includes(c));
    let v = card.v;
    for (const c of take) v += c.v;
    s.gain[s.side[p]] += v;
    s.lastCapturer = p;
  } else s.table.push(card);
  s.turn = (p + 1) % s.n;
  if (s.hands.every((x) => !x.length)) {
    if (s.deck.length && s.deals > 0) {
      s.deals -= 1;
      const per = s.deck.length >= 3 * s.n ? 3 : Math.floor(s.deck.length / s.n);
      for (let i = 1; i <= s.n; i++) s.hands[(s.dealer + i) % s.n].push(...s.deck.splice(0, per));
      if (per < 3) s.table.push(...s.deck.splice(0));
    }
    if (s.hands.every((x) => !x.length) && !s.deck.length && s.lastCapturer >= 0) {
      // end of the hand: the last to take gets the table
      let v = 0;
      for (const c of s.table) v += c.v;
      s.gain[s.side[s.lastCapturer]] += v;
      s.table = [];
    }
  }
}

/** Best points the player on turn can take right now. */
function bestTake(s: Sim): number {
  let best = 0;
  for (const c of s.hands[s.turn]) {
    for (const t of combos(s.table, c.r)) {
      let v = c.v;
      for (const x of t) v += x.v;
      if (v > best) best = v;
    }
  }
  return best;
}

function moves(s: Sim): { card: C; take: C[] }[] {
  const out: { card: C; take: C[] }[] = [];
  const seenDrop = new Set<string>();
  for (const c of s.hands[s.turn]) {
    for (const t of combos(s.table, c.r)) out.push({ card: c, take: t });
    const k = `${c.r}:${c.v}`;
    if (!seenDrop.has(k)) {
      seenDrop.add(k);
      out.push({ card: c, take: [] });
    }
  }
  return out;
}

function policy(s: Sim): { card: C; take: C[] } {
  const side = s.side[s.turn];
  let best: { card: C; take: C[] } | null = null;
  let bestV = -Infinity;
  for (const m of moves(s)) {
    let v = 0;
    if (m.take.length) {
      v = m.card.v;
      for (const x of m.take) v += x.v;
    }
    const t = clone(s);
    apply(t, m.card, m.take);
    if (t.hands[t.turn].length && t.side[t.turn] !== side) v -= 1 * bestTake(t);
    // keep a card that can take later rather than a dead one
    if (!m.take.length) v -= m.card.v * 0.05;
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best!;
}

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

export function kanzaBotMove(k: KanzaKnowledge, level: BotLevel): KanzaMove {
  const start = performance.now();
  const n = k.seats.length;
  const sideIdx = (id: string) => Math.max(0, k.sides.findIndex((x) => x.members.includes(id)));
  const meIdx = k.seats.indexOf(k.me);
  const mySide = sideIdx(k.me);
  let uid = 0;
  const toC = (c: Card): C => ({ id: uid++, r: c.rank, v: points(c.suit, c.rank) });
  const handC = k.hand.map(toC);
  const tableC = k.table.map(toC);
  const known = new Set([...k.hand, ...k.table, ...k.seen].map((c) => c.id));
  const unseen: C[] = [];
  for (const suit of SUITS) for (const rank of RANKS) if (!known.has(`${suit}-${rank}`)) unseen.push({ id: uid++, r: rank, v: points(suit, rank) });

  const base: Sim = {
    n,
    side: k.seats.map(sideIdx),
    sides: k.sides.length,
    hands: k.seats.map(() => []),
    table: tableC,
    deck: [],
    turn: k.turnIdx,
    dealer: k.dealerIdx,
    gain: k.sides.map(() => 0),
    lastCapturer: -1,
    // only to the end of this deal: a longer horizon with all hands known in the sample played worse
    deals: 0,
  };
  base.hands[meIdx] = handC;
  const rootMoves = moves(base);
  const pickBack = (m: { card: C; take: C[] }): KanzaMove => ({
    card: k.hand[handC.indexOf(m.card)],
    take: m.take.map((x) => k.table[tableC.indexOf(x)]),
  });
  if (rootMoves.length === 1) return pickBack(rootMoves[0]);

  const lv = level === 'expert' ? 'expert' : 'smart';
  const { max: maxSamples, budget } = sampling(lv, lv === 'expert' ? 30 : 6, lv === 'expert' ? 300 : 30);
  const total = rootMoves.map(() => 0);
  let samples = 0;
  const pool = unseen.slice();
  while (samples < maxSamples) {
    shuffleInPlace(pool);
    const world = clone(base);
    let at = 0;
    for (let i = 0; i < n; i++) {
      if (i === meIdx) continue;
      const cnt = k.handCounts[k.seats[i]] ?? 0;
      world.hands[i] = pool.slice(at, at + cnt);
      at += cnt;
    }
    world.deck = pool.slice(at, at + k.deckLeft);
    rootMoves.forEach((m, i) => {
      const w = clone(world);
      apply(w, m.card, m.take);
      while (w.hands[w.turn].length || w.hands.some((h) => h.length)) {
        if (!w.hands[w.turn].length) {
          w.turn = (w.turn + 1) % w.n;
          continue;
        }
        const pm = policy(w);
        apply(w, pm.card, pm.take);
      }
      let v = w.gain[mySide];
      let others = 0;
      for (let j = 0; j < w.sides; j++) if (j !== mySide) others += w.gain[j];
      v -= w.sides > 1 ? others / (w.sides - 1) : 0;
      // what stays on the table for the next deal is up for grabs: a little risk for golds left there
      if (w.deck.length || k.deckLeft > 0) {
        let tv = 0;
        for (const c of w.table) tv += c.v > 1 ? c.v : 0;
        v -= tv * 0.15;
      }
      total[i] += v;
    });
    samples += 1;
    if (performance.now() - start > budget) break;
  }
  const avg = total.map((t) => t / samples + (level === 'smart' ? (Math.random() - 0.5) * 1.5 : 0));
  let best = 0;
  for (let i = 1; i < avg.length; i++) if (avg[i] > avg[best]) best = i;
  return pickBack(rootMoves[best]);
}
