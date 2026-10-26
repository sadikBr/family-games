/**
 * «البالونات»: the words behind the game — the app's secret words, the check of a setter's word, and the
 * bots' letters.
 *
 * Every category reuses the curated lists of «سؤال وشرط» (server/qcond-words.ts: `std` correctly spelled
 * and roughly from the most common to the rarest, `alt` other spellings players type), «مدينة» joins the
 * world's and Morocco's cities, and «أداة» has its own list below. The app's words are single `std` words
 * without «ال» (3–10 letters); boys' and girls' names come from a short list of common names (the names
 * game's lists also hold rare ones).
 *
 * A setter's word must be a word the app knows, so a typo never spoils a round: in a curated list (any
 * category), or in the dictionaries (server/dictionary.ts: the names dictionary for names and places,
 * Hunspell for common nouns) written exactly — a word one slip away from a listed one gets «هل تقصد …؟».
 *
 * Bots choose letters from the public board only: the category's words that fit the boxes found so far
 * and avoid every letter already tried (server never shows them the word).
 */
import { editDistance } from '../src/shared/arabic';
import { BALLOONS_CATS, BALLOONS_KEYS, balloonsClean, prepareWord, type BalloonsCat, type PreparedWord } from '../src/shared/games/balloons';
import type { BotLevel } from '../src/shared/protocol';
import { wordMatch } from './dictionary';
import { QCOND_WORDS } from './qcond-words';

export type Rnd = () => number;

const list = (text: string): string[] => text.split(/\s+/).filter(Boolean).map((w) => w.replace(/_/g, ' '));

/** «أداة»: hand tools and everyday instruments. */
const TOOL = {
  std: list(`
    مطرقة مفك منشار مسمار برغي كماشة مفتاح مقص إبرة خيط سكين مجرفة معول فأس منجل مسطرة ميزان مثقاب مبرد إزميل
    ملقط فرشاة دلو سلم حبل مكنسة مضخة رافعة مصباح ولاعة مسحاة مذراة مبشرة مقشرة فتاحة سندان منفاخ مدقة غربال
    مغرفة مصفاة مشط بوصلة عتلة مقياس شريط ممسحة دباسة مكواة قلم ممحاة مجهر منظار مرآة ساعة مظلة مقلاة إبريق
  `),
  alt: list(`
    مفك_براغي مفتاح_إنجليزي مفتاح_ربط شريط_قياس ميزان_ماء منشار_كهربائي مسامير براغي شاقور مقراض
  `),
};

/**
 * The app's words where the curated list is long and holds rare words (it isn't ordered by how common a
 * word is): animals, jobs, cities, boys' and girls' names — words every child knows.
 */
const COMMON: Partial<Record<BalloonsCat, string[]>> = {
  animal: list(`
    أسد نمر فيل زرافة حصان حمار جمل بقرة خروف كلب قطة أرنب فأر دب ذئب ثعلب قرد غزال تمساح سلحفاة ضفدع سمكة
    حوت دلفين قرش أخطبوط نحلة نملة فراشة عصفور حمامة ديك دجاجة بطة بومة نسر صقر ببغاء طاووس بطريق غراب ثعبان
    أفعى عقرب عنكبوت حلزون سنجاب قنفذ كنغر باندا غوريلا خفاش جاموس ثور عجل ذبابة بعوضة خنفساء نعامة فقمة
  `),
  job: list(`
    معلم طبيب مهندس نجار فلاح صياد شرطي طيار خباز حلاق خياط سائق مصور ممثل رسام بناء حداد جزار تاجر طباخ
    بحار ممرض محامي قاضي صحفي مدرب لاعب حارس إطفائي كهربائي سباك دهان فنان صيدلي جراح أستاذ إمام بستاني
    خطاط نادل مبرمج مذيع كاتب شاعر عازف حلواني
  `),
  city: list(`
    باريس لندن مدريد روما برلين دبي مكة جدة دمشق بغداد بيروت تونس طرابلس عمان إسطنبول طوكيو بكين موسكو
    نيويورك واشنطن سيدني فاس مراكش طنجة أكادير مكناس وجدة تطوان سلا آسفي أزرو إفران شفشاون أصيلة تازة
    برشلونة ميلانو أمستردام جنيف لشبونة أثينا فيينا بروكسل صنعاء مسقط داكار وهران حلب غزة أنقرة القدس
  `),
  boy: list(`
    أحمد محمد يوسف آدم أمين علي عمر حمزة إلياس ياسين كريم سعيد خالد مهدي أنس إدريس إبراهيم إسماعيل رضا سفيان
    طارق عثمان هشام نبيل مراد رشيد سمير ياسر بلال أيوب أسامة صلاح عادل جمال منير مصطفى زكرياء حسن حسين سليمان
    عماد نوفل وليد فيصل مالك ريان أنور جواد بدر هاشم إسحاق يونس موسى عيسى داود نزار
  `),
  girl: list(`
    فاطمة مريم خديجة عائشة سلمى نور ليلى سارة هند ياسمين زينب أمينة حليمة سناء نادية سعاد رجاء إيمان هدى منى
    سلوى رقية حنان أسماء كوثر وفاء لبنى جميلة شيماء دعاء نوال سميرة كريمة لطيفة نجاة حياة بشرى أميرة رحمة صفاء
    هاجر آمنة غيثة إكرام سهام لمياء مليكة نعيمة وداد يسرى
  `),
};

