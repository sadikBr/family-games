/**
 * «أكمل المثل» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface MathalSettings {
  rounds: number;
}

export const MATHAL_DEFAULTS: MathalSettings = { rounds: 1 };

export interface MathalView {
  game: 'mathal';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const MATHAL_INFO = {
  title: 'أكمل المثل',
  tagline: 'بداية مثل عربي أو مغربي… من يكمله أولاً؟',
  color: '#8E5BD0',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
