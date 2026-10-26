/**
 * «خمّن من؟» — understanding a typed question for a bot opponent. A bot can't read free text, so the
 * question is matched by keywords to ONE of the ready questions (GW_QUESTIONS) and answered truthfully;
 * the screens then show which one it was understood as («فُهم السؤال: هل يلبس نظارة؟»).
 *
 * - A negation («ليس له لحية؟», «بدون نظارة؟», «لا تلبس حجاباً؟») is understood without it, and the answer
 *   is to the plain question, which is shown (`neg`).
 * - «رجل / ولد / ذكر» is the female question, negated; brown or black eyes are «عينان زرقاوان؟», negated.
 * - A colour goes with the word it describes: eyes, hair or clothes; alone, black and brown are the hair
 *   and red and blue the clothes.
 * - Two attributes at once («شعر أسود طويل؟») are refused, unless one implies the other («امرأة بحجاب؟» is
 *   the hijab question, «رجل بلحية؟» the beard one). A character's name points to «خمّن الشخصية».
 *
 * Shared with the app, which shows while typing what a bot will understand.
 */
import { norm } from '../arabic';
import { GW_CHARS } from './guesswho-chars';
import type { GwQuestionId } from './guesswho';

export type GwMatch =
  | { ok: true; q: GwQuestionId; neg: boolean }
  /** none: nothing understood; many: more than one attribute; name: a character's name (a guess) */
  | { ok: false; why: 'none' | 'many' | 'name' };

/** What to tell the player when a typed question isn't understood. */
export const GW_MATCH_ERROR: Record<'none' | 'many' | 'name', string> = {
  none: 'لم يُفهم السؤال: اختر سؤالاً من الأسئلة الجاهزة',
  many: 'سؤال عن صفة واحدة في كل مرة، أو اختر سؤالاً جاهزاً',
  name: 'لسؤال «هل هو …؟» استعمل «خمّن الشخصية»',
};

type Word = (w: string) => boolean;
/** A word test: starts with one of the stems (or equals it, with a trailing `$`); stems are normalised like the text. */
function stems(...raw: string[]): Word {
  const xs = raw.map((x) => (x.endsWith('$') ? { s: norm(x.slice(0, -1)), whole: true } : { s: norm(x), whole: false }));
  return (w) => xs.some((x) => (x.whole ? w === x.s : w.startsWith(x.s)));
}

const DIRECT: [GwQuestionId, Word][] = [
  ['glasses', stems('نظار', 'نضار', 'عوينات', 'منظار')],
  ['beard', stems('لحيه', 'ملتح', 'لحي$', 'لحيت', 'لحا$', 'لحاه', 'ذقن', 'دقن')],
  ['moustache', stems('شارب', 'شوارب', 'شنب', 'شناب')],
  ['hat', stems('طربوش', 'طرابيش', 'قبعه', 'قبعات', 'قبعت', 'عمامه', 'عمامت', 'عمائم', 'طاقيه', 'كاسكيت', 'شاشيه', 'برنيطه', 'قلنسوه')],
  ['hijab', stems('حجاب', 'محجب', 'متحجب', 'خمار', 'منديل', 'فولار', 'وشاح', 'ايشارب')],
  ['jellaba', stems('جلاب', 'جلباب', 'جلالب')],
  ['earrings', stems('قرط', 'اقراط', 'حلق$', 'حلقان', 'حلقات', 'خرص', 'اخراص')],
  ['smile', stems('يبتسم', 'تبتسم', 'مبتسم', 'ابتسام', 'باسم', 'يضحك', 'تضحك', 'ضاحك', 'ضحك', 'فرحان', 'مسرور', 'بشوش')],
  ['child', stems('طفل', 'اطفال', 'صغير', 'صغار', 'رضيع')],
  ['elder', stems('عجوز', 'عجائز', 'مسن', 'شيخ$', 'شيوخ', 'شايب', 'هرم$', 'كهل', 'جد$', 'جده$', 'جدي$', 'جدتي$', 'كبير$', 'كبيره$', 'الجد$', 'الجده$')],
];
const FEMALE = stems('امراه', 'امرأه', 'مراه', 'بنت', 'بنات', 'انثي', 'اناث', 'فتاه', 'فتيات', 'سيده', 'نساء', 'نسوه');
const MALE = stems('رجل', 'رجال', 'ذكر$', 'ولد$', 'اولاد', 'صبي', 'شاب$', 'فتي$');

const HAIR = stems('شعر', 'شعور', 'خصل');
const EYES = stems('عين', 'عيون', 'اعين');
const CLOTHES = stems('ثياب', 'ثوب', 'ملابس', 'لباس', 'قميص', 'فستان', 'كسوه');
const LONG = stems('طويل', 'طوال');
const SHORT = stems('قصير', 'قصار');
const BRAIDS = stems('ضفير', 'ضفائر', 'جدائل', 'جديل');

