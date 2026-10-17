/**
 * «المنقلة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 *
 * Board: 14 holes. Side 0 owns pits 0..5 and its store 6; side 1 owns pits 7..12 and its store 13.
 * Seeds go round in increasing index order (counter-clockwise on screen).
 */

export type MancalaLevel = 'easy' | 'medium' | 'hard';
export const MANCALA_SEEDS = [3, 4, 5, 6] as const;

export interface MancalaSettings {
  /** seeds in each pit at the start */
  seeds: number;
  /** bot strength */
  level: MancalaLevel;
}

export interface MancalaMove {
  /** counts every move of the game (a new value = a new move to animate) */
  seq: number;
  side: 0 | 1;
  /** the pit that was emptied */
  from: number;
  /** every hole that got a seed, in order */
  path: number[];
  /** the board just before the move */
  before: number[];
  /** last seed landed in an empty own pit and took the opposite pit with it */
  capture: { pit: number; opposite: number; seeds: number } | null;
  /** last seed in the mover's store: they play again */
  extra: boolean;
}

export interface MancalaView {
  game: 'mancala';
  phase: 'play' | 'final';
  /** [side 0, side 1]; side 0 moves first */
  seats: [string, string];
  board: number[];
  turn: 0 | 1;
  mySide: 0 | 1 | null;
  last: MancalaMove | null;
  winner: 0 | 1 | 'draw' | null;
  /** how the game ended: a side ran out of seeds, or someone resigned / left */
  reason: 'empty' | 'forfeit' | null;
  /** games won in this series */
  score: Record<string, number>;
  seeds: number;
}

export const MANCALA_DEFAULTS: MancalaSettings = { seeds: 4, level: 'medium' };

export const MANCALA_INFO = {
  title: 'المنقلة',
  tagline: 'وزّع الحبات في الحفر واجمع أكثرها في خزانتك.',
  color: '#B5652B',
  maxPlayers: 2,
  howTo: [
    'لكل لاعب ست حفر في جهته (الصف السفلي على هاتفك) وخزانة كبيرة على يمينه.',
    'في دورك اختر حفرة من حفرك، فتُوزَّع حباتها واحدة واحدة على الحفر التالية عكس عقارب الساعة، وتدخل خزانتك ولا تدخل خزانة خصمك.',
    'إذا سقطت آخر حبة في خزانتك، تلعب مرة أخرى.',
    'إذا سقطت آخر حبة في حفرة فارغة من جهتك، وكانت الحفرة المقابلة لها عند الخصم فيها حبات، تأخذ الحبة وكل حبات الحفرة المقابلة إلى خزانتك. (إذا كانت المقابلة فارغة فلا أكل.)',
    'تنتهي اللعبة حين تفرغ كل حفر أحد الجهتين، وكل لاعب يضيف ما بقي في جهته إلى خزانته.',
    'الفائز صاحب أكثر الحبات في خزانته. يتبادل اللاعبان البدء من لعبة إلى أخرى.',
  ],
};

export const mancalaStore = (side: 0 | 1) => side * 7 + 6;
export const mancalaOpposite = (pit: number) => 12 - pit;
