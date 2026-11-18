/**
 * «الطاولة» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface TawlaSettings {
  rounds: number;
}

export const TAWLA_DEFAULTS: TawlaSettings = { rounds: 1 };

export interface TawlaView {
  game: 'tawla';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const TAWLA_INFO = {
  title: 'الطاولة',
  tagline: 'النرد والحجارة: أدخل حجارتك الخمسة عشر إلى البيت قبل خصمك.',
  color: '#9A6233',
  maxPlayers: 2,
  howTo: ['قريباً.'],
};
