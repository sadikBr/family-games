/**
 * «مكية أم مدنية؟» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface MakkiSettings {
  rounds: number;
}

export const MAKKI_DEFAULTS: MakkiSettings = { rounds: 1 };

export interface MakkiView {
  game: 'makki';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const MAKKI_INFO = {
  title: 'مكية أم مدنية؟',
  tagline: 'سور تتوالى بسرعة… مكية أم مدنية؟ ومع كل سورة فائدة.',
  color: '#2E9E6B',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
