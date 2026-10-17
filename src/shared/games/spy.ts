/**
 * «الجاسوس» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export const SPY_MINUTES = [5, 8, 10] as const;

export interface SpySettings {
  /** spies per round: 0 = auto (1, or 2 from 7 players), 1 or 2 */
  spies: number;
  /** round timer in minutes: 5, 8 or 10 */
  minutes: number;
  rounds: number;
}

export type SpySecret =
  | { role: 'spy'; partners: string[] }
  | { role: 'civilian'; location: string; part: string };

export type SpyHow =
  | 'caught' // an accusation (or the final vote) picked a spy
  | 'wrongAccuse' // an accusation (or the final vote) picked an innocent
  | 'tie' // time ran out and the final vote didn't agree on anyone
  | 'guessRight' // the spy revealed themselves and named the location
  | 'guessWrong' // … and got it wrong (or ran out of time)
  | 'spyLeft'; // the spy left the game

export interface SpyResult {
  winners: 'spies' | 'civilians';
  how: SpyHow;
  spies: string[];
  location: string;
  /** everyone's role at the location (civilians only) */
  parts: Record<string, string>;
  /** who the accusation / final vote picked */
  accused: string | null;
  guessed: string | null;
  /** the final vote (voter → suspect), when there was one */
  votes: Record<string, string> | null;
  /** points won this round */
  points: Record<string, number>;
}

export interface SpyAccusation {
  by: string;
  target: string;
  /** who has voted (not what) while voting is open */
  voted: string[];
}

export interface SpyView {
  game: 'spy';
  phase: 'reveal' | 'play' | 'accuse' | 'spyGuess' | 'finalVote' | 'result' | 'final';
  round: number;
  totalRounds: number;
  participants: string[];
  spyCount: number;
  /** null for spectators */
  secret: SpySecret | null;
  /** every possible location this round (the same list for everyone) */
  locations: string[];
  ready: string[];
  /** suggested order of askers */
  order: string[];
  askerId: string | null;
  /** round timer; null while it is paused (accusation, spy guess) */
  endsAt: number | null;
  /** ms left while the timer is paused */
  pausedLeft: number | null;
  totalMs: number;
  /** players who already used their one accusation this round */
  accusers: string[];
  accusation: SpyAccusation | null;
  /** my vote in the open accusation (yes/no) */
  myAccuseVote: boolean | null;
  /** the last failed accusation, for a short notice */
  failed: { by: string; target: string; yes: number; no: number } | null;
  finalVoted: string[];
  myFinalVote: string | null;
  guesserId: string | null;
  guessEndsAt: number | null;
  result: SpyResult | null;
  scores: Record<string, number>;
}

export const SPY_DEFAULTS: SpySettings = { spies: 0, minutes: 8, rounds: 3 };

export const SPY_INFO = {
  title: 'الجاسوس',
  tagline: 'الجميع يعرفون المكان إلا الجاسوس… اكشفوه بالأسئلة!',
  color: '#4F5BD5',
  maxPlayers: 10,
  howTo: [
    'الجميع يرون المكان السري نفسه ودوراً فيه (مثلاً «الطبيب» في «المستشفى»)، إلا الجاسوس: يرى «أنت الجاسوس» وقائمة كل الأماكن.',
    'تسألون بعضكم بصوت عالٍ بالترتيب الظاهر على الهاتف. اسألوا أسئلة تكشف الجاسوس بدون أن تفضحوا المكان.',
    'أي لاعب يستطيع اتهام لاعب مرة واحدة في الجولة: الباقون يصوّتون نعم أو لا. إذا وافقت الأغلبية وكان جاسوساً فاز المواطنون، وإن كان بريئاً فاز الجاسوس.',
    'الجاسوس يستطيع في أي لحظة كشف نفسه وتخمين المكان: إن أصاب فاز، وإن أخطأ فاز المواطنون.',
    'عند نهاية الوقت يصوّت الجميع على من يشكّون فيه. بعد كل الجولات، صاحب أكثر النقاط يفوز.',
  ],
};
