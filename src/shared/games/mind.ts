/**
 * «العقل الواحد» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface MindSettings {
  rounds: number;
}

export const MIND_DEFAULTS: MindSettings = { rounds: 1 };

export interface MindView {
  game: 'mind';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const MIND_INFO = {
  title: 'العقل الواحد',
  tagline: 'العبوا أوراقكم بالترتيب… دون كلمة واحدة.',
  color: '#5B6CE0',
  maxPlayers: 6,
  howTo: ['قريباً.'],
};
