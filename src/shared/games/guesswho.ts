/**
 * «خمّن من؟» — the classic two-player guessing game: the types shared by the server and the app (settings,
 * the questions, the view each phone gets), the default settings and the game's card on the home screen.
 *
 * Both players have the same board of 24 family characters (guesswho-chars.ts) and each one secretly
 * gets one of them. In turn, a player asks a yes/no question about the other's secret character — chosen
 * from a fixed list the app answers itself from the character's attributes (no lying possible) — then
 * flips down the characters that don't match (automatically with «إسقاط تلقائي»). Instead of asking, a
 * player may guess «هل هو …؟»: right wins the round; wrong loses it (or only costs the turn, by setting).
 */
import { GW_CHARS, type GwChar } from './guesswho-chars';

export { GW_CHARS, type GwChar };

export type GwQuestionId =
  | 'female'
  | 'child'
  | 'elder'
  | 'glasses'
  | 'beard'
  | 'moustache'
  | 'hat'
  | 'hijab'
  | 'hairBlack'
  | 'hairBrown'
  | 'hairLong'
  | 'jellaba'
  | 'smile'
  | 'eyesBlue'
  | 'earrings'
  | 'red'
  | 'blue';

export interface GwQuestion {
  id: GwQuestionId;
  /** the whole question, as asked and as read in the log */
  text: string;
  /** a short label for the button */
  short: string;
  test: (c: GwChar) => boolean;
}

/** Long hair: it falls below the ears to the shoulders (braids too). */
const longHair = (c: GwChar) => c.style === 'long' || c.style === 'braids';

/** The questions, in the order of the buttons. What the picture shows decides: a hijab or a turban hides the hair. */
export const GW_QUESTIONS: GwQuestion[] = [
  { id: 'female', text: 'هل هي أنثى؟', short: 'أنثى', test: (c) => c.female },
  { id: 'child', text: 'هل هو طفل؟', short: 'طفل', test: (c) => c.age === 'child' },
  { id: 'elder', text: 'هل هو كبير في السنّ؟', short: 'كبير السنّ', test: (c) => c.age === 'elder' },
  { id: 'glasses', text: 'هل يلبس نظارة؟', short: 'نظارة', test: (c) => c.glasses },
  { id: 'beard', text: 'هل له لحية؟', short: 'لحية', test: (c) => c.beard },
  { id: 'moustache', text: 'هل له شارب؟', short: 'شارب', test: (c) => c.moustache },
  { id: 'hat', text: 'هل يلبس طربوشاً أو قبعة أو عمامة؟', short: 'طربوش أو قبعة', test: (c) => c.hat !== 'none' },
  { id: 'hijab', text: 'هل تلبس حجاباً؟', short: 'حجاب', test: (c) => c.hijab },
  { id: 'hairBlack', text: 'هل شعره أسود؟', short: 'شعر أسود', test: (c) => c.hair === 'black' },
  { id: 'hairBrown', text: 'هل شعره بنّي؟', short: 'شعر بنّي', test: (c) => c.hair === 'brown' },
  { id: 'hairLong', text: 'هل شعره طويل؟', short: 'شعر طويل', test: longHair },
  { id: 'jellaba', text: 'هل يلبس جلابة؟', short: 'جلابة', test: (c) => c.outfit === 'jellaba' },
  { id: 'smile', text: 'هل يبتسم؟', short: 'يبتسم', test: (c) => c.smile },
  { id: 'eyesBlue', text: 'هل عيناه زرقاوان؟', short: 'عينان زرقاوان', test: (c) => c.eyes === 'blue' },
  { id: 'earrings', text: 'هل تلبس أقراطاً؟', short: 'أقراط', test: (c) => c.earrings },
  { id: 'red', text: 'هل ثيابه حمراء؟', short: 'ثياب حمراء', test: (c) => c.color === 'red' },
  { id: 'blue', text: 'هل ثيابه زرقاء؟', short: 'ثياب زرقاء', test: (c) => c.color === 'blue' },
];

export const GW_QUESTION: Record<GwQuestionId, GwQuestion> = Object.fromEntries(GW_QUESTIONS.map((q) => [q.id, q])) as Record<GwQuestionId, GwQuestion>;

export const GW_N = GW_CHARS.length;

