/**
 * «المنقلة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface MancalaSettings {
  rounds: number;
}

export interface MancalaView {
  game: 'mancala';
  phase: 'play' | 'final';
}

export const MANCALA_DEFAULTS: MancalaSettings = { rounds: 1 };

export const MANCALA_INFO = {
  title: 'المنقلة',
  tagline: 'وزّع الحبات في الحفر واجمع أكثرها في خزانتك.',
  color: '#B5652B',
  maxPlayers: 2,
  howTo: ['قريباً.'],
};
