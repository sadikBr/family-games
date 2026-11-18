/**
 * «رتّب الأحداث» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface TartibSettings {
  rounds: number;
}

export const TARTIB_DEFAULTS: TartibSettings = { rounds: 1 };

export interface TartibView {
  game: 'tartib';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const TARTIB_INFO = {
  title: 'رتّب الأحداث',
  tagline: 'أيهما كان أولاً؟ رتّبوا الأحداث والاختراعات على خط الزمن.',
  color: '#C77D2E',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
