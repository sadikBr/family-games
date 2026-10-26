/**
 * «من الفاعل؟» — a family mystery in the spirit of Cluedo: the types shared by the server and the app
 * (the cards, the house map, settings, the view each phone gets), the defaults, the game's card on the
 * home screen, and the certain facts a phone writes in its detective notebook by itself.
 *
 * The plate of sweets for the Eid has disappeared. «الملف السري» holds one character, one item and one
 * room; the other 18 cards are dealt. On a turn a player goes to another room of the house and makes an
 * «اتهام مؤقت» (a character + an item + that room); the players to the left, in seat order, must
 * disprove it: the first one who holds any of the three secretly shows ONE of them to the suggester only.
 * A final accusation «الاتهام النهائي» may be made once: right → the game is won; wrong → that player is
 * out of the guessing (but still shows cards).
 */

export type ClueKind = 'who' | 'what' | 'where';

export interface ClueCardInfo {
  id: string;
  kind: ClueKind;
  /** full name («الجدة زهرة», «صينية الشاي») */
  name: string;
  /** short name for the notebook rows and small cards */
  short: string;
  /** the card's colour (each character has its own, items and rooms share their category's) */
  color: string;
}

export const CLUE_KIND_COLOR: Record<ClueKind, string> = { who: '#E86FA6', what: '#F2B33D', where: '#22B8B0' };
export const CLUE_KIND_TITLE: Record<ClueKind, string> = { who: 'الشخصيات', what: 'الأدوات', where: 'الأماكن' };
/** the question each category answers */
export const CLUE_KIND_ASK: Record<ClueKind, string> = { who: 'من؟', what: 'بماذا؟', where: 'أين؟' };

const who = (id: string, name: string, color: string): ClueCardInfo => ({ id, kind: 'who', name, short: name, color });
const what = (id: string, name: string, short: string): ClueCardInfo => ({ id, kind: 'what', name, short, color: CLUE_KIND_COLOR.what });
const where = (id: string, name: string): ClueCardInfo => ({ id, kind: 'where', name, short: name, color: CLUE_KIND_COLOR.where });

/** The 21 cards: 6 characters, 6 items, 9 rooms (in this order). */
export const CLUE_CARDS: ClueCardInfo[] = [
  who('zahra', 'الجدة زهرة', '#2FB67C'),
  who('hammou', 'العمّ حمّو', '#F08A3E'),
  who('ruqaya', 'الخالة رقيّة', '#7B61D9'),
  who('anas', 'الصغير أنس', '#3D9BE9'),
  who('bouchaib', 'الجار بوشعيب', '#E2475F'),
  who('salma', 'الضيفة سلمى', '#E86FA6'),
  what('spoon', 'الملعقة الخشبية', 'الملعقة'),
  what('tray', 'صينية الشاي', 'الصينية'),
  what('stool', 'الكرسي الصغير', 'الكرسي'),
  what('basket', 'سلّة الخبز', 'السلّة'),
  what('umbrella', 'المظلّة', 'المظلّة'),
  what('broom', 'المكنسة', 'المكنسة'),
  where('salon', 'الصالون'),
  where('kitchen', 'المطبخ'),
  where('roof', 'السطح'),
  where('riad', 'الرياض'),
  where('bedroom', 'غرفة النوم'),
  where('library', 'المكتبة'),
  where('guests', 'غرفة الضيوف'),
  where('pantry', 'المخزن'),
  where('entrance', 'المدخل'),
];

export const CLUE_BY_ID: Record<string, ClueCardInfo> = Object.fromEntries(CLUE_CARDS.map((c) => [c.id, c]));
export const CLUE_KINDS: ClueKind[] = ['who', 'what', 'where'];
export const clueOfKind = (k: ClueKind) => CLUE_CARDS.filter((c) => c.kind === k);
export const CLUE_WHO = clueOfKind('who').map((c) => c.id);
export const CLUE_WHAT = clueOfKind('what').map((c) => c.id);
export const CLUE_WHERE = clueOfKind('where').map((c) => c.id);

