/**
 * «البلياردو» — the types shared by the server and the app: settings, the view each phone gets, the
 * game's card on the home screen. The table geometry and the physics are in billiards-physics.ts.
 *
 * Two modes in one game: «الكرة 8» (2 players, or 4 as two teams) and «الكرة 9» (2–4 players). The
 * server plays every shot with the deterministic physics and sends every phone the recorded trajectories
 * once (`shot`, only in the first moments after the stroke); each phone plays them back smoothly, then
 * shows the final positions (`balls`), which are already in the view during the playback (someone who
 * opens the screen mid-shot simply sees where the balls stopped). What the shot did (a foul, a group,
 * the end of the rack) is applied when the playback is over.
 */

export type BilliardsMode = 'eight' | 'nine';
export type BilliardsGroup = 'solids' | 'stripes';
export type BilliardsGuide = 'long' | 'short' | 'off';

export const BILLIARDS_RACES = [1, 2, 3] as const;

export interface BilliardsSettings {
  mode: BilliardsMode;
  /** racks to win the match: 1, 2 or 3 */
  race: number;
  /** 8-ball: the pocket for the 8 must be called before shooting at it */
  callPocket: boolean;
  /** the aim guide on the shooter's phone */
  guide: BilliardsGuide;
}

export const BILLIARDS_DEFAULTS: BilliardsSettings = { mode: 'eight', race: 1, callPocket: true, guide: 'long' };

/** A recorded shot (see ShotRecord in billiards-physics.ts) with its id and its moment in server time. */
export interface BilliardsShot {
  id: number;
  /** server time of the stroke */
  at: number;
  /** ms */
  dur: number;
  /** ball id → keyframes [t, x, y, dt, dx, dy, …] (ms, mm) */
  tr: Record<string, number[]>;
  /** [ball, pocket, t ms] */
  pk: [number, number, number][];
}

export interface BilliardsSide {
  /** the players of this side (two for a team of 8-ball) */
  ids: string[];
  /** 8-ball: the group once the table is no longer open */
  group: BilliardsGroup | null;
  /** racks won */
  wins: number;
  /** balls this side pocketed this rack, in order (9-ball: the strip's rack) */
  pocketed: number[];
  /** left the game */
  out: boolean;
}

/** The banner under the strips: what the last shot did. */
export interface BilliardsNote {
  id: number;
  kind: 'foul' | 'group' | 'rack' | 'respot' | 'info';
  /** «خطأ — الكرة في اليد لماما» */
  text: string;
  /** the reason of a foul, or a detail */
  sub?: string;
  /** whose shot it was */
  by?: string;
}

export interface BilliardsView {
  game: 'billiards';
  mode: BilliardsMode;
  /** aim: the shooter aims; rolling: a shot is being played back; rack: between racks; final: the match is over */
  phase: 'aim' | 'rolling' | 'rack' | 'final';
  /** seat order */
  players: string[];
  sides: BilliardsSide[];
  /** who shoots now (or shot last, while rolling) */
  shooter: string | null;
  /** the shooter's side */
  side: number;
  /** balls on the table: [id, x, y, id, x, y, …] in mm (the cue ball is id 0; missing while in hand) */
  balls: number[];
  /** the cue ball is in the shooter's hand: behind the head string (the break) or anywhere */
  inHand: 'kitchen' | 'anywhere' | null;
  /** the next shot is the break */
  breakShot: boolean;
  /** the balls the shooter may hit first (legal targets) */
  targets: number[];
  /** 8-ball: the shooter must call the pocket for the 8 before shooting */
  needCall: boolean;
  /** the shooter's live aim, relayed to everyone: angle (rad), the cue ball while placing it, the called pocket */
  aim: { seq: number; a: number; cue: [number, number] | null; pocket: number | null } | null;
  /** the last shot's id (always), and its recorded trajectories (only right after the stroke) */
  shotId: number;
  shot: BilliardsShot | null;
  note: BilliardsNote | null;
  /** 1-based */
  rack: number;
  race: number;
  /** rack / final: the side that won the rack (or the match) */
  winner: number | null;
  /** rack: when the next rack starts (server time) */
  nextAt: number | null;
  callPocket: boolean;
  guide: BilliardsGuide;
}

export const BALL_COLOR: Record<number, string> = {
  0: '#F6F1E3',
  1: '#F2C21B',
  2: '#2367D1',
  3: '#DA3030',
  4: '#6C3FB5',
  5: '#F07F1E',
  6: '#1E9A55',
  7: '#8E2A2A',
  8: '#1A1A1E',
  9: '#F2C21B',
  10: '#2367D1',
  11: '#DA3030',
  12: '#6C3FB5',
  13: '#F07F1E',
  14: '#1E9A55',
  15: '#8E2A2A',
};

