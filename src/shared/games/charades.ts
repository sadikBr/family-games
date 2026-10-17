/**
 * «تمثيل صامت» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface CharadesSettings {
  rounds: number;
}

export interface CharadesView {
  game: 'charades';
  phase: 'play' | 'final';
}

export const CHARADES_DEFAULTS: CharadesSettings = { rounds: 1 };

export const CHARADES_INFO = {
  title: 'تمثيل صامت',
  tagline: 'مثّل الكلمة بلا كلام… وفريقك يخمّن!',
  color: '#F08A3E',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
