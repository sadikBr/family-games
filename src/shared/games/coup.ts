/**
 * «الانقلاب» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface CoupSettings {
  rounds: number;
}

export const COUP_DEFAULTS: CoupSettings = { rounds: 1 };

export interface CoupView {
  game: 'coup';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const COUP_INFO = {
  title: 'الانقلاب',
  tagline: 'أدوار مخفية وكذب جريء: آخر من يبقى في القصر يربح.',
  color: '#9C3D54',
  maxPlayers: 6,
  howTo: ['قريباً.'],
};
