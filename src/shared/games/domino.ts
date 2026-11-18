/**
 * «الدومينو» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface DominoSettings {
  rounds: number;
}

export const DOMINO_DEFAULTS: DominoSettings = { rounds: 1 };

export interface DominoView {
  game: 'domino';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const DOMINO_INFO = {
  title: 'الدومينو',
  tagline: 'ضع قطعك طرفاً بطرف… وأول من يفرغ يده يربح.',
  color: '#2F8F83',
  maxPlayers: 4,
  howTo: ['قريباً.'],
};
