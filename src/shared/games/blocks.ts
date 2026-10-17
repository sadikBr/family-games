/**
 * «القطع الملونة» — the types shared by the server and the app: settings, the view each phone gets, the
 * default settings, and the game's card on the home screen (title, how-to).
 * The placement rules themselves live in ../blocks-rules.ts.
 */

export type BlocksLevel = 'easy' | 'hard';

export interface BlocksSettings {
  /** bot strength */
  level: BlocksLevel;
}

export interface BlocksScore {
  /** squares still in the tray (each costs a point) */
  squares: number;
  /** +15 for placing every piece, +5 more when the 1-square went last */
  bonus: number;
  total: number;
}

export interface BlocksView {
  game: 'blocks';
  phase: 'play' | 'final';
  /** board side: 14 for two players, 20 otherwise */
  n: number;
  /** everyone who started, in turn order (a seat's index picks its colour and start square) */
  seats: string[];
  /** names captured at the start (a player who left is no longer in the room) */
  names: Record<string, string>;
  /** start square per seat */
  starts: number[];
  /** per cell: -1 empty, else the seat index whose piece covers it */
  board: number[];
  turn: string | null;
  /** pieces still in each seat's tray (public, as on a real table) */
  left: number[][];
  /** seats that can't place anything any more (they are skipped) */
  done: boolean[];
  /** seats whose player left the room (their pieces stay on the board) */
  gone: boolean[];
  /** the last piece placed */
  last: { seat: number; piece: number; cells: number[] } | null;
  /** seats that ran out of moves since the last piece went down (passed automatically) */
  passed: number[];
  /** pieces placed so far (changes on every move) */
  moveNo: number;
  scores: BlocksScore[];
  winners: string[] | null;
  /** how the game ended: nobody can move, or everyone else left */
  reason: 'blocked' | 'forfeit' | null;
  /** games won in this series (same group of players in the same room) */
  series: Record<string, number>;
  /** my seat index (-1: watching) */
  me: number;
}

export const BLOCKS_DEFAULTS: BlocksSettings = { level: 'easy' };

export const BLOCKS_INFO = {
  title: 'القطع الملونة',
  tagline: 'ضع قطعك ركناً إلى ركن واحتلّ أكبر مساحة.',
  color: '#3D7BE0',
  maxPlayers: 4,
  howTo: [
    'لكل لاعب لون و٢١ قطعة مختلفة الأشكال (من مربع واحد إلى خمسة مربعات).',
    'قطعتك الأولى تغطي مربع البداية المعلَّم بلونك.',
    'بعدها، كل قطعة جديدة تلمس قطعة من لونك من الركن فقط، ولا تلمس قطعك من الجانب أبداً. يجوز أن تلمس قطع الآخرين كما تشاء.',
    'اختر قطعة، دوّرها أو اقلبها، المس اللوحة لترى مكانها (أخضر = مسموح، أحمر = ممنوع)، ثم اضغط «ضع».',
    'من لا يجد مكاناً لأي قطعة يتجاوزه الدور تلقائياً، وتنتهي اللعبة حين لا يستطيع أحد اللعب.',
    'النقاط: تُخصم نقطة عن كل مربع بقي معك، و+١٥ إن وضعت كل قطعك (+٥ أخرى إن كانت آخرها القطعة ذات المربع الواحد). الأعلى يفوز.',
    'لاعبان: لوحة ١٤×١٤ والبداية قرب الوسط. ٣ أو ٤ لاعبين: لوحة ٢٠×٢٠ والبداية من الأركان.',
  ],
};
