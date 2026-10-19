/**
 * «شبكة الكلمات» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 * The board, the tile set and the scoring live in src/shared/scrabble-rules.ts.
 */

export interface ScrabbleSettings {
  /** seconds per turn (0 = no limit); when the time runs out the turn passes */
  seconds: 0 | 60 | 90 | 120;
  /** the bots' old level (old apps still send it; the bots now follow the room's bot level) */
  level: 1 | 2;
}

/** A tile on the board: the (normalised) letter and its points (0 for a blank). */
export interface ScrabbleCell {
  l: string;
  v: number;
}

/** A tile in a rack. `l` is '' for a blank. */
export interface ScrabbleTile {
  id: number;
  l: string;
  v: number;
}

/** One tile put on the board in a move: `l` is the letter shown (chosen by the player for a blank). */
export interface ScrabblePlacement {
  cell: number;
  l: string;
  blank?: boolean;
}

export interface ScrabbleMove {
  by: string;
  kind: 'play' | 'swap' | 'pass' | 'timeout';
  /** cells of the tiles put down (play) */
  cells: number[];
  words: { w: string; score: number }[];
  score: number;
  bingo: boolean;
  /** tiles swapped */
  count: number;
}

export interface ScrabbleView {
  game: 'scrabble';
  phase: 'play' | 'final';
  /** players still in the game, in turn order */
  order: string[];
  turn: string | null;
  turnNo: number;
  /** 225 cells, row by row; column 0 is on the RIGHT (across words read right to left) */
  board: (ScrabbleCell | null)[];
  /** my tiles (empty for spectators) */
  rack: ScrabbleTile[];
  rackCounts: Record<string, number>;
  scores: Record<string, number>;
  bag: number;
  last: ScrabbleMove | null;
  /** the last few moves, newest last */
  log: ScrabbleMove[];
  endsAt: number | null;
  /** ms per turn (0 = no limit) */
  total: number;
  /** consecutive turns without a word (the game ends at 2 × players) */
  scoreless: number;
  final: {
    winner: string | null;
    /** who emptied their rack with the bag empty (null: the game ended by passes or departures) */
    out: string | null;
    /** points added / taken at the end for the tiles left */
    adjust: Record<string, number>;
    left: Record<string, ScrabbleTile[]>;
  } | null;
}

export const SCRABBLE_DEFAULTS: ScrabbleSettings = { seconds: 0, level: 1 };

export const SCRABBLE_INFO = {
  title: 'شبكة الكلمات',
  tagline: 'كوّن كلمات عربية على اللوحة واجمع النقاط.',
  color: '#2FA57A',
  maxPlayers: 4,
  howTo: [
    'لكل لاعب سبعة أحرف لا يراها غيره. بالدور، كوّن كلمة على اللوحة: الكلمات الأفقية تُقرأ من اليمين إلى اليسار، والعمودية من الأعلى إلى الأسفل.',
    'اضغط على حرف من أحرفك ثم على مربع لتضعه (واضغط عليه مرة أخرى لتسترجعه). ضع أحرفك في سطر واحد متصلة بالأحرف الموجودة. الكلمة الأولى تمر بالنجمة في الوسط.',
    'كل كلمة تتكوّن يجب أن تكون في القاموس. الأحرف تُكتب منفصلة، والهمزات تُكتب ألفاً: «أ إ آ» = ا، «ة» = ه، «ى» = ي، «ؤ» = و، «ئ» = ي.',
    'الكلمة مع «ال» مقبولة إذا كانت الكلمة بدونها في القاموس: «الباب» تُقبل لأن «باب» كلمة.',
    'المربعات الملوّنة: ح×2 و ح×3 تضاعف نقاط الحرف، ك×2 و ك×3 تضاعف الكلمة كلها. استعمال الأحرف السبعة دفعة واحدة = 50 نقطة إضافية.',
    'المربع الفارغ (الجوكر) يصير أي حرف تختاره، لكنه بلا نقاط.',
    'بدل اللعب يمكنك تبديل بعض أحرفك (إذا بقي 7 أحرف أو أكثر في الكيس) أو التمرير.',
    'تنتهي اللعبة عندما يفرغ الكيس ويستعمل لاعب كل أحرفه (يربح نقاط أحرف الآخرين)، أو إذا مرّر الجميع دورين متتاليين. تُخصم من كل لاعب نقاط الأحرف الباقية عنده، والأكثر نقاطاً يفوز.',
  ],
};
