/**
 * «ابنِ المسجد» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface MosqueSettings {
  rounds: number;
}

export interface MosqueView {
  game: 'mosque';
  phase: 'play' | 'final';
}

export const MOSQUE_DEFAULTS: MosqueSettings = { rounds: 1 };

export const MOSQUE_INFO = {
  title: 'ابنِ المسجد',
  tagline: 'أجيبوا معاً وابنوا المسجد قطعة قطعة.',
  color: '#2FA57A',
  maxPlayers: 8,
  howTo: ['قريباً.'],
};
