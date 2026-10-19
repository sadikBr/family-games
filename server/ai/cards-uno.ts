/**
 * أونو فليب — the strong bot.
 * - Memory: everybody sees the other side of the cards in the other hands, so after a «قلب» the bot
 *   knows the faces it saw on their backs; it also remembers its own faces from before a flip and the
 *   other side of the top of the stock. A player who had to draw on a colour is marked short of it.
 * - Each playable card (each colour for a wild) is scored one move ahead: the cards it sheds, what it
 *   does to the next player (draws, skips — worth more when they are close to going out), how likely the
 *   next player is to answer it (known faces, colours they are short of, the odds for unknown cards),
 *   what is left for its own next turns, and for a «قلب» how the hands look on the other side.
 * - Wilds and attacks are kept for when they matter; points are dumped when someone is about to win;
 *   it always says «أونو» and always catches a forgotten one.
 * Sees only what its own phone shows (plus what it remembers seeing).
 */
import type { BotLevel, GameAction } from '../../src/shared/protocol';
import { canPlayFace, colorsOf, isWild, otherSide, unoPoints, type UnoCard, type UnoColor, type UnoFace, type UnoSide } from '../../src/shared/uno';

/** Per seat: card id → bitmask of the faces this seat has seen (1 = light, 2 = dark). */
export type UnoMemory = Record<string, Record<string, number>>;

const bit = (side: UnoSide) => (side === 'light' ? 1 : 2);
const faceOf = (c: UnoCard, side: UnoSide) => (side === 'light' ? c.light : c.dark);

/** Record what every seat can see right now. */
export function unoObserve(mem: UnoMemory, seats: string[], hands: Record<string, UnoCard[]>, side: UnoSide, top: UnoCard | undefined, deckTop: UnoCard | undefined) {
  const other = otherSide(side);
  for (const o of seats) {
    const m = (mem[o] ??= {});
    for (const x of seats) {
      const b = x === o ? bit(side) : bit(other);
      for (const c of hands[x] ?? []) m[c.id] = (m[c.id] ?? 0) | b;
    }
    if (top) m[top.id] = (m[top.id] ?? 0) | bit(side);
    if (deckTop) m[deckTop.id] = (m[deckTop.id] ?? 0) | bit(other);
  }
}

export interface UnoKnowledge {
  me: string;
  seats: string[];
  turnIdx: number;
  dir: 1 | -1;
  side: UnoSide;
  top: UnoFace;
  color: UnoColor;
  hand: UnoCard[];
  /** the other hands: the cards (only the faces this seat has seen may be read: see `knows`) */
  hands: Record<string, UnoCard[]>;
  memory: Record<string, number>;
  voids: Record<string, UnoColor[]>;
  drawn: string | null;
  scores: Record<string, number>;
  target: number;
}

/** Danger of a face to the others (attacks and wilds). */
const DANGER: Record<string, number> = { wildColor: 5, draw5: 4, skipAll: 3, wild2: 3, wild: 2.5, draw1: 1.5, skip: 1.5, reverse: 0.8, flip: 1, num: 0 };

function at(k: UnoKnowledge, dir: number, offset: number) {
  const n = k.seats.length;
  return k.seats[(((k.turnIdx + offset * dir) % n) + n) % n];
}

/** The faces of a side this seat knows for a card (null = unknown). */
function known(k: UnoKnowledge, c: UnoCard, side: UnoSide): UnoFace | null {
  return (k.memory[c.id] ?? 0) & bit(side) ? faceOf(c, side) : null;
}

/** Probability that player `o` can play on (top, color) on side `side`. */
function canAnswer(k: UnoKnowledge, o: string, side: UnoSide, top: UnoFace, color: UnoColor, pUnknown: number): number {
  const voids = side === k.side ? (k.voids[o] ?? []) : [];
  let none = 1;
  for (const c of k.hands[o] ?? []) {
    const f = known(k, c, side);
    if (f) {
      if (canPlayFace(f, top, color)) return 1;
      continue;
    }
    none *= 1 - (voids.includes(color) ? pUnknown * 0.35 : pUnknown);
  }
  return 1 - none;
}

/** Odds that an unknown card can be played on (top, color): a quarter for the colour, plus matches and wilds. */
function oddsUnknown(top: UnoFace): number {
  // 112 faces per side: 26 of each colour, 8 wilds, and about 6 of the same number / symbol elsewhere
  return 26 / 112 + 8 / 112 + (isWild(top) ? 0 : 6 / 112);
}

interface Option {
  card: UnoCard;
  color: UnoColor | null;
  score: number;
}

