/**
 * «فك الشيفرة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface CodebreakSettings {
  rounds: number;
}

export interface CodebreakView {
  game: 'codebreak';
  phase: 'play' | 'final';
}

export const CODEBREAK_DEFAULTS: CodebreakSettings = { rounds: 1 };

export const CODEBREAK_INFO = {
  title: 'فك الشيفرة',
  tagline: 'خمّن الرمز السري من الدلائل قبل الجميع.',
  color: '#7B61D9',
  maxPlayers: 6,
  howTo: ['قريباً.'],
};
