/**
 * «املأ القائمة» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface QaimaSettings {
  rounds: number;
}

export const QAIMA_DEFAULTS: QaimaSettings = { rounds: 1 };

export interface QaimaView {
  game: 'qaima';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const QAIMA_INFO = {
  title: 'املأ القائمة',
  tagline: 'دول أفريقيا، مدن مغربية… اكتبوا أكثر ما يمكن قبل انتهاء الوقت.',
  color: '#D98A2B',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
