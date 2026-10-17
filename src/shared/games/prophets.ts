/**
 * «قصص الأنبياء» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface ProphetsSettings {
  rounds: number;
}

export interface ProphetsView {
  game: 'prophets';
  phase: 'play' | 'final';
}

export const PROPHETS_DEFAULTS: ProphetsSettings = { rounds: 1 };

export const PROPHETS_INFO = {
  title: 'قصص الأنبياء',
  tagline: 'عيشوا القصة معاً، فصلاً بعد فصل.',
  color: '#7B61D9',
  maxPlayers: 8,
  howTo: ['قريباً.'],
};
