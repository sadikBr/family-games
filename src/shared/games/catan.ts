/**
 * «المستوطنون» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface CatanSettings {
  rounds: number;
}

export interface CatanView {
  game: 'catan';
  phase: 'play' | 'final';
}

export const CATAN_DEFAULTS: CatanSettings = { rounds: 1 };

export const CATAN_INFO = {
  title: 'المستوطنون',
  tagline: 'ابنِ القرى والمدن، وتاجر بالموارد، وكن أول من يبلغ عشر نقاط.',
  color: '#C9772E',
  maxPlayers: 4,
  howTo: ['قريباً.'],
};
