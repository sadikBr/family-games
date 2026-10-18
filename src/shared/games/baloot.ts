/**
 * «البلوط» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface BalootSettings {
  rounds: number;
}

export interface BalootView {
  game: 'baloot';
  phase: 'play' | 'final';
}

export const BALOOT_DEFAULTS: BalootSettings = { rounds: 1 };

export const BALOOT_INFO = {
  title: 'البلوط',
  tagline: 'صن أو حكم؟ العب مع شريكك واجمع 152 قبل الخصوم.',
  color: '#B8324A',
  maxPlayers: 4,
  howTo: ['قريباً.'],
};
