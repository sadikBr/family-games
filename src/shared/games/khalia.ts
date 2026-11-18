/**
 * «خلية الحروف» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface KhaliaSettings {
  rounds: number;
}

export const KHALIA_DEFAULTS: KhaliaSettings = { rounds: 1 };

export interface KhaliaView {
  game: 'khalia';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const KHALIA_INFO = {
  title: 'خلية الحروف',
  tagline: 'سبعة حروف في خلية: كوّنوا أكبر عدد من الكلمات.',
  color: '#E6A817',
  maxPlayers: 10,
  howTo: ['قريباً.'],
};
