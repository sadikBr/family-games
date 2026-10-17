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
  category: CharadesCategoryKey | 'mixed';
  level: CharadesLevel;
}

export type CharadesResult = 'ok' | 'skip' | 'penalty';

export interface CharadesCard {
  index: number;
  word: string;
  /** category label */
  category: string;
  level: 1 | 2 | 3;
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
  /** only for the actor and the other team (who checks fairness) */
  card: CharadesCard | null;
  /** this turn's cards; `word` is null for the guessing team while the turn is running */
  history: { word: string | null; result: CharadesResult }[];
  teamScores: [number, number];
  /** free skips left this turn (CHARADES_FREE_SKIPS: unlimited) */
  skipsLeft: number;
  notice: string | null;
}

export const CHARADES_DEFAULTS: CharadesSettings = { seconds: 60, turnsEach: 1, skips: 2, category: 'mixed', level: 'all' };

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
  ],
};
