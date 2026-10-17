/**
 * «المربعات» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface DotsSettings {
  rounds: number;
}

export interface DotsView {
  game: 'dots';
  phase: 'play' | 'final';
}

export const DOTS_DEFAULTS: DotsSettings = { rounds: 1 };

export const DOTS_INFO = {
  title: 'المربعات',
  tagline: 'صِل النقاط وأغلق المربعات… كل مربع لك!',
  color: '#7B61D9',
  maxPlayers: 4,
  howTo: ['قريباً.'],
};
