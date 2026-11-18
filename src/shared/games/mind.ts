/**
 * «العقل الواحد» — a cooperative game in the style of «The Mind»: the types shared by the server and the app
 * (settings, the view each phone gets), the default settings, the game's card on the home screen and the
 * rule numbers both sides use.
 *
 * Cards 1 to 100. At level L everyone holds L cards. The team must lay ALL the cards on one pile in rising
 * order, without talking. There are no turns: anyone plays at any moment, but always their lowest card (the
 * phone's one button plays it). A card laid while someone still holds a lower one costs the team a life, and
 * every lower card still in a hand is put aside face up; then play goes on.
 *
 * Lives: one per player (5 at most). Stars («نجمة»): 1 at the start; anyone may propose one, and it is used
 * only when everyone agrees: each player then puts their lowest card aside face up (useful information).
 * Rewards after some levels (as in the box): a star after 2, 5 and 8, a life after 3, 6 and 9.
 * Before each level a short focus moment («تركيز»): everyone taps «جاهز», then the level starts.
 * The team wins after the last level (12 for two players, 10 for three, 8 for four, 7 for five or six) and
 * loses when the lives run out.
 */

/** The highest card. */
export const MIND_TOP = 100;
/** Starting levels the lobby offers. */
export const MIND_STARTS = [1, 3, 5] as const;
export const MIND_MAX_LIVES = 5;
export const MIND_MAX_STARS = 3;
/** The reward for clearing a level (as in the box). */
export const MIND_REWARDS: Readonly<Record<number, 'life' | 'star'>> = { 2: 'star', 3: 'life', 5: 'star', 6: 'life', 8: 'star', 9: 'life' };
/** A star proposal stays open this long. */
export const MIND_VOTE_MS = 15_000;

/** Levels to clear: 12 for two players, 10 for three, 8 for four, 7 for five or six. */
export function mindLevels(players: number): number {
  if (players <= 2) return 12;
  if (players === 3) return 10;
  if (players === 4) return 8;
  return 7;
}

/** Lives at the start: one per player, five at most. */
export const mindLives = (players: number) => Math.max(1, Math.min(players, MIND_MAX_LIVES));

export interface MindSettings {
  /** the level the team starts at (1, 3 or 5); the rewards of the levels skipped are given */
  start: number;
  /** «بداية مريحة»: one more life and one more star at the start */
  extra: boolean;
}

export const MIND_DEFAULTS: MindSettings = { start: 1, extra: false };

/** Lives and stars when a game starts at `start` (the rewards of the levels before it included). */
export function mindStartKit(players: number, settings: MindSettings): { lives: number; stars: number } {
  let lives = mindLives(players);
  let stars = 1;
  for (let l = 1; l < settings.start; l++) {
    if (MIND_REWARDS[l] === 'life') lives = Math.min(MIND_MAX_LIVES, lives + 1);
    if (MIND_REWARDS[l] === 'star') stars = Math.min(MIND_MAX_STARS, stars + 1);
  }
  if (settings.extra) {
    lives = Math.min(MIND_MAX_LIVES + 1, lives + 1);
    stars = Math.min(MIND_MAX_STARS, stars + 1);
  }
  return { lives, stars };
}

/** A card on the pile. */
export interface MindPlay {
  card: number;
  by: string;
}

/** A card put aside face up: after a mistake (it was lower than the card laid) or by a star. */
export interface MindShown {
  card: number;
  by: string;
  why: 'mistake' | 'star';
}

/** The last mistake of the level. */
export interface MindMistake {
  /** the card laid too early */
  card: number;
  by: string;
  /** the lower cards that were still in hands (put aside face up) */
  lower: { by: string; cards: number[] }[];
  /** the pile's size once that card was on it */
  seq: number;
}

/** A star proposed, waiting for everyone. */
export interface MindProposal {
  by: string;
  /** who agreed (the proposer included) */
  yes: string[];
  /** who must agree (everyone still holding cards and at the table) */
  voters: string[];
  endsAt: number;
}

export interface MindView {
  game: 'mind';
  /**
   * focus: cards dealt, everyone taps «جاهز» · play · oops: a mistake shown for a moment ·
   * cleared: the level is done (calm success screen) · final: the game is over (won or lost)
   */
  phase: 'focus' | 'play' | 'oops' | 'cleared' | 'final';
  level: number;
  levels: number;
  lives: number;
  stars: number;
  /** my cards, lowest first (empty for a spectator) */
  hand: number[];
  /** everyone's number of cards */
  counts: Record<string, number>;
  /** this level's pile, first card first */
  pile: MindPlay[];
  /** cards put aside face up this level */
  shown: MindShown[];
  /** focus: who tapped «جاهز» */
  ready: string[];
  proposal: MindProposal | null;
  /** the last mistake of this level */
  mistake: MindMistake | null;
  /** server time of the last card laid (or of the level's start) */
  lastAt: number | null;
  /** oops / cleared: when the game moves on */
  endsAt: number | null;
  /** cleared: the reward earned (null: none for this level) and whether it was over the cap */
  reward: { kind: 'life' | 'star'; capped: boolean } | null;
  /** final: did the team win (null: ended because too few players were left) */
  won: boolean | null;
  /** final: mistakes and stars used over the whole game */
  stats: { mistakes: number; starsUsed: number; cards: number };
  players: string[];
}

export const MIND_INFO = {
  title: 'العقل الواحد',
  tagline: 'العبوا أوراقكم بالترتيب… دون كلمة واحدة.',
  color: '#5B6CE0',
  maxPlayers: 6,
  howTo: [
    'لعبة تعاونية: الفريق كله يفوز أو يخسر معاً. البطاقات من 1 إلى 100، وفي المستوى الأول بطاقة واحدة لكل لاعب، وفي الثاني بطاقتان، وهكذا.',
    'المطلوب: وضع كل البطاقات على كومة واحدة بترتيب تصاعدي، دون كلام ولا إشارات. لا أدوار: يلعب أي لاعب في أي لحظة، لكن أصغر بطاقة في يده دائماً.',
    'السر في الوقت: كلما كانت بطاقتك أبعد عن آخر بطاقة في الكومة، انتظر أكثر.',
    'إذا وُضعت بطاقة وفي يد أحدكم بطاقة أصغر منها: قلب أقل للفريق، وتُكشف كل البطاقات الأصغر وتوضع جانباً، ثم يستمر اللعب.',
    'النجمة: يقترحها أي لاعب، وتُستعمل عند موافقة الجميع: تُكشف أصغر بطاقة من كل يد وتوضع جانباً. معلومة مفيدة للجميع!',
    'قبل كل مستوى لحظة «تركيز»: يضغط الجميع «جاهز» ثم يبدأ اللعب. وبعد المستويات 2 و5 و8 نجمة إضافية، وبعد 3 و6 و9 قلب إضافي.',
    'الفوز بإنهاء كل المستويات: 12 للاعبَين، 10 لثلاثة، 8 لأربعة، 7 لخمسة أو ستة. وتنتهي اللعبة إذا نفدت القلوب.',
  ],
};
