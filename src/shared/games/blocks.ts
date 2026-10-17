/**
 * «القطع الملونة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 */

export interface BlocksSettings {
  rounds: number;
}

export interface BlocksView {
  game: 'blocks';
  phase: 'play' | 'final';
}

export const BLOCKS_DEFAULTS: BlocksSettings = { rounds: 1 };

export const BLOCKS_INFO = {
  title: 'القطع الملونة',
  tagline: 'ضع قطعك ركناً لركن واحتل أكبر مساحة.',
  color: '#3D7BE0',
  maxPlayers: 4,
  howTo: ['قريباً.'],
};
