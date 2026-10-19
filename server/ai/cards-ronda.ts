/**
 * روندا — the strong bot. Only the suits never matter in Ronda (a play is decided by its rank), so the
 * search works on ranks: for each rank the bot could play it samples the unseen cards (everything not in
 * its hand, on the table or already captured — every captured card was shown face up) into the other
 * hands, plays the rest of the deal out with a 2-ply greedy policy (دقة, «ف جوج», ميسا, the dealer's last
 * card and the end-of-hand table all scored like the game does) and keeps the rank with the best average
 * card + point difference. Sees only what its own phone shows.
 */
import { RANKS, type Card } from '../../src/shared/cards';
import { sampling } from './cards-tuning';
import type { BotLevel, CardSide } from '../../src/shared/protocol';

const R = RANKS.length; // 10 ranks, index 9 = the king (الراي), 0 = the ace
const KING = 9;
const ACE = 0;

export interface RondaKnowledge {
  me: string;
  seats: string[];
  sides: CardSide[];
  turnIdx: number;
  dealerIdx: number;
  hand: Card[];
  table: Card[];
  /** cards taken so far by every side (public: each was shown when taken) */
  seen: Card[];
  handCounts: Record<string, number>;
  deckLeft: number;
  lastPlayed: { by: string; cardId: string } | null;
  chain: { by: string; side: string; rank: number; cards: Card[] } | null;
}

interface Sim {
  n: number;
  side: number[];
  sides: number;
  hands: number[][];
  table: number[]; // count per rank (0 or 1: a matching card always takes)
  tableN: number;
  turn: number;
  /** rank dropped by the previous player, still on the table (for دقة) */
  dropped: number;
  droppedBy: number;
  chain: { by: number; side: number; r: number; cards: number; same: number } | null;
  gain: number[]; // per side: cards + points won in the simulation
  lastCapturer: number;
  finalDeal: boolean;
  dealer: number;
  left: number; // cards still in hands
}

const ri = (rank: number) => RANKS.indexOf(rank);

function clone(s: Sim): Sim {
  return {
    ...s,
    hands: s.hands.map((h) => h.slice()),
    table: s.table.slice(),
    gain: s.gain.slice(),
    chain: s.chain ? { ...s.chain } : null,
  };
}

/** Play rank `r` (index) for the player on turn. Mutates. */
function play(s: Sim, r: number) {
  const p = s.turn;
  const h = s.hands[p];
  h.splice(h.indexOf(r), 1);
  s.left -= 1;
  const side = s.side[p];
  const prev = (p - 1 + s.n) % s.n;
  let took = false;
  if (s.chain && s.chain.by === prev && s.chain.r === r && s.chain.side !== side) {
    const c = s.chain;
    s.gain[c.side] -= c.cards;
    const same = c.same + 1;
    s.gain[side] += c.cards + 1 + (same >= 4 ? 10 : 5);
    s.chain = same < 4 ? { by: p, side, r, cards: c.cards + 1, same } : null;
    s.dropped = -1;
    s.lastCapturer = p;
    took = true;
  } else if (s.table[r]) {
    let k = 0;
    for (let i = r; i < R && s.table[i]; i++) {
      s.table[i] = 0;
      k++;
    }
    s.tableN -= k;
    const daqa = s.dropped === r && s.droppedBy === prev;
    const missa = s.tableN === 0 && !(s.finalDeal && s.left === 0);
    s.gain[side] += k + 1 + (daqa ? 1 : 0) + (missa ? 1 : 0);
    s.chain = daqa ? { by: p, side, r, cards: k + 1, same: 2 } : null;
    s.dropped = -1;
    s.lastCapturer = p;
    took = true;
  } else {
    s.table[r] = 1;
    s.tableN += 1;
    s.dropped = r;
    s.droppedBy = p;
    s.chain = null;
  }
  if (s.left === 0 && s.finalDeal) {
    // المفرّق ياكل القاعة, then the last capturer takes what is left
    if (p === s.dealer) {
      if (took && s.tableN) {
        s.gain[side] += s.tableN;
        s.table.fill(0);
        s.tableN = 0;
      }
      if (took && r === KING) s.gain[side] += 5;
      else if (r === ACE || !took) for (let k = 0; k < s.sides; k++) if (k !== side) s.gain[k] += 5;
    }
    if (s.tableN && s.lastCapturer >= 0) s.gain[s.side[s.lastCapturer]] += s.tableN;
    s.tableN = 0;
  }
  s.turn = (p + 1) % s.n;
}

/** What playing rank `r` is worth right now to the side on turn (cards + points, rough). */
function immediate(s: Sim, r: number): number {
  const t = clone(s);
  const side = s.side[s.turn];
  const before = t.gain[side];
  play(t, r);
  return t.gain[side] - before;
}

