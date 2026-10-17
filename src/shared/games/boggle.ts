/**
 * «حروف مبعثرة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface BoggleSettings {
  rounds: number;
}

export interface BoggleView {
  game: 'boggle';
  phase: 'play' | 'final';
}

export const BOGGLE_DEFAULTS: BoggleSettings = { rounds: 1 };

export const BOGGLE_INFO = {
  title: 'حروف مبعثرة',
  tagline: 'ابحث عن أكبر عدد من الكلمات في شبكة الحروف.',
  color: '#E8A417',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
