/**
 * Shared data for the Islamic board games: the Hajj journey and «سلّم الحسنات».
 * (Question banks and Quran text live on the server.)
 */

/* ---------------- رحلة الحج ---------------- */

export interface HajjStation {
  title: string;
  day?: string;
  text: string;
}

/** The journey, in order. Each station is a square every pilgrim must stop at. */
export const HAJJ_STATIONS: HajjStation[] = [
  { title: 'الميقات', text: 'يلبس الحاج ملابس الإحرام وينوي النسك، ثم يبدأ التلبية: «لبيك اللهم لبيك».' },
  { title: 'طواف القدوم', text: 'عند الوصول إلى المسجد الحرام يطوف الحاج حول الكعبة سبعة أشواط (طواف القدوم أو العمرة)، يبدأ من الحجر الأسود.' },
  { title: 'السعي', text: 'يسعى الحاج بين الصفا والمروة سبعة أشواط، تذكّراً لسعي هاجر بحثاً عن الماء لابنها إسماعيل.' },
  { title: 'منى', day: 'يوم التروية — 8 ذي الحجة', text: 'يتوجّه الحجاج إلى منى ويبيتون فيها، ويصلّون الصلوات في أوقاتها.' },
  { title: 'عرفات', day: 'يوم عرفة — 9 ذي الحجة', text: 'الوقوف بعرفة ركن الحج الأعظم؛ يقضي الحجاج اليوم في الدعاء والذكر حتى غروب الشمس.' },
  { title: 'مزدلفة', text: 'بعد الغروب ينفر الحجاج إلى مزدلفة فيصلّون المغرب والعشاء ويبيتون فيها، ويلتقطون الحصى.' },
  { title: 'جمرة العقبة', day: 'يوم النحر — 10 ذي الحجة', text: 'يرمي الحاج جمرة العقبة بسبع حصيات، يكبّر مع كل حصاة.' },
  { title: 'النحر والحلق', text: 'يذبح الحاج هديه إن كان متمتعاً أو قارناً، ثم يحلق رأسه أو يقصّر، وهو يوم عيد الأضحى للمسلمين.' },
  { title: 'طواف الإفاضة', text: 'يعود الحاج إلى مكة فيطوف طواف الإفاضة، وهو ركن من أركان الحج، ثم يسعى بين الصفا والمروة إن لم يكن سعى من قبل.' },
  { title: 'أيام التشريق', day: '11 و12 و13 ذي الحجة', text: 'يبيت الحجاج في منى ويرمون الجمرات الثلاث كل يوم: الصغرى ثم الوسطى ثم الكبرى. ومن تعجّل في يومين فلا إثم عليه.' },
  { title: 'طواف الوداع', text: 'آخر ما يفعله الحاج قبل مغادرة مكة: يطوف بالبيت مودّعاً. تقبّل الله حجّك!' },
];

export interface HajjEvent {
  text: string;
  move: number;
}

/** Small things that happen on the way. */
export const HAJJ_EVENTS: HajjEvent[] = [
  { text: 'ساعدت حاجّاً كبيراً في السن على حمل متاعه. تقدّم خانتين.', move: 2 },
  { text: 'سقيت الحجاج ماءً بارداً. تقدّم خانة.', move: 1 },
  { text: 'أرشدت حاجّاً تائهاً إلى خيمته. تقدّم خانتين.', move: 2 },
  { text: 'ابتسمت في وجه أخيك — «تبسّمك في وجه أخيك صدقة». تقدّم خانة.', move: 1 },
  { text: 'أزلت حجراً من طريق الناس. تقدّم خانة.', move: 1 },
  { text: 'زحام شديد في الطريق — اصبر واحتسب. ارجع خانة.', move: -1 },
  { text: 'نسيت حقيبتك في الحافلة فعدت لأخذها. ارجع خانتين.', move: -2 },
  { text: 'تأخرت في النوم عن الرفقة. ارجع خانة.', move: -1 },
];

/* ---------------- سلّم الحسنات ---------------- */

export interface Deed {
  from: number;
  to: number;
  title: string;
  text: string;
  icon: string;
}

/** Ladders (good deeds lift you up) and snakes (bad habits pull you down). Squares are 1..100. */
export const LADDERS: Deed[] = [
  { from: 2, to: 23, title: 'برّ الوالدين', text: 'ساعدت أمك وأباك في البيت وأطعتهما. البرّ يرفعك!', icon: 'heart' },
  { from: 8, to: 29, title: 'الصلاة في وقتها', text: 'صلّيت الصلاة في وقتها، وهي من أحبّ الأعمال إلى الله.', icon: 'moon' },
  { from: 15, to: 35, title: 'الصدقة', text: 'تصدّقت من مصروفك على محتاج.', icon: 'coins' },
  { from: 28, to: 68, title: 'قراءة القرآن', text: 'قرأت وِردك من القرآن وتدبّرته.', icon: 'book' },
  { from: 36, to: 57, title: 'الصدق', text: 'قلت الصدق حتى عندما كان صعباً.', icon: 'check' },
  { from: 51, to: 72, title: 'صلة الرحم', text: 'زرت جدّك وجدّتك وسألت عن أقاربك.', icon: 'users' },
  { from: 71, to: 91, title: 'إماطة الأذى', text: 'أزلت الأذى عن الطريق — وهي صدقة.', icon: 'leaf' },
  { from: 80, to: 99, title: 'مساعدة المحتاج', text: 'ساعدت جارك المحتاج دون أن يطلب.', icon: 'hand' },
];

