/**
 * «قصص الأنبياء» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * A cooperative game: the whole family reads a story together, chapter by chapter, and answers one
 * question per chapter by majority vote. A wrong answer dims one of the shared lanterns.
 */

export type ProphetsStoryId = 'yusuf' | 'musa' | 'nuh' | 'ibrahim' | 'yunus' | 'sulayman';

/** The stories, in the order the lobby lists them. */
export const PROPHETS_STORIES: { key: ProphetsStoryId; label: string; short: string }[] = [
  { key: 'yusuf', label: 'يوسف عليه السلام', short: 'يوسف' },
  { key: 'musa', label: 'موسى عليه السلام', short: 'موسى' },
  { key: 'nuh', label: 'نوح عليه السلام', short: 'نوح' },
  { key: 'ibrahim', label: 'إبراهيم عليه السلام', short: 'إبراهيم' },
  { key: 'yunus', label: 'يونس عليه السلام', short: 'يونس' },
  { key: 'sulayman', label: 'سليمان عليه السلام', short: 'سليمان' },
];

/**
 * The illustrated scene of a chapter: places, objects and scenery only (never people, prophets or
 * angels).
 */
export type ProphetsScene =
  | 'stars'
  | 'well'
  | 'desert'
  | 'palace'
  | 'prison'
  | 'wheat'
  | 'river'
  | 'mountain'
  | 'staff'
  | 'sea'
  | 'calm'
  | 'ship'
  | 'ark'
  | 'judi'
  | 'flood'
  | 'fire'
  | 'kaaba'
  | 'valley'
  | 'fish'
  | 'tree'
  | 'city'
  | 'ants'
  | 'bird'
  | 'glass'
  | 'rain'
  | 'wind'
  | 'garden'
  | 'letter';

export interface ProphetsSettings {
  /** a story, or 'random' (the room goes through every story before repeating one) */
  story: ProphetsStoryId | 'random';
  /** seconds to read the chapter and vote */
  seconds: number;
  /** shared lanterns: each wrong answer dims one */
  lanterns: number;
}

/** Where a chapter is told in the Quran: a surah and a range of verses. */
export interface ProphetsSource {
  surah: string;
  from: number;
  to: number;
}

export interface ProphetsAyah {
  /** Uthmani text, taken from the Quran data file (one or more consecutive verses) */
  verses: { n: number; text: string }[];
  surah: string;
}

export interface ProphetsView {
  game: 'prophets';
  phase: 'ask' | 'reveal' | 'final';
  story: ProphetsStoryId;
  storyTitle: string;
  /** 1-based */
  chapter: number;
  chapters: number;
  scene: ProphetsScene;
  title: string;
  text: string;
  /** «من سورة …» */
  source: ProphetsSource[];
  question: string;
  options: string[];
  endsAt: number | null;
  timerTotal: number;
  /** everyone still playing */
  participants: string[];
  /** who has voted this chapter */
  voted: string[];
  myVote: number | null;
  /** who voted for which option: shown once I have voted, and at the reveal */
  votes: Record<string, number> | null;
  /** the family's answer (majority; ties: the option that got there first), null if nobody voted */
  chosen: number | null;
  /** revealed at the reveal */
  correct: number | null;
  /** what happened next, shown at the reveal */
  after: string | null;
  ayah: ProphetsAyah | null;
  /** who pressed «تابع» on the reveal */
  ready: string[];
  lanterns: number;
  maxLanterns: number;
  /** one entry per chapter played: answered right or not */
  history: boolean[];
  /** at the end */
  final: {
    completed: boolean;
    lessons: string[];
    right: number;
    /** right votes per player */
    perPlayer: Record<string, number>;
  } | null;
}

export const PROPHETS_DEFAULTS: ProphetsSettings = { story: 'random', seconds: 35, lanterns: 3 };

export const PROPHETS_INFO = {
  title: 'قصص الأنبياء',
  tagline: 'عيشوا القصة معاً، فصلاً بعد فصل.',
  color: '#7B61D9',
  maxPlayers: 8,
  howTo: [
    'لعبة تعاونية: العائلة كلها فريق واحد، تفوز معاً أو تعيد القصة معاً.',
    'اختاروا قصة نبي. تُروى القصة فصلاً بعد فصل كما جاءت في القرآن الكريم، مع ذكر السورة.',
    'بعد كل فصل سؤال عمّا حدث أو عمّا سيحدث بعده. يصوّت كل واحد من هاتفه، والجواب الذي يختاره أكثركم هو جواب العائلة. عند التعادل يُعتمد الجواب الذي بلغ ذلك العدد أولاً.',
    'لكم فوانيس مضيئة: كل جواب خاطئ يُطفئ فانوساً. إن وصلتم إلى آخر القصة وما زال فانوس مضيئاً فقد أتممتم القصة.',
    'البوتات زملاء في الفريق: تصوّت مثل أي لاعب، وصوتها يُحسب كصوت واحد.',
  ],
};
