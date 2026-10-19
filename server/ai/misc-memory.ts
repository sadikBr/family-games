/**
 * «الذاكرة» bots. A bot only knows the cards that were turned face up in front of everyone.
 *
 * easy   — the old bot: each seen card is remembered with a 70 % chance, re-drawn at every flip.
 * smart  — remembers 90 % of what it saw, plays the expert strategy otherwise.
 * expert — perfect recall and a careful second flip:
 *   · a known pair on the table → take it;
 *   · otherwise turn a card nobody has seen (it may match a card we already know);
 *   · no match known for it → the second card: an unseen one only when that is worth the risk (the
 *     chance of hitting its mate is 1/u, but every known single on the table gives the next player a
 *     free pair if we turn up its mate), else a card already seen, which tells the others nothing.
 */
import type { BotLevel } from '../../src/shared/protocol';

export interface MemoryBoard {
  deck: readonly string[];
  owners: readonly (string | null)[];
  flipped: readonly number[];
  /** card index → face, for every card that has been face up */
  seen: Readonly<Record<number, string>>;
}

const pickOf = <T>(a: readonly T[], rand: () => number) => a[Math.floor(rand() * a.length)];

/** The card the bot turns next. `rand` decides forgetfulness and ties. */
export function memoryBotFlip(b: MemoryBoard, level: BotLevel, rand: () => number = Math.random): number {
  const open = (i: number) => !b.owners[i] && !b.flipped.includes(i);
  const hidden = b.deck.map((_, i) => i).filter(open);
  // the one card turned this turn (a pair found just before still sits in `flipped`, but is owned)
  const first = b.flipped.length === 1 ? b.flipped[0] : null;
  const firstFace = first === null ? null : b.seen[first];

  if (level === 'easy') {
    // the old bot, unchanged: imperfect memory re-drawn on every flip
    const memo = Object.entries(b.seen).filter(([i]) => !b.owners[Number(i)] && rand() < 0.7);
    if (first !== null) {
      const known = memo.find(([i, f]) => f === firstFace && Number(i) !== first);
      return known ? Number(known[0]) : pickOf(hidden, rand);
    }
    const byFace = new Map<string, number[]>();
    for (const [i, f] of memo) byFace.set(f, [...(byFace.get(f) ?? []), Number(i)]);
    const pair = [...byFace.values()].find((v) => v.length >= 2);
    return pair ? pair[0] : pickOf(hidden, rand);
  }

  const recall = level === 'expert' ? 1 : 0.9;
  // what the bot remembers: seen cards still on the table (not the one just turned: it is face up)
  const known = new Map<number, string>();
  for (const [k, f] of Object.entries(b.seen)) {
    const i = Number(k);
    if (open(i) && rand() < recall) known.set(i, f);
  }
  const unseen = hidden.filter((i) => !known.has(i));

  if (first !== null) {
    for (const [i, f] of known) if (f === firstFace) return i;
    if (!unseen.length) return pickOf(hidden, rand);
    if (!known.size) return pickOf(unseen, rand);
    // singles we know whose mate is still unseen: turning that mate up hands the next player a pair
    const faces = new Map<string, number>();
    for (const f of known.values()) faces.set(f, (faces.get(f) ?? 0) + 1);
    const singles = [...faces.values()].filter((n) => n === 1).length;
    // chance to match the first card vs chance to give a pair away (which also gives them another turn)
    const hit = 1 / unseen.length;
    const gift = singles / unseen.length;
    if (hit >= gift * 0.9) return pickOf(unseen, rand);
    return pickOf([...known.keys()], rand);
  }

  // first card of the turn: a known pair, else a card nobody has seen
  const byFace = new Map<string, number[]>();
  for (const [i, f] of known) byFace.set(f, [...(byFace.get(f) ?? []), i]);
  const pair = [...byFace.values()].find((v) => v.length >= 2);
  if (pair) return pair[0];
  return pickOf(unseen.length ? unseen : hidden, rand);
}
