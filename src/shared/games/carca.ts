/**
 * «المدن والطرق» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface CarcaSettings {
  rounds: number;
}

export interface CarcaView {
  game: 'carca';
  phase: 'play' | 'final';
}

export const CARCA_DEFAULTS: CarcaSettings = { rounds: 1 };

export const CARCA_INFO = {
  title: 'المدن والطرق',
  tagline: 'ضع البلاطات، وابنِ المدن والطرق، وضع أتباعك في المكان المناسب.',
  color: '#4E9A5B',
  maxPlayers: 5,
  howTo: ['قريباً.'],
};
