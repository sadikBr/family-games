/**
 * «من سيربح المليون؟» — the family version of the famous TV quiz: the types shared by the server and the app
 * (settings, the view each phone gets), the default settings, the game's card on the home screen and the
 * money ladder.
 *
 * «الكرسي الساخن»: the players take turns in the hot seat (once or twice each). The contestant answers up
 * to 15 questions that get harder rung by rung, from 100 to 1,000,000. Four answers (أ ب ج د); a tap
 * chooses, «الإجابة النهائية؟» confirms; the chosen answer is lit, then revealed. A wrong answer drops the
 * prize to the last safe level reached (1,000 after question 5, 32,000 after question 10); «انسحب» keeps
 * the prize reached so far. With a timer, a question left unanswered ends the turn as a walk-away.
 *
 * Three lifelines, once each per turn: 50:50 removes two wrong answers; «اسأل الجمهور» shows how the
 * others voted — everyone not in the seat is the audience and answers every question secretly anyway
 * (one audience point for each right answer); «اتصل بصديق»: the contestant picks another player, who sees
 * the question and sends an answer (and «متأكد» or «غير متأكد») within 30 seconds.
 *
 * The final standing: the prizes each player won (added up over their turns), ties broken by audience
 * points. A player alone just plays their ladder(s) (no audience, no friend).
 */

export type MillionTopic = 'general' | 'islamic' | 'mixed';
export type MillionLifeline = 'fifty' | 'audience' | 'friend';

export interface MillionSettings {
  /** turns in the hot seat for each player: 1 or 2 */
  rounds: number;
  /** seconds per question: 0 (no timer), 30 or 60 */
  timer: number;
  topic: MillionTopic;
}

export const MILLION_DEFAULTS: MillionSettings = { rounds: 1, timer: 0, topic: 'mixed' };

export const MILLION_ROUNDS = [1, 2] as const;
export const MILLION_TIMERS = [0, 30, 60] as const;
export const MILLION_TOPICS: { key: MillionTopic; label: string }[] = [
  { key: 'general', label: 'معلومات عامة' },
  { key: 'islamic', label: 'إسلامية' },
  { key: 'mixed', label: 'منوّعة' },
];

/** The prize of each rung (question 1 … 15). */
export const MILLION_LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1_000_000] as const;
/** The safe rungs (0-based): questions 5 and 10. */
export const MILLION_SAFE = [4, 9] as const;
/** How hard the question of each rung is (1 easy … 5 hardest). */
export const MILLION_STEP_LEVEL = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5] as const;

/** Time the friend has to answer. */
export const MILLION_FRIEND_MS = 30_000;
/** Longest wait for the audience's votes once asked. */
export const MILLION_POLL_MS = 12_000;
/** Audience points for a right answer. */
export const MILLION_AUDIENCE_POINT = 1;

/** The prize kept after `won` right answers (0 … 15). */
export const prizeAt = (won: number): number => (won <= 0 ? 0 : MILLION_LADDER[Math.min(won, 15) - 1]);

/** The safe prize after `won` right answers: what a wrong answer drops to. */
export function safePrize(won: number): number {
  let best = 0;
  for (const i of MILLION_SAFE) if (won >= i + 1) best = MILLION_LADDER[i];
  return best;
}

/** «1,000,000» */
export function formatMoney(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** The letters on the four answers. */
export const MILLION_LETTERS = ['أ', 'ب', 'ج', 'د'] as const;

export type MillionPhase = 'intro' | 'ask' | 'poll' | 'call' | 'lock' | 'reveal' | 'turnEnd' | 'final';
/** How a question / a turn ended. */
export type MillionOutcome = 'right' | 'wrong' | 'walk' | 'time' | 'away' | 'left' | 'million';

export interface MillionCall {
  friend: string;
  /** the call's end (while waiting for the answer) */
  endsAt: number;
  /** the friend's answer: null while waiting, or when the call ended without one */
  answer: number | null;
  sure: boolean | null;
  done: boolean;
}

export interface MillionTurn {
  id: string;
  /** right answers in this turn */
  won: number;
  prize: number;
  outcome: MillionOutcome;
}

export interface MillionView {
  game: 'million';
  phase: MillionPhase;
  topic: MillionTopic;
  /** 1-based number of the turn, and how many there are */
  turn: number;
  turns: number;
  /** who is in the hot seat (null at the end) */
  hot: string | null;
  /** the current rung, 0-based (0 … 14) */
  step: number;
  /** right answers so far in this turn */
  won: number;
  question: { text: string; options: string[]; label: string } | null;
  /** the answers removed by 50:50 */
  removed: number[];
  used: Record<MillionLifeline, boolean>;
  /** someone to ask: false for a player alone */
  canAudience: boolean;
  canFriend: boolean;
  /** the contestant's final answer (from «الإجابة النهائية» on) */
  locked: number | null;
  /** the right answer: only at the reveal */
  correct: number | null;
  /** how the question / turn ended (reveal and turnEnd) */
  outcome: MillionOutcome | null;
  /** the question's clock (ask), the poll's or the call's end, the pause's end */
  endsAt: number | null;
  timerTotal: number;
  /** seconds left on the question's clock while a lifeline pauses it */
  pausedLeft: number | null;
  /** the audience's votes (counts per answer), shown once asked */
  poll: number[] | null;
  /** the call to a friend (this question only) */
  call: MillionCall | null;
  /** everyone answering as the audience this turn */
  audience: string[];
  /** who of the audience answered this question (not what) */
  answered: string[];
  /** my own audience answer for this question */
  myAnswer: number | null;
  /** at the reveal: who of the audience was right */
  audienceRight: string[] | null;
  /** prizes won so far (all turns), audience points */
  prizes: Record<string, number>;
  audiencePts: Record<string, number>;
  /** finished turns, in order */
  history: MillionTurn[];
  players: string[];
}

export const MILLION_INFO = {
  title: 'من سيربح المليون؟',
  tagline: 'خمسة عشر سؤالاً نحو المليون… ووسائل مساعدة ثلاث.',
  color: '#6C4BD1',
  maxPlayers: 10,
  howTo: [
    'يجلس اللاعبون على «الكرسي الساخن» بالتناوب، ويجيب صاحب الكرسي عن خمسة عشر سؤالاً تزداد صعوبتها من 100 إلى مليون.',
    'اختر إجابة من أربع، ثم أكّدها بـ«الإجابة النهائية». الإجابة الخاطئة تعيد الجائزة إلى آخر مستوى مضمون: 1,000 بعد السؤال الخامس و32,000 بعد العاشر.',
    '«انسحب» متى شئت لتحتفظ بالجائزة التي وصلت إليها.',
    'وسائل المساعدة مرة واحدة في كل دور: حذف إجابتين، واسأل الجمهور، واتصل بصديق يرى السؤال ويرسل جوابه في 30 ثانية.',
    'البقية هم الجمهور: يجيبون عن كل سؤال سرّاً، ولكل إجابة صحيحة نقطة جمهور.',
    'الترتيب النهائي بمجموع الجوائز، ونقاط الجمهور تفصل عند التعادل.',
  ],
};
