/**
 * «الرامي» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 * Two French 52-card decks + 4 jokers (108 cards), 2–6 players.
 */
import type { FeedItem } from '../protocol';

/** التلّاج: the first laydown must reach 71 (or 51); سامبل: you only go down all at once, to go out. */
export type RamiVariant = 'talaj' | 'sample';

export interface RamiSettings {
  variant: RamiVariant;
  /** the least a first laydown is worth in التلّاج (frank melds only) */
  open: 71 | 51;
  /** every later first laydown must beat the highest one already made this round */
  ceiling: boolean;
  /** reach this and the game ends: the lowest total wins */
  limit: 500 | 1000;
  /** seconds for a turn (0 = no timer) */
  timer: 0 | 60 | 90 | 120;
}

export type RSuit = 'S' | 'H' | 'D' | 'C';

export interface RCard {
  /** e.g. "a-H-7" (deck a or b), "J1".."J4" for the jokers */
  id: string;
  /** null for a joker */
  suit: RSuit | null;
  /** 1 = ace … 11 = J, 12 = Q, 13 = K; 0 = joker */
  rank: number;
}

/**
 * One place in a meld on the table: the card, and what it stands for. In a run `rank` is the position
 * (1 = low ace … 13 = K, 14 = high ace); in a set it is the set's rank. A joker in a set of three has
 * `suit` null (it stands for either missing suit).
 */
export interface RSlot {
  card: RCard;
  rank: number;
  suit: RSuit | null;
}

export type RMeldKind = 'set' | 'run';

export interface RMeld {
  id: number;
  owner: string;
  kind: RMeldKind;
  /** in order (a run from low to high) */
  slots: RSlot[];
}

export interface RamiRoundRow {
  id: string;
  /** the cards left in hand */
  cards: RCard[];
  points: number;
  /** out = went out (رامي), closed = never laid down (+100/+200), open = laid down (10 a card, joker 20), forfeit = lost the round */
  status: 'out' | 'closed' | 'open' | 'forfeit' | 'void';
}

export interface RamiView {
  game: 'rami';
  phase: 'play' | 'roundEnd' | 'final';
  variant: RamiVariant;
  participants: string[];
  /** still in the game (people who left are dropped) */
  active: string[];
  turn: string;
  step: 'draw' | 'play';
  round: number;
  myHand: RCard[];
  counts: Record<string, number>;
  discardTop: RCard | null;
  /** who threw the top card */
  discardBy: string | null;
  stockLeft: number;
  melds: RMeld[];
  /** players who have laid down this round, with what their first laydown was worth */
  openings: Record<string, number>;
  /** the least a new first laydown must be worth now (التلّاج) */
  need: number;
  open: number;
  ceiling: boolean;
  /** the table's first round is not over: nobody may take the discard yet */
  firstRound: boolean;
  /** the card I took from the discard pile this turn (التلّاج: it must go down this turn) */
  taken: string | null;
  /** التلّاج: the taken card is still in my hand */
  mustUse: boolean;
  scores: Record<string, number>;
  limit: number;
  feed: FeedItem[];
  roundWinner: string | null;
  /** the round was won by a «رامي سيك» */
  sec: boolean;
  /** who lost the round by not laying down the card taken from the discard pile */
  forfeit: string | null;
  roundSummary: RamiRoundRow[] | null;
  /** the points each player gained per round, oldest first */
  history: Record<string, number>[];
  winner: string | null;
  /** when the next round deals itself (server time) */
  nextAt: number | null;
  /** when the current turn runs out (server time; null: no timer) */
  deadline: number | null;
  timer: number;
  /** the melds laid down or added to most recently, and by whom (kept until the next player has discarded) */
  lastMelds: { ids: number[]; by: string } | null;
}

/** pause between rounds before the next one deals itself (the host can deal sooner) */
export const RAMI_ROUND_END_MS = 30_000;

export const RAMI_DEFAULTS: RamiSettings = { variant: 'talaj', open: 71, ceiling: true, limit: 1000, timer: 0 };

