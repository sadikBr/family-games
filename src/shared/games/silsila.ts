/**
 * «سلسلة الذاكرة» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface SilsilaSettings {
  rounds: number;
}

export const SILSILA_DEFAULTS: SilsilaSettings = { rounds: 1 };

export interface SilsilaView {
  game: 'silsila';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const SILSILA_INFO = {
  title: 'سلسلة الذاكرة',
  tagline: 'كل جولة لون جديد في السلسلة… من يخطئ يخرج!',
  color: '#7A5BD6',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
