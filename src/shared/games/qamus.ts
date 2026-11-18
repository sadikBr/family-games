/**
 * «القاموس العجيب» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface QamusSettings {
  rounds: number;
}

export const QAMUS_DEFAULTS: QamusSettings = { rounds: 1 };

export interface QamusView {
  game: 'qamus';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const QAMUS_INFO = {
  title: 'القاموس العجيب',
  tagline: 'كلمة غريبة: اكتبوا معنى مزيفاً… واكتشفوا المعنى الحقيقي.',
  color: '#C2577A',
  maxPlayers: 10,
  howTo: ['قريباً.'],
};
