/**
 * «من القائل؟» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface QquoteSettings {
  rounds: number;
}

export interface QquoteView {
  game: 'qquote';
  phase: 'play' | 'final';
}

export const QQUOTE_DEFAULTS: QquoteSettings = { rounds: 1 };

export const QQUOTE_INFO = {
  title: 'من القائل؟',
  tagline: 'جملة وردت في القرآن على لسان أحدهم… فمن قالها؟',
  color: '#2E8B57',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
