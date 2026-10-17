/**
 * «كلمة قرآنية» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface QwordSettings {
  rounds: number;
}

export interface QwordView {
  game: 'qword';
  phase: 'play' | 'final';
}

export const QWORD_DEFAULTS: QwordSettings = { rounds: 1 };

export const QWORD_INFO = {
  title: 'كلمة قرآنية',
  tagline: 'خمّن كلمة من القرآن الكريم في ست محاولات.',
  color: '#C8A13A',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