/** The truthful answer about character `char` (an index in GW_CHARS). */
export const gwAnswer = (q: GwQuestionId, char: number): boolean => GW_QUESTION[q].test(GW_CHARS[char]);

/** One line of a round's log (public: both players hear every question and its answer). */
export type GwEvent =
  | { kind: 'ask'; n: number; by: string; q: GwQuestionId; yes: boolean }
  | { kind: 'guess'; n: number; by: string; char: number; right: boolean };

/** Is character `char` still possible after the questions `by` asked (their answers) and their wrong guesses? */
export function gwConsistent(char: number, log: GwEvent[], by: string): boolean {
  for (const e of log) {
    if (e.by !== by) continue;
    if (e.kind === 'ask' && gwAnswer(e.q, char) !== e.yes) return false;
    if (e.kind === 'guess' && !e.right && e.char === char) return false;
  }
  return true;
}

export const GW_BEST_OF = [1, 3, 5] as const;

export interface GuesswhoSettings {
  /** 1, 3 or 5 rounds: the first to win more than half wins */
  bestOf: number;
  /** after each answer the app flips down the characters that don't match */
  autoFlip: boolean;
  /** a wrong guess loses the round (otherwise it only costs the turn) */
  wrongLoses: boolean;
}

export const GUESSWHO_DEFAULTS: GuesswhoSettings = { bestOf: 3, autoFlip: true, wrongLoses: true };

/** Rounds needed to win the match. */
export const gwToWin = (bestOf: number) => Math.floor(bestOf / 2) + 1;

export interface GuesswhoView {
  game: 'guesswho';
  phase: 'play' | 'reveal' | 'final';
  players: [string, string];
  /** 1-based */
  round: number;
  bestOf: number;
  wins: Record<string, number>;
  /** whose turn it is (null between rounds) */
  turn: string | null;
  /**
   * After a question: the answer stays on the screens until this server time, then the turn passes
   * (null: the turn is open). Without «إسقاط تلقائي» the asker ends the turn with «إنهاء الدور».
   */
  pauseUntil: number | null;
  pauseTotal: number;
  /** the pause waits for the asker to flip by hand and tap «إنهاء الدور» */
  manual: boolean;
  /** my own secret character (null for a spectator) */
  mySecret: number | null;
  /** the characters flipped down on my board */
  myDown: number[];
  /** how many characters still stand on each board (public, like the other side of a real board) */
  standing: Record<string, number>;
  /** this round's questions, answers and guesses, oldest first */
  log: GwEvent[];
  autoFlip: boolean;
  wrongLoses: boolean;
  /** reveal / final: both secrets; never before the round is over */
  secrets: Record<string, number> | null;
  roundWinner: string | null;
  /** how the round ended */
  how: 'guess' | 'wrong' | 'resign' | 'leave' | null;
  /** final: the match winner */
  winner: string | null;
  /** reveal: when the next round starts */
  nextAt: number | null;
  nextTotal: number;
}

export const GUESSWHO_INFO = {
  title: 'خمّن من؟',
  tagline: 'اسأل بنعم أو لا واكتشف الشخصية السرية',
  color: '#3FA7D6',
  maxPlayers: 2,
  howTo: [
    'لكل لاعب لوحة فيها 24 شخصية من العائلة، وشخصية سرية يختارها التطبيق له. الهدف: اكتشاف الشخصية السرية للخصم قبله.',
    'في دورك اختر سؤالاً من القائمة: نظارة؟ لحية؟ حجاب؟ شعر أسود؟… يجيب التطبيق بنعم أو لا من صورة الشخصية، فلا كذب ولا خطأ.',
    'بعد الجواب تسقط الشخصيات التي لا تطابق (مع «إسقاط تلقائي»)، أو أسقطها بنفسك بلمسها.',
    'الصورة هي الحَكَم: الحجاب والعمامة يخفيان الشعر، فجواب «شعره أسود؟» عندها «لا».',
    'بدل السؤال يمكنك التخمين: «هل هو …؟». التخمين الصحيح يربح الجولة، والخاطئ يخسرها (أو يضيّع الدور فقط، حسب الإعدادات).',
    'جولة واحدة، أو الأفضل من 3 أو من 5، ويتناوب اللاعبان على البداية.',
  ],
};
