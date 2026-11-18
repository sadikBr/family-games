/**
 * «البلد الغامض» — the countries a round can hide, with the names people type for them, and the tolerant
 * matching shared by the server (is this guess right?) and the app (suggestions as you type).
 *
 * The names are those of «الأعلام والعواصم» (server/flags-content.ts; the content test checks they agree),
 * and the codes are its flag codes (ISO 3166-1 alpha-2), so the reveal shows the same flag art. The clues
 * themselves stay on the server (server/balad-content.ts): this list only says which countries exist.
 */

export type BaladContinent = 'africa' | 'asia' | 'europe' | 'americas' | 'oceania';

export interface BaladCountry {
  code: string;
  name: string;
  continent: BaladContinent;
  /** a member of the Arab League */
  arab?: boolean;
  /** other names people type («أمريكا»، «بريطانيا»، «هولاندا»…) */
  aliases: string[];
}

const k = (continent: BaladContinent, code: string, name: string, aliases: string[] = [], arab = false): BaladCountry => ({
  code,
  name,
  continent,
  ...(arab ? { arab: true } : {}),
  aliases,
});
const a = (continent: BaladContinent, code: string, name: string, aliases: string[] = []) => k(continent, code, name, aliases, true);

export const BALAD_COUNTRIES: BaladCountry[] = [
  /* ---------- العالم العربي ---------- */
  a('africa', 'ma', 'المغرب', ['المملكة المغربية']),
  a('africa', 'dz', 'الجزائر', ['جمهورية الجزائر']),
  a('africa', 'tn', 'تونس', ['الجمهورية التونسية']),
  a('africa', 'ly', 'ليبيا'),
  a('africa', 'eg', 'مصر', ['جمهورية مصر العربية', 'مصر العربية']),
  a('africa', 'sd', 'السودان'),
  a('africa', 'mr', 'موريتانيا', ['موريطانيا']),
  a('africa', 'so', 'الصومال'),
  a('africa', 'dj', 'جيبوتي', ['جيبوتى']),
  a('africa', 'km', 'جزر القمر', ['القمر', 'جزر القمر المتحدة', 'كوموروس']),
  a('asia', 'sa', 'السعودية', ['المملكة العربية السعودية', 'العربية السعودية']),
  a('asia', 'ae', 'الإمارات', ['الإمارات العربية المتحدة', 'دولة الإمارات']),
  a('asia', 'kw', 'الكويت', ['دولة الكويت']),
  a('asia', 'qa', 'قطر', ['دولة قطر']),
  a('asia', 'bh', 'البحرين', ['مملكة البحرين']),
  a('asia', 'om', 'عُمان', ['سلطنة عمان']),
  a('asia', 'ye', 'اليمن'),
  a('asia', 'ps', 'فلسطين', ['دولة فلسطين']),
  a('asia', 'jo', 'الأردن', ['المملكة الأردنية الهاشمية']),
  a('asia', 'lb', 'لبنان'),
  a('asia', 'sy', 'سوريا', ['سورية']),
  a('asia', 'iq', 'العراق'),
  /* ---------- أفريقيا ---------- */
  k('africa', 'sn', 'السنغال'),
  k('africa', 'ml', 'مالي'),
  k('africa', 'ne', 'النيجر'),
  k('africa', 'ng', 'نيجيريا'),
  k('africa', 'gh', 'غانا'),
  k('africa', 'ci', 'ساحل العاج', ['كوت ديفوار', 'كوت ديفوارر']),
  k('africa', 'cm', 'الكاميرون', ['كاميرون']),
  k('africa', 'td', 'تشاد'),
  k('africa', 'cd', 'الكونغو الديمقراطية', ['الكونغو', 'جمهورية الكونغو الديمقراطية', 'زائير', 'الكونغو كينشاسا', 'الكونغو الديموقراطية']),
  k('africa', 'et', 'إثيوبيا', ['الحبشة', 'أثيوبيا']),
  k('africa', 'er', 'إريتريا', ['أريتريا', 'ارتريا']),
  k('africa', 'ke', 'كينيا'),
  k('africa', 'tz', 'تنزانيا'),
  k('africa', 'ug', 'أوغندا'),
  k('africa', 'rw', 'رواندا'),
  k('africa', 'mg', 'مدغشقر', ['ماداغاسكار', 'مدغشكر']),
  k('africa', 'za', 'جنوب أفريقيا', ['جنوب إفريقيا', 'جمهورية جنوب أفريقيا']),
  k('africa', 'zw', 'زيمبابوي', ['زمبابوي']),
  k('africa', 'zm', 'زامبيا'),
  k('africa', 'ao', 'أنغولا', ['أنجولا']),
  k('africa', 'mz', 'موزمبيق', ['موزامبيق']),
  k('africa', 'na', 'ناميبيا'),
  k('africa', 'bw', 'بوتسوانا', ['بتسوانا']),
  k('africa', 'mu', 'موريشيوس', ['موريس']),
  /* ---------- أوروبا ---------- */
  k('europe', 'fr', 'فرنسا'),
  k('europe', 'gb', 'المملكة المتحدة', ['بريطانيا', 'بريطانيا العظمى', 'إنجلترا', 'إنكلترا', 'انقلترا']),
  k('europe', 'ie', 'أيرلندا', ['إيرلندا', 'ايرلاندا', 'جمهورية أيرلندا']),
  k('europe', 'be', 'بلجيكا'),
  k('europe', 'nl', 'هولندا', ['هولاندا', 'نيذرلاند', 'الأراضي المنخفضة']),
  k('europe', 'de', 'ألمانيا'),
  k('europe', 'at', 'النمسا'),
  k('europe', 'ch', 'سويسرا'),
  k('europe', 'es', 'إسبانيا', ['أسبانيا']),
  k('europe', 'pt', 'البرتغال'),
  k('europe', 'it', 'إيطاليا'),
  k('europe', 'gr', 'اليونان'),
  k('europe', 'mt', 'مالطا', ['مالطة']),
  k('europe', 'cy', 'قبرص'),
  k('europe', 'no', 'النرويج'),
  k('europe', 'se', 'السويد'),
  k('europe', 'fi', 'فنلندا', ['فنلنده']),
  k('europe', 'dk', 'الدنمارك', ['الدانمارك', 'الدنمرك']),
  k('europe', 'is', 'آيسلندا', ['إيسلندا', 'أيسلندا']),
  k('europe', 'pl', 'بولندا', ['بولونيا']),
  k('europe', 'cz', 'التشيك', ['تشيكيا', 'جمهورية التشيك']),
  k('europe', 'hu', 'المجر', ['هنغاريا', 'هنجاريا']),
  k('europe', 'ro', 'رومانيا'),
  k('europe', 'ua', 'أوكرانيا'),
  k('europe', 'ru', 'روسيا', ['روسيا الاتحادية']),
  k('europe', 'hr', 'كرواتيا'),
  k('europe', 'ba', 'البوسنة والهرسك', ['البوسنة', 'البوسنه']),
  k('europe', 'rs', 'صربيا'),
  k('europe', 'al', 'ألبانيا'),
  k('europe', 'bg', 'بلغاريا'),
  k('europe', 'va', 'الفاتيكان', ['دولة الفاتيكان', 'مدينة الفاتيكان']),
  k('europe', 'mc', 'موناكو'),
  /* ---------- آسيا ---------- */
  k('asia', 'tr', 'تركيا'),
  k('asia', 'ir', 'إيران'),
  k('asia', 'ge', 'جورجيا', ['جيورجيا']),
  k('asia', 'am', 'أرمينيا'),
  k('asia', 'az', 'أذربيجان', ['اذربيجان', 'أزربيجان']),
  k('asia', 'kz', 'كازاخستان', ['قازاقستان', 'كزاخستان']),
  k('asia', 'uz', 'أوزبكستان', ['أوزباكستان']),
  k('asia', 'in', 'الهند'),
  k('asia', 'pk', 'باكستان'),
  k('asia', 'bd', 'بنغلاديش', ['بنجلاديش', 'بنغلادش']),
  k('asia', 'lk', 'سريلانكا', ['سيلان', 'سري لانكا']),
  k('asia', 'np', 'نيبال'),
  k('asia', 'cn', 'الصين'),
  k('asia', 'jp', 'اليابان'),
  k('asia', 'kr', 'كوريا الجنوبية', ['كوريا']),
  k('asia', 'mn', 'منغوليا', ['مونغوليا', 'منجوليا']),
  k('asia', 'th', 'تايلاند', ['تايلند']),
  k('asia', 'vn', 'فيتنام'),
  k('asia', 'kh', 'كمبوديا'),
  k('asia', 'my', 'ماليزيا'),
  k('asia', 'sg', 'سنغافورة'),
  k('asia', 'id', 'إندونيسيا', ['أندونيسيا']),
  k('asia', 'ph', 'الفلبين'),
  k('asia', 'mv', 'جزر المالديف', ['المالديف']),
  /* ---------- الأمريكتان ---------- */
  k('americas', 'us', 'الولايات المتحدة', ['أمريكا', 'أميركا', 'الولايات المتحدة الأمريكية', 'الولايات المتحدة الأميركية']),
  k('americas', 'ca', 'كندا'),
  k('americas', 'mx', 'المكسيك'),
  k('americas', 'cu', 'كوبا'),
  k('americas', 'jm', 'جامايكا'),
  k('americas', 'br', 'البرازيل'),
  k('americas', 'ar', 'الأرجنتين'),
  k('americas', 'cl', 'تشيلي', ['تشيلى', 'شيلي']),
  k('americas', 'pe', 'بيرو'),
  k('americas', 'co', 'كولومبيا'),
  k('americas', 've', 'فنزويلا'),
  k('americas', 'uy', 'الأوروغواي', ['الأورغواي', 'أوروجواي']),
  k('americas', 'bo', 'بوليفيا'),
  k('americas', 'ec', 'الإكوادور'),
  k('americas', 'py', 'باراغواي', ['البارغواي', 'باراجواي']),
  k('americas', 'pa', 'بنما'),
  k('americas', 'cr', 'كوستاريكا', ['كوستا ريكا']),
  k('americas', 'gt', 'غواتيمالا', ['جواتيمالا']),
  k('americas', 'do', 'جمهورية الدومينيكان', ['الدومينيكان', 'الدومنيكان']),
  k('americas', 'ht', 'هايتي'),
  /* ---------- أوقيانوسيا ---------- */
  k('oceania', 'au', 'أستراليا'),
  k('oceania', 'nz', 'نيوزيلندا'),
  k('oceania', 'fj', 'فيجي'),
];

