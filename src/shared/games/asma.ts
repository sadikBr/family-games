/**
 * «أسماء الله الحسنى» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface AsmaSettings {
  rounds: number;
}

export interface AsmaView {
  game: 'asma';
  phase: 'play' | 'final';
}

export const ASMA_DEFAULTS: AsmaSettings = { rounds: 1 };

export const ASMA_INFO = {
  title: 'أسماء الله الحسنى',
  tagline: 'طابِق الاسم بمعناه، وتعلّم الأسماء الحسنى.',
  color: '#B5892B',
  maxPlayers: 6,
  howTo: ['قريباً.'],
};
