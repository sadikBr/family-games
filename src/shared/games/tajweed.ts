/**
 * «مسابقة التجويد» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface TajweedSettings {
  rounds: number;
}

export interface TajweedView {
  game: 'tajweed';
  phase: 'play' | 'final';
}

export const TAJWEED_DEFAULTS: TajweedSettings = { rounds: 1 };

export const TAJWEED_INFO = {
  title: 'مسابقة التجويد',
  tagline: 'ما حكم التجويد في الكلمة الملوّنة؟',
  color: '#1F7A6B',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
