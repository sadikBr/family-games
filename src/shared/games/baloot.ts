/**
 * «البلوط» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */
import type { CardSide } from '../protocol';

/** ♠ سبيت · ♥ هاص · ♦ ديمن · ♣ شريا */
export type BSuit = 'S' | 'H' | 'D' | 'C';
export type BRank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7';

export interface BCard {
  /** e.g. "10H", "AS" */
  id: string;
  suit: BSuit;
  rank: BRank;
}

export type BSide = 'A' | 'B';
export type BMode = 'sun' | 'hokm';

/** صن · حكم (the face-up suit, round 1) · أشكل · حكم ثانٍ (another suit, round 2) · تثبيت الحكم · بس */
export type BalootCall = 'pass' | 'hokm' | 'sun' | 'ashkal' | 'hokm2' | 'confirm';
export type BalootRaise = 'double' | 'triple' | 'four' | 'gahwa';

/** سرا (3 in sequence) · خمسين (4) · مية (5 in sequence, or four K/Q/J/10 — four aces in حكم) · أربعمية (four aces in صن) */
export type BProjKind = 'sira' | 'fifty' | 'hundred' | 'four100';
/** Moroccan announcements (الإعلانات): تيرس (3 in sequence) · كارت (4) · سانك (5+) · كاري (four of a kind) */
export type MAnnKind = 'tierce' | 'quarte' | 'quinte' | 'carre';

/** 'saudi': Saudi Baloot (صن / حكم, French cards) · 'morocco': Moroccan Belote (الطرونفو, the Moroccan deck) */
export type BalootRules = 'saudi' | 'morocco';

export interface BalootSettings {
  /** which rules (and which cards): Saudi Baloot (default) or Moroccan Belote */
  mode?: BalootRules;
  /** the team that reaches this many points first wins */
  target: number;
  /** seconds per decision (0 = no limit); when it runs out the computer plays for you */
  timer: number;
  /** دبل / ثري / فور / قهوة allowed */
  doubling: boolean;
  /** 1 = beginner bots, 2 = strong bots */
  level: number;
}

export interface BalootContract {
  mode: BMode;
  trump: BSuit | null;
  /** the player who took the face-up card (the partner of whoever said «أشكل») */
  buyer: string;
  /** who made the winning call */
  caller: string;
  call: 'sun' | 'hokm' | 'ashkal';
  /** 1 · 2 دبل · 3 ثري · 4 فور */
  mult: number;
  /** قهوة: the winners of this hand win the whole game */
  gahwa: boolean;
}

export interface BProjectView {
  by: string;
  kind: BProjKind | MAnnKind;
  /** the cards, once the projects are shown (2nd trick) */
  cards?: BCard[];
  /** game points it is worth in this contract */
  points: number;
}

export interface BalootHandResult {
  hand: number;
  contract: BalootContract;
  buyerSide: BSide;
  /** card points (أبناط) taken, the last trick's 10 included */
  abnat: Record<BSide, number>;
  /** who took the last trick (الأرض, +10) */
  ground: BSide;
  tricks: Record<BSide, number>;
  /** project points of the team with the best project (game points) */
  projects: Record<BSide, number>;
  /** «بلوت» points (2 each) */
  baloot: Record<BSide, number>;
  /** what each team adds to its score */
  points: Record<BSide, number>;
  /** خسرانة: the buyers took less than the defenders */
  failed: boolean;
  /** كبوت: one team took all 8 tricks */
  kaboot: BSide | null;
  /** the team that won the hand */
  winner: BSide;
  /** Moroccan rules — ليتيج: equal totals, the taker's points wait for the next decided hand */
  litige?: boolean;
  /** Moroccan rules: points carried over from earlier ليتيج hands that this hand's winner took */
  potWon?: number;
}

export interface BalootHistoryRow {
  A: number;
  B: number;
  /** short tag: «خسرانة», «كبوت», «قهوة» (Moroccan: «دخل», «كابو», «ليتيج») */
  tag?: string;
  mode: BMode;
  buyerSide: BSide;
}

export interface BalootOption {
  call: BalootCall;
  /** for «حكم ثانٍ»: the suits that may be named */
  suits?: BSuit[];
}

