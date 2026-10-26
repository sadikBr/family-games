/**
 * «تمثيل صامت» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export type CharadesCategoryKey = 'actions' | 'animals' | 'jobs' | 'sports' | 'movies' | 'home' | 'daily';
export type CharadesLevel = 'all' | 'easy' | 'medium' | 'hard';

export const CHARADES_CATEGORIES: { key: CharadesCategoryKey; label: string }[] = [
  { key: 'actions', label: 'أفعال' },
  { key: 'animals', label: 'حيوانات' },
  { key: 'jobs', label: 'مهن' },
  { key: 'sports', label: 'رياضات' },
  { key: 'movies', label: 'أفلام ورسوم متحركة' },
  { key: 'home', label: 'أشياء في البيت' },
  { key: 'daily', label: 'مواقف يومية' },
];

/** «أمثال وحكم»: the «غصب عنك تقول» style (proverbs worth 1–3 points, «أوامر» and «بطاقات الراحة»). Not part of «خليط». */
export const CHARADES_PROVERBS = { key: 'proverbs', label: 'أمثال وحكم' } as const;

export const CHARADES_SECONDS = [45, 60, 90] as const;
/** `skips` value meaning «تخطٍّ بلا حدود وبلا خصم». */
export const CHARADES_FREE_SKIPS = 9;

export interface CharadesSettings {
  /** seconds per turn: 45, 60 or 90 */
  seconds: number;
  /** turns each player acts (the bigger team sets how many turns both teams get) */
  turnsEach: number;
  /** free skips per turn; once used up a skip costs one point. CHARADES_FREE_SKIPS = unlimited */
  skips: number;
  category: CharadesCategoryKey | 'mixed' | 'proverbs';
  level: CharadesLevel;
  /** «أمثال وحكم» only: «بطاقات الأوامر» mixed into the deck */
  commands: boolean;
  /** «أمثال وحكم» only: «بطاقات الراحة» mixed into the deck */
  rest: boolean;
}

/** done / undone: a command judged by the other team; rest: a rest card (its effect applied by itself) */
export type CharadesResult = 'ok' | 'skip' | 'penalty' | 'done' | 'undone' | 'rest';

/** word: the classic categories; proverb: «أمثال وحكم»; command: «أمر»; rest: «بطاقة راحة» */
export type CharadesCardKind = 'word' | 'proverb' | 'command' | 'rest';

export interface CharadesCard {
  index: number;
  word: string;
  /** category label */
  category: string;
  level: 1 | 2 | 3;
  kind: CharadesCardKind;
  /** what the card is worth (1 for the classic words; for a rest card, the free points, 0 for none) */
  points: number;
  /** a Moroccan proverb, with its meaning in فصحى */
  ma?: boolean;
  meaning?: string;
  /** a rest card's effect */
  effect?: 'points' | 'pass' | 'freeSkip';
}

export interface CharadesView {
  game: 'charades';
  phase: 'teams' | 'ready' | 'countdown' | 'play' | 'turnEnd' | 'final';
  participants: string[];
  teams: [string[], string[]];
  activeTeam: 0 | 1;
  actorId: string;
  /** 1-based */
  turn: number;
  totalTurns: number;
  endsAt: number | null;
  seconds: number;
  /** only for the actor and the other team (who checks fairness); a command or rest card for everyone */
  card: CharadesCard | null;
  /** this turn's cards; `word` is null for the guessing team while the turn is running; `points`: what it changed */
  history: { word: string | null; result: CharadesResult; points: number; kind: CharadesCardKind }[];
  /** the turn clock is stopped (a command waiting for the judges, a rest card): the ms left */
  pausedLeft: number | null;
  /** may judge the command on screen («نُفِّذ ✓ / لم يُنفَّذ»): the other team and the host */
  canJudge: boolean;
  teamScores: [number, number];
  /** free skips left this turn (CHARADES_FREE_SKIPS: unlimited) */
  skipsLeft: number;
  notice: string | null;
}

export const CHARADES_DEFAULTS: CharadesSettings = { seconds: 60, turnsEach: 1, skips: 2, category: 'mixed', level: 'all', commands: true, rest: true };

export const CHARADES_INFO = {
  title: 'تمثيل صامت',
  tagline: 'مثّل الكلمة بلا كلام… وفريقك يخمّن!',
  color: '#F08A3E',
  maxPlayers: 12,
  howTo: [
    'فريقان: الأحمر والأزرق. في كل دور يقف ممثّل من الفريق، وتظهر له كلمة على هاتفه.',
    'يمثّل الكلمة بلا كلام ولا أصوات ولا إشارة إلى الحروف، وفريقه يصرخ بالتخمينات قبل نهاية الوقت.',
    'يضغط الممثّل «صحيح» عندما يخمّن فريقه (نقطة)، أو «تخطَّ» لكلمة صعبة. التخطّي محدود في كل دور، وبعده يكلّف نقطة.',
    'الفريق الآخر يرى الكلمة على هواتفه ليتأكد أن كل شيء نزيه.',
    'الفرق تتناوب، والممثّل يتغيّر كل مرة. الفريق صاحب أكثر النقاط يفوز.',
    'موضوع «أمثال وحكم» على طريقة «غصب عنك تقول»: مثّل مثلاً أو حكمة مشهورة، ولكل بطاقة نقاطها (من 1 إلى 3 حسب صعوبتها).',
    'وفيه «بطاقات الأوامر»: أمر طريف ينفّذه الممثّل ويحكم الفريق الآخر «نُفِّذ ✓ / لم يُنفَّذ»، و«بطاقات الراحة»: نقطة مجانية أو تخطٍّ بلا خسارة.',
  ],
};
