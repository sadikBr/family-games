/**
 * «كلمة واحدة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface OnewordSettings {
  rounds: number;
}

export interface OnewordView {
  game: 'oneword';
  phase: 'play' | 'final';
}

export const ONEWORD_DEFAULTS: OnewordSettings = { rounds: 1 };

export const ONEWORD_INFO = {
  title: 'كلمة واحدة',
  tagline: 'كل واحد يكتب تلميحاً من كلمة واحدة، والتلميحات المتشابهة تُحذف!',
  color: '#2E9C8F',
  maxPlayers: 10,
  howTo: ['قريباً.'],
};
