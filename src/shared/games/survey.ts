/**
 * «ماذا قال الناس؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface SurveySettings {
  rounds: number;
}

export interface SurveyView {
  game: 'survey';
  phase: 'play' | 'final';
}

export const SURVEY_DEFAULTS: SurveySettings = { rounds: 1 };

export const SURVEY_INFO = {
  title: 'ماذا قال الناس؟',
  tagline: 'خمّن أشهر الأجوبة قبل الفريق الآخر.',
  color: '#E8A417',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
