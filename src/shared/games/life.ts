/**
 * «مشوار الحياة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * A family board game about a whole life: roll the die and walk a winding road from school to
 * retirement. Two forks on the way (university or work straight away; the adventurous road or the
 * quiet one), job cards with salaries, paydays, short family/Moroccan event cards, a house to buy,
 * optional insurance, loans when the money runs out. At retirement the house is sold and the loans
 * repaid; money + family tokens decide the winner.
 */
import type { FeedItem } from '../protocol';

export type LifeLength = 'short' | 'normal';

export interface LifeSettings {
  /** how long the road is */
  length: LifeLength;
  /** money each player starts with */
  startCash: number;
}

export const LIFE_CASH = [10000, 20000, 30000] as const;

/** Prices and rules, shown on the phones too. */
export const LIFE_RULES = {
  tuition: 20000,
  loan: 10000,
  /** paid on every payday, for each loan */
  interest: 1000,
  insurance: 4000,
  tokenValue: 10000,
  /** each other player's gift when you get a family token */
  gift: 1000,
  raise: 2000,
  /** retirement order: 1st, 2nd, 3rd */
  retireBonus: [20000, 10000, 5000],
  /** «مشروع مغامر»: die 1–2, 3–4, 5–6 */
  risk: [-10000, 5000, 15000],
} as const;

/** 16000 → "16,000", −3000 → "−3,000" (wrap it in num() / isolates inside Arabic text). */
export function lifeMoney(n: number): string {
  const digits = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '−' : ''}${digits}`;
}

export type LifeIcon = 'book' | 'leaf' | 'coins' | 'heart' | 'bolt' | 'star' | 'train' | 'house' | 'globe' | 'hand' | 'edit' | 'tea' | 'calc' | 'target' | 'paw' | 'mic' | 'sun' | 'drop' | 'key' | 'box' | 'crown';

export interface LifeJob {
  id: string;
  title: string;
  salary: number;
  icon: LifeIcon;
  /** needs a university degree */
  degree: boolean;
}

export interface LifeHouse {
  id: string;
  title: string;
  price: number;
  /** what it sells for at retirement */
  sell: number;
  icon: LifeIcon;
}

export type LifeTokenKind = 'family' | 'pet' | 'friend';

export interface LifeScore {
  money: number;
  house: number;
  tokens: number;
  loans: number;
  total: number;
}

export interface LifePlayer {
  id: string;
  /** node index on the board */
  pos: number;
  money: number;
  loans: number;
  job: LifeJob | null;
  /** salary (the job's, plus raises) */
  salary: number;
  degree: boolean;
  house: LifeHouse | null;
  tokens: LifeTokenKind[];
  insured: boolean;
  /** retirement place (1 = first to retire), null while still on the road */
  retired: number | null;
  /** the retirement bonus they got */
  bonus: number;
  /** filled in at retirement (or when the game ends early) */
  score: LifeScore | null;
}

/** What the player whose turn it is must decide (everyone sees it). */
export type LifeChoice =
  | { kind: 'fork'; fork: 1 | 2 }
  | { kind: 'job'; cards: LifeJob[]; degree: boolean }
  | { kind: 'house'; cards: LifeHouse[] }
  | { kind: 'insure'; price: number }
  | { kind: 'risk'; title: string };

export type LifeCardKind = 'school' | 'event' | 'family' | 'payday' | 'raise' | 'risk' | 'retire' | 'house' | 'job' | 'insure' | 'uni' | 'loan';

export interface LifeCard {
  id: number;
  by: string;
  kind: LifeCardKind;
  title: string;
  text: string;
  /** money won (+) or lost (−) by `by`, if any */
  amount?: number;
  /** the move this card belongs to (shown after the pawn has walked) */
  move: number;
}

export interface LifeMove {
  id: number;
  by: string;
  /** every node the pawn walks through, in order (the last one is where it stops) */
  path: number[];
  /** the roll that made this move */
  rollId: number;
}

export interface LifeView {
  game: 'life';
  phase: 'roll' | 'choose' | 'final';
  length: LifeLength;
  /** in turn order */
  players: LifePlayer[];
  turn: string;
  dice: number | null;
  rollId: number;
  move: LifeMove | null;
  choice: LifeChoice | null;
  card: LifeCard | null;
  feed: FeedItem[];
  winner: string | null;
}

export const LIFE_DEFAULTS: LifeSettings = { length: 'normal', startCash: 20000 };

export const LIFE_INFO = {
  title: 'مشوار الحياة',
  tagline: 'من المدرسة إلى التقاعد… من يعيش أجمل مشوار؟',
  color: '#2FB67C',
  maxPlayers: 6,
  howTo: [
    'ارمِ النرد وامشِ في طريق الحياة: من المدرسة إلى التقاعد.',
    'في المفترق الأول اختر: «الجامعة» (أطول وتكلف 20٬000، لكن المهن أعلى راتباً) أو «العمل مباشرة» (تختار مهنتك فوراً).',
    'كلما مررت بخانة «يوم الأجرة» تقبض راتبك. خانات المفاجآت فيها أحداث من الحياة: أعراس، جوائز، أعطال…',
    'خانة العائلة تعطيك فرداً جديداً (عائلة أو صديق أو حيوان أليف)، وكل لاعب يهديك 1٬000. كل فرد يساوي 10٬000 في النهاية.',
    'في خانة «المنزل» تختار داراً تشتريها (أو لا)، وتبيعها عند التقاعد بثمن أعلى. التأمين يحميك من الأعطال والسرقة.',
    'إذا نزل مالك تحت الصفر تأخذ قرضاً (10٬000) تلقائياً، وتدفع فائدة 1٬000 عن كل قرض في كل يوم أجرة. يمكنك تسديد القرض في دورك.',
    'في المفترق الثاني: طريق المغامرة (أقصر، فيه مشاريع قد تربح أو تخسر) أو الطريق الهادئ (أطول وأكثر أماناً).',
    'عند التقاعد تبيع منزلك وتسدد قروضك. أول من يتقاعد يأخذ مكافأة 20٬000، الثاني 10٬000، الثالث 5٬000. الأغنى (المال + أفراد العائلة) يفوز!',
  ],
};
