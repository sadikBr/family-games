/**
 * «الرسم المتسلسل» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * Every player has a book. The first page is a phrase; then the books go round: a drawing of the
 * previous phrase, a guess of the previous drawing, and so on. Nobody sees more than the page just
 * before theirs until the reveal, where the books are shown page by page to everyone.
 */

/** One drawn line: colour, width (canvas units, the canvas is 1000 wide) and the points x0,y0,x1,y1… */
export interface TeledrawStroke {
  c: string;
  w: number;
  p: number[];
}

export type TeledrawPageKind = 'phrase' | 'draw' | 'guess';

/** A page of a book. Empty pages (time ran out) show «(لا شيء)», pages of a player who left «(غادر)». */
export interface TeledrawPage {
  kind: TeledrawPageKind;
  /** the author */
  by: string;
  text?: string;
  strokes?: TeledrawStroke[];
  empty?: boolean;
  left?: boolean;
  /** a phrase picked automatically (time ran out before a choice) */
  auto?: boolean;
}

export interface TeledrawSettings {
  /** seconds to draw */
  drawSeconds: number;
  /** seconds to write a guess */
  guessSeconds: number;
  /** players may write their own starting phrase */
  custom: boolean;
  /** books stop after 6 pages (big groups play faster) */
  capSteps: boolean;
  /** votes at the end: best drawing, funniest guess */
  votes: boolean;
  /** the reveal turns the pages by itself */
  autoReveal: boolean;
}

export type TeledrawPhase = 'write' | 'draw' | 'guess' | 'pass' | 'reveal' | 'vote' | 'final';

/** What I have to do during a step (only ever the page just before mine). */
export interface TeledrawTask {
  kind: 'write' | 'draw' | 'guess';
  /** whose book I hold */
  owner: string;
  /** write: the phrases offered to me */
  options: string[];
  /** the page I respond to (draw: a phrase or a guess; guess: a drawing) */
  prompt: TeledrawPage | null;
  done: boolean;
  /** draw: my drawing so far (restored after a reconnect) */
  draft: TeledrawStroke[];
  /** write / guess: what I sent */
  sent: string | null;
}

/** A vote target: book index + page index. */
export interface TeledrawRef {
  book: number;
  page: number;
}

/** A book open on a phone (during the votes and at the end, each phone browses on its own). */
export interface TeledrawBookView {
  index: number;
  owner: string;
  pages: TeledrawPage[];
}

export interface TeledrawWinner {
  ref: TeledrawRef;
  page: TeledrawPage;
  /** for a guess: the drawing it described */
  before: TeledrawPage | null;
  votes: number;
}

export interface TeledrawView {
  game: 'teledraw';
  phase: TeledrawPhase;
  /** everyone still playing, in seat order */
  players: string[];
  /** books' owners in book order (players who left included) */
  owners: string[];
  /** names of every author (players who left included) */
  names: Record<string, string>;
  /** 0-based page being made now, out of `steps` */
  step: number;
  steps: number;
  endsAt: number | null;
  total: number;
  task: TeledrawTask | null;
  /** players with a page to make in this step, and who has sent it */
  working: string[];
  done: string[];
  /** during 'pass': what comes next */
  next: 'draw' | 'guess' | 'reveal' | null;
  reveal: {
    book: number;
    books: number;
    owner: string;
    /** the pages shown so far (the last one is the current page) */
    pages: TeledrawPage[];
    /** pages in this book */
    length: number;
    /** I may turn the page (the book's owner; the host can always) */
    canTurn: boolean;
    auto: boolean;
  } | null;
  vote: {
    myDraw: TeledrawRef | null;
    myGuess: TeledrawRef | null;
    /** players who confirmed their votes */
    confirmed: string[];
  } | null;
  /** the book this phone is browsing (votes, final) */
  browse: TeledrawBookView | null;
  final: {
    votes: boolean;
    /** votes received by each player (both categories) */
    scores: Record<string, number>;
    bestDraw: TeledrawWinner[];
    bestGuess: TeledrawWinner[];
  } | null;
}

export const TELEDRAW_DRAW_CHOICES = [45, 60, 90, 120] as const;
export const TELEDRAW_GUESS_CHOICES = [25, 35, 45, 60] as const;
/** the most pages a book has with «capSteps» */
export const TELEDRAW_CAP = 6;
/** longest phrase / guess */
export const TELEDRAW_TEXT_MAX = 60;

export const TELEDRAW_DEFAULTS: TeledrawSettings = {
  drawSeconds: 60,
  guessSeconds: 35,
  custom: true,
  capSteps: false,
  votes: true,
  autoReveal: false,
};

export const TELEDRAW_INFO = {
  title: 'الرسم المتسلسل',
  tagline: 'اكتب جملة، ارسمها، خمّنها… وانظروا إلى أين وصلت في النهاية.',
  color: '#E0703A',
  maxPlayers: 12,
  howTo: [
    'لكل لاعب دفتر. في البداية يختار كل واحد جملة من بين جمل مقترحة (أو يكتب جملته الخاصة).',
    'ثم تنتقل الدفاتر بين اللاعبين: من يستلم جملة يرسمها، ومن يستلم رسمة يكتب ما يظنه فيها.',
    'لا يرى أحد إلا الصفحة التي قبله مباشرة، والجميع يلعب في الوقت نفسه.',
    'في النهاية تُكشف الدفاتر صفحة بعد صفحة أمام الجميع… وتبدأ الضحكات!',
    'ثم تصويت خفيف: أفضل رسمة وأطرف تخمين.',
  ],
};
