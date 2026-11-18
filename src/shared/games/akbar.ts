/**
 * «أكبر أم أصغر؟» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface AkbarSettings {
  rounds: number;
}

export const AKBAR_DEFAULTS: AkbarSettings = { rounds: 1 };

export interface AkbarView {
  game: 'akbar';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const AKBAR_INFO = {
  title: 'أكبر أم أصغر؟',
  tagline: 'سكان، مساحة، ارتفاع، سرعة… أيهما أكبر؟',
  color: '#3A8FD6',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