export const SNAKES: Deed[] = [
  { from: 17, to: 4, title: 'الكذب', text: 'كذبت لتنجو من موقف — الكذب يهوي بصاحبه.', icon: 'chat' },
  { from: 47, to: 26, title: 'الغيبة', text: 'تكلّمت عن صديقك في غيابه بما يكره.', icon: 'mic' },
  { from: 55, to: 45, title: 'الغش', text: 'غششت في الامتحان.', icon: 'eye' },
  { from: 89, to: 52, title: 'إضاعة الصلاة', text: 'أخّرت الصلاة حتى خرج وقتها.', icon: 'clock' },
  { from: 64, to: 44, title: 'السخرية', text: 'سخرت من شكل أحد زملائك.', icon: 'thumbDown' },
  { from: 86, to: 66, title: 'الحسد', text: 'حسدت أخاك على ما عنده بدل أن تدعو له.', icon: 'flame' },
  { from: 93, to: 73, title: 'الغضب', text: 'غضبت وصرخت على إخوتك.', icon: 'bolt' },
  { from: 98, to: 78, title: 'الكِبر', text: 'تكبّرت على الناس ورفضت النصيحة.', icon: 'crown' },
];


/* ---------------- Hajj board geometry ----------------
 * 45 squares in a serpentine of 5 rows × 9, starting bottom-right (RTL reading order).
 * Square 0 = start; station k sits at square 4(k+1); the 3 squares between are plain / event / question.
 */
export const HAJJ_COLS = 9;
export const HAJJ_ROWS = 5;
export const HAJJ_LEN = 45;
export const hajjStationAt = (sq: number) => (sq > 0 && sq % 4 === 0 ? sq / 4 - 1 : -1);
export type HajjSquare = 'start' | 'station' | 'event' | 'question' | 'plain';
/** Fixed pattern so the board art and the rules agree. */
const BETWEEN: HajjSquare[][] = [
  ['plain', 'event', 'question'],
  ['event', 'plain', 'question'],
  ['question', 'event', 'plain'],
];
export function hajjSquare(sq: number): HajjSquare {
  if (sq === 0) return 'start';
  if (hajjStationAt(sq) >= 0) return 'station';
  const seg = Math.floor(sq / 4);
  return BETWEEN[seg % 3][(sq % 4) - 1];
}
/** Centre of a square on the board, in 0..1 of width / height. */
export function hajjCell(sq: number): { x: number; y: number } {
  const row = Math.floor(sq / HAJJ_COLS);
  const k = sq % HAJJ_COLS;
  const col = row % 2 === 0 ? HAJJ_COLS - 1 - k : k; // row 0 runs right → left
  return { x: (col + 0.5) / HAJJ_COLS, y: 1 - (row + 0.5) / HAJJ_ROWS };
}

/* ---------------- ladders board geometry (10×10, square 1 bottom-right, serpentine) ---------------- */
export function laddersCell(n: number): { x: number; y: number } {
  const i = n - 1;
  const row = Math.floor(i / 10);
  const k = i % 10;
  const col = row % 2 === 0 ? 9 - k : k;
  return { x: (col + 0.5) / 10, y: 1 - (row + 0.5) / 10 };
}
export const JUMPS: Record<number, { to: number; kind: 'ladder' | 'snake'; deed: Deed }> = Object.fromEntries([
  ...LADDERS.map((d) => [d.from, { to: d.to, kind: 'ladder' as const, deed: d }]),
  ...SNAKES.map((d) => [d.from, { to: d.to, kind: 'snake' as const, deed: d }]),
]);

/* ---------------- حروف: 5×5 hex grid, rows offset ("odd-r") ----------------
 * Red joins right ↔ left, green joins top ↔ bottom.
 */
export const HEX_N = 5;
export function hexNeighbors(i: number): number[] {
  const r = Math.floor(i / HEX_N), c = i % HEX_N;
  const odd = r % 2 === 1;
  const cand = [
    [r, c - 1], [r, c + 1],
    [r - 1, odd ? c : c - 1], [r - 1, odd ? c + 1 : c],
    [r + 1, odd ? c : c - 1], [r + 1, odd ? c + 1 : c],
  ];
  return cand.filter(([rr, cc]) => rr >= 0 && rr < HEX_N && cc >= 0 && cc < HEX_N).map(([rr, cc]) => rr * HEX_N + cc);
}
/** Cells of a winning chain for `team`, or null. */
export function hexWinPath(owners: (string | null)[], team: 'red' | 'green'): number[] | null {
  const starts = team === 'red' ? [...Array(HEX_N)].map((_, r) => r * HEX_N + HEX_N - 1) : [...Array(HEX_N)].map((_, c) => c);
  const isEnd = (i: number) => (team === 'red' ? i % HEX_N === 0 : Math.floor(i / HEX_N) === HEX_N - 1);
  const prev = new Map<number, number>();
  const queue = starts.filter((i) => owners[i] === team);
  for (const i of queue) prev.set(i, -1);
  while (queue.length) {
    const i = queue.shift()!;
    if (isEnd(i)) {
      const path = [];
      for (let k = i; k !== -1; k = prev.get(k)!) path.push(k);
      return path;
    }
    for (const n of hexNeighbors(i)) {
      if (owners[n] !== team || prev.has(n)) continue;
      prev.set(n, i);
      queue.push(n);
    }
  }
  return null;
}