const TAKEN = 'من أخذ المرمية في التلّاج يجب أن ينزّلها في الدور نفسه وإلا خسر الجولة.';
const CEILING_LINE = `${TAKEN} وكل نزلة أولى بعدها يجب أن تتجاوز أعلى نزلة أولى سبقتها. ومن نزّل يده كاملة دفعة واحدة لا يحتاج إلى 71 ولا إلى هذا السقف.`;
const NO_CEILING_LINE = `${TAKEN} ومن نزّل يده كاملة دفعة واحدة لا يحتاج إلى 71.`;

const COMMON = [
  'الأوراق: مجموعتا ورق فرنسي (52 ورقة لكل منهما) و4 جوكر — 108 أوراق، من 2 إلى 6 لاعبين.',
  'في دورك: اسحب ورقة من الكومة أو خذ آخر ورقة مرمية، ثم نزّل ما تستطيع، ثم ارمِ ورقة. لا تُؤخذ المرمية في الدورة الأولى، ولا عندما تبقى في يدك ورقة واحدة.',
  'تيرسي = 3 أو 4 أوراق من الرتبة نفسها بأنواع مختلفة. سويفي = 3 أوراق متتالية فأكثر من النوع نفسه (الآس قبل 2 أو بعد K، لا الاثنان). فرانك = بلا جوكر.',
  'الجوكر يعوّض ورقة واحدة، وجوكر واحد فقط في كل تشكيلة. ومن نزّل يمكنه أن يضع الورقة التي يمثّلها الجوكر مكانه ويسترجع الجوكر.',
];

export const RAMI_INFO = {
  title: 'الرامي',
  tagline: 'تيرسي وسويفي من ورقتين فرنسيتين… وأول نزلة بـ71',
  color: '#1F8A70',
  maxPlayers: 6,
  howTo: [
    ...COMMON,
    'التلّاج (14 ورقة، والبادئ 15): أول نزلة يجب أن تبلغ 71 نقطة من تشكيلات فرانك، وفيها تيرسي فرانك وسويفي فرانك. 2–10 بقيمتها، والصور والآس الأعلى 10، والآس قبل 2 بـ1. ثم تنزّل وتضيف إلى أي تشكيلة بحرية.',
    CEILING_LINE,
    'رامي: من أفرغ يده ربح الجولة. الباقون: كل ورقة في اليد 10 والجوكر 20، ومن لم ينزّل شيئاً 100. «رامي سيك» (الخروج دفعة واحدة دون نزول سابق): 200 لمن لم ينزّل، والضعف لمن نزّل.',
    'المجموع الأقل يفوز: تنتهي اللعبة عندما يبلغ لاعب 1000 نقطة.',
  ],
};

/** The cover text for the room's variant (سامبل changes the rules). */
export function ramiVariantInfo(s: RamiSettings): { tagline: string; howTo: string[] } | null {
  const limit = `المجموع الأقل يفوز: تنتهي اللعبة عندما يبلغ لاعب ${s.limit} نقطة.`;
  if (s.variant === 'sample') {
    return {
      tagline: 'سامبل: لا نزول قبل الخروج… تنزّل يدك كاملة دفعة واحدة',
      howTo: [
        ...COMMON,
        'سامبل (13 ورقة، والبادئ 14): لا حدّ للنقاط، لكن لا أحد ينزّل قبل أن يخرج: تنزّل يدك كاملة في دور واحد، وفيها تيرسي فرانك وسويفي فرانك على الأقل، ثم ترمي ورقتك الأخيرة إن بقيت.',
        'رامي: من أفرغ يده ربح الجولة، وكل لاعب آخر عليه 100 نقطة.',
        limit,
      ],
    };
  }
  if (s.open === 71 && s.ceiling && s.limit === 1000) return null;
  const howTo = RAMI_INFO.howTo.map((l) => (l === CEILING_LINE && !s.ceiling ? NO_CEILING_LINE : l).split('71').join(String(s.open)));
  howTo[howTo.length - 1] = limit;
  return { tagline: `التلّاج: أول نزلة بـ${s.open} نقطة`, howTo };
}
