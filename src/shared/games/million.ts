/**
 * «من سيربح المليون؟» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface MillionSettings {
  rounds: number;
}

export const MILLION_DEFAULTS: MillionSettings = { rounds: 1 };

export interface MillionView {
  game: 'million';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const MILLION_INFO = {
  title: 'من سيربح المليون؟',
  tagline: 'خمسة عشر سؤالاً نحو المليون… ووسائل مساعدة ثلاث.',
  color: '#6C4BD1',
  maxPlayers: 10,
  howTo: ['قريباً.'],
};
