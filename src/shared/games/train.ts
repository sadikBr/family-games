/**
 * «قطار المغرب» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface TrainSettings {
  rounds: number;
}

export const TRAIN_DEFAULTS: TrainSettings = { rounds: 1 };

export interface TrainView {
  game: 'train';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const TRAIN_INFO = {
  title: 'قطار المغرب',
  tagline: 'اجمعوا العربات وامتلكوا السكك بين مدن المغرب لتكملوا رحلاتكم.',
  color: '#B5453A',
  maxPlayers: 5,
  howTo: ['قريباً.'],
};