/**
 * The house as a 3 × 3 plan (first row = the top of the plan; first column = the right-hand side, as
 * the screen is right-to-left). Any room but the one a player is in may be visited: no dice and no
 * walking, so a turn is two taps on a phone, and nobody can stay in one room and ask about it forever.
 */
export const CLUE_MAP: string[][] = [
  ['roof', 'library', 'bedroom'],
  ['salon', 'riad', 'guests'],
  ['kitchen', 'pantry', 'entrance'],
];

/** The mystery of the game (one picked at random): the question and what disappeared. */
export const CLUE_MYSTERIES = [
  { title: 'من أكل كعب الغزال؟', thing: 'كعب الغزال' },
  { title: 'من أخذ حلوى العيد؟', thing: 'حلوى العيد' },
  { title: 'من أكل الشبّاكية؟', thing: 'الشبّاكية' },
  { title: 'من أخذ صحن البغرير؟', thing: 'صحن البغرير' },
];

/** Seconds a player has to choose which card to show when holding several (then the app picks). */
export const CLUE_SHOW_SECS = [20, 30, 45] as const;

export interface ClueSettings {
  /** the notebook also crosses out the cards of whoever could not disprove a suggestion */
  helper: boolean;
  /** 20, 30 or 45 */
  showSecs: number;
}

export const CLUE_DEFAULTS: ClueSettings = { helper: true, showSecs: 30 };

export interface ClueTriple {
  who: string;
  what: string;
  where: string;
}

export const clueTriple = (t: ClueTriple) => [t.who, t.what, t.where];

/** One suggestion in the history, as one phone sees it. */
export interface ClueSuggestionEntry extends ClueTriple {
  kind: 'suggest';
  n: number;
  by: string;
  /** asked in seat order and could not disprove */
  passed: string[];
  /** showed a card (null: nobody yet / nobody could) */
  shownBy: string | null;
  /** the card shown: only for the suggester and the one who showed it */
  card: string | null;
  /** waiting for this player to choose a card to show */
  pending: string | null;
  /** everyone has been asked (or someone showed a card) */
  done: boolean;
}

export interface ClueAccusationEntry extends ClueTriple {
  kind: 'accuse';
  n: number;
  by: string;
  correct: boolean;
}

export type ClueEntry = ClueSuggestionEntry | ClueAccusationEntry;

export interface ClueView {
  game: 'clue';
  /** turn: suggest (or accuse) · show: someone chooses a card to show · after: accuse or end the turn */
  phase: 'turn' | 'show' | 'after' | 'final';
  /** a random id of this game (the notebook on the phone is kept under it) */
  gameKey: string;
  mystery: number;
  /** seat order: the disproving order goes from the suggester to the next seats */
  order: string[];
  names: Record<string, string>;
  turn: string | null;
  /** the room each player is in (null: not in the house yet) */
  rooms: Record<string, string | null>;
  handCounts: Record<string, number>;
  /** out of the guessing (a wrong final accusation): they still show cards */
  out: string[];
  myHand: string[];
  /** this turn's suggestion (null before it is made) */
  current: ClueSuggestionEntry | null;
  /** I must choose which of these cards to show to `to` (null: not me) */
  choose: { to: string; options: string[] } | null;
  /** the end of the time to choose a card (whoever is choosing) */
  endsAt: number | null;
  timerTotal: number;
  log: ClueEntry[];
  helper: boolean;
  /** cards of players who left the game, shown to everyone */
  revealed: { card: string; by: string }[];
  winner: string | null;
  /** final only: the secret file and every hand */
  envelope: ClueTriple | null;
  hands: Record<string, string[]> | null;
}

/** A notebook cell: ✓ holds it · ✗ doesn't hold it · ? a hunch. */
export type ClueMark = 'y' | 'n' | 'q';

export const clueCell = (card: string, player: string) => `${card}|${player}`;

