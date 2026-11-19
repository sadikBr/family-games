/**
 * «من الأرجح؟» — who at the table is most likely to…: the types shared by the server and the app (settings,
 * the view each phone gets), the default settings, the game's card on the home screen and small helpers.
 *
 * Each round shows one prompt («من الأرجح أن ينام في العرس؟») on every phone. Everyone secretly picks ONE
 * player at the table (oneself too) before the timer ends; the pick can be changed while the vote is open.
 * The round ends at the timer or as soon as everyone connected has voted. The reveal shows how many votes
 * each player got (with «تصويت سري» on, only the counts: never who voted for whom); the most chosen
 * player(s) take the round's title. One point for every vote that matched the most chosen player (all
 * tied top choices count). A round whose votes are all on different players has no title and no points.
 *
 * With the secret vote, a point would tell who voted for the title holder, so during the game each phone
 * sees only its own points; the full standings come at the end. The end: a podium («أكثر من يعرف العائلة»)
 * and «الألقاب»: for each player, the prompt the family chose them most for.
 */

export const ARJAH_ROUNDS = [8, 12, 15] as const;
export const ARJAH_SECONDS = [20, 30] as const;

export type ArjahTheme = 'general' | 'home' | 'food' | 'travel' | 'work' | 'funny' | 'talents' | 'ramadan';
/** The lobby's theme setting: «منوّع» mixes them all. */
export type ArjahThemeSetting = 'mix' | ArjahTheme;
export const ARJAH_THEMES: ArjahTheme[] = ['general', 'home', 'food', 'travel', 'work', 'funny', 'talents', 'ramadan'];
export const ARJAH_THEME_SETTINGS: ArjahThemeSetting[] = ['mix', ...ARJAH_THEMES];
export const ARJAH_THEME_LABEL: Record<ArjahThemeSetting, string> = {
  mix: 'منوّع',
  general: 'عام',
  home: 'البيت والعائلة',
  food: 'الأكل',
  travel: 'السفر والعطل',
  work: 'المدرسة والعمل',
  funny: 'الطرائف',
  talents: 'المواهب',
  ramadan: 'رمضان والعيد',
};

export interface ArjahSettings {
  /** 8, 12 or 15 prompts */
  rounds: number;
  /** 20 or 30 seconds to vote */
  seconds: number;
  theme: ArjahThemeSetting;
  /** «تصويت سري»: the reveal shows only the counts, never who voted for whom */
  secret: boolean;
}

export const ARJAH_DEFAULTS: ArjahSettings = { rounds: 12, seconds: 20, theme: 'mix', secret: true };

/** The words every prompt starts with. */
export const ARJAH_LEAD = 'من الأرجح أن';
/** The whole question from a prompt's clause: «ينام في العرس» → «من الأرجح أن ينام في العرس؟». */
export const arjahQuestion = (clause: string) => `${ARJAH_LEAD} ${clause}؟`;

export interface ArjahPromptView {
  id: string;
  theme: ArjahTheme;
  /** the clause after «من الأرجح أن» («ينام في العرس»), without the question mark */
  clause: string;
}

export interface ArjahReveal {
  /** votes each player got (every player, 0 included) */
  tally: Record<string, number>;
  /** votes cast this round */
  total: number;
  /** the round's title holder(s); empty when nobody voted or every vote went to a different player */
  top: string[];
  /** open vote only: for each player, who voted for them. Null with «تصويت سري». */
  voters: Record<string, string[]> | null;
  /** open vote only: who scored this round. Null with «تصويت سري» (a point would tell the vote). */
  matched: string[] | null;
  /** my own result: true = my vote was with the most chosen, false = not, null = no vote of mine */
  mineMatched: boolean | null;
}

/** «الألقاب» at the end: the prompt a player was most chosen for. */
export interface ArjahTitle {
  id: string;
  /** null: the family never chose this player */
  clause: string | null;
  /** the votes it got for that prompt */
  count: number;
  /** the player held the round's title for it */
  top: boolean;
}

export interface ArjahView {
  game: 'arjah';
  phase: 'vote' | 'reveal' | 'final';
  /** 1-based */
  round: number;
  rounds: number;
  secret: boolean;
  /** the setting («منوّع» or one theme) */
  theme: ArjahThemeSetting;
  prompt: ArjahPromptView | null;
  endsAt: number | null;
  timerTotal: number;
  /** who has voted so far (not for whom) */
  voted: string[];
  /** my vote this round */
  mine: string | null;
  reveal: ArjahReveal | null;
  /**
   * Points. Open vote, or the final: everyone's. Secret vote during the game: only mine (the others'
   * points would tell who voted for the title holder).
   */
  scores: Record<string, number>;
  /** my points this game (also with the secret vote) */
  myScore: number;
  players: string[];
  /** the final: «الألقاب», one per player */
  titles: ArjahTitle[] | null;
}

/** The round's title holders from the counts: the most votes, at least 2 (all tied top choices count). */
export function arjahTop(tally: Record<string, number>): string[] {
  const ids = Object.keys(tally);
  const best = Math.max(0, ...ids.map((id) => tally[id]));
  if (best < 2) return [];
  return ids.filter((id) => tally[id] === best);
}

/** «صوت واحد»، «صوتان»، «3 أصوات»، «11 صوتاً» (`fmt` wraps the digits: the app's `num`). */
export function votesWord(n: number, fmt: (n: number) => string = String): string {
  if (n <= 0) return 'بلا أصوات';
  if (n === 1) return 'صوت واحد';
  if (n === 2) return 'صوتان';
  if (n <= 10) return `${fmt(n)} أصوات`;
  return `${fmt(n)} صوتاً`;
}

export const ARJAH_INFO = {
  title: 'من الأرجح؟',
  tagline: 'من الأرجح أن ينام في العرس؟ صوّتوا سراً على أحد الجالسين!',
  color: '#E0607E',
  maxPlayers: 12,
  howTo: [
    'في كل جولة سؤال يبدأ بـ«من الأرجح أن…؟» على كل الهواتف.',
    'اختر سراً لاعباً واحداً من الجالسين (يجوز أن تختار نفسك)، ويمكنك تغيير اختيارك قبل نهاية الوقت.',
    'تنتهي الجولة بانتهاء الوقت أو حين يصوّت الجميع، ثم تظهر الأصوات: لقب الجولة لصاحب أكثر الأصوات.',
    'نقطة لكل من وافق صوتُه الأغلبية (وعند التعادل في القمة تُحسب كل الأسماء المتعادلة).',
    'مع «تصويت سري» تظهر الأعداد فقط، ولا يعرف أحد من صوّت لمن؛ والترتيب الكامل في النهاية.',
    'في النهاية: «أكثر من يعرف العائلة»، وقائمة الألقاب لكل لاعب.',
  ],
};