/** Score every play; returns them best first. */
export function unoScore(k: UnoKnowledge, level: BotLevel): Option[] {
  const hand = k.hand;
  const n = k.seats.length;
  const opps = k.seats.filter((id) => id !== k.me);
  const minOpp = Math.min(...opps.map((id) => k.hands[id]?.length ?? 7));
  const threat = (id: string) => {
    const h = k.hands[id]?.length ?? 7;
    return h <= 1 ? 8 : h <= 2 ? 5 : h <= 4 ? 2 : 0.5;
  };
  const playable = hand.filter((c) => (k.drawn ? c.id === k.drawn : true) && canPlayFace(faceOf(c, k.side), k.top, k.color));
  const out: Option[] = [];
  const myColors = (side: UnoSide, without: UnoCard) => {
    const m = new Map<UnoColor, number>();
    for (const c of hand) {
      if (c === without) continue;
      const f = side === k.side ? faceOf(c, side) : known(k, c, side);
      if (f?.color) m.set(f.color, (m.get(f.color) ?? 0) + 1);
    }
    return m;
  };
  for (const card of playable) {
    const f = faceOf(card, k.side);
    let side = k.side;
    let top = f;
    let dir = k.dir;
    let victim: string | null = null;
    let draws = 0;
    let next = at(k, dir, 1);
    switch (f.kind) {
      case 'draw1':
      case 'draw5':
        victim = next;
        draws = f.kind === 'draw1' ? 1 : 5;
        next = at(k, dir, 2);
        break;
      case 'skip':
        victim = next;
        next = at(k, dir, 2);
        break;
      case 'skipAll':
        next = k.me;
        break;
      case 'reverse':
        dir = dir === 1 ? -1 : 1;
        next = n === 2 ? k.me : at(k, dir, 1);
        break;
      case 'flip':
        side = otherSide(k.side);
        top = faceOf(card, side);
        break;
      case 'wild2':
        victim = next;
        draws = 2;
        next = at(k, dir, 2);
        break;
      case 'wildColor':
        victim = next;
        draws = 3; // until the colour shows: about 3–4
        next = at(k, dir, 2);
        break;
    }
    const colors: (UnoColor | null)[] = isWild(top) ? colorsOf(side) : [top.color];
    for (const col of colors) {
      const color = col ?? k.color;
      let s = 0;
      const left = hand.length - 1;
      if (left === 0) {
        out.push({ card, color: isWild(top) ? colorsOf(side)[0] : null, score: 1e6 });
        continue;
      }
      // shed; dump points when someone is close to going out
      s += 10;
      const pts = unoPoints(f);
      s += pts * (minOpp <= 2 ? 0.12 : 0.03);
      // flexibility kept: wilds are best played late or to stop someone
      if (isWild(f)) s -= minOpp <= 2 || left <= 2 ? 2 : 4;
      // attacks: worth most against someone about to win
      if (victim && victim !== k.me) {
        const tv = threat(victim);
        s += draws * (1.5 + 0.6 * tv) + (f.kind === 'skip' || draws ? 1 + tv : 0);
        if (minOpp > 3 && left > 3 && !isWild(f)) s -= 0.5; // a little thrift with attacks early on
      }
      // my next turn comes at once (a skip in a duel, «منع الجميع», reverse with two)
      if (next === k.me) s += left >= 1 ? 6 : 0;
      // the next player's answer
      if (next !== k.me) {
        const pu = oddsUnknown(top);
        const p = canAnswer(k, next, side, top, color, pu);
        s -= p * (8 + 1.5 * threat(next));
      }
      // what I keep for later: cards that follow this colour
      const mine = myColors(side, card);
      s += 0.8 * (mine.get(color) ?? 0);
      // a flip turns every hand over: compare how dangerous the others' hands are on each side
      if (f.kind === 'flip') {
        let delta = 0;
        for (const o of opps) {
          const hs = k.hands[o] ?? [];
          let now = 0;
          let then = 0;
          for (const c of hs) {
            const a = known(k, c, k.side);
            const b = known(k, c, side);
            now += a ? DANGER[a.kind] : 1.2;
            then += b ? DANGER[b.kind] : 1.2;
          }
          delta += (then - now) * (1 + threat(o) * 0.3);
        }
        s -= delta * 0.6;
        // my own hand on the other side: what I remember of it, else average
        let mineNow = 0;
        let mineThen = 0;
        for (const c of hand) {
          if (c === card) continue;
          mineNow += DANGER[faceOf(c, k.side).kind];
          const b = known(k, c, side);
          mineThen += b ? DANGER[b.kind] : 1.2;
        }
        s += (mineThen - mineNow) * 0.4;
      }
      if (level === 'smart') s += (Math.random() - 0.5) * 6;
      out.push({ card, color: isWild(top) ? color : null, score: s });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The colour to name after a wild (or a flip onto a wild). */
export function unoColor(k: UnoKnowledge, level: BotLevel): UnoColor {
  const opts = colorsOf(k.side);
  const next = at(k, k.dir, 1);
  let best = opts[0];
  let bestV = -Infinity;
  for (const col of opts) {
    let v = 0;
    for (const c of k.hand) if (faceOf(c, k.side).color === col) v += 1;
    // a colour the next player is short of, or holds none of (known faces)
    if ((k.voids[next] ?? []).includes(col)) v += 1.5;
    let knownCol = 0;
    for (const c of k.hands[next] ?? []) {
      const f = known(k, c, k.side);
      if (f?.color === col) knownCol++;
    }
    v -= knownCol * 0.8;
    if (level === 'smart') v += Math.random() * 1.2;
    if (v > bestV) {
      bestV = v;
      best = col;
    }
  }
  return best;
}

/** The bot's move on its turn (not while choosing a colour). */
export function unoTurn(k: UnoKnowledge, level: BotLevel): GameAction {
  const opts = unoScore(k, level);
  if (!opts.length) return k.drawn ? { type: 'pass' } : { type: 'draw' };
  const best = opts[0];
  // a card just drawn: play it unless keeping it is clearly better (a wild early on)
  if (k.drawn && best.score < 0 && k.hand.length > 3) return { type: 'pass' };
  return { type: 'play', card: best.card.id };
}

