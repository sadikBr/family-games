/**
 * «الرسم المتسلسل» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface TeledrawSettings {
  rounds: number;
}

export interface TeledrawView {
  game: 'teledraw';
  phase: 'play' | 'final';
}

export const TELEDRAW_DEFAULTS: TeledrawSettings = { rounds: 1 };

export const TELEDRAW_INFO = {
  title: 'الرسم المتسلسل',
  tagline: 'اكتب جملة، ارسمها، خمّنها… وانظروا إلى أين وصلت في النهاية.',
  color: '#E0703A',
  maxPlayers: 12,
  howTo: ['قريباً.'],
};