export const isStripe = (id: number) => id >= 9 && id <= 15;
export const isSolid = (id: number) => id >= 1 && id <= 7;
export const groupBalls = (g: BilliardsGroup) => (g === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]);
export const groupOf = (id: number): BilliardsGroup | null => (isSolid(id) ? 'solids' : isStripe(id) ? 'stripes' : null);

export const GROUP_NAME: Record<BilliardsGroup, string> = { solids: 'الكرات الكاملة', stripes: 'الكرات المخططة' };
export const GROUP_SHORT: Record<BilliardsGroup, string> = { solids: 'الكاملة 1–7', stripes: 'المخططة 9–15' };
export const POCKET_NAME = ['الجيب الأعلى الأيسر', 'الجيب الأعلى الأيمن', 'الجيب الأوسط الأيسر', 'الجيب الأوسط الأيمن', 'الجيب الأسفل الأيسر', 'الجيب الأسفل الأيمن'];

/** «الكرة 8» / «الكرة 9». */
export const MODE_NAME: Record<BilliardsMode, string> = { eight: 'الكرة 8', nine: 'الكرة 9' };

const EIGHT_HOWTO = [
  'كل لاعب على هاتفه. اسحب إصبعك على الطاولة لتدوير العصا (السحب البطيء أدق)، أو المس كرة للتصويب نحوها، واضبط الدقة بالسهمين، واختر نقطة ضرب البيضاء من زر الكرة البيضاء الصغيرة، ثم اسحب شريط القوة جانباً واتركه للضرب.',
  'الكرة 8: الكرات الكاملة (1–7) لفريق والمخططة (9–15) للآخر. الطاولة مفتوحة بعد الكسر، وأول كرة تدخل الجيب بضربة صحيحة تحدد المجموعة.',
  'إدخال كرة من مجموعتك يمنحك ضربة أخرى. بعد إنهاء مجموعتك ادخل الكرة 8 في الجيب الذي تختاره (يمكن إيقاف تسمية الجيب في الإعدادات).',
  'الخطأ يعطي الخصم الكرة في اليد في أي مكان: سقوط الكرة البيضاء، أو عدم لمس أي كرة، أو لمس كرة الخصم أو الكرة 8 أولاً، أو عدم وصول أي كرة إلى الحافة ولا دخول أي كرة.',
  'إدخال الكرة 8 قبل الأوان، أو في جيب آخر، أو مع خطأ يخسر الشوط. الكرة 8 في الكسر تعود إلى مكانها ويكمل الكاسر.',
  'لاعبان، أو أربعة في فريقين يتناوبان. الفائز بالشوط يكسر الشوط التالي. عدد الأشواط للفوز في الإعدادات.',
];

const NINE_HOWTO = [
  'كل لاعب على هاتفه. اسحب إصبعك على الطاولة لتدوير العصا (السحب البطيء أدق)، أو المس كرة للتصويب نحوها، واضبط الدقة بالسهمين، واختر نقطة ضرب البيضاء من زر الكرة البيضاء الصغيرة، ثم اسحب شريط القوة جانباً واتركه للضرب.',
  'الكرة 9: الكرات من 1 إلى 9 على شكل معيّن. يجب أن تلمس الكرة البيضاء أولاً أصغر كرة رقماً على الطاولة.',
  'أي كرة تدخل الجيب بضربة صحيحة تمنحك ضربة أخرى. إدخال الكرة 9 بضربة صحيحة يربح الشوط، ولو في الكسر أو بكرة أخرى.',
  'الخطأ يعطي اللاعب التالي الكرة في اليد في أي مكان: لمس كرة غير الأصغر أولاً، أو عدم لمس أي كرة، أو سقوط الكرة البيضاء، أو عدم وصول أي كرة إلى الحافة ولا دخول أي كرة. الكرة 9 التي تدخل مع خطأ تعود إلى مكانها.',
  'من لاعبَين إلى أربعة، كل واحد لنفسه، والدور بالتناوب. الفائز بالشوط يكسر الشوط التالي.',
];

export const BILLIARDS_INFO = {
  title: 'البلياردو',
  tagline: 'الكرة 8 أو الكرة 9 على طاولة حقيقية: صوّب، اختر القوة، واضرب.',
  color: '#1C8C64',
  maxPlayers: 4,
  howTo: EIGHT_HOWTO,
};

/** The cover text for 9-ball. */
export function billiardsVariant(s: BilliardsSettings | undefined): { tagline: string; howTo: string[] } | null {
  if (s?.mode !== 'nine') return null;
  return { tagline: 'الكرة 9: الكرات من 1 إلى 9، المس الأصغر أولاً، ومن يدخل الكرة 9 يربح الشوط.', howTo: NINE_HOWTO };
}

/** The flat ball list of the view as objects. */
export function unpackBalls(flat: number[]): { id: number; x: number; y: number }[] {
  const out: { id: number; x: number; y: number }[] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push({ id: flat[i], x: flat[i + 1], y: flat[i + 2] });
  return out;
}
