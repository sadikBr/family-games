/**
 * «الأعلام والعواصم» — flags and capitals: the types shared by the server and the app. Four kinds of
 * question, mixed by the lobby's mode: a flag → its country, a country → its capital, a capital → its
 * country, a country → its flag among four. Distractors come from the same part of the world. A right
 * answer scores 500 and up to 500 more for speed. The flags are small images (assets/flags, from the
 * MIT-licensed flag-icons set): the view sends the country's code, never a picture of the answer.
 */

export type FlagsKind = 'flag' | 'capital' | 'country' | 'pickflag';
export type FlagsMode = 'flags' | 'capitals' | 'mixed';
export type FlagsRegion = 'world' | 'arab' | 'africa' | 'europe' | 'asia' | 'americas' | 'oceania';
export type FlagsLevel = 'easy' | 'all';

export const FLAGS_ROUNDS = [10, 15, 20] as const;
/** seconds to answer each question */
export const FLAGS_SECONDS = 15;

export interface FlagsSettings {
  /** 10, 15 or 20 */
  rounds: number;
  mode: FlagsMode;
  region: FlagsRegion;
  /** easy: well-known countries only */
  level: FlagsLevel;
}

export const FLAGS_DEFAULTS: FlagsSettings = { rounds: 10, mode: 'mixed', region: 'world', level: 'easy' };

export const FLAGS_MODES: { key: FlagsMode; label: string }[] = [
  { key: 'mixed', label: 'مختلط' },
  { key: 'flags', label: 'أعلام' },
  { key: 'capitals', label: 'عواصم' },
];

export const FLAGS_REGIONS: { key: FlagsRegion; label: string }[] = [
  { key: 'world', label: 'العالم كله' },
  { key: 'arab', label: 'العالم العربي' },
  { key: 'africa', label: 'أفريقيا' },
  { key: 'europe', label: 'أوروبا' },
  { key: 'asia', label: 'آسيا' },
  { key: 'americas', label: 'الأمريكتان' },
  { key: 'oceania', label: 'أوقيانوسيا' },
];

export const FLAGS_LEVELS: { key: FlagsLevel; label: string }[] = [
  { key: 'easy', label: 'سهل' },
  { key: 'all', label: 'كل الدول' },
];

/** The kinds each mode mixes. */
export const FLAGS_MODE_KINDS: Record<FlagsMode, FlagsKind[]> = {
  flags: ['flag', 'pickflag'],
  capitals: ['capital', 'country'],
  mixed: ['flag', 'capital', 'country', 'pickflag'],
};

/** The question's line for each kind. */
export const FLAGS_ASK: Record<FlagsKind, string> = {
  flag: 'علم أي دولة هذا؟',
  capital: 'ما عاصمة هذه الدولة؟',
  country: 'هذه عاصمة أي دولة؟',
  pickflag: 'أيّ هذه الأعلام علم هذه الدولة؟',
};

export const FLAGS_KIND_LABEL: Record<FlagsKind, string> = {
  flag: 'علم',
  capital: 'عاصمة',
  country: 'عاصمة',
  pickflag: 'علم',
};

/** A thing to show: a name, a flag (a country's code), or both. */
export interface FlagsShown {
  text?: string;
  /** flag-icons code (ISO 3166-1 alpha-2, lowercase) */
  flag?: string;
}

export const FLAGS_POINTS = 500;
export const FLAGS_SPEED_POINTS = 500;

export interface FlagsResult {
  id: string;
  /** the option they tapped (null: nothing in time) */
  choice: number | null;
  correct: boolean;
  points: number;
}

export interface FlagsView {
  game: 'flags';
  phase: 'ask' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  kind: FlagsKind;
  /** what is asked about: a flag (kind flag), a country (capital, pickflag), a capital (country) */
  prompt: FlagsShown;
  options: FlagsShown[];
  endsAt: number | null;
  timerTotal: number;
  answered: string[];
  myChoice: number | null;
  /** reveal / final */
  correct: number | null;
  /** reveal: the country with its flag and capital («المغرب — الرباط») */
  answer: { name: string; capital: string | null; flag: string | null } | null;
  results: FlagsResult[] | null;
  scores: Record<string, number>;
  players: string[];
  rights: Record<string, number>;
}

export const FLAGS_INFO = {
  title: 'الأعلام والعواصم',
  tagline: 'علم أي دولة هذا؟ وما عاصمتها؟ من كل قارات العالم.',
  color: '#3E7BD6',
  maxPlayers: 12,
  howTo: [
    'أسئلة مختلطة: يظهر علم فاختر دولته، أو دولة فاختر عاصمتها، أو عاصمة فاختر دولتها، أو اختر علم دولة من بين أربعة أعلام.',
    'لكل سؤال أربعة اختيارات من المنطقة نفسها من العالم، و15 ثانية للجواب.',
    'الجواب الصحيح يعطي 500 نقطة، وحتى 500 نقطة إضافية حسب السرعة.',
    'بعد كل سؤال تظهر الدولة مع علمها وعاصمتها، وما اختاره كل واحد.',
    'في الإعدادات: عدد الأسئلة، والنوع (أعلام / عواصم / مختلط)، والمنطقة (العالم كله، العالم العربي، أفريقيا، أوروبا، آسيا، الأمريكتان، أوقيانوسيا)، والمستوى: «سهل» للدول المعروفة فقط أو «كل الدول».',
  ],
};
