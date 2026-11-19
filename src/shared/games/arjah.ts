/**
 * «من الأرجح؟» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface ArjahSettings {
  rounds: number;
}

export const ARJAH_DEFAULTS: ArjahSettings = { rounds: 1 };

export interface ArjahView {
  game: 'arjah';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const ARJAH_INFO = {
  title: 'من الأرجح؟',
  tagline: 'من الأرجح أن ينام في العرس؟ صوّتوا سراً على أحد الجالسين!',
  color: '#E0607E',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
