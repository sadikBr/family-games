/**
 * «قصة جماعية» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * Every player has a story. Everyone writes at the same time: each round the stories move one seat on,
 * and each player adds one sentence to the story in their hands, seeing ONLY its last sentence. At the
 * end the stories are revealed sentence by sentence to everyone (each with its author), read aloud by
 * the phones, then a light vote for «أجمل قصة».
 */

/** One sentence of a story. `by` null: the opening line dealt by the game. */
export interface StoryLine {
  by: string | null;
  text: string;
  /** time ran out with nothing typed: a neutral filler («… ومرّ الوقت بسرعة») */
  filler?: boolean;
  /** written for a player who left (their draft, or a filler) */
  left?: boolean;
}

/** How long the stories are: one lap (every player writes once in each), two laps, or a fixed count. */
export type StoryLength = 'lap' | 'two' | '4' | '6' | '8';
export const STORY_LENGTHS: StoryLength[] = ['lap', 'two', '4', '6', '8'];
export const STORY_LENGTH_LABEL: Record<StoryLength, string> = { lap: 'دورة واحدة', two: 'دورتان', '4': '٤ جمل', '6': '٦ جمل', '8': '٨ جمل' };

/** Where the stories start: a ready opening line dealt by the game, or each player writes their own. */
export type StoryOpening = 'ready' | 'own';

export interface StorySettings {
  opening: StoryOpening;
  length: StoryLength;
  /** seconds per round; 0 = no limit */
  seconds: number;
  /** «أجمل قصة» vote at the end */
  votes: boolean;
  /** the reveal moves on by itself (at the room's pace) */
  autoReveal: boolean;
}

export type StoryPhase = 'write' | 'pass' | 'reveal' | 'vote' | 'final';

/** What I write this round: only the last sentence of the story in my hands is shown. */
export interface StoryTask {
  /** 1-based number of the sentence I write in this story (the dealt opening line not counted) */
  index: number;
  /** the story I started (the first round, and again after each lap) */
  mine: boolean;
  /** the last sentence (null: I write the very first sentence of the story) */
  prompt: string | null;
  /** the prompt is the game's opening line */
  opening: boolean;
  done: boolean;
  /** what I sent (shown while waiting) */
  sent: string | null;
  /** what I had typed (restored after a reconnect) */
  draft: string;
}

/** A finished story (votes and the end). */
export interface StoryBook {
  owner: string;
  lines: StoryLine[];
}

export interface StoryView {
  game: 'story';
  phase: StoryPhase;
  /** everyone still playing, in seat order */
  players: string[];
  /** stories' owners in story order (players who left included) */
  owners: string[];
  /** names of every author (players who left included) */
  names: Record<string, string>;
  /** 0-based round being written, out of `rounds` */
  round: number;
  rounds: number;
  endsAt: number | null;
  total: number;
  /** a round with no time limit (the host may end it) */
  noLimit: boolean;
  task: StoryTask | null;
  /** players writing this round, and who has finished */
  working: string[];
  done: string[];
  /** during 'pass': what comes next */
  next: 'write' | 'reveal' | null;
  reveal: {
    story: number;
    stories: number;
    owner: string;
    /** the sentences shown so far (the last one is the one being read) */
    lines: StoryLine[];
    /** sentences in this story */
    length: number;
    /** I may move on (the story's owner; the host can always) */
    canTurn: boolean;
    auto: boolean;
  } | null;
  vote: {
    /** the story I voted for */
    mine: number | null;
    /** players who have voted */
    voted: string[];
  } | null;
  /** every story in full: only once the reveal is over (votes, final) */
  books: StoryBook[] | null;
  final: {
    votes: boolean;
    /** votes received by each story */
    tally: number[];
    /** the story (or stories, a tie) with the most votes; empty without votes */
    best: number[];
    /** points per player: one for each vote a story they wrote in received */
    scores: Record<string, number>;
  } | null;
}

export const STORY_SECONDS = [45, 60, 90, 0] as const;
/** longest sentence */
export const STORY_TEXT_MAX = 140;
/** the most rounds a game has (two laps of 12) */
export const STORY_MAX_ROUNDS = 24;

export const STORY_DEFAULTS: StorySettings = {
  opening: 'ready',
  length: 'lap',
  seconds: 60,
  votes: true,
  autoReveal: false,
};

/** Rounds in a game of `n` players with these settings. */
export function storyRounds(n: number, length: StoryLength): number {
  const r = length === 'lap' ? n : length === 'two' ? 2 * n : Number(length);
  return Math.max(1, Math.min(STORY_MAX_ROUNDS, r));
}

export const STORY_INFO = {
  title: 'قصة جماعية',
  tagline: 'كل واحد يضيف جملة دون أن يرى إلا الجملة السابقة… ثم تُقرأ القصص كاملة!',
  color: '#A04D6A',
  maxPlayers: 12,
  howTo: [
    'لكل لاعب قصة تبدأ بجملة جاهزة من اللعبة (أو يكتب كل واحد أول جملة في قصته).',
    'في كل جولة تنتقل القصص بين اللاعبين: يستلم كل واحد قصة لا يرى منها إلا جملتها الأخيرة، فيضيف جملة واحدة تكملها. الجميع يكتب في الوقت نفسه.',
    'إذا انتهى الوقت أُرسل ما كُتب، وإن لم يُكتب شيء مرّت جملة محايدة.',
    'في النهاية تُكشف القصص جملة بعد جملة أمام الجميع، مع اسم كاتب كل جملة، ويقرؤها الهاتف بصوت مسموع.',
    'ثم تصويت خفيف لأجمل قصة (لا تصويت لقصتك)، وكل من كتب فيها يأخذ نقطة عن كل صوت.',
    'تحتاج اللعبة 3 لاعبين على الأقل، كلٌّ على هاتفه: البوتات لا تكتب القصص.',
  ],
};
