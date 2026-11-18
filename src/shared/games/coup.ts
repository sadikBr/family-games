/**
 * «الانقلاب» — a hidden-role bluffing card game in the style of Coup, with our own family court: the types shared by
 * the server and the app (settings, the view each phone gets), the default settings, the game's card on the home
 * screen, and the rule tables both sides use.
 *
 * The court deck has five roles, three cards of each (15 cards). Every player gets two hidden cards (their
 * «نفوذ» in the palace, seen on their own phone only) and two coins. On a turn a player takes ONE action:
 *  - «الدخل»: +1 coin. «المعونة»: +2 coins (any other player may stop it by claiming «الوزير»).
 *  - «الانقلاب»: pay 7 coins, a player of your choice loses an influence (no answer possible). With 10 coins
 *    or more the coup is the only action allowed.
 *  - A role's action, claimed by anyone (a bluff is allowed!):
 *    «الوزير» → «الضريبة» +3 coins (and stops «المعونة»);
 *    «الواشي» → «الوشاية»: pay 3 coins, a player loses an influence (stopped by «الحارسة»);
 *    «القرصان» → «الاستيلاء»: take 2 coins from a player (stopped by «القرصان» or «السفير»);
 *    «السفير» → «التبديل»: draw 2 cards from the deck, keep the hand you like, return 2 (and stops «الاستيلاء»);
 *    «الحارسة» → no action; stops «الوشاية».
 *
 * A claimed role (an action or a block) can be challenged by any other player during a short window. The claim
 * is true: the challenger loses an influence, and the proven card goes back into the deck, which is shuffled,
 * and its owner draws a new card. The claim is a bluff: the bluffer loses an influence and the action (or the
 * block) fails (the 3 coins of a caught «الوشاية» come back). The order on the table is: action → challenge →
 * block (by the target; by anyone for «المعونة») → challenge of the block → the action happens.
 *
 * Losing an influence = choosing one of one's hidden cards and turning it face up for good. No hidden card
 * left: out of the palace (the coins go back to the bank). The last player with influence wins.
 *
 * Two players (the official tweak): the first player starts with 1 coin instead of 2.
 */

export type CoupRole = 'wazir' | 'washi' | 'qursan' | 'safir' | 'harisa';
export const COUP_ROLES: CoupRole[] = ['wazir', 'washi', 'qursan', 'safir', 'harisa'];

export type CoupAction = 'income' | 'aid' | 'coup' | 'tax' | 'inform' | 'seize' | 'exchange';
export const COUP_ACTIONS: CoupAction[] = ['income', 'aid', 'tax', 'seize', 'inform', 'exchange', 'coup'];

/** Copies of each role in the deck. */
export const COUP_COPIES = 3;
export const COUP_START_COINS = 2;
export const COUP_COST = 7;
export const COUP_INFORM_COST = 3;
/** With this many coins, «الانقلاب» is the only action. */
export const COUP_FORCE = 10;
/** Coins taken by «الاستيلاء». */
export const COUP_SEIZE = 2;

/** Seconds to challenge / block (lobby setting). */
export const COUP_WINDOW_SECONDS = [6, 10, 15] as const;
/** Seconds for a turn (0 = no limit). */
export const COUP_TURN_SECONDS = [0, 30, 60] as const;
/** Time to choose which card to reveal, and to choose the cards kept in an exchange. */
export const COUP_LOSE_MS = 20_000;
export const COUP_EXCHANGE_MS = 30_000;

export const ROLE_INFO: Record<CoupRole, { name: string; color: string; action: string | null; blocks: string | null; line: string }> = {
  wazir: { name: 'الوزير', color: '#7B3FA0', action: '«الضريبة»: خذ 3 قطع من الخزينة', blocks: 'يمنع «المعونة»', line: 'أمين خزينة القصر' },
  washi: { name: 'الواشي', color: '#3F4A6B', action: '«الوشاية»: ادفع 3 قطع ليخسر لاعب نفوذاً', blocks: null, line: 'يهمس في أذن السلطان' },
  qursan: { name: 'القرصان', color: '#1F74B8', action: '«الاستيلاء»: خذ قطعتين من لاعب', blocks: 'يمنع «الاستيلاء»', line: 'لا تفلت منه قطعة ذهب' },
  safir: { name: 'السفير', color: '#23885A', action: '«التبديل»: اسحب بطاقتين واختر ما تحتفظ به', blocks: 'يمنع «الاستيلاء»', line: 'يأتي بالأخبار من البلاد البعيدة' },
  harisa: { name: 'الحارسة', color: '#C23B3B', action: null, blocks: 'تمنع «الوشاية»', line: 'تحرس أبواب القصر' },
};

export const ACTION_INFO: Record<CoupAction, { name: string; role: CoupRole | null; target: boolean; cost: number; gain: string; blockedBy: CoupRole[] }> = {
  income: { name: 'الدخل', role: null, target: false, cost: 0, gain: '+1', blockedBy: [] },
  aid: { name: 'المعونة', role: null, target: false, cost: 0, gain: '+2', blockedBy: ['wazir'] },
  coup: { name: 'الانقلاب', role: null, target: true, cost: COUP_COST, gain: '−7', blockedBy: [] },
  tax: { name: 'الضريبة', role: 'wazir', target: false, cost: 0, gain: '+3', blockedBy: [] },
  inform: { name: 'الوشاية', role: 'washi', target: true, cost: COUP_INFORM_COST, gain: '−3', blockedBy: ['harisa'] },
  seize: { name: 'الاستيلاء', role: 'qursan', target: true, cost: 0, gain: '+2', blockedBy: ['qursan', 'safir'] },
  exchange: { name: 'التبديل', role: 'safir', target: false, cost: 0, gain: '⇄', blockedBy: [] },
};

