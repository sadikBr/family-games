/**
 * «القنبلة» — a quick draw-until-it-blows card game for the family (our own cards and characters): the types shared
 * by the server and the app (settings, the view each phone gets), the deck tables, the card texts and the game's
 * card on the home screen.
 *
 * The rules:
 *  - Each player starts with 1 «المفكّك» and 5 other cards (never a bomb). Then «القنبلة» (players − 1 of them) and
 *    a few more «المفكّك» go into the rest of the deck, which is shuffled.
 *  - A turn: play as many action cards as you like (one at a time), then draw the top card to end the turn.
 *    «تخطٍّ» and «هجوم» end the turn without drawing.
 *  - Drawing «القنبلة»: with a «المفكّك» in hand it is used at once and the bomb goes back into the deck, at a
 *    place only that player chooses (top, 2nd, 3rd, bottom, random or any exact place). Without one: out of the
 *    game, and the hand goes to the discard pile.
 *  - «هجوم»: the next player takes 2 turns. Attacks stack: someone under attack who attacks passes their remaining
 *    turns plus 2 on.
 *  - «نظرة»: see the top 3 cards (only you). «خلط»: shuffle the deck. «طلب»: a player of your choice gives you a
 *    card of their choice. A pair of the same kitchen character: steal a random card from a player.
 *  - «لا!»: after every action card, everyone has a short window (the same for all, whatever their hands) to play
 *    «لا!» and cancel it; a «لا!» can be cancelled by another «لا!» (each one restarts the window). «لا!» never
 *    stops «القنبلة» or «المفكّك». The window is skipped only when every «لا!» is already in the discard pile.
 *  - The last player standing wins; the others are placed by the order they went out.
 *
 * The deck by number of players (the cards dealt to the hands included; DECK_TABLE below):
 *
 *   players | تخطٍّ هجوم نظرة خلط طلب لا! | 5 pairs | extra «المفكّك» | «القنبلة» | total
 *   2–3     |   3    2    3    2   2   3  |  5 × 2  |        2        |  1–2      | 25 + n + 2 + (n − 1)
 *   4–5     |   4    3    4    3   3   4  |  5 × 3  |        2        |  3–4      | 36 + n + 2 + (n − 1)
 *   6–8     |   6    5    5    4   4   6  |  5 × 4  |        3        |  5–7      | 50 + n + 3 + (n − 1)
 */

export type BombKind =
  | 'bomb'
  | 'defuse'
  | 'skip'
  | 'attack'
  | 'peek'
  | 'shuffle'
  | 'favor'
  | 'nope'
  | 'tajine'
  | 'teapot'
  | 'ladle'
  | 'sieve'
  | 'bread';

