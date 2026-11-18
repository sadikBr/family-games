/**
 * «الروابط» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface RawabitSettings {
  rounds: number;
}

export const RAWABIT_DEFAULTS: RawabitSettings = { rounds: 1 };

export interface RawabitView {
  game: 'rawabit';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const RAWABIT_INFO = {
  title: 'الروابط',
  tagline: 'ست عشرة كلمة: رتّبوها في أربع مجموعات خفية.',
  color: '#2E9E6A',
  maxPlayers: 10,
  howTo: ['قريباً.'],
};
