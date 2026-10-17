/**
 * «المراحل العشر» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface Phase10Settings {
  rounds: number;
}

export interface Phase10View {
  game: 'phase10';
  phase: 'play' | 'final';
}

export const PHASE10_DEFAULTS: Phase10Settings = { rounds: 1 };

export const PHASE10_INFO = {
  title: 'المراحل العشر',
  tagline: 'عشر مراحل من المجموعات والمتتاليات… من يكملها أولاً؟',
  color: '#E2475F',
  maxPlayers: 6,
  howTo: ['قريباً.'],
};