export const PAIR_KINDS = ['tajine', 'teapot', 'ladle', 'sieve', 'bread'] as const;
export type PairKind = (typeof PAIR_KINDS)[number];
/** Cards played on their own on my turn (each opens the «لا!» window). */
export const ACTION_KINDS = ['skip', 'attack', 'peek', 'shuffle', 'favor'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
/** Every kind, in the order of the reference panel. */
export const BOMB_KINDS: BombKind[] = ['bomb', 'defuse', 'nope', 'skip', 'attack', 'peek', 'shuffle', 'favor', ...PAIR_KINDS];

export const isPairKind = (k: unknown): k is PairKind => typeof k === 'string' && (PAIR_KINDS as readonly string[]).includes(k);
export const isActionKind = (k: unknown): k is ActionKind => typeof k === 'string' && (ACTION_KINDS as readonly string[]).includes(k);

export interface BombCard {
  id: string;
  kind: BombKind;
}

export const CARD_INFO: Record<BombKind, { name: string; effect: string; color: string }> = {
  bomb: { name: 'القنبلة', effect: 'من يسحبها بلا مفكّك يخرج', color: '#C8323A' },
  defuse: { name: 'المفكّك', effect: 'يوقف القنبلة، ثم تعود إلى الرزمة سرّاً', color: '#23885A' },
  nope: { name: 'لا!', effect: 'إلغاء ورقة حركة لعبها أي لاعب', color: '#B8326E' },
  skip: { name: 'تخطٍّ', effect: 'إنهاء الدور دون سحب', color: '#2E7BD6' },
  attack: { name: 'هجوم', effect: 'إنهاء الدور دون سحب، ودوران للتالي', color: '#E36A1E' },
  peek: { name: 'نظرة', effect: 'رؤية أعلى 3 أوراق سرّاً', color: '#7B4FC9' },
  shuffle: { name: 'خلط', effect: 'خلط الرزمة كلها', color: '#178F8B' },
  favor: { name: 'طلب', effect: 'لاعب تختاره يعطيك ورقة يختارها', color: '#D2558A' },
  tajine: { name: 'طاجين ضاحك', effect: 'زوج = سرقة ورقة عشوائية', color: '#B9542E' },
  teapot: { name: 'إبريق راقص', effect: 'زوج = سرقة ورقة عشوائية', color: '#A8841C' },
  ladle: { name: 'مغرفة نعسانة', effect: 'زوج = سرقة ورقة عشوائية', color: '#86603F' },
  sieve: { name: 'غربال مندهش', effect: 'زوج = سرقة ورقة عشوائية', color: '#4F8A35' },
  bread: { name: 'رغيف طائر', effect: 'زوج = سرقة ورقة عشوائية', color: '#C7862A' },
};

/** The action and pair cards of a deck tier (bombs and defuses are added by player count). */
export interface DeckTier {
  /** the tier is used up to this many players */
  upTo: number;
  counts: Record<'skip' | 'attack' | 'peek' | 'shuffle' | 'favor' | 'nope', number>;
  /** copies of each of the 5 pair characters */
  pairs: number;
  /** «المفكّك» cards put in the deck (besides the one each player starts with) */
  extraDefuse: number;
}

export const DECK_TABLE: DeckTier[] = [
  { upTo: 3, counts: { skip: 3, attack: 2, peek: 3, shuffle: 2, favor: 2, nope: 3 }, pairs: 2, extraDefuse: 2 },
  { upTo: 5, counts: { skip: 4, attack: 3, peek: 4, shuffle: 3, favor: 3, nope: 4 }, pairs: 3, extraDefuse: 2 },
  { upTo: 8, counts: { skip: 6, attack: 5, peek: 5, shuffle: 4, favor: 4, nope: 6 }, pairs: 4, extraDefuse: 3 },
];

/** Cards dealt to each player besides their «المفكّك». */
export const BOMB_HAND = 5;

export const deckTier = (players: number): DeckTier => DECK_TABLE.find((t) => players <= t.upTo) ?? DECK_TABLE[DECK_TABLE.length - 1];

/** How many cards of each kind a game with `players` players has. */
export function deckCounts(players: number): Record<BombKind, number> {
  const t = deckTier(players);
  const out = {} as Record<BombKind, number>;
  for (const k of BOMB_KINDS) out[k] = 0;
  for (const [k, n] of Object.entries(t.counts)) out[k as BombKind] = n;
  for (const k of PAIR_KINDS) out[k] = t.pairs;
  out.bomb = Math.max(1, players - 1);
  out.defuse = players + t.extraDefuse;
  return out;
}

/** The deck right after the deal: its size and the bombs in it. */
export function deckAfterDeal(players: number): { deck: number; bombs: number; defuse: number } {
  const c = deckCounts(players);
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  return { deck: total - players * (BOMB_HAND + 1), bombs: c.bomb, defuse: deckTier(players).extraDefuse };
}

/** Seconds of the «لا!» window (lobby setting). */
export const BOMB_WINDOW_SECONDS = [3, 5] as const;
/** Seconds for a turn (0 = no limit): when the time is up, a card is drawn for the player. */
export const BOMB_TURN_SECONDS = [0, 30, 45, 60] as const;
/** Time to choose the card to give («طلب») and the bomb's new place. */
export const BOMB_GIVE_MS = 20_000;
export const BOMB_PLACE_MS = 20_000;
/** The bomb's moment on every screen before the defuse (or the exit), at the room's pace. */
export const BOMB_BOOM_MS = 2200;

export interface BombSettings {
  /** seconds of the «لا!» window: 3 or 5 */
  windowSec: number;
  /** seconds for a turn: 0 (no limit), 30, 45 or 60 */
  turnSec: number;
}

export const BOMB_DEFAULTS: BombSettings = { windowSec: 3, turnSec: 45 };

/** The bomb's new place, as a choice on the picker: an exact place from the top (0 = on top) or a quick one. */
export type BombPlace = number | 'top' | 'second' | 'third' | 'bottom' | 'random';

export interface BombSeat {
  id: string;
  cards: number;
  out: boolean;
}

/** An action card on the table, waiting for its «لا!» window to close. */
export interface BombPending {
  /** what it does: an action card, or a pair («pair», with the character in `card`) */
  kind: ActionKind | 'pair';
  card: BombKind;
  by: string;
  /** who it aims at: the player asked («طلب»), robbed (a pair) or attacked (the next player) */
  target: string | null;
  /** who played each «لا!» on it, in order (an odd count = cancelled for now) */
  nopes: string[];
  endsAt: number;
  total: number;
}

export interface BombView {
  game: 'bomb';
  /**
   * turn: the player plays cards or draws · window: an action card waits, «لا!» may be played · give: the asked
   * player chooses a card to give · boom: a bomb was drawn (everyone sees it) · place: the defused bomb goes back
   * into the deck · final
   */
  phase: 'turn' | 'window' | 'give' | 'boom' | 'place' | 'final';
  /** bumps with every step (actions carry it back so a late tap never answers a newer question) */
  seq: number;
  /** seat order */
  players: string[];
  seats: Record<string, BombSeat>;
  turn: string | null;
  /** turns the current player still has to take, this one included (2 or more after an attack) */
  turns: number;
  turnEndsAt: number | null;
  turnTotal: number;
  /** my cards (empty for a spectator or someone out) */
  hand: BombCard[];
  /** cards in the deck, and the bombs among them (public: every bomb drawn is seen) */
  deck: number;
  bombs: number;
  /** the last cards of the discard pile (the top one last) and its size */
  discard: BombCard[];
  discardCount: number;
  /** cards of each kind in the whole game, and in the discard pile (for the reference panel) */
  total: Record<BombKind, number>;
  gone: Record<BombKind, number>;
  /** a «لا!» is still somewhere (a hand or the deck): action cards open the window */
  nopeLive: boolean;
  pending: BombPending | null;
  give: { from: string; to: string; endsAt: number; total: number } | null;
  boom: { who: string; card: BombCard; endsAt: number } | null;
  place: { who: string; endsAt: number; total: number } | null;
  /**
   * What I know about the top of the deck (index 0 = the next card), from my «نظرة» or the bomb I put back;
   * null = unknown. Shifts as cards are drawn; cleared when the deck is shuffled or someone else puts a bomb back.
   */
  known: (BombKind | null)[];
  /** a private line for me only (the card I was given or that was stolen from me…) */
  note: { k: number; text: string; card: BombKind | null } | null;
  /** the last few events, oldest first */
  log: { text: string; by: string | null }[];
  /** eliminated players, first out first */
  outOrder: string[];
  winner: string | null;
  windowSec: number;
}

/** «دور واحد»، «دوران»، «3 أدوار» */
export function turnsText(n: number): string {
  if (n <= 1) return 'دور واحد';
  if (n === 2) return 'دوران';
  return n <= 10 ? `${n} أدوار` : `${n} دوراً`;
}

/** «دور واحد متبقٍّ»، «دوران متبقيان»، «3 أدوار متبقية» */
export function turnsLeftText(n: number): string {
  if (n <= 1) return 'دور واحد متبقٍّ';
  if (n === 2) return 'دوران متبقيان';
  return n <= 10 ? `${n} أدوار متبقية` : `${n} دوراً متبقياً`;
}

export const BOMB_INFO = {
  title: 'القنبلة',
  tagline: 'اسحبوا الأوراق… ومن يسحب القنبلة دون مفكّك يخرج!',
  color: '#E2543B',
  maxPlayers: 8,
  howTo: [
    'في الرزمة قنابل (عددها أقل من اللاعبين بواحدة). من يسحب القنبلة ومعه «المفكّك» ينجو، ومن لا مفكّك معه يخرج. آخر من يبقى يفوز.',
    'في البداية لكل لاعب «مفكّك» واحد وخمس أوراق أخرى، وفي الرزمة بضعة مفكّكات إضافية.',
    'في دورك العب ما تشاء من أوراق الحركة، ثم اسحب ورقة من الرزمة لإنهاء الدور.',
    '«تخطٍّ»: إنهاء الدور دون سحب. «هجوم»: إنهاء الدور دون سحب، وعلى اللاعب التالي دوران (والهجوم يتراكم). «نظرة»: رؤية أعلى 3 أوراق سرّاً. «خلط»: خلط الرزمة. «طلب»: لاعب تختاره يعطيك ورقة من اختياره.',
    'شخصيات المطبخ (طاجين، إبريق، مغرفة، غربال، رغيف): زوج متشابه منها = سرقة ورقة عشوائية من لاعب تختاره.',
    '«لا!»: بعد كل ورقة حركة مهلة قصيرة لأي لاعب ليلغيها بـ«لا!»، و«لا!» تُلغى بـ«لا!» أخرى. ولا تلغي القنبلة ولا المفكّك.',
    'سحب القنبلة مع المفكّك: تعيدها إلى الرزمة سرّاً في الموضع الذي تختاره (الأعلى، الثانية، الثالثة، الأسفل، عشوائياً أو موضعاً محدّداً).',
  ],
};
