/**
 * «البلوط» — pure rules shared by the server and the app: the 32-card deck, card order and points
 * (أبناط) in صن and حكم, the legal cards (follow suit; in حكم the trumping duties with the partner
 * exceptions), projects (المشاريع) and how they compare, and the end-of-hand scoring.
 */
import type { BCard, BMode, BProjKind, BRank, BSide, BSuit } from './games/baloot';

export const B_SUITS: BSuit[] = ['S', 'H', 'C', 'D'];
/** the natural sequence (used for projects): A K Q J 10 9 8 7 */
export const B_RANKS: BRank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7'];

export const SUIT_NAME: Record<BSuit, string> = { S: 'سبيت', H: 'هاص', D: 'ديمن', C: 'شريا' };
export const SUIT_SYM: Record<BSuit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const isRedSuit = (s: BSuit) => s === 'H' || s === 'D';

/** strongest first */
const PLAIN_ORDER: BRank[] = ['A', '10', 'K', 'Q', 'J', '9', '8', '7'];
const TRUMP_ORDER: BRank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];
const PLAIN_VALUE: Record<BRank, number> = { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0 };
const TRUMP_VALUE: Record<BRank, number> = { J: 20, '9': 14, A: 11, '10': 10, K: 4, Q: 3, '8': 0, '7': 0 };

/** points of the last trick (الأرض) */
export const GROUND = 10;

export function makeBalootDeck(): BCard[] {
  return B_SUITS.flatMap((suit) => B_RANKS.map((rank) => ({ id: `${rank}${suit}`, suit, rank })));
}

/** «10♥» kept left-to-right inside Arabic text */
export const cardLabel = (c: BCard) => `⁦${c.rank}${SUIT_SYM[c.suit]}⁩`;
/** «♥ هاص» */
export const suitLabel = (s: BSuit) => `${SUIT_SYM[s]} ${SUIT_NAME[s]}`;

/** Card points (أبناط). */
export function cardValue(c: BCard, trump: BSuit | null): number {
  return c.suit === trump ? TRUMP_VALUE[c.rank] : PLAIN_VALUE[c.rank];
}

/** Strength of a card inside its own suit (higher wins). */
export function power(c: BCard, trump: BSuit | null): number {
  const order = c.suit === trump ? TRUMP_ORDER : PLAIN_ORDER;
  return order.length - order.indexOf(c.rank);
}

export interface Played {
  by: string;
  card: BCard;
}

/** Index (in the trick) of the card that holds the trick: the highest trump, else the highest card of the suit led. */
export function trickLeader(trick: { card: BCard }[], trump: BSuit | null): number {
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    const a = trick[best].card;
    const b = trick[i].card;
    if (b.suit === a.suit) {
      if (power(b, trump) > power(a, trump)) best = i;
    } else if (b.suit === trump) best = i;
  }
  return best;
}

/** Is this card the highest one still out of the tricks in its suit (a «إكة» lead)? */
export function isBoss(card: BCard, unplayed: BCard[], trump: BSuit | null): boolean {
  return !unplayed.some((c) => c.suit === card.suit && c.id !== card.id && power(c, trump) > power(card, trump));
}

/**
 * The cards I may play. Sun: follow suit if you can. Hokm (Saudi rules):
 * - trump led: overtrump if you can (any trump when your partner holds the trick), else any trump, else anything;
 * - plain suit led: follow suit; void → you must trump (beat a trump already played if you can,
 *   otherwise anything), unless your partner holds the trick and either you are the last to play
 *   or your partner led the highest card left in that suit (an ace or «إكة»).
 * `leadBoss`: the card led was the highest one left in its suit when it was led.
 */
export function legalCards(hand: BCard[], trick: { card: BCard }[], trump: BSuit | null, leadBoss = false): BCard[] {
  if (!trick.length) return hand;
  const led = trick[0].card.suit;
  const follow = hand.filter((c) => c.suit === led);
  if (!trump) return follow.length ? follow : hand;
  const pos = trick.length;
  const holder = trickLeader(trick, trump);
  const partnerHolds = pos >= 2 && holder === pos - 2;
  const trumps = hand.filter((c) => c.suit === trump);
  const top = Math.max(0, ...trick.filter((t) => t.card.suit === trump).map((t) => power(t.card, trump)));
  const over = trumps.filter((c) => power(c, trump) > top);
  if (led === trump) {
    if (!follow.length) return hand;
    if (partnerHolds) return follow;
    return over.length ? over : follow;
  }
  if (follow.length) return follow;
  if (!trumps.length) return hand;
  if (partnerHolds && (pos === 3 || leadBoss)) return hand;
  return over.length ? over : hand;
}