const SOURCES: Record<BalloonsCat, { std: string[]; alt: string[] }> = {
  animal: { std: [...COMMON.animal!, ...QCOND_WORDS.animal.std], alt: QCOND_WORDS.animal.alt },
  fruit: QCOND_WORDS.fruit,
  veg: QCOND_WORDS.veg,
  country: QCOND_WORDS.country,
  city: { std: [...COMMON.city!, ...QCOND_WORDS.city.std], alt: [...QCOND_WORDS.city.alt, ...QCOND_WORDS.mcity.alt] },
  job: { std: [...COMMON.job!, ...QCOND_WORDS.job.std], alt: QCOND_WORDS.job.alt },
  tool: TOOL,
  sport: QCOND_WORDS.sport,
  food: QCOND_WORDS.food,
  house: QCOND_WORDS.house,
  boy: { std: [...COMMON.boy!, ...QCOND_WORDS.boy.std], alt: QCOND_WORDS.boy.alt },
  girl: { std: [...COMMON.girl!, ...QCOND_WORDS.girl.std], alt: QCOND_WORDS.girl.alt },
  color: QCOND_WORDS.color,
  body: QCOND_WORDS.body,
  school: QCOND_WORDS.school,
};

/** Which names-game column the dictionary check uses (Hunspell's word forms count for the common nouns). */
const DICT_CAT: Record<BalloonsCat, string> = {
  animal: 'animal',
  fruit: 'plant',
  veg: 'plant',
  country: 'country',
  city: 'country',
  job: 'job',
  tool: 'thing',
  sport: 'thing',
  food: 'thing',
  house: 'thing',
  boy: 'boy',
  girl: 'girl',
  color: 'thing',
  body: 'thing',
  school: 'thing',
};

export interface Entry {
  /** as written (no «ال») */
  word: string;
  /** the keys, joined */
  key: string;
}

interface Pool {
  /** the app's words: single std words without «ال», most common first */
  app: Entry[];
  /** every single word of the category (std and alt, «ال» taken off), for the bots and the check */
  all: Entry[];
  byKey: Map<string, Entry>;
}

const pools = new Map<BalloonsCat, Pool>();

function entry(w: string): (Entry & { al: boolean }) | null {
  const p = prepareWord(w);
  if (!p.ok) return null;
  return { word: p.word.chars.join(''), key: p.word.keys.join(''), al: p.word.alStripped };
}

export function poolOf(cat: BalloonsCat): Pool {
  let p = pools.get(cat);
  if (p) return p;
  const src = SOURCES[cat];
  const app: Entry[] = [];
  const all: Entry[] = [];
  const byKey = new Map<string, Entry>();
  const appSeen = new Set<string>();
  const appSrc = COMMON[cat] ?? src.std;
  for (const w of appSrc) {
    const e = entry(w);
    if (!e || e.al || appSeen.has(e.key)) continue;
    appSeen.add(e.key);
    app.push({ word: e.word, key: e.key });
  }
  for (const w of [...src.std, ...src.alt]) {
    const e = entry(w);
    if (!e || byKey.has(e.key)) continue;
    const x = { word: e.word, key: e.key };
    byKey.set(e.key, x);
    all.push(x);
  }
  p = { app, all, byKey };
  pools.set(cat, p);
  return p;
}

let everyWord: Entry[] | null = null;
/** Every category's words together (a word in no list of its category, for the bots). */
function allWords(): Entry[] {
  if (everyWord) return everyWord;
  const seen = new Set<string>();
  everyWord = [];
  for (const c of BALLOONS_CATS)
    for (const e of poolOf(c).all) {
      if (seen.has(e.key)) continue;
      seen.add(e.key);
      everyWord.push(e);
    }
  return everyWord;
}

