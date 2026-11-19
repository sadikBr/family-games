/**
 * «القنبلة» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface BombSettings {
  rounds: number;
}

export const BOMB_DEFAULTS: BombSettings = { rounds: 1 };

export interface BombView {
  game: 'bomb';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const BOMB_INFO = {
  title: 'القنبلة',
  tagline: 'اسحبوا الأوراق… ومن يسحب القنبلة دون مفكّك يخرج!',
  color: '#E2543B',
  maxPlayers: 8,
  howTo: ['قريباً.'],
};