const distinct = (h: number[]) => [...new Set(h)];

/** Rollout policy: the play that is best after the next player's best answer (both known in the sample). */
function policy(s: Sim): number {
  const h = s.hands[s.turn];
  const opts = distinct(h);
  if (opts.length === 1) return opts[0];
  const side = s.side[s.turn];
  let best = opts[0];
  let bestV = -Infinity;
  for (const r of opts) {
    const t = clone(s);
    const b0 = t.gain.slice();
    play(t, r);
    let v = t.gain[side] - b0[side];
    for (let k = 0; k < s.sides; k++) if (k !== side) v -= t.gain[k] - b0[k];
    if (t.left > 0 && t.hands[t.turn].length && t.side[t.turn] !== side) {
      // the next player answers with their best immediate play
      let worst = 0;
      for (const q of distinct(t.hands[t.turn])) worst = Math.max(worst, immediate(t, q));
      v -= worst * 0.9;
    }
    if (v > bestV) {
      bestV = v;
      best = r;
    }
  }
  return best;
}

function rollout(s: Sim) {
  while (s.left > 0) {
    if (!s.hands[s.turn].length) {
      s.turn = (s.turn + 1) % s.n;
      continue;
    }
    play(s, policy(s));
  }
}

function shuffleInPlace<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/** The card the bot plays. */
export function rondaBotCard(k: RondaKnowledge, level: BotLevel): Card {
  const start = performance.now();
  const hand = k.hand;
  const ranks = [...new Set(hand.map((c) => ri(c.rank)))];
  const cardOf = (r: number) => hand.find((c) => ri(c.rank) === r)!;
  if (ranks.length === 1) return hand[0];

  const n = k.seats.length;
  const sideKeys = k.sides.map((x) => x.key);
  const sideIdx = (id: string) => Math.max(0, k.sides.findIndex((x) => x.members.includes(id)));
  const meIdx = k.seats.indexOf(k.me);
  const mySide = sideIdx(k.me);
  const known = new Set([...hand, ...k.table, ...k.seen].map((c) => c.id));
  const unseen: number[] = [];
  for (const suit of ['coins', 'cups', 'swords', 'clubs']) for (const rank of RANKS) if (!known.has(`${suit}-${rank}`)) unseen.push(ri(rank));

  const table = new Array(R).fill(0);
  for (const c of k.table) table[ri(c.rank)] = 1;
  const dropped = k.lastPlayed ? k.table.find((c) => c.id === k.lastPlayed!.cardId) : undefined;
  const base: Sim = {
    n,
    side: k.seats.map(sideIdx),
    sides: sideKeys.length,
    hands: k.seats.map(() => []),
    table,
    tableN: k.table.length,
    turn: k.turnIdx,
    dropped: dropped ? ri(dropped.rank) : -1,
    droppedBy: k.lastPlayed ? k.seats.indexOf(k.lastPlayed.by) : -1,
    chain: k.chain
      ? {
          by: k.seats.indexOf(k.chain.by),
          side: sideIdx(k.chain.by),
          r: ri(k.chain.rank),
          cards: k.chain.cards.length,
          same: k.chain.cards.filter((c) => c.rank === k.chain!.rank).length,
        }
      : null,
    gain: sideKeys.map(() => 0),
    lastCapturer: -1,
    finalDeal: k.deckLeft === 0,
    dealer: k.dealerIdx,
    left: 0,
  };
  base.hands[meIdx] = hand.map((c) => ri(c.rank));
  base.left = k.seats.reduce((t, id) => t + (id === k.me ? hand.length : (k.handCounts[id] ?? 0)), 0);

  const lv = level === 'expert' ? 'expert' : 'smart';
  const { max: maxSamples, budget } = sampling(lv, lv === 'expert' ? 30 : 6, lv === 'expert' ? 400 : 40);
  const total = ranks.map(() => 0);
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
    ranks.forEach((r, i) => {
      const w = clone(world);
      play(w, r);
      rollout(w);
      let v = w.gain[mySide];
      let others = 0;
      for (let j = 0; j < w.sides; j++) if (j !== mySide) others += w.gain[j];
      v -= w.sides > 1 ? others / (w.sides - 1) : 0;
      total[i] += v;
    });
    samples += 1;
    if (performance.now() - start > budget) break;
  }
  // 'smart': a little noise on the averages, so it sometimes misjudges a close call
  const avg = total.map((t) => t / samples + (level === 'smart' ? (Math.random() - 0.5) * 0.8 : 0));
  let best = 0;
  for (let i = 1; i < ranks.length; i++) if (avg[i] > avg[best]) best = i;
  return cardOf(ranks[best]);
}
