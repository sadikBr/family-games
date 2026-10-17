/**
 * «ماذا قال الناس؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface SurveySettings {
  /** 3, 5 or 7 rounds; the last two count double and triple */
  rounds: number;
  /** seconds for each answer (the steal gets a little more to talk it over) */
  seconds: number;
}

export type SurveyTeam = 0 | 1;

export type SurveyPhase = 'teams' | 'faceoff' | 'play' | 'steal' | 'roundEnd' | 'final';

/** One answer slot on the board. Hidden slots carry no text or points. */
export interface SurveySlot {
  text: string | null;
  points: number | null;
  /** the team that found it; null while hidden or when shown at the end of the round */
  found: SurveyTeam | null;
}

/** What just happened (drives the flip / ✗ animations). */
export interface SurveyEvent {
  id: number;
  by: string;
  text: string;
  /** hit: revealed a slot · miss: wrong · dup: already on the board · timeout: no answer in time */
  kind: 'hit' | 'miss' | 'dup' | 'timeout';
  slot: number | null;
}

export interface SurveyView {
  game: 'survey';
  phase: SurveyPhase;
  teams: [string[], string[]];
  scores: [number, number];
  /** 1-based */
  round: number;
  rounds: number;
  multiplier: number;
  question: string | null;
  slots: SurveySlot[];
  /** points found this round (before the multiplier) */
  bank: number;
  strikes: number;
  /** the team playing the board */
  control: SurveyTeam | null;
  /** face-off: the two players at the buzzers, who buzzed, and the first answer */
  faceoff: { players: [string, string]; buzzer: string | null; firstSlot: number | null; firstMissed: boolean } | null;
  /** who must type now (in a steal: the captain — any team-mate may answer) */
  answerer: string | null;
  endsAt: number | null;
  timerTotal: number;
  /** a number that changes with every new prompt (resets the answer box) */
  step: number;
  last: SurveyEvent | null;
  result: { team: SurveyTeam; points: number; stolen: boolean } | null;
  notice: string | null;
  /** final: 0 / 1, or -1 for a draw */
  winner: SurveyTeam | -1 | null;
}

export const SURVEY_ROUND_CHOICES = [3, 5, 7] as const;

/** ×1 for every round except the last two: ×2 then ×3. */
export function surveyMultiplier(round: number, rounds: number): number {
  if (round === rounds - 1) return 3;
  if (round === rounds - 2) return 2;
  return 1;
}

export const SURVEY_DEFAULTS: SurveySettings = { rounds: 5, seconds: 20 };

export const SURVEY_INFO = {
  title: 'ماذا قال الناس؟',
  tagline: 'خمّن أشهر الأجوبة قبل الفريق الآخر.',
  color: '#E8A417',
  maxPlayers: 12,
  howTo: [
    'فريقان. لكل سؤال من 5 إلى 8 أجوبة مخفية، مرتبة من الأشهر إلى الأقل شهرة، ولكل جواب نقاط.',
    'الأجوبة ونقاطها تقديرات من اللعبة لأشهر ما يقوله الناس عادة، وليست نتيجة استطلاع حقيقي.',
    'المواجهة: لاعب من كل فريق أمام الجرس، وأول من يضغط يكتب جوابه. إن كان الجواب رقم 1 على اللوحة يلعب فريقه، وإلا يجيب الآخر والجواب الأعلى يربح. إن أخطأ الاثنان يتواجه لاعبان آخران.',
    'الفريق الذي يلعب يجيب بالدور، كل واحد من هاتفه، حتى يكشف كل الأجوبة. الخطأ أو انتهاء الوقت = ✗، وثلاثة ✗ تنهي دوره. جواب موجود على اللوحة لا يُحسب خطأ: جرّب غيره.',
    'بعد ثلاثة ✗ يتشاور الفريق الآخر ويرسل جواباً واحداً للسرقة: إن أصاب أخذ كل نقاط الجولة، وإن أخطأ بقيت للفريق الأول.',
    'الجولة قبل الأخيرة نقاطها ×2 والأخيرة ×3. الفريق صاحب أكثر النقاط يفوز.',
  ],
};
