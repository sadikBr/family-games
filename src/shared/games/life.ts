/**
 * «مشوار الحياة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface LifeSettings {
  rounds: number;
}

export interface LifeView {
  game: 'life';
  phase: 'play' | 'final';
}

export const LIFE_DEFAULTS: LifeSettings = { rounds: 1 };

export const LIFE_INFO = {
  title: 'مشوار الحياة',
  tagline: 'من المدرسة إلى التقاعد… من يعيش أجمل مشوار؟',
  color: '#2FB67C',
  maxPlayers: 6,
  howTo: ['قريباً.'],
};
