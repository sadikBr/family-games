/**
 * «البلد الغامض» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface BaladSettings {
  rounds: number;
}

export const BALAD_DEFAULTS: BaladSettings = { rounds: 1 };

export interface BaladView {
  game: 'balad';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const BALAD_INFO = {
  title: 'البلد الغامض',
  tagline: 'دلائل تتوالى عن بلد مجهول… خمّنه مبكراً تربح أكثر.',
  color: '#D2554B',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
