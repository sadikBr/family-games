/**
 * «خمّن من الإيموجي» — STUB (to be written): the types shared by the server and the app, the default settings and the
 * game's card on the home screen.
 */

export interface EmojiSettings {
  rounds: number;
}

export const EMOJI_DEFAULTS: EmojiSettings = { rounds: 1 };

export interface EmojiView {
  game: 'emoji';
  phase: 'play' | 'final';
  players: string[];
  scores: Record<string, number>;
}

export const EMOJI_INFO = {
  title: 'خمّن من الإيموجي',
  tagline: 'أمثال وأفلام وأكلات مكتوبة بالإيموجي… فكّوا الرموز!',
  color: '#E9A21F',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