export const BALAD_BY_CODE: Record<string, BaladCountry> = Object.fromEntries(BALAD_COUNTRIES.map((c) => [c.code, c]));

/* ------------------------------------------------------------------ */
/* Tolerant matching                                                   */
/* ------------------------------------------------------------------ */

/** Letters only, hamza shapes and ة/ى folded, no vowel marks; words kept apart by one space. */
function fold(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[یې]/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/[^ء-ي ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words people add in front of a name («دولة قطر»، «جمهورية مصر»). */
const LEAD = new Set(['دوله', 'جمهوريه', 'بلد', 'بلاد']);

/**
 * The spellings a text is compared by: with and without «ال» on each word (so «البانيا» and «ألبانيا»
 * meet, and «الأردن» = «أردن»), spaces dropped, and without a leading «دولة / جمهورية».
 */
export function baladForms(text: string): string[] {
  let words = fold(text).split(' ').filter(Boolean);
  if (words.length > 1 && LEAD.has(words[0])) words = words.slice(1);
  if (!words.length) return [];
  const bare = words.map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w)).join('');
  const whole = words.join('');
  // «و» joining two names («البوسنة والهرسك») is part of the second word: drop its «ال» too
  const joined = words.map((w) => (w.startsWith('وال') && w.length > 4 ? `و${w.slice(3)}` : w)).map((w) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w)).join('');
  return [...new Set([bare, whole, joined])];
}

