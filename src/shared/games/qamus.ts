/**
 * «القاموس العجيب» — the bluffing dictionary game (in the style of Balderdash / Fictionary): the types shared by
 * the server and the app, the default settings, the game's card on the home screen and the rules both sides use.
 *
 * Each round shows a rare but real Arabic word (with its vowel marks). Everyone secretly writes a short, fake
 * but believable definition. Then every fake definition and the real one are shown, shuffled and without
 * names; everyone votes for the one they think is real (never their own). The reveal shows the real meaning,
 * who wrote each fake and who voted for what.
 *
 * Points: +2 for voting the real definition; +1 to a fake's author for every vote it got; +3 to a player whose
 * definition turns out to be the real meaning (very close to it after normalising, or marked «صحيح» by the host
 * in the reveal): that definition is merged with the real one (votes for it count as votes for the real one).
 */
import { editDistance, norm } from '../arabic';

/** Rounds in a game. */
export const QAMUS_ROUNDS = [5, 8, 10] as const;
/** Seconds to write a definition. */
export const QAMUS_SECONDS = [60, 90, 120] as const;
/** A definition's length (characters). */
export const QAMUS_TEXT_MIN = 3;
export const QAMUS_TEXT_MAX = 80;

/** Points. */
export const QAMUS_POINTS = {
  /** voting the real definition */
  real: 2,
  /** to a fake's author, for each vote it got */
  fooled: 1,
  /** writing the real meaning */
  knew: 3,
} as const;

export interface QamusSettings {
  /** 5, 8 or 10 */
  rounds: number;
  /** 60, 90 or 120 */
  seconds: number;
}

export const QAMUS_DEFAULTS: QamusSettings = { rounds: 5, seconds: 90 };

/** A definition on the voting list: no author, no «real» flag (only `mine` for my own). */
export interface QamusCard {
  /** opaque, new every round */
  id: string;
  text: string;
  /** I wrote it (I can't vote for it) */
  mine: boolean;
}

/** A definition at the reveal. */
export interface QamusRevealCard {
  id: string;
  text: string;
  /** the dictionary's definition */
  real: boolean;
  /** who wrote it (several people can write the same thing; empty for the real one) */
  authors: string[];
  /** who voted for it */
  voters: string[];
  /** a fake the host marked «صحيح»: merged with the real one */
  marked: boolean;
}

export interface QamusReveal {
  /** the real definition first, then the fakes by votes */
  cards: QamusRevealCard[];
  /** players whose own definition was the real meaning (found by the app, or marked by the host) */
  knew: string[];
  /** what each one wrote (null: nothing in time; the real-meaning ones too) */
  wrote: Record<string, string | null>;
  /** the card each one voted for (null: no vote) */
  votes: Record<string, string | null>;
  gains: Record<string, number>;
}

export interface QamusView {
  game: 'qamus';
  phase: 'write' | 'vote' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  /** the word with its vowel marks */
  word: string;
  /** its family («صغار الحيوان»، «أصوات»…) */
  category: string;
  endsAt: number | null;
  /** the phase's full time (ms) */
  total: number;
  players: string[];
  /** write: who has sent a definition · vote: who has voted (or has nothing to vote) */
  done: string[];
  /** write: my definition (sent, or the draft kept by the server) */
  mine: { text: string; sent: boolean } | null;
  /** my definition was the real meaning (vote: I sit the vote out) */
  iKnew: boolean;
  /** vote: the definitions, shuffled */
  cards: QamusCard[] | null;
  myVote: string | null;
  /** reveal / final: everything */
  reveal: QamusReveal | null;
  scores: Record<string, number>;
}

export const QAMUS_INFO = {
  title: 'القاموس العجيب',
  tagline: 'كلمة غريبة: اكتبوا معنى مزيفاً… واكتشفوا المعنى الحقيقي.',
  color: '#C2577A',
  maxPlayers: 10,
  howTo: [
    'في كل جولة كلمة عربية نادرة لكنها حقيقية، بحركاتها، ومعها بابها (صغار الحيوان، نباتات، أصوات…).',
    'يكتب كل لاعب سراً تعريفاً مزيفاً قصيراً يبدو صحيحاً، ليخدع به الآخرين.',
    'تُعرض التعريفات كلها مع التعريف الحقيقي، مخلوطة وبلا أسماء: صوّت للتعريف الذي تراه صحيحاً (لا لتعريفك).',
    'نقطتان لمن يختار التعريف الحقيقي، ونقطة لصاحب كل تعريف مزيف عن كل صوت يخدع به غيره.',
    'من يكتب المعنى الحقيقي نفسه يأخذ ثلاث نقاط (يكتشفه التطبيق، أو يضغط المضيف «صحيح» عند الكشف).',
    'الأكثر نقاطاً بعد آخر جولة يفوز.',
  ],
};