const BLACK = stems('اسود', 'سوداء', 'سودا$', 'سود$');
const BROWN = stems('بني$', 'بنيه$', 'بنيا$', 'كستنائي', 'عسلي');
const BLUE = stems('ازرق', 'زرقاء', 'زرقا$', 'زرق$', 'زرقاو');
const RED = stems('احمر', 'حمراء', 'حمرا$', 'حمر$');
/** colours no ready question asks about: a colour word is still a colour (so «شعر أشقر» isn't the black-hair question) */
const OTHER_COLOR = stems('اشقر', 'شقراء', 'ابيض', 'بيضاء', 'رمادي', 'اخضر', 'خضراء', 'اصفر', 'صفراء', 'بنفسجي', 'وردي', 'برتقالي');

const NEG = stems('ليس$', 'ليست$', 'لست$', 'لا$', 'لم$', 'لن$', 'بدون$', 'بلا$', 'غير$', 'مش$', 'دون$');

/** The word and the same word without a leading «و / ف» and «ال / بال / لل / ب / ل». */
function variants(w: string): string[] {
  const out = [w];
  let x = w;
  if (/^[وف]/.test(x) && x.length > 3) {
    x = x.slice(1);
    out.push(x);
  }
  for (const p of ['بال', 'وال', 'لل', 'ال', 'ب', 'ل', 'ك']) if (x.startsWith(p) && x.length - p.length >= 2) out.push(x.slice(p.length));
  return out;
}

/** The characters' one-word names, normalised (a guess, not a question). «علي» is checked before normalising: «على» becomes alike. */
const NAMES = new Set(GW_CHARS.map((c) => norm(c.name)).filter((n) => !n.includes(' ') && n !== 'علي'));

/** Matches a typed question to one ready question (see the header). */
export function gwMatchQuestion(text: string): GwMatch {
  let t = norm(text.toLowerCase())
    .replace(/[^ء-ي0-9a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // «… أم لا؟» / «… أو لا؟» ask «or not», they don't negate
  t = t.replace(/(^| )(ام|او|ولا|والا) ?لا( |$)/g, ' ').replace(/ (ولا|والا)$/, '').trim();
  const words = t.split(' ').filter(Boolean);
  const has = (f: Word) => words.some((w) => variants(w).some(f));

  const found = new Map<GwQuestionId, boolean>(); // question → negated by the word itself
  for (const [q, f] of DIRECT) if (has(f)) found.set(q, false);
  const male = has(MALE);
  const female = has(FEMALE);
  if (male !== female) found.set('female', male);
  else if (male && female) return { ok: false, why: 'many' };

  const ctx = [has(HAIR) && 'hair', has(EYES) && 'eyes', has(CLOTHES) && 'clothes'].filter(Boolean) as string[];
  const colors = { black: has(BLACK), brown: has(BROWN), blue: has(BLUE), red: has(RED), other: has(OTHER_COLOR) };
  const nColors = Object.values(colors).filter(Boolean).length;
  if (nColors) {
    if (nColors > 1 || ctx.length > 1) return { ok: false, why: 'many' };
    const where = ctx[0] ?? (colors.black || colors.brown ? 'hair' : colors.blue || colors.red ? 'clothes' : 'other');
    if (where === 'eyes') {
      if (colors.blue) found.set('eyesBlue', false);
      else if (colors.black || colors.brown) found.set('eyesBlue', true);
    } else if (where === 'hair') {
      if (colors.black) found.set('hairBlack', false);
      else if (colors.brown) found.set('hairBrown', false);
    } else if (where === 'clothes') {
      if (colors.red) found.set('red', false);
      else if (colors.blue) found.set('blue', false);
    }
    // a colour no question covers («شعر أشقر؟», «ثياب خضراء؟») is not understood
    if (![...found.keys()].some((q) => ['eyesBlue', 'hairBlack', 'hairBrown', 'red', 'blue'].includes(q))) return { ok: false, why: found.size ? 'many' : 'none' };
  }
  if (has(BRAIDS) || (ctx.includes('hair') && has(LONG))) found.set('hairLong', false);
  else if (ctx.includes('hair') && has(SHORT)) found.set('hairLong', true);

  // «امرأة بحجاب؟» = «حجاب؟», «رجل بلحية؟» = «لحية؟» (the one implies the other)
  if (found.size === 2 && found.has('female')) {
    const [o] = [...found.keys()].filter((q) => q !== 'female');
    const fem = !found.get('female');
    if ((fem && (o === 'hijab' || o === 'earrings')) || (!fem && (o === 'beard' || o === 'moustache'))) found.delete('female');
  }

  if (found.size > 1) return { ok: false, why: 'many' };
  if (found.size === 0) {
    const raw = text.replace(/[ً-ْـ]/g, '').split(/[^ء-ي]+/);
    if (has((w) => NAMES.has(w)) || words.join('').includes('عبدالله') || raw.some((w) => w === 'علي' || w === 'وعلي')) return { ok: false, why: 'name' };
    return { ok: false, why: 'none' };
  }
  const [[q, self]] = [...found.entries()];
  const negs = words.filter((w) => NEG(w)).length;
  return { ok: true, q, neg: (negs % 2 === 1) !== self };
}
