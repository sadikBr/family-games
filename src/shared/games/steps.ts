/**
 * «رتّب الخطوات» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface StepsSettings {
  rounds: number;
}

export interface StepsView {
  game: 'steps';
  phase: 'play' | 'final';
}

export const STEPS_DEFAULTS: StepsSettings = { rounds: 1 };

export const STEPS_INFO = {
  title: 'رتّب الخطوات',
  tagline: 'الوضوء والصلاة والعمرة… رتّب خطواتها كما ينبغي.',
  color: '#3D7BE0',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