export const isRole = (v: unknown): v is CoupRole => typeof v === 'string' && (COUP_ROLES as string[]).includes(v);
export const isAction = (v: unknown): v is CoupAction => typeof v === 'string' && (COUP_ACTIONS as string[]).includes(v);

export interface CoupSettings {
  /** seconds to challenge or block: 6, 10 or 15 */
  windowSec: number;
  /** seconds for a turn: 0 (no limit), 30 or 60 */
  turnSec: number;
}

export const COUP_DEFAULTS: CoupSettings = { windowSec: 10, turnSec: 60 };

/** One seat at the table, as everyone sees it. */
export interface CoupSeat {
  id: string;
  coins: number;
  /** hidden cards left */
  hidden: number;
  /** cards turned face up (lost influence), in order */
  revealed: CoupRole[];
  out: boolean;
  /** the last role this player claimed (an action or a block), for everyone's memory */
  claim: CoupRole | null;
  /** the game is over: the cards still hidden, shown to all (null while playing) */
  kept: CoupRole[] | null;
}

/** What the table is busy with: the action announced this turn and the answers to it. */
export interface CoupPending {
  action: CoupAction;
  by: string;
  target: string | null;
  /** the role the action claims (null for income, aid, coup) */
  claim: CoupRole | null;
  block: { by: string; role: CoupRole } | null;
  /** the last challenge and how it ended */
  challenge: { by: string; of: string; role: CoupRole; proven: boolean } | null;
  /** the action failed (bluff caught or blocked) */
  failed: boolean;
}

/** An open window: these players may answer now (challenge, block, or let it go). */
export interface CoupWindow {
  kind: 'challenge' | 'block' | 'blockChallenge';
  /** who may answer */
  eligible: string[];
  /** who let it go already */
  passed: string[];
  /** the roles that may block (block window) */
  roles: CoupRole[];
  endsAt: number;
  total: number;
}

export type CoupLoseReason = 'coup' | 'inform' | 'caught' | 'wrong' | 'left';

export interface CoupView {
  game: 'coup';
  /**
   * turn: the player to act chooses · window: challenge / block window open · proof: a challenge is shown ·
   * lose: someone chooses a card to reveal · exchange: the actor chooses the cards to keep · final
   */
  phase: 'turn' | 'window' | 'proof' | 'lose' | 'exchange' | 'final';
  /** bumps with every step (actions carry it back so a late tap never answers a newer question) */
  seq: number;
  /** seat order */
  players: string[];
  seats: Record<string, CoupSeat>;
  /** whose turn it is */
  turn: string | null;
  turnEndsAt: number | null;
  turnTotal: number;
  /** my hidden cards (empty for a spectator or someone out) */
  hand: CoupRole[];
  pending: CoupPending | null;
  window: CoupWindow | null;
  /** who loses an influence now, and why */
  lose: { who: string; reason: CoupLoseReason; endsAt: number; total: number } | null;
  /** the exchange: `cards` (my hand + the drawn cards) only on the actor's phone */
  exchange: { by: string; cards: CoupRole[] | null; keep: number; endsAt: number; total: number } | null;
  /** proof: the moment ends at this time */
  proofEndsAt: number | null;
  /** cards in the deck */
  deck: number;
  /** the last few events, oldest first */
  log: { text: string; by: string | null }[];
  /** eliminated players, first out first */
  outOrder: string[];
  winner: string | null;
  twoPlayer: boolean;
  windowSec: number;
}

export const COUP_INFO = {
  title: 'الانقلاب',
  tagline: 'أدوار مخفية وكذب جريء: آخر من يبقى في القصر يربح.',
  color: '#9C3D54',
  maxPlayers: 6,
  howTo: [
    'لكل لاعب بطاقتان مخفيتان لا يراهما غيره، وهما نفوذه في القصر، وقطعتان ذهبيتان. آخر من يبقى له نفوذ يفوز.',
    'في دورك اختر عملاً واحداً: «الدخل» +1، أو «المعونة» +2، أو «الانقلاب» بـ7 قطع ليخسر لاعب تختاره نفوذاً. ومن عنده 10 قطع أو أكثر فعليه الانقلاب.',
    'وفي القصر خمسة أدوار (3 بطاقات لكل دور): «الوزير» أمين الخزينة يأخذ «الضريبة» +3. «الواشي» يهمس للسلطان: ادفع 3 قطع ليخسر لاعب نفوذاً. «القرصان» يستولي على قطعتين من لاعب. «السفير» يبدّل بطاقاته من الرزمة. «الحارسة» تحرس الأبواب.',
    'يمكنك أن تدّعي أي دور ولو لم تكن بطاقته عندك! وللآخرين تحدّيك خلال ثوانٍ: إن كان الدور عندك فالخسارة على المتحدّي، وتعود بطاقتك إلى الرزمة لتأخذ بدلها بطاقة جديدة. وإن كانت خدعة فالخسارة عليك ويفشل العمل.',
    'المنع: «الوزير» يمنع «المعونة»، و«الحارسة» تمنع «الوشاية» عن صاحبها، و«القرصان» أو «السفير» يمنعان «الاستيلاء». والمنع ادّعاء أيضاً: يمكن تحدّيه.',
    'خسارة النفوذ: تختار بنفسك أي بطاقة تكشفها للجميع. وانكشاف البطاقتين يعني الخروج من القصر.',
    'بين لاعبَين فقط: يبدأ صاحب الدور الأول بقطعة واحدة. وفي الإعدادات: مهلة التحدّي والمنع، ووقت الدور. وزر «مرجع الأدوار» يذكّرك بكل شيء أثناء اللعب.',
  ],
};
