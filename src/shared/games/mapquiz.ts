/**
 * «أين المكان؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface MapquizSettings {
  rounds: number;
}

export interface MapquizView {
  game: 'mapquiz';
  phase: 'play' | 'final';
}

export const MAPQUIZ_DEFAULTS: MapquizSettings = { rounds: 1 };

export const MAPQUIZ_INFO = {
  title: 'أين المكان؟',
  tagline: 'ضع المدن والمعالم الإسلامية في مكانها على الخريطة.',
  color: '#22B8B0',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
