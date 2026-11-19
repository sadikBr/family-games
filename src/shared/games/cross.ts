/**
 * «الكلمات المتقاطعة» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface CrossSettings {
  rounds: number;
}

export const CROSS_DEFAULTS: CrossSettings = { rounds: 1 };

export interface CrossView {
  game: 'cross';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const CROSS_INFO = {
  title: 'الكلمات المتقاطعة',
  tagline: 'شبكة كلمات عربية صغيرة: حلّوها معاً أو تسابقوا عليها.',
  color: '#4A7BD9',
  maxPlayers: 8,
  howTo: ['قريباً.'],
};