/* ------------------------------------------------------------------ */
/* The app's words                                                     */
/* ------------------------------------------------------------------ */

/** The part of the app's list each strength picks from (most common first), and the word lengths. */
const LEVEL_PICK: Record<BotLevel | 'app', { share: number; min: number; max: number }> = {
  easy: { share: 0.4, min: 3, max: 6 },
  app: { share: 0.6, min: 3, max: 8 },
  smart: { share: 0.75, min: 4, max: 8 },
  expert: { share: 1, min: 5, max: 10 },
};

/** A word from the app's list for this category, not one of `used` (keys). */
export function pickWord(cat: BalloonsCat, level: BotLevel | 'app', rnd: Rnd, used: ReadonlySet<string> = new Set()): Entry {
  const app = poolOf(cat).app;
  const { share, min, max } = LEVEL_PICK[level];
  const head = app.slice(0, Math.max(12, Math.ceil(app.length * share)));
  const fits = (e: Entry) => e.key.length >= min && e.key.length <= max && !used.has(e.key);
  // the expert prefers the harder half of what fits (longer words, rarer letters)
  let options = head.filter(fits);
  if (level === 'expert' && options.length > 8) {
    const hard = (e: Entry) => e.key.length + [...new Set(e.key)].filter((k) => RARE.has(k)).length * 1.5;
    options = [...options].sort((a, b) => hard(b) - hard(a)).slice(0, Math.ceil(options.length / 2));
  }
  if (!options.length) options = app.filter((e) => !used.has(e.key));
  if (!options.length) options = app;
  return options[Math.floor(rnd() * options.length)];
}

/** A category for the app's word: the setting, or one not used lately. */
export function pickCat(setting: BalloonsCat | 'mix', rnd: Rnd, recent: readonly BalloonsCat[] = []): BalloonsCat {
  if (setting !== 'mix') return setting;
  const fresh = BALLOONS_CATS.filter((c) => !recent.slice(-8).includes(c));
  const from = fresh.length ? fresh : BALLOONS_CATS;
  return from[Math.floor(rnd() * from.length)];
}

/* ------------------------------------------------------------------ */
/* A setter's word                                                     */
/* ------------------------------------------------------------------ */

const skeleton = (k: string) => k.replace(/[اوي]/g, '');

/** A listed word of the category that this key is one slip away from (null: none). */
function nearListed(cat: BalloonsCat, key: string): Entry | null {
  const n = key.length;
  if (n < 4) return null;
  const sk = skeleton(key);
  for (const e of poolOf(cat).all) {
    if (Math.abs(e.key.length - n) > 1) continue;
    if (e.key.length >= 4 && (skeleton(e.key) === sk || editDistance(e.key, key) <= 1)) return e;
  }
  return null;
}

export type SecretCheck = { ok: true; word: PreparedWord } | { ok: false; error: string };

/** Is this word fine for a round (see the top of the file)? The error is shown to its author. */
export function checkSecret(cat: BalloonsCat, raw: string): SecretCheck {
  const p = prepareWord(raw);
  if (!p.ok) return p;
  const key = p.word.keys.join('');
  if (poolOf(cat).byKey.has(key)) return p;
  if (BALLOONS_CATS.some((c) => c !== cat && poolOf(c).byKey.has(key))) return p;
  // «زرافا» for «زرافة», «سلمي» typed for «سلمى» is the same key: a final ا for ة / ى is a slip
  if (key.endsWith('ا')) {
    const listed = ['ه', 'ي'].map((k) => key.slice(0, -1) + k).map((k) => BALLOONS_CATS.map((c) => poolOf(c).byKey.get(k)).find(Boolean)).find(Boolean);
    if (listed) return { ok: false, error: `كلمة غير معروفة — هل تقصد «${listed.word}»؟` };
  }
  const typed = balloonsClean(raw);
  let m: ReturnType<typeof wordMatch> = null;
  try {
    m = wordMatch(typed, DICT_CAT[cat]) ?? (p.word.alStripped ? wordMatch(p.word.chars.join(''), DICT_CAT[cat]) : null);
  } catch {
    m = null; // no dictionary: the lists alone decide
  }
  if (m === 'list' || m === 'dict' || m === 'hunspell') return p;
  const near = nearListed(cat, key);
  if (near) return { ok: false, error: `كلمة غير معروفة — هل تقصد «${near.word}»؟` };
  return { ok: false, error: 'كلمة لا يعرفها قاموس التطبيق: تأكّد من كتابتها أو اختر كلمة أخرى' };
}

