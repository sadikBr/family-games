/**
 * «هزّ 2» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, the card values and the game's card on the home screen (title, how-to).
 * Rules: https://rasderb.com/rules/hez2 (Moroccan deck of 40, 2–4 players, 5 cards each).
 */
import type { Card, Suit } from '../cards';

export interface Hez2Settings {
  /** the game ends when someone reaches this many points (the fewest points then wins) */
  target: number;
  /**
   * a 2 as the last card: the round only ends once someone has drawn its penalty (if it comes back
   * to its player, they draw it and play on). Off («the table cancels it»): the next player draws
   * the penalty at once and the round ends.
   */
  lastTwo: boolean;
}

export const HEZ2_DEFAULTS: Hez2Settings = { target: 100, lastTwo: true };
export const HEZ2_TARGETS = [50, 100, 150, 200];
export const HEZ2_HAND = 5;
/** the last card of a round stays on the table this long before the round's results */
export const HEZ2_OVER_MS = 2600;
/** the next round deals itself after this long (the host can deal sooner) */
export const HEZ2_ROUND_END_MS = 25_000;

/** Points of a card left in hand: 1–7 at face value, the figures (10, 11, 12) 10 each. */
export const hez2Points = (c: Card) => (c.rank >= 10 ? 10 : c.rank);

/** Cards that do something when played (the first card turned up is never one of them). */
export const isSpecial = (c: Card) => c.rank === 1 || c.rank === 2 || c.rank === 7 || c.rank === 10 || c.rank === 12;

export interface Hez2Row {
  id: string;
  cards: Card[];
  points: number;
}

/** A call-out over the table: a 2 landing, a lost turn, the suit chosen with a 7, a 2 coming back. */
export interface Hez2Event {
  id: number;
  kind: 'two' | 'skip' | 'suit' | 'back';
  by: string;
  target?: string;
  /** cards to draw */
  n?: number;
  suit?: Suit;
}

export interface Hez2View {
  game: 'hez2';
  /** over = the last card lies on the table for a moment before the results */
  phase: 'play' | 'over' | 'roundEnd' | 'final';
  participants: string[];
  round: number;
  target: number;
  lastTwo: boolean;
  /** whose turn it is (null between rounds) */
  turn: string | null;
  top: Card | null;
  /** who played the top card (null: turned up at the deal) */
  topBy: string | null;
  /** the suit to follow (the top card's, or the one chosen with a 7) */
  suit: Suit;
  /** the top card is a 7 and its suit was chosen */
  suitChosen: boolean;
  /** cards the next draw costs (stacked 2s); 0 = none */
  pending: number;
  /** the player waiting for someone to take the penalty of their last card, a 2 */
  out: string | null;
  /** the player who plays again now (after a 1, a 10, or a 12 with two players) */
  again: string | null;
  deckLeft: number;
  myHand: Card[];
  playable: string[];
  counts: Record<string, number>;
  /** the player choosing a suit after a 7 */
  choosing: string | null;
  /** the card I just drew and may play */
  drawn: string | null;
  canDraw: boolean;
  canPass: boolean;
  scores: Record<string, number>;
  /** points of each round, in order */
  history: Record<string, number>[];
  event: Hez2Event | null;
  roundWinner: string | null;
  roundSummary: Hez2Row[] | null;
  /** the round ended because nobody could play or draw any more */
  stuck: boolean;
  winner: string | null;
  nextAt: number | null;
}

const HOW_TO = [
  'من 2 إلى 4 لاعبين بورق اللعب المغربي (40 ورقة)، لكل لاعب 5 أوراق. الهدف: أن تكون أول من يُنهي أوراقه.',
  'في دورك ضع ورقة لها الرقم نفسه أو اللون نفسه (أوروص، كوباص، شباضا، باسطوص) كالورقة المكشوفة. إن لم تجد، اسحب ورقة: إن صلحت فلك أن تلعبها فوراً، وإلا ينتقل الدور.',
  '7 جوكر: تُلعب على أي ورقة، وتختار بها اللون الذي يتبعه الجميع حتى تأتي 7 أخرى.',
  '2 «هزّ 2»: على اللاعب التالي سحب ورقتين وفقدان دوره، إلا إذا ردّ بـ2 أخرى فتتراكم العقوبة (حتى 8 أوراق). لا يُردّ على 2 إلا بـ2.',
  '1 والخادم (10): دور إضافي لك. الملك (12): دور ضائع على اللاعب التالي (وبلاعبَين: دور إضافي لك). لا تنتهي أوراقك بالخادم.',
  'إذا كانت آخر ورقة 2، لا تنتهي الجولة حتى يسحب أحدٌ عقوبتها، وإن عادت إليك سحبتها أنت وأكملت.',
  'في نهاية الجولة تُحسب الأوراق الباقية على صاحبها: من 1 إلى 7 بقيمتها، والخادم والفارس والملك 10 لكل واحدة.',
  'حين يبلغ أحدٌ 100 نقطة تنتهي اللعبة ويفوز صاحب أقل نقاط، وعند التعادل الأفضل في الجولة الأخيرة.',
];

const LAST_TWO_OFF = 'إذا كانت آخر ورقة 2، يسحب اللاعب التالي عقوبتها وتنتهي الجولة فوراً.';
const targetLine = (t: number) => `حين يبلغ أحدٌ ${t} نقطة تنتهي اللعبة ويفوز صاحب أقل نقاط، وعند التعادل الأفضل في الجولة الأخيرة.`;

export const HEZ2_INFO = {
  title: 'هزّ 2',
  tagline: 'طابق الرقم أو اللون، والـ2 تُثقل يد من بعدك… من يُنهي أوراقه أولاً؟',
  color: '#B83C8E',
  maxPlayers: 4,
  howTo: HOW_TO,
};

/** The cover text for non-default settings (the home card keeps the defaults). */
export function hez2Variant(s: Hez2Settings | undefined): { tagline: string; howTo: string[] } | null {
  if (!s || (s.lastTwo && s.target === HEZ2_DEFAULTS.target)) return null;
  const howTo = HOW_TO.slice();
  if (!s.lastTwo) howTo[5] = LAST_TWO_OFF;
  howTo[7] = targetLine(s.target);
  return { tagline: HEZ2_INFO.tagline, howTo };
}