function editDistance(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[y.length];
}

/** One slip allowed from 4 letters, two from 8: «فنزولا»، «الأرجنتيين»… */
const slack = (n: number) => (n >= 8 ? 2 : n >= 4 ? 1 : 0);

const FORMS: { code: string; forms: string[] }[] = BALAD_COUNTRIES.map((c) => ({
  code: c.code,
  forms: [...new Set([c.name, ...c.aliases].flatMap(baladForms))],
}));

/**
 * The country a typed guess names (its code), or null when it names none of them clearly: an exact
 * spelling (name or alias, see baladForms) first, else the one country within a slip or two of it —
 * never a guess that is as close to two countries.
 */
export function matchCountry(text: string): string | null {
  const typed = baladForms(text);
  if (!typed.length || typed.every((t) => [...t].length < 2)) return null;
  for (const c of FORMS) if (c.forms.some((f) => typed.includes(f))) return c.code;
  let best = Infinity;
  let found: string[] = [];
  for (const c of FORMS) {
    let d = Infinity;
    for (const f of c.forms) {
      const room = slack([...f].length);
      if (!room) continue;
      for (const t of typed) {
        const e = editDistance(t, f);
        if (e <= room) d = Math.min(d, e);
      }
    }
    if (d < best) {
      best = d;
      found = [c.code];
    } else if (d === best && d < Infinity && !found.includes(c.code)) found.push(c.code);
  }
  return found.length === 1 ? found[0] : null;
}

/**
 * Suggestions while typing: the countries of `pool` whose name or alias starts with what is typed (or
 * contains it), then those within a slip of it; at most `limit`, by their shown name.
 */
export function suggestCountries(text: string, pool: readonly string[], limit = 6): string[] {
  const typed = baladForms(text);
  if (!typed.length) return [];
  const inPool = FORMS.filter((c) => pool.includes(c.code));
  const starts: string[] = [];
  const contains: string[] = [];
  const near: string[] = [];
  for (const c of inPool) {
    if (c.forms.some((f) => typed.some((t) => f.startsWith(t)))) starts.push(c.code);
    else if (c.forms.some((f) => typed.some((t) => [...t].length >= 2 && f.includes(t)))) contains.push(c.code);
    else if (typed.some((t) => [...t].length >= 3 && c.forms.some((f) => editDistance(t, f.slice(0, t.length)) <= 1))) near.push(c.code);
  }
  return [...starts, ...contains, ...near].slice(0, limit);
}

/** Alphabetical order of the shown names (for the full list). */
export function byName(codes: readonly string[]): string[] {
  return [...codes].sort((x, y) => fold(BALAD_BY_CODE[x]?.name ?? x).replace(/^ال/, '').localeCompare(fold(BALAD_BY_CODE[y]?.name ?? y).replace(/^ال/, ''), 'ar'));
}
