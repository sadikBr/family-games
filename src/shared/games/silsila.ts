/**
 * «سلسلة الذاكرة» — a Simon-style memory chain for the whole family, each player on their own phone: the
 * types shared by the server and the app (settings, the view each phone gets), the default settings, the
 * game's card on the home screen and the timing both sides use.
 *
 * There are 4 (or 6) big coloured pads, each with its own shape (so colour-blind players can play) and its
 * own soft tone. Every round the server adds one random pad to the shared chain; every phone plays the whole
 * chain (the pads light up one by one with their tone, a little faster as the chain grows), then everyone
 * repeats it at the same time on their own phone. A wrong pad, or no tap for a few seconds, costs a life
 * («المحاولات»: 1, 2 or 3); at 0 the player is out. The round ends when every remaining player has finished
 * the chain or failed it. The last player standing wins; players who fall in the same round are ranked by
 * how far they got in it, then by speed. Alone: play until the lives run out; the score is the longest chain
 * repeated, and the room keeps its best.
 *
 * The view never shows another player's taps (only whether they are still in, done this round or out).
 */

/** Pads on the board. */
export const SILSILA_PADS = [4, 6] as const;
/** Lives at the start. */
export const SILSILA_LIVES = [1, 2, 3] as const;
/** Time for each tap: after the playback, then since the previous tap. */
export const SILSILA_TAP_MS = 4000;
/** «شاهد»: the pause before the first light of the playback (the very first round waits a bit longer). */
export const SILSILA_LEAD_MS = 1100;
export const SILSILA_FIRST_LEAD_MS = 2200;
/** The part of each step a pad stays lit (the rest is a short dark gap, so a repeated pad is seen twice). */
export const SILSILA_LIT = 0.62;
/** A chain this long ends the game (nobody gets this far, but the game must end). */
export const SILSILA_MAX_LEN = 60;

/** Time per pad in the playback: 700 ms at the start, a little quicker each round, never under 380 ms. */
export function silsilaStepMs(len: number): number {
  return Math.max(380, Math.round(700 - 18 * (len - 1)));
}

export interface SilsilaSettings {
  /** 4 or 6 */
  pads: number;
  /** 1, 2 or 3 */
  lives: number;
}

export const SILSILA_DEFAULTS: SilsilaSettings = { pads: 4, lives: 1 };

/** A player's state in the current round, as everyone sees it. */
export type SilsilaPlayerState = 'play' | 'done' | 'fail' | 'out';

export interface SilsilaRow {
  id: string;
  lives: number;
  state: SilsilaPlayerState;
  /** the longest chain repeated so far */
  best: number;
}

/** Who lost a life in the round just played. */
export interface SilsilaFall {
  id: string;
  out: boolean;
  /** 'wrong' pad or 'time' ran out */
  how: 'wrong' | 'time';
}

export interface SilsilaFinal {
  /** places[0] = the winner(s) */
  places: string[][];
  /** the round each player went out in (absent = still in at the end) */
  outRound: Record<string, number>;
  /** the longest chain of this game, and who repeated it */
  longest: number;
  longestBy: string[];
  /** the room's best chain with this many pads (this game included), and the names of who made it */
  roomBest: number;
  roomBestBy: string[];
  /** this game beat the room's best */
  record: boolean;
  /** everyone fell in the same last round */
  together: boolean;
}

export interface SilsilaView {
  game: 'silsila';
  /** watch = the playback · input = everyone repeats · fallen = the round's result · final */
  phase: 'watch' | 'input' | 'fallen' | 'final';
  pads: number;
  maxLives: number;
  solo: boolean;
  /** the chain's length = the round number */
  len: number;
  /** the chain, only up to its current length */
  seq: number[];
  /** server time of the first light, and the time per pad */
  playAt: number;
  stepMs: number;
  /** server time when tapping starts */
  inputAt: number;
  /** fallen: when the next round starts */
  endsAt: number | null;
  /** my own round (null when I'm watching the game) */
  me: {
    prog: number;
    lives: number;
    state: SilsilaPlayerState;
    /** my next tap must come before this (input) */
    deadline: number | null;
    /** my mistake this round: the pad that was due and the one tapped (null on a timeout) */
    miss: { want: number; got: number | null } | null;
  } | null;
  players: string[];
  rows: SilsilaRow[];
  /** fallen / final: who lost a life in the last round */
  fallen: SilsilaFall[];
  /** the room's best chain with this many pads before this game (0 = none yet) */
  roomBest: number;
  final: SilsilaFinal | null;
}

export const SILSILA_INFO = {
  title: 'سلسلة الذاكرة',
  tagline: 'كل جولة لون جديد في السلسلة… من يخطئ يخرج!',
  color: '#7A5BD6',
  maxPlayers: 12,
  howTo: [
    'في كل جولة تُضاف إلى السلسلة خطوة جديدة: زرّ ملوّن بشكله ونغمته.',
    '«شاهد»: تضيء الأزرار واحداً بعد الآخر على كل الهواتف، وتسرع قليلاً كلما طالت السلسلة.',
    '«دورك»: أعد السلسلة كلها بالترتيب على هاتفك، والجميع يلعب في الوقت نفسه.',
    'لكل ضغطة 4 ثوانٍ. الزر الخطأ أو انتهاء الوقت يكلّف قلباً، ومن تنفد قلوبه يخرج.',
    'آخر من يبقى يفوز. ومن يخرجون في الجولة نفسها يترتّبون بمن وصل أبعد، ثم بالأسرع.',
    'وحدك؟ العب حتى تنفد قلوبك، وحاول أن تتجاوز أفضل سلسلة في الغرفة.',
  ],
};
