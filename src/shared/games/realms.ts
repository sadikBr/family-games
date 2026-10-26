/**
 * «الممالك الخمس» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 * A card game of books, runs and a wild that changes every round (Five Crowns rules): 116 cards — five
 * suits (fire, sun, leaf, water, star) × 3…K, twice, and 6 jokers. 2–7 players, lowest total wins.
 */
import type { FeedItem } from '../protocol';

export type RealmSuit = 'fire' | 'sun' | 'leaf' | 'water' | 'star';
export const REALM_SUITS: RealmSuit[] = ['fire', 'sun', 'leaf', 'water', 'star'];

export interface RealmCard {
  /** "a-fire-7" / "b-star-13" (two copies of each card), "J1".."J6" for the jokers */
  id: string;
  /** null for a joker */
  suit: RealmSuit | null;
  /** 3…10, 11 = J, 12 = Q, 13 = K; 0 = joker */
  rank: number;
}

export interface RealmsSettings {
  /** full = 11 rounds (3 to 13 cards); short = 6 rounds (3 to 8 cards) */
  rounds: 'full' | 'short';
  /** seconds for a turn (0 = no timer) */
  timer: 0 | 60 | 90 | 120;
}

/** A book (3+ of a rank, any suits) or a run (3+ in a row, one suit); wilds stand for anything. */
export interface RealmGroup {
  kind: 'book' | 'run';
  /** in display order (a run from low to high) */
  cards: RealmCard[];
  /** the rank each card stands for, in the same order (a wild shows what it replaces; 0 in a book of wilds) */
  ranks: number[];
}

/** The best arrangement of my hand, worked out by the server for my phone. */
export interface RealmsPlan {
  /** on my turn, with one card too many: the card to throw (the one to go out with, else the throw that leaves the fewest points); the groups and points below are then those of the other cards */
  throw: string | null;
  /** the groups, as card ids (best arrangement: fewest points left) */
  groups: string[][];
  /** the cards that fit nowhere */
  left: string[];
  /** their points */
  points: number;
  /** with one card too many (I drew): the cards I can throw and lay all the rest down (go out) */
  outCards: string[];
  /** on my last turn (someone went out): the throw that leaves the fewest points, and those points */
  best: { card: string; points: number } | null;
}

export interface RealmsRoundRow {
  id: string;
  groups: RealmGroup[];
  /** the cards that counted */
  left: RealmCard[];
  points: number;
  /** went out (laid everything down first) */
  out: boolean;
}

export interface RealmsView {
  game: 'realms';
  phase: 'play' | 'roundEnd' | 'final';
  participants: string[];
  /** still in the game (people who left are dropped) */
  active: string[];
  turn: string;
  step: 'draw' | 'discard';
  /** 1-based number of this round, and how many the game has */
  round: number;
  rounds: number;
  /** cards dealt to each player this round */
  dealt: number;
  /** the wild rank of the round (= the number of cards dealt; 11 = J, 12 = Q, 13 = K) */
  wild: number;
  myHand: RealmCard[];
  plan: RealmsPlan | null;
  /** the card I took from the discard pile this turn (it can't be thrown straight back) */
  taken: string | null;
  counts: Record<string, number>;
  discardTop: RealmCard | null;
  /** who threw the top card (null: turned up at the deal) */
  discardBy: string | null;
  stockLeft: number;
  /** who went out this round (everyone else has one last turn) */
  outBy: string | null;
  /** the groups they laid down */
  outGroups: RealmGroup[] | null;
  /** players who still have their last turn */
  lastTurn: string[];
  /** bumps once per going out (a one-shot banner) */
  outEvent: { id: number; by: string } | null;
  scores: Record<string, number>;
  /** the points each player got per round, oldest first */
  history: Record<string, number>[];
  feed: FeedItem[];
  summary: RealmsRoundRow[] | null;
  winner: string | null;
  /** when the next round deals itself (server time) */
  nextAt: number | null;
  /** when the current turn runs out (server time; null: no timer) */
  deadline: number | null;
  timer: number;
}

/** pause between rounds before the next one deals itself (the host can deal sooner) */
export const REALMS_ROUND_END_MS = 30_000;

export const REALMS_DEFAULTS: RealmsSettings = { rounds: 'full', timer: 0 };

/** The number of cards dealt in each round of a game with these settings (= the wild rank). */
export const realmsDeals = (s: RealmsSettings): number[] => (s.rounds === 'short' ? [3, 4, 5, 6, 7, 8] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);

export const REALMS_INFO = {
  title: 'الممالك الخمس',
  tagline: 'مجموعات ومتتاليات… وفي كل جولة جوكر جديد',
  color: '#9C4DB5',
  maxPlayers: 7,
  howTo: [
    'من 2 إلى 7 لاعبين. 116 ورقة: خمس ممالك (النار، الشمس، الغصن، الماء، النجمة) من 3 إلى 10 ثم J وQ وK، مرتين، و6 جوكر.',
    'إحدى عشرة جولة: في الأولى 3 أوراق لكل لاعب، ثم 4… حتى 13 في الأخيرة. وجوكر الجولة هو الرتبة التي تساوي عدد الأوراق: الثلاثات في الأولى، ثم الأربعات… ثم J وQ وK. والجوكر جوكر دائماً.',
    'في دورك: اسحب ورقة من الكومة أو خذ الورقة المكشوفة، ثم ارمِ ورقة.',
    'مجموعة = 3 أوراق أو أكثر من الرتبة نفسها (أي مملكة). متتالية = 3 أوراق أو أكثر متتابعة من المملكة نفسها (من 3 إلى K، بلا دوران). الجوكر يعوّض أي ورقة.',
    'اخرج عندما تصلح أوراقك كلها، بعد ورقة ترميها، في مجموعات ومتتاليات. بعدها يلعب كل لاعب آخر دوراً أخيراً واحداً.',
    'ثم يضع كل لاعب ما يستطيع (الترتيب الأفضل يُحسب تلقائياً)، وتُحسب عليه الأوراق الباقية: الأرقام بقيمتها، J = 11، Q = 12، K = 13، جوكر الجولة 20، الجوكر 50. ومن خرج أولاً: صفر.',
    'بعد الجولة الأخيرة يفوز صاحب أقل مجموع.',
    'اضغط «رتّب» ليرتّب التطبيق يدك في أفضل مجموعات، والأوراق التي عليها رقم أحمر هي التي ستُحسب عليك.',
  ],
};