/* ------------------------------------------------------------------ */
/* Comparing definitions                                               */
/* ------------------------------------------------------------------ */

/** Little words that don't carry the meaning. */
const STOP = new Set(
  [
    'من', 'في', 'على', 'الى', 'الي', 'عن', 'او', 'و', 'ما', 'هو', 'هي', 'الذي', 'التي', 'الذين', 'به', 'بها', 'له', 'لها', 'ذو', 'ذات',
    'كل', 'بين', 'عند', 'اذا', 'ثم', 'قد', 'لا', 'ان', 'حتي', 'مع', 'كان', 'يكون', 'تكون', 'وهو', 'وهي', 'اي', 'كما', 'مثل', 'نوع', 'ضرب',
    'يعني', 'معناها', 'معناه', 'هذا', 'هذه', 'ذلك', 'تلك', 'شيء', 'احد', 'بعض', 'يسمي', 'تسمي', 'اسم',
  ].map((w) => norm(w)),
);

/** «ولدُ الأرنب.» → ['ولد', 'ارنب']: normalised words without «ال», a leading «و»/«ب»/«ل» joined to them, or little words. */
export function defWords(text: string): string[] {
  return norm(text.replace(/[\u064B-\u0652\u0640\u0670]/g, '').replace(/[^\u0621-\u064A\u0660-\u0669\s0-9]/g, ' '))
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      let x = w;
      if (/^[وفبلك]ال/.test(x) && x.length > 4) x = x.slice(1);
      if (x.startsWith('ال') && x.length > 3) x = x.slice(2);
      else if (x.startsWith('و') && x.length > 3 && !STOP.has(x)) x = x.slice(1);
      return x;
    })
    .filter((w) => w && !STOP.has(w));
}

/** Extra words that don't change a definition («ولد الأرنب الصغير» is still «ولد الأرنب»). */
const SOFT = new Set(['صغير', 'صغيره', 'كبير', 'كبيره', 'جدا', 'عاده', 'غالبا', 'تقريبا', 'يعني'].map((w) => norm(w)));

/** The same word, allowing one slip in a long one. */
const sameWord = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && editDistance(a, b) <= 1);

/**
 * Two definitions say the same thing: the same words after normalising (one slip allowed in a long word),
 * or nearly all of them, or one holds all the other's words plus a word like «صغير».
 */
export function sameMeaning(a: string, b: string): boolean {
  const wa = [...new Set(defWords(a))];
  const wb = [...new Set(defWords(b))];
  if (!wa.length || !wb.length) return norm(a) === norm(b) && norm(a).length > 0;
  const [small, big] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const common = small.filter((w) => big.some((x) => sameWord(w, x))).length;
  const extra = big.filter((x) => !small.some((w) => sameWord(w, x)));
  if (common === small.length && !extra.length) return true;
  // a long definition (four words or more) with one word changed, added or left out
  if (small.length >= 4 && small.length - common <= 1 && extra.length <= 1) return true;
  // all of the other's words (two at least) plus a word that adds nothing
  return small.length >= 2 && common === small.length && extra.every((x) => SOFT.has(x));
}

/** The text a player sent, tidied: one line, no doubled spaces, at most QAMUS_TEXT_MAX characters. */
export function cleanDefinition(raw: string): string {
  return [...raw.replace(/\s+/g, ' ').trim()].slice(0, QAMUS_TEXT_MAX).join('').trim();
}

/* ------------------------------------------------------------------ */
/* Points                                                              */
/* ------------------------------------------------------------------ */

export interface QamusScoreInput {
  players: string[];
  /** card ids → who wrote it ([] for the real one) */
  cards: { id: string; real: boolean; authors: string[]; marked: boolean }[];
  /** who voted for which card */
  votes: Record<string, string | null | undefined>;
  /** the players whose definition matched the real one before the vote */
  knewBefore: string[];
}

/** The round's points for everyone (marked cards count as the real one). */
export function scoreRound({ players, cards, votes, knewBefore }: QamusScoreInput): { gains: Record<string, number>; knew: string[] } {
  const gains: Record<string, number> = Object.fromEntries(players.map((p) => [p, 0]));
  const byId = new Map(cards.map((c) => [c.id, c]));
  const knew = new Set(knewBefore.filter((p) => players.includes(p)));
  for (const c of cards) if (c.marked && !c.real) for (const a of c.authors) if (players.includes(a)) knew.add(a);
  for (const p of knew) gains[p] += QAMUS_POINTS.knew;
  for (const p of players) {
    const id = votes[p];
    const c = id ? byId.get(id) : undefined;
    if (!c || c.authors.includes(p)) continue;
    if (c.real || c.marked) gains[p] += QAMUS_POINTS.real;
    else for (const a of c.authors) if (players.includes(a) && a !== p) gains[a] += QAMUS_POINTS.fooled;
  }
  return { gains, knew: players.filter((p) => knew.has(p)) };
}