/**
 * The certain facts a phone writes in its notebook by itself: my own cards (✓ for me, ✗ for the
 * others), the cards I hold not (✗ for me), the cards shown to me (✓ for who showed it, ✗ for the
 * others), the cards of players who left (out of the file), and — with the helper on — a ✗ for each
 * card of a suggestion that a player could not disprove. Nothing here is a guess.
 */
export function clueFacts(view: Pick<ClueView, 'order' | 'myHand' | 'log' | 'helper' | 'revealed'>, me: string): Record<string, 'y' | 'n'> {
  const f: Record<string, 'y' | 'n'> = {};
  const others = view.order.filter((p) => p !== me);
  const owns = (card: string, owner: string | null) => {
    if (owner) f[clueCell(card, owner)] = 'y';
    for (const p of view.order) if (p !== owner) f[clueCell(card, p)] = 'n';
  };
  if (view.order.includes(me)) {
    for (const c of CLUE_CARDS) {
      if (view.myHand.includes(c.id)) owns(c.id, me);
      else f[clueCell(c.id, me)] = 'n';
    }
  }
  for (const r of view.revealed) owns(r.card, view.order.includes(r.by) ? r.by : null);
  for (const e of view.log) {
    if (e.kind !== 'suggest') continue;
    if (e.card && e.shownBy && e.by === me) owns(e.card, e.shownBy);
    if (view.helper) for (const p of e.passed) for (const c of clueTriple(e)) if (others.includes(p) && f[clueCell(c, p)] !== 'y') f[clueCell(c, p)] = 'n';
  }
  return f;
}

/**
 * A notebook row as a whole: 'out' — someone holds it (not in the file); 'in' — nobody can hold it
 * (it is in the file); null — not known yet. Reads the certain facts and my own ✓ / ✗.
 */
export function clueRow(card: string, order: string[], cell: (card: string, player: string) => ClueMark | undefined): 'in' | 'out' | null {
  let no = 0;
  for (const p of order) {
    const m = cell(card, p);
    if (m === 'y') return 'out';
    if (m === 'n') no++;
  }
  return order.length && no === order.length ? 'in' : null;
}

/** «الجدة زهرة، بالمظلّة، في السطح» */
export function clueSentence(t: ClueTriple) {
  return `${CLUE_BY_ID[t.who]?.name ?? '؟'}، ب${CLUE_BY_ID[t.what]?.short ?? '؟'}، في ${CLUE_BY_ID[t.where]?.name ?? '؟'}`;
}

export const CLUE_INFO = {
  title: 'من الفاعل؟',
  tagline: 'لغز عائلي مضحك: من أكل حلوى العيد، وبماذا، وأين؟',
  color: '#B0507A',
  maxPlayers: 6,
  howTo: [
    'اختفت حلوى العيد! في «الملف السري» ثلاث أوراق: الفاعل (شخصية)، والأداة، والمكان. وتوزَّع باقي الأوراق على اللاعبين.',
    'في دورك: اختر غرفة أخرى من البيت (أي غرفة غير التي أنت فيها)، ثم شخصية وأداة، واضغط «اتهام مؤقت».',
    'يُسأل اللاعبون بالترتيب بعدك: أول من يملك واحدة من الأوراق الثلاث يعرض ورقة واحدة عليك وحدك. إن ملك أكثر من ورقة يختار هو أيّها يعرض.',
    'يرى الجميع أن ورقة عُرضت، لكن لا يعرف أيّها إلا أنت. إن لم يستطع أحد النفي فهذه إشارة قوية!',
    'دفتر المحقّق: جدول خاص بك يسجّل فيه الهاتف ما هو مؤكد (أوراقك، وما عُرض عليك). المس أي خانة أخرى لتضع ✗ أو ✓ أو ؟ بنفسك.',
    'الاتهام النهائي مرة واحدة فقط: الصحيح يعني الفوز، والخاطئ يعني الخروج من التخمين (مع بقاء عرض الأوراق على الآخرين).',
  ],
};