/* ------------------------------------------------------------------ */
/* Projects (المشاريع)                                                  */
/* ------------------------------------------------------------------ */

export interface Project {
  kind: BProjKind;
  cards: BCard[];
  /** top card of the sequence / rank of the four (sequence order) */
  top: BRank;
  /** four of a kind */
  four: boolean;
}

export const PROJECT_NAME: Record<BProjKind, string> = { sira: 'سرا', fifty: 'خمسين', hundred: 'مية', four100: 'أربعمية' };

/** Game points of a project: صن سرا 4، خمسين 10، مية 20، أربعمية 40 · حكم 2، 5، 10. */
export function projectPoints(kind: BProjKind, mode: BMode): number {
  const sun = { sira: 4, fifty: 10, hundred: 20, four100: 40 };
  const hokm = { sira: 2, fifty: 5, hundred: 10, four100: 10 };
  return (mode === 'sun' ? sun : hokm)[kind];
}

/** Comparable strength of a project: the kind first (a four of a kind beats a 5-card sequence), then the top card. */
export function projectRank(p: Project): number {
  const kind = p.kind === 'four100' ? 5 : p.kind === 'hundred' ? (p.four ? 4 : 3) : p.kind === 'fifty' ? 2 : 1;
  return kind * 10 + (B_RANKS.length - B_RANKS.indexOf(p.top));
}

export const projectKey = (p: Project) => `${p.kind}-${p.cards.map((c) => c.id).join('.')}`;

function candidates(hand: BCard[], mode: BMode): Project[] {
  const out: Project[] = [];
  for (const suit of B_SUITS) {
    const idx = hand.filter((c) => c.suit === suit).map((c) => B_RANKS.indexOf(c.rank)).sort((a, b) => a - b);
    // every run of 3, 4 or 5 consecutive cards
    for (let i = 0; i < idx.length; i++) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1 && j - i < 4) {
        j++;
        const len = j - i + 1;
        if (len >= 3) {
          const ranks = idx.slice(i, j + 1).map((k) => B_RANKS[k]);
          out.push({
            kind: len === 3 ? 'sira' : len === 4 ? 'fifty' : 'hundred',
            cards: ranks.map((r) => hand.find((c) => c.suit === suit && c.rank === r)!),
            top: ranks[0],
            four: false,
          });
        }
      }
    }
  }
  for (const rank of ['A', 'K', 'Q', 'J', '10'] as BRank[]) {
    const four = hand.filter((c) => c.rank === rank);
    if (four.length === 4) out.push({ kind: rank === 'A' && mode === 'sun' ? 'four100' : 'hundred', cards: four, top: rank, four: true });
  }
  return out;
}

/**
 * The best projects in a hand: no card in two projects; the most points, then the strongest project.
 * (An 8-card hand holds at most two.)
 */
export function findProjects(hand: BCard[], mode: BMode): Project[] {
  const all = candidates(hand, mode);
  let best: Project[] = [];
  let bestScore = [0, 0];
  const walk = (from: number, used: Set<string>, chosen: Project[]) => {
    const pts = chosen.reduce((t, p) => t + projectPoints(p.kind, mode), 0);
    const top = Math.max(0, ...chosen.map(projectRank));
    if (pts > bestScore[0] || (pts === bestScore[0] && top > bestScore[1])) {
      best = chosen.slice();
      bestScore = [pts, top];
    }
    for (let i = from; i < all.length; i++) {
      const p = all[i];
      if (p.cards.some((c) => used.has(c.id))) continue;
      const next = new Set(used);
      for (const c of p.cards) next.add(c.id);
      walk(i + 1, next, [...chosen, p]);
    }
  };
  walk(0, new Set(), []);
  return best.sort((a, b) => projectRank(b) - projectRank(a));
}

/**
 * Which team scores its projects: the one with the best single project; equal best projects go to
 * the player who played earlier in the first trick (`order`: the first trick's playing order).
 */
export function bestProjectSide(declared: { by: string; project: Project }[], order: string[], sideOf: (id: string) => BSide): BSide | null {
  let best: { by: string; project: Project } | null = null;
  for (const d of declared) {
    if (!best) best = d;
    else {
      const a = projectRank(d.project);
      const b = projectRank(best.project);
      if (a > b || (a === b && order.indexOf(d.by) < order.indexOf(best.by))) best = d;
    }
  }
  return best ? sideOf(best.by) : null;
}