export interface BalootView {
  game: 'baloot';
  /** Saudi Baloot or Moroccan Belote */
  rules: BalootRules;
  phase: 'bid' | 'double' | 'play' | 'handEnd' | 'final';
  seats: string[];
  sides: CardSide[];
  dealer: string;
  hand: number;
  /** who must act now (null during a pause) */
  turn: string | null;
  /** server time the current decision runs out (null: no timer) */
  deadline: number | null;
  timer: number;
  /** the face-up card, during the bidding */
  faceUp: BCard | null;
  bidRound: 1 | 2;
  /** 'confirm': after a «حكم» in round 1, those who passed (and the bidder) may still go «صن» */
  bidStage: 'main' | 'confirm';
  /** what each player said in this bidding round */
  calls: Record<string, { call: BalootCall; suit?: BSuit }>;
  /** what I may say now (empty when it is not my turn) */
  myOptions: BalootOption[];
  /** everyone passed twice: the cards are dealt again */
  redeal: boolean;
  contract: BalootContract | null;
  /** the raise that may be made now (doubling window) */
  raiseStep: BalootRaise | null;
  /** what each player answered in the doubling window */
  raises: Record<string, BalootRaise | 'pass'>;
  myHand: BCard[];
  playable: string[];
  counts: Record<string, number>;
  trick: { by: string; card: BCard }[];
  trickWinner: string | null;
  trickNo: number;
  lastTrick: { cards: { by: string; card: BCard }[]; winner: string } | null;
  abnat: Record<BSide, number>;
  tricks: Record<BSide, number>;
  /** the projects said on the first trick (names only) */
  declared: BProjectView[];
  /** the best team's projects, shown face up during the 2nd trick */
  shown: { side: BSide; items: BProjectView[] } | null;
  /** my projects I may declare with my first card */
  myProjects: (BProjectView & { key: string })[];
  /** who said «بلوت» this hand */
  baloot: string[];
  scores: Record<BSide, number>;
  target: number;
  history: BalootHistoryRow[];
  result: BalootHandResult | null;
  /** the next hand deals itself at this server time (the host can deal sooner) */
  nextAt: number | null;
  winner: BSide | null;
  /** Moroccan rules — ليتيج: points waiting for the winner of the next decided hand */
  pot: number;
  /** Moroccan rules — البيل: both teams are level at or above the target, a deciding hand is played */
  bel: boolean;
}

export const BALOOT_DEFAULTS: BalootSettings = { mode: 'saudi', target: 152, timer: 0, doubling: true, level: 2 };
/** the targets each rule set offers (the first is the default) */
export const BALOOT_TARGETS: Record<BalootRules, number[]> = { saudi: [152, 100], morocco: [1000, 500] };

export const BALOOT_INFO = {
  title: 'البلوط',
  tagline: 'صن أو حكم؟ العب مع شريكك واجمع 152 قبل الخصوم.',
  color: '#B8324A',
  maxPlayers: 4,
  howTo: [
    'أربعة لاعبين في فريقين، والشريك يجلس مقابلك. الورق 32 ورقة: A K Q J 10 9 8 7 من الأشكال الأربعة: ♠ سبيت، ♥ هاص، ♦ ديمن، ♣ شريا. أكملوا المقاعد بالبوتات.',
    'يوزّع الموزّع 5 أوراق لكل لاعب ويكشف ورقة واحدة. يبدأ الشراء من يمين الموزّع، ويدور اللعب عكس عقارب الساعة.',
    'الجولة الأولى: «حكم» بشكل الورقة المكشوفة، أو «صن» بلا حكم، أو «بس» للتمرير. «صن» يعلو على «حكم» وينهي الشراء، ومن مرّر قبل الحكم يحق له أن يطلب «صن» بعده، ويحق للمشتري أن يحوّل حكمه إلى صن.',
    '«أشكل» صن يُعطى للشريك: يأخذ الشريك الورقة المكشوفة ويصبح هو المشتري. يحق للاعب الثالث (يسار الموزّع)، وللموزّع إن مرّر الجميع قبله.',
    'الجولة الثانية إن مرّر الجميع: «حكم» بشكل آخر غير شكل المكشوفة، أو «صن». إن مرّر الجميع مرة ثانية تُوزَّع الأوراق من جديد.',
    'يأخذ المشتري الورقة المكشوفة وورقتين، ويأخذ كل لاعب آخر 3 أوراق، فتصير لكل واحد 8 أوراق. يبدأ اللعب دائماً اللاعب الذي على يمين الموزّع.',
    'الترتيب في الصن وفي الأشكال غير الحكم: A ثم 10 ثم K ثم Q ثم J ثم 9 8 7. وفي شكل الحكم: J ثم 9 ثم A ثم 10 ثم K ثم Q ثم 8 7.',
    'يجب أن تتبع الشكل المطلوب. في الحكم إن لم يكن معك الشكل فيجب أن تقطع بالحكم وأن تعلو على حكم الخصم إن استطعت، إلا إذا كانت الأكلة لشريكك وكنت آخر من يلعب، أو بدأ شريكك بأعلى ورقة باقية في ذلك الشكل. وإذا بُدئ بالحكم فيجب أن تعلو عليه إن استطعت ما لم تكن الأكلة لشريكك.',
    'الأبناط: A = 11، 10 = 10، K = 4، Q = 3، J = 2 (في الحكم: J = 20، 9 = 14). آخر أكلة (الأرض) = 10. المجموع 130 في الصن و162 في الحكم.',
    'تتحوّل الأبناط إلى نقاط: في الصن 26 نقطة لليد (الأبناط × 2 ÷ 10)، وفي الحكم 16 نقطة (الأبناط ÷ 10)، مع التقريب المعتاد.',
    'المشاريع تُعلن مع الورقة الأولى وتُكشف في الأكلة الثانية: سرا (3 متتالية) = 4 في الصن و2 في الحكم، خمسين (4 متتالية) = 10 و5، مية (5 متتالية أو أربع K أو Q أو J أو 10) = 20 و10، أربعمية (أربع A في الصن) = 40. في الحكم أربع A = مية.',
    'تُحسب مشاريع الفريق صاحب أكبر مشروع فقط (الأعلى قيمة، ثم الأعلى ورقة، ثم الأسبق في اللعب). «بلوت» = K و Q الحكم في يد واحدة: نقطتان تُعلنان عند لعب الثانية منهما.',
    'إن جمع المشترون أقل من الخصوم فهي «خسرانة»: يأخذ الخصوم كل نقاط اليد والمشاريع. وعند التعادل يفوز المشترون. «كبوت» = كل الأكلات الثماني: 44 في الصن و25 في الحكم.',
    'الدبل: في الحكم يحق للخصم «دبل» (×2)، ثم للمشتري «ثري» (×3)، ثم «فور» (×4)، ثم «قهوة» وفيها يربح الفائز باليد اللعبة كلها. في الصن «دبل» فقط، إذا تجاوز المشترون 100 والخصوم دونها. في اليد المضاعفة يأخذ الفائز كل شيء.',
    'يفوز الفريق الذي يصل أولاً إلى 152 نقطة (أو الهدف الذي تختارونه). سجل النتائج يعرض «لنا» و«لهم».',
  ],
};

