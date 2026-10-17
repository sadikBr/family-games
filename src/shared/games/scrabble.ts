/**
 * «شبكة الكلمات» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface ScrabbleSettings {
  rounds: number;
}

export interface ScrabbleView {
  game: 'scrabble';
  phase: 'play' | 'final';
}

export const SCRABBLE_DEFAULTS: ScrabbleSettings = { rounds: 1 };

export const SCRABBLE_INFO = {
  title: 'شبكة الكلمات',
  tagline: 'كوّن كلمات عربية على اللوحة واجمع النقاط.',
  color: '#2FA57A',
  maxPlayers: 4,
  howTo: ['قريباً.'],
};
