/**
 * «التوتي» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */
import type { Card, Suit } from '../cards';
import type { CardSide } from '../protocol';
import type { TSide } from '../touti-rules';

export type { TSide } from '../touti-rules';

/** who may sing after a trick taken by the bidding team: the one who took it, or either partner */
export type ToutiSingBy = 'winner' | 'team';

export interface ToutiSettings {
  /** the team that reaches this many points first wins */
  target: number;
  /** seconds per decision (0 = no limit); when it runs out the computer decides for you */
  timer: number;
  /** who may sing a pair after a trick won by the bidding team */
  singBy: ToutiSingBy;
  /** a player without the suit led need not trump while their partner holds the trick */
  partnerFree: boolean;
  /** 1 = beginner bots, 2 = strong bots */
  level: number;
}

export const TOUTI_TARGETS = [600, 300, 1000];

/** what a player said in the bidding: a number, or «باص» */
export type ToutiCall = number | 'pass';

export interface ToutiSung {
  by: string;
  suit: Suit;
  points: number;
  /** the trick after which it was sung */
  trick: number;
}

export interface ToutiHandResult {
  hand: number;
  bidder: string;
  bid: number;
  trump: Suit;
  bidSide: TSide;
  /** card points taken by each team (the last trick's 10 included) */
  cards: Record<TSide, number>;
  /** who took the last trick («الدير», +10) */
  last: TSide;
  tricks: Record<TSide, number>;
  /** the bidding team's pairs */
  sung: ToutiSung[];
  /** the bidding team's total: cards + pairs */
  made: number;
  success: boolean;
  /** what each team adds to its score */
  points: Record<TSide, number>;
}

export interface ToutiHistoryRow {
  A: number;
  B: number;
  bid: number;
  bidSide: TSide;
  success: boolean;
}

export interface ToutiView {
  game: 'touti';
  phase: 'bid' | 'trump' | 'play' | 'handEnd' | 'final';
  seats: string[];
  sides: CardSide[];
  dealer: string;
  hand: number;
  /** who must act now (null during a pause) */
  turn: string | null;
  /** server time the current decision runs out (null: no timer) */
  deadline: number | null;
  timer: number;
  /** the bidding: what each player said last (a number or «باص»), the highest bid so far */
  calls: Record<string, ToutiCall>;
  high: number | null;
  highBy: string | null;
  /** everyone passed: the cards are dealt again */
  redeal: boolean;
  /** the bids I may make now (empty when it is not my turn to bid) */
  myBids: number[];
  /** the contract once the bidding is over (trump null while the bidder chooses it) */
  bidder: string | null;
  bid: number | null;
  trump: Suit | null;
  myHand: Card[];
  playable: string[];
  counts: Record<string, number>;
  trick: { by: string; card: Card }[];
  trickWinner: string | null;
  trickNo: number;
  lastTrick: { cards: { by: string; card: Card }[]; winner: string } | null;
  /** card points taken so far (the bidding team's pairs not included) */
  cards: Record<TSide, number>;
  tricks: Record<TSide, number>;
  /** pairs sung this hand (shown to everyone) */
  sung: ToutiSung[];
  /** «الغناء» window: the player who may sing now, and the pairs I may sing (when it's me) */
  singer: string | null;
  mySing: { suit: Suit; points: number }[];
  scores: Record<TSide, number>;
  target: number;
  history: ToutiHistoryRow[];
  result: ToutiHandResult | null;
  /** the next hand deals itself at this server time (the host can deal sooner) */
  nextAt: number | null;
  winner: TSide | null;
  partnerFree: boolean;
  singBy: ToutiSingBy;
}

export const TOUTI_DEFAULTS: ToutiSettings = { target: 600, timer: 0, singBy: 'winner', partnerFree: false, level: 2 };

export const TOUTI_INFO = {
  title: 'التوتي',
  tagline: 'لعبة المزايدة الفاسية: زايد مع شريكك، سمِّ الطرونفو، وغنِّ الملك والفارس حتى 600.',
  color: '#8E3B5E',
  maxPlayers: 4,
  howTo: [
    'أربعة لاعبين في فريقين، والشريك يجلس مقابلك. الورق المغربي كاملاً: 40 ورقة، 10 لكل لاعب. يدور اللعب عكس عقارب الساعة، وأكملوا المقاعد بالبوتات.',
    'المزايدة تبدأ ممن على يمين الموزّع: من 70 إلى 230 بزيادة 10 في كل مرة، أو «باص» فيخرج اللاعب من المزايدة. آخر من بقي يزايد هو «الشاري» ويختار الطرونفو. إن قال الجميع «باص» تُوزَّع الأوراق من جديد.',
    'يبدأ اللعب من على يمين الموزّع. اتبع الشكل المطلوب؛ إن لم يكن معك فاقطع بالطرونفو، وإن كانت الأكلة مقطوعة فاعلُ عليها إن استطعت. يأخذ الأكلة أعلى طرونفو، وإلا أعلى ورقة من الشكل المطلوب.',
    'الترتيب واحد في كل الأشكال: 1 ثم 3 ثم 12 (الملك) ثم 11 (الفارس) ثم 10 (الخادم) ثم 7 6 5 4 2. النقاط: 1 = 11، 3 = 10، 12 = 4، 11 = 3، 10 = 2، والباقي 0. آخر أكلة «الدير» = 10، فمجموع اليد 130.',
    '«الغناء»: الملك والفارس من شكل واحد في يد لاعب من فريق الشاري، يُغنّيان بعد أكلة يأخذها، قبل الأكلة التالية: 20 نقطة (مزايدة 80 فما فوق)، أو 40 في الطرونفو (مزايدة 90 فما فوق). زوج واحد بعد كل أكلة، والورقتان تبقيان في اليد.',
    'في آخر اليد تُجمع نقاط فريق الشاري (الأكلات والدير والغناء): إن بلغت المزايدة ربح فريقه قيمة المزايدة، وإلا ربحها الخصمان. لا تُسجَّل النقاط الخام.',
    'يفوز أول فريق يصل إلى 600 (أو الهدف الذي تختارونه). سجل النتائج يعرض «لنا» و«لهم».',
  ],
};