/** The Moroccan rules (النمط المغربي): shown in the lobby instead of the Saudi cover text when chosen. */
export const BALOOT_MA_INFO = {
  tagline: 'الطرونفو والإعلانات وبلوط-ريبلوط: العب مع شريكك بالورق المغربي حتى 1000.',
  howTo: [
    'أربعة لاعبين في فريقين، والشريك يجلس مقابلك، ويدور اللعب عكس عقارب الساعة. الورق المغربي بلا 2 و3: 32 ورقة (1، 4، 5، 6، 7، 10، 11، 12) من الأشكال الأربعة: شباضا، أوروص، الباسطوص، الكوباص.',
    'الشرا: يوزَّع لكل لاعب 5 أوراق وتُكشف ورقة. يبدأ من على يمين الموزّع: «شاري» تجعل شكل المكشوفة هو الطرونفو (الحكم)، أو «باص». إن قال الجميع «باص» ففي الجولة الثانية يختار كل لاعب شكلاً آخر أو يقول «باص»، وإن تكرر ذلك من الجميع يوزّع اللاعب التالي.',
    'الفورص: إذا كانت المكشوفة ولداً (10) فعلى أول لاعب أن يشتريها. يأخذ الشاري المكشوفة وورقتين، ويأخذ كل لاعب آخر 3 أوراق، فتصير لكل واحد 8 أوراق.',
    'الترتيب في الطرونفو: 10 (الولد) = 20، ثم 6 = 14، ثم 1 = 11، ثم 7 = 10، ثم 12 = 4، ثم 11 = 3، ثم 5 و4 = 0.',
    'وفي الأشكال الأخرى: 1 = 11، ثم 7 = 10، ثم 12 = 4، ثم 11 = 3، ثم 10 = 2، ثم 6 و5 و4 = 0. آخر أكلة «ديكس دي دير» = 10، فمجموع اليد 162.',
    'اتبع الشكل المطلوب. إن لم يكن معك: إذا كانت الأكلة لشريكك فالعب ما تشاء، وإلا فاقطع بالطرونفو واعلُ على الطرونفو الموجود إن استطعت. وإذا بُدئ بالطرونفو فالعب طرونفو أعلى إن استطعت.',
    'بلوط-ريبلوط: 12 و11 من الطرونفو في يد واحدة = 20 نقطة لفريق صاحبهما، شاريًا كان أو لا، وتُحسب عند لعب الثانية.',
    'الإعلانات في دورك في الأكلة الثانية: تيرس (3 متتالية من شكل واحد) = 20، كارت (4) = 50، سانك (5 فأكثر) = 100. التسلسل: 4 5 6 7 10 11 12 1.',
    'كاري (أربع أوراق من رقم واحد): أربع 10 = 200، أربع 6 = 150، أربع 1 أو 7 أو 12 أو 11 = 100. تُحسب إعلانات الفريق صاحب أقوى إعلان فقط: الكاري أولاً، ثم الأطول، ثم الأعلى، ثم تسلسل الطرونفو، ثم الأقرب إلى يمين الموزّع.',
    'إذا جمع فريق الشاري أكثر من الخصمين (الأكلات والإعلانات وبلوط) يأخذ كل فريق نقاطه. وإلا فهي «دخل»: يأخذ الخصمان 162 وكل الإعلانات، ولا يبقى لفريق الشاري إلا بلوط.',
    'كابو: الأكلات الثماني كلها = 252 مع الإعلانات (بلا ديكس دي دير). ليتيج: عند التعادل تُعلَّق نقاط الشاري وتذهب إلى من يربح اليد التالية، وتتراكم إن تكرر التعادل.',
    'يفوز أول فريق يصل إلى 1000 (أو 500 في اللعبة القصيرة). إن تجاوزها الفريقان في اليد نفسها فالأعلى يفوز، وعند التساوي تُلعب يد فاصلة: «البيل».',
  ],
};