/** Load the dictionaries now (half a second), not at the first word typed. */
export function warmDictionaries() {
  try {
    wordMatch('قطة', 'animal');
  } catch {
    // no dictionary: words are checked by the lists only
  }
}

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

/** Arabic letters from the most to the least common in words without «ال» (the easy bots' order). */
export const LETTER_FREQ = [...'ايرنملوتبهسعدكفقحجشطصخزغثذضظ'];
const RARE = new Set([...'ظضذثغخص']);

export interface BoardInfo {
  cat: BalloonsCat;
  /** each box's key once found, null while hidden */
  slots: (string | null)[];
  /** keys already chosen */
  tried: ReadonlySet<string>;
  /** keys of whole words already refused */
  wrongWords: ReadonlySet<string>;
  balloons: number;
}

export type BotMove = { kind: 'letter'; key: string } | { kind: 'word'; text: string };

/** The words of the category that fit the board (or, if none, any listed word that does). */
export function candidates(b: BoardInfo): Entry[] {
  const fit = (e: Entry) => {
    if (e.key.length !== b.slots.length || b.wrongWords.has(e.key)) return false;
    for (let i = 0; i < b.slots.length; i++) {
      const s = b.slots[i];
      const k = e.key[i];
      if (s ? k !== s : b.tried.has(k)) return false;
    }
    return true;
  };
  const own = poolOf(b.cat).all.filter(fit);
  return own.length ? own : allWords().filter(fit);
}

/** How many candidates hold each untried key, and how evenly a key splits them (its positions). */
function letterScores(b: BoardInfo, cands: Entry[]) {
  const out: { key: string; count: number; info: number }[] = [];
  for (const key of BALLOONS_KEYS) {
    if (b.tried.has(key)) continue;
    const groups = new Map<string, number>();
    let count = 0;
    for (const e of cands) {
      let pat = '';
      for (let i = 0; i < e.key.length; i++) if (e.key[i] === key) pat += i + ',';
      if (pat) count++;
      groups.set(pat, (groups.get(pat) ?? 0) + 1);
    }
    let info = 0;
    for (const g of groups.values()) {
      const q = g / cands.length;
      info -= q * Math.log2(q);
    }
    out.push({ key, count, info });
  }
  return out;
}

const firstUntried = (b: BoardInfo, order: readonly string[]) => order.find((k) => !b.tried.has(k)) ?? BALLOONS_KEYS.find((k) => !b.tried.has(k))!;

/**
 * The bot's move at its strength:
 * - expert: the letter most candidates hold (the fewest balloons risked), ties broken by the best split;
 *   the whole word as soon as one candidate is left;
 * - smart: mostly the best letter, sometimes the second or just a common letter; the word when one candidate
 *   is left and half the boxes are found (or few balloons are left);
 * - easy: the common letters in order, often a random one; the word only when one box is missing.
 */
export function botMove(level: BotLevel, b: BoardInfo, rnd: Rnd): BotMove {
  const hidden = b.slots.filter((s) => !s).length;
  const untried = BALLOONS_KEYS.filter((k) => !b.tried.has(k));
  if (level === 'easy') {
    const cands = hidden <= 1 ? candidates(b) : [];
    if (cands.length === 1 && rnd() < 0.6) return { kind: 'word', text: cands[0].word };
    if (rnd() < 0.35) return { kind: 'letter', key: untried[Math.floor(rnd() * untried.length)] };
    return { kind: 'letter', key: firstUntried(b, LETTER_FREQ) };
  }
  const cands = candidates(b);
  if (cands.length === 1 && hidden > 0) {
    if (level === 'expert' || hidden * 2 <= b.slots.length || b.balloons <= 2) return { kind: 'word', text: cands[0].word };
  }
  if (!cands.length) return { kind: 'letter', key: firstUntried(b, LETTER_FREQ) };
  const scores = letterScores(b, cands).sort((x, y) => y.count - x.count || y.info - x.info || LETTER_FREQ.indexOf(x.key) - LETTER_FREQ.indexOf(y.key));
  if (level === 'smart') {
    // a good player, not a perfect one: now and then a common letter or the second best
    const r = rnd();
    if (r < 0.3) return { kind: 'letter', key: firstUntried(b, LETTER_FREQ) };
    if (r < 0.5 && scores.length > 1 && scores[1].count > 0) return { kind: 'letter', key: scores[1].key };
  }
  return { kind: 'letter', key: scores[0].key };
}