/** «بلوت»: K and Q of trumps in one hand — not when that player's declared 100 already holds the K or the Q. */
export function balootBlocked(projects: Project[], trump: BSuit): boolean {
  return projects.some((p) => p.kind === 'hundred' && p.cards.some((c) => c.suit === trump && (c.rank === 'K' || c.rank === 'Q')));
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/** Game points per hand: صن 26، حكم 16. */
export const handTotal = (mode: BMode) => (mode === 'sun' ? 26 : 16);
/** Kaboot (all 8 tricks): صن 44، حكم 25. */
export const kabootTotal = (mode: BMode) => (mode === 'sun' ? 44 : 25);

/**
 * Card points → game points. حكم: nearest ten (a 5 rounds down) ÷ 10 (65 → 6, 66 → 7).
 * صن: ×2 ÷ 10, rounding to the nearest ten unless the units digit is 5 (64 → 12, 65 → 13, 66 → 14).
 */
export function abnatToPoints(abnat: number, mode: BMode): number {
  if (mode === 'hokm') return Math.floor((abnat + 4) / 10);
  if (abnat % 10 === 5) return abnat / 5;
  return 2 * Math.round(abnat / 10);
}

/** Card points that a number of game points stands for (to compare projects with abnat). */
const pointsToAbnat = (pts: number, mode: BMode) => pts * (mode === 'sun' ? 5 : 10);

export interface ScoreInput {
  mode: BMode;
  buyerSide: BSide;
  /** card points taken, the last trick's 10 included */
  abnat: Record<BSide, number>;
  tricks: Record<BSide, number>;
  /** game points of the projects that count (only the best team has some) */
  projects: Record<BSide, number>;
  /** «بلوت» game points */
  baloot: Record<BSide, number>;
  /** 1, 2 (دبل), 3 (ثري), 4 (فور) */
  mult: number;
}

export interface ScoreOutput {
  points: Record<BSide, number>;
  failed: boolean;
  kaboot: BSide | null;
  winner: BSide;
}

const other = (s: BSide): BSide => (s === 'A' ? 'B' : 'A');

/**
 * The points each team adds after a hand.
 * - The buyers win when their card points + projects + «بلوت» reach the defenders' (a tie goes to the buyers).
 * - Not doubled, buyers win: each team scores its own (the defenders' card points are rounded, the
 *   buyers get the rest of 26/16), plus its projects and «بلوت».
 * - Not doubled, buyers lose (خسرانة): the defenders take 26/16 + every project + every «بلوت».
 * - Doubled (×2, ×3, ×4): the winners take 26/16 × the multiplier + projects × 2 + «بلوت»; the losers nothing.
 * - Kaboot: the team that took all 8 tricks scores 44/25 (× the multiplier) + the projects (× 2 when doubled) + «بلوت».
 */
export function scoreHand(x: ScoreInput): ScoreOutput {
  const buyer = x.buyerSide;
  const def = other(buyer);
  const allProjects = x.projects.A + x.projects.B;
  const allBaloot = x.baloot.A + x.baloot.B;
  const projMult = x.mult > 1 ? 2 : 1;
  const kaboot: BSide | null = x.tricks.A === 8 ? 'A' : x.tricks.B === 8 ? 'B' : null;
  const points: Record<BSide, number> = { A: 0, B: 0 };
  if (kaboot) {
    points[kaboot] = kabootTotal(x.mode) * x.mult + allProjects * projMult + allBaloot;
    return { points, failed: kaboot !== buyer, kaboot, winner: kaboot };
  }
  const total = (s: BSide) => x.abnat[s] + pointsToAbnat(x.projects[s] + x.baloot[s], x.mode);
  const buyerWins = total(buyer) >= total(def);
  const winner = buyerWins ? buyer : def;
  if (x.mult === 1 && buyerWins) {
    const defCards = abnatToPoints(x.abnat[def], x.mode);
    points[def] = defCards + x.projects[def] + x.baloot[def];
    points[buyer] = handTotal(x.mode) - defCards + x.projects[buyer] + x.baloot[buyer];
  } else {
    points[winner] = handTotal(x.mode) * x.mult + allProjects * projMult + allBaloot;
  }
  return { points, failed: !buyerWins, kaboot: null, winner };
}

/** Sort a hand for display: suits alternating colours, strongest first in each suit. */
export function sortBaloot(cards: BCard[], trump: BSuit | null): BCard[] {
  const suits = B_SUITS.filter((s) => cards.some((c) => c.suit === s));
  return cards.slice().sort((a, b) => suits.indexOf(a.suit) - suits.indexOf(b.suit) || power(b, trump) - power(a, trump));
}
