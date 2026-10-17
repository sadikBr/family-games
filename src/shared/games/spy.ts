/**
 * «الجاسوس» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface SpySettings {
  rounds: number;
}

export interface SpyView {
  game: 'spy';
  phase: 'play' | 'final';
}

export const SPY_DEFAULTS: SpySettings = { rounds: 1 };

export const SPY_INFO = {
  title: 'الجاسوس',
  tagline: 'الكل يعرف المكان إلا الجاسوس… اكشفوه بالأسئلة!',
  color: '#4F5BD5',
  maxPlayers: 10,
  howTo: ['قريباً.'],
};
