/**
 * «أين تقع؟» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface AynaSettings {
  rounds: number;
}

export const AYNA_DEFAULTS: AynaSettings = { rounds: 1 };

export interface AynaView {
  game: 'ayna';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const AYNA_INFO = {
  title: 'أين تقع؟',
  tagline: 'مدينة أو معلم: ضع الدبوس على الخريطة، والأقرب يربح.',
  color: '#2FA58A',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
