/**
 * «مسابقة التجويد» — the examples. Every example points at a verse in quran-data.json by [surah, ayah] and
 * the index of the first coloured word (`w`, counted from 0 on the verse split by spaces) and how many words
 * are coloured (`n`, default 1). The Quran text itself is never typed here: the comments after each line were
 * copied from quran-data.json by a script, only to make the list easy to review.
 *
 * All examples follow رواية حفص عن عاصم, and each was checked by hand (and by a script reading the Uthmani
 * marks) so that only ONE rule of its topic applies to the coloured spot:
 * - noon: exactly one نون ساكنة / تنوين in the coloured words, and the letter after it decides the rule;
 * - meem: exactly one ميم ساكنة;
 * - madd: exactly one madd in the word (no مدّ بدل / صلة / لين / عوض nearby);
 * - qalqala: صغرى = a sakin qalqala letter inside a word in the middle of the verse; كبرى = the last letter of
 *   the verse (stopping makes it sakin), not doubled;
 * - jalala: the vowel before the lam of «الله» (on a prefix or the end of the previous word);
 * - lam: لام التعريف followed by a sun or a moon letter.
 */
import type { TajweedTopic } from '../src/shared/games/tajweed';

export const TAJWEED_RULES: Record<TajweedTopic, { key: string; label: string }[]> = {
  noon: [
    { key: 'izhar', label: 'إظهار حلقي' },
    { key: 'idgham_g', label: 'إدغام بغنة' },
    { key: 'idgham_n', label: 'إدغام بغير غنة' },
    { key: 'iqlab', label: 'إقلاب' },
    { key: 'ikhfa', label: 'إخفاء حقيقي' },
  ],
  meem: [
    { key: 'ikhfa_sh', label: 'إخفاء شفوي' },
    { key: 'idgham_sh', label: 'إدغام شفوي' },
    { key: 'izhar_sh', label: 'إظهار شفوي' },
  ],
  madd: [
    { key: 'tabii', label: 'مدّ طبيعي' },
    { key: 'muttasil', label: 'مدّ متصل' },
    { key: 'munfasil', label: 'مدّ منفصل' },
    { key: 'lazim', label: 'مدّ لازم' },
    { key: 'arid', label: 'مدّ عارض للسكون' },
  ],
  qalqala: [
    { key: 'sughra', label: 'قلقلة صغرى' },
    { key: 'kubra', label: 'قلقلة كبرى' },
  ],
  jalala: [
    { key: 'tafkhim', label: 'تفخيم' },
    { key: 'tarqiq', label: 'ترقيق' },
  ],
  lam: [
    { key: 'shamsi', label: 'لام شمسية' },
    { key: 'qamari', label: 'لام قمرية' },
  ],
};

export interface TajweedExample {
  topic: TajweedTopic;
  /** a key of TAJWEED_RULES[topic] */
  rule: string;
  s: number;
  a: number;
  /** first coloured word (0-based) */
  w: number;
  /** coloured words (default 1) */
  n?: number;
  /** one line: why this rule */
  why: string;
}

export const TAJWEED_EXAMPLES: TajweedExample[] = [
  // noon
  { topic: 'noon', rule: 'izhar', s: 101, a: 8, w: 1, n: 2, why: 'نون ساكنة بعدها خاء ⇐ إظهار حلقي' }, // مَنۡ خَفَّتۡ
  { topic: 'noon', rule: 'izhar', s: 97, a: 5, w: 0, n: 2, why: 'تنوين بعده هاء ⇐ إظهار حلقي' }, // سَلَٰمٌ هِيَ
  { topic: 'noon', rule: 'izhar', s: 93, a: 10, w: 3, why: 'نون ساكنة بعدها هاء ⇐ إظهار حلقي' }, // تَنۡهَرۡ
  { topic: 'noon', rule: 'izhar', s: 113, a: 3, w: 2, n: 2, why: 'تنوين بعده همزة ⇐ إظهار حلقي' }, // غَاسِقٍ إِذَا
  { topic: 'noon', rule: 'izhar', s: 92, a: 5, w: 1, n: 2, why: 'نون ساكنة بعدها همزة ⇐ إظهار حلقي' }, // مَنۡ أَعۡطَىٰ
  { topic: 'noon', rule: 'izhar', s: 80, a: 34, w: 3, n: 2, why: 'نون ساكنة بعدها همزة ⇐ إظهار حلقي' }, // مِنۡ أَخِيهِ
  { topic: 'noon', rule: 'izhar', s: 111, a: 2, w: 2, why: 'نون ساكنة بعدها هاء ⇐ إظهار حلقي' }, // عَنۡهُ
  { topic: 'noon', rule: 'idgham_g', s: 99, a: 7, w: 0, n: 2, why: 'نون ساكنة بعدها ياء ⇐ إدغام بغنة' }, // فَمَن يَعۡمَلۡ
  { topic: 'noon', rule: 'idgham_g', s: 99, a: 7, w: 4, n: 2, why: 'تنوين بعده ياء ⇐ إدغام بغنة' }, // خَيۡرٗا يَرَهُۥ
  { topic: 'noon', rule: 'idgham_g', s: 78, a: 30, w: 1, n: 2, why: 'نون ساكنة بعدها نون ⇐ إدغام بغنة' }, // فَلَن نَّزِيدَكُمۡ
  { topic: 'noon', rule: 'idgham_g', s: 85, a: 20, w: 1, n: 2, why: 'نون ساكنة بعدها واو ⇐ إدغام بغنة' }, // مِن وَرَآئِهِم
  { topic: 'noon', rule: 'idgham_g', s: 109, a: 4, w: 2, n: 2, why: 'تنوين بعده ميم ⇐ إدغام بغنة' }, // عَابِدٞ مَّا
  { topic: 'noon', rule: 'idgham_g', s: 111, a: 1, w: 3, n: 2, why: 'تنوين بعده واو ⇐ إدغام بغنة' }, // لَهَبٖ وَتَبَّ
  { topic: 'noon', rule: 'idgham_n', s: 112, a: 4, w: 1, n: 2, why: 'نون ساكنة بعدها لام ⇐ إدغام بغير غنة' }, // يَكُن لَّهُۥ
  { topic: 'noon', rule: 'idgham_n', s: 104, a: 1, w: 0, n: 2, why: 'تنوين بعده لام ⇐ إدغام بغير غنة' }, // وَيۡلٞ لِّكُلِّ
  { topic: 'noon', rule: 'idgham_n', s: 78, a: 36, w: 1, n: 2, why: 'نون ساكنة بعدها راء ⇐ إدغام بغير غنة' }, // مِّن رَّبِّكَ
  { topic: 'noon', rule: 'idgham_n', s: 93, a: 4, w: 1, n: 2, why: 'تنوين بعده لام ⇐ إدغام بغير غنة' }, // خَيۡرٞ لَّكَ
  { topic: 'noon', rule: 'idgham_n', s: 2, a: 2, w: 5, n: 2, why: 'تنوين بعده لام ⇐ إدغام بغير غنة' }, // هُدٗى لِّلۡمُتَّقِينَ
  { topic: 'noon', rule: 'idgham_n', s: 83, a: 15, w: 2, n: 2, why: 'نون ساكنة بعدها راء ⇐ إدغام بغير غنة' }, // عَن رَّبِّهِمۡ
  { topic: 'noon', rule: 'iqlab', s: 86, a: 7, w: 1, n: 2, why: 'نون ساكنة بعدها باء ⇐ إقلاب' }, // مِنۢ بَيۡنِ
  { topic: 'noon', rule: 'iqlab', s: 92, a: 8, w: 1, n: 2, why: 'نون ساكنة بعدها باء ⇐ إقلاب' }, // مَنۢ بَخِلَ
  { topic: 'noon', rule: 'iqlab', s: 98, a: 4, w: 6, n: 2, why: 'نون ساكنة بعدها باء ⇐ إقلاب' }, // مِنۢ بَعۡدِ
  { topic: 'noon', rule: 'iqlab', s: 104, a: 4, w: 1, why: 'نون ساكنة بعدها باء ⇐ إقلاب' }, // لَيُنۢبَذَنَّ
  { topic: 'noon', rule: 'iqlab', s: 90, a: 2, w: 1, n: 2, why: 'تنوين بعده باء ⇐ إقلاب' }, // حِلُّۢ بِهَٰذَا
  { topic: 'noon', rule: 'iqlab', s: 91, a: 14, w: 5, why: 'نون ساكنة بعدها باء ⇐ إقلاب' }, // بِذَنۢبِهِمۡ
  { topic: 'noon', rule: 'ikhfa', s: 113, a: 2, w: 0, n: 2, why: 'نون ساكنة بعدها شين ⇐ إخفاء حقيقي' }, // مِن شَرِّ
  { topic: 'noon', rule: 'ikhfa', s: 2, a: 4, w: 7, n: 2, why: 'نون ساكنة بعدها قاف ⇐ إخفاء حقيقي' }, // مِن قَبۡلِكَ
  { topic: 'noon', rule: 'ikhfa', s: 2, a: 3, w: 7, why: 'نون ساكنة بعدها فاء ⇐ إخفاء حقيقي' }, // يُنفِقُونَ
  { topic: 'noon', rule: 'ikhfa', s: 91, a: 9, w: 2, n: 2, why: 'نون ساكنة بعدها زاي ⇐ إخفاء حقيقي' }, // مَن زَكَّىٰهَا
  { topic: 'noon', rule: 'ikhfa', s: 85, a: 11, w: 6, n: 2, why: 'تنوين بعده تاء ⇐ إخفاء حقيقي' }, // جَنَّـٰتٞ تَجۡرِي
  { topic: 'noon', rule: 'ikhfa', s: 97, a: 4, w: 6, n: 2, why: 'نون ساكنة بعدها كاف ⇐ إخفاء حقيقي' }, // مِّن كُلِّ
  { topic: 'noon', rule: 'ikhfa', s: 109, a: 3, w: 1, why: 'نون ساكنة بعدها تاء ⇐ إخفاء حقيقي' }, // أَنتُمۡ
  // meem
  { topic: 'meem', rule: 'ikhfa_sh', s: 105, a: 4, w: 0, n: 2, why: 'ميم ساكنة بعدها باء ⇐ إخفاء شفوي' }, // تَرۡمِيهِم بِحِجَارَةٖ
  { topic: 'meem', rule: 'ikhfa_sh', s: 96, a: 14, w: 1, n: 2, why: 'ميم ساكنة بعدها باء ⇐ إخفاء شفوي' }, // يَعۡلَم بِأَنَّ
  { topic: 'meem', rule: 'ikhfa_sh', s: 2, a: 8, w: 9, n: 2, why: 'ميم ساكنة بعدها باء ⇐ إخفاء شفوي' }, // هُم بِمُؤۡمِنِينَ
  { topic: 'meem', rule: 'ikhfa_sh', s: 18, a: 5, w: 1, n: 2, why: 'ميم ساكنة بعدها باء ⇐ إخفاء شفوي' }, // لَهُم بِهِۦ
  { topic: 'meem', rule: 'ikhfa_sh', s: 61, a: 4, w: 8, n: 2, why: 'ميم ساكنة بعدها باء ⇐ إخفاء شفوي' }, // كَأَنَّهُم بُنۡيَٰنٞ
  { topic: 'meem', rule: 'ikhfa_sh', s: 67, a: 12, w: 3, n: 2, why: 'ميم ساكنة بعدها باء ⇐ إخفاء شفوي' }, // رَبَّهُم بِٱلۡغَيۡبِ
  { topic: 'meem', rule: 'idgham_sh', s: 106, a: 4, w: 1, n: 2, why: 'ميم ساكنة بعدها ميم ⇐ إدغام شفوي (مِثلين صغير)' }, // أَطۡعَمَهُم مِّن
  { topic: 'meem', rule: 'idgham_sh', s: 97, a: 4, w: 5, n: 2, why: 'ميم ساكنة بعدها ميم ⇐ إدغام شفوي (مِثلين صغير)' }, // رَبِّهِم مِّن
  { topic: 'meem', rule: 'idgham_sh', s: 83, a: 4, w: 3, n: 2, why: 'ميم ساكنة بعدها ميم ⇐ إدغام شفوي (مِثلين صغير)' }, // أَنَّهُم مَّبۡعُوثُونَ
  { topic: 'meem', rule: 'idgham_sh', s: 2, a: 10, w: 1, n: 2, why: 'ميم ساكنة بعدها ميم ⇐ إدغام شفوي (مِثلين صغير)' }, // قُلُوبِهِم مَّرَضٞ
  { topic: 'meem', rule: 'idgham_sh', s: 36, a: 13, w: 1, n: 2, why: 'ميم ساكنة بعدها ميم ⇐ إدغام شفوي (مِثلين صغير)' }, // لَهُم مَّثَلًا
  { topic: 'meem', rule: 'idgham_sh', s: 83, a: 14, w: 4, n: 2, why: 'ميم ساكنة بعدها ميم ⇐ إدغام شفوي (مِثلين صغير)' }, // قُلُوبِهِم مَّا
  { topic: 'meem', rule: 'izhar_sh', s: 1, a: 7, w: 3, n: 2, why: 'ميم ساكنة بعدها غين ⇐ إظهار شفوي' }, // عَلَيۡهِمۡ غَيۡرِ
  { topic: 'meem', rule: 'izhar_sh', s: 2, a: 4, w: 10, n: 2, why: 'ميم ساكنة بعدها ياء ⇐ إظهار شفوي' }, // هُمۡ يُوقِنُونَ
  { topic: 'meem', rule: 'izhar_sh', s: 94, a: 1, w: 0, n: 2, why: 'ميم ساكنة بعدها نون ⇐ إظهار شفوي' }, // أَلَمۡ نَشۡرَحۡ
  { topic: 'meem', rule: 'izhar_sh', s: 1, a: 2, w: 0, why: 'ميم ساكنة بعدها دال ⇐ إظهار شفوي' }, // ٱلۡحَمۡدُ
  { topic: 'meem', rule: 'izhar_sh', s: 91, a: 14, w: 5, n: 2, why: 'ميم ساكنة بعدها فاء ⇐ إظهار شفوي' }, // بِذَنۢبِهِمۡ فَسَوَّىٰهَا
  { topic: 'meem', rule: 'izhar_sh', s: 2, a: 7, w: 3, n: 2, why: 'ميم ساكنة بعدها واو ⇐ إظهار شفوي' }, // قُلُوبِهِمۡ وَعَلَىٰ
  // madd
  { topic: 'madd', rule: 'tabii', s: 1, a: 1, w: 2, why: 'حرف مدّ ليس بعده همز ولا سكون ⇐ مدّ طبيعي (حركتان)' }, // ٱلرَّحۡمَٰنِ
  { topic: 'madd', rule: 'tabii', s: 1, a: 7, w: 0, why: 'حرف مدّ ليس بعده همز ولا سكون ⇐ مدّ طبيعي (حركتان)' }, // صِرَٰطَ
  { topic: 'madd', rule: 'tabii', s: 1, a: 7, w: 5, why: 'حرف مدّ ليس بعده همز ولا سكون ⇐ مدّ طبيعي (حركتان)' }, // ٱلۡمَغۡضُوبِ
  { topic: 'madd', rule: 'tabii', s: 2, a: 8, w: 3, why: 'حرف مدّ ليس بعده همز ولا سكون ⇐ مدّ طبيعي (حركتان)' }, // يَقُولُ
  { topic: 'madd', rule: 'tabii', s: 101, a: 5, w: 1, why: 'حرف مدّ ليس بعده همز ولا سكون ⇐ مدّ طبيعي (حركتان)' }, // ٱلۡجِبَالُ
  { topic: 'madd', rule: 'tabii', s: 105, a: 4, w: 1, why: 'حرف مدّ ليس بعده همز ولا سكون ⇐ مدّ طبيعي (حركتان)' }, // بِحِجَارَةٖ
  { topic: 'madd', rule: 'muttasil', s: 110, a: 1, w: 1, why: 'حرف مدّ بعده همزة في الكلمة نفسها ⇐ مدّ متصل' }, // جَآءَ
  { topic: 'madd', rule: 'muttasil', s: 2, a: 19, w: 3, why: 'حرف مدّ بعده همزة في الكلمة نفسها ⇐ مدّ متصل' }, // ٱلسَّمَآءِ
  { topic: 'madd', rule: 'muttasil', s: 106, a: 2, w: 2, why: 'حرف مدّ بعده همزة في الكلمة نفسها ⇐ مدّ متصل' }, // ٱلشِّتَآءِ
  { topic: 'madd', rule: 'muttasil', s: 98, a: 5, w: 8, why: 'حرف مدّ بعده همزة في الكلمة نفسها ⇐ مدّ متصل' }, // حُنَفَآءَ
  { topic: 'madd', rule: 'muttasil', s: 80, a: 8, w: 2, why: 'حرف مدّ بعده همزة في الكلمة نفسها ⇐ مدّ متصل' }, // جَآءَكَ
  { topic: 'madd', rule: 'muttasil', s: 93, a: 10, w: 1, why: 'حرف مدّ بعده همزة في الكلمة نفسها ⇐ مدّ متصل' }, // ٱلسَّآئِلَ
  { topic: 'madd', rule: 'munfasil', s: 2, a: 4, w: 2, why: 'حرف مدّ في آخر الكلمة والهمزة في أول التي تليها ⇐ مدّ منفصل' }, // بِمَآ
  { topic: 'madd', rule: 'munfasil', s: 97, a: 1, w: 0, why: 'حرف مدّ في آخر الكلمة والهمزة في أول التي تليها ⇐ مدّ منفصل' }, // إِنَّآ
  { topic: 'madd', rule: 'munfasil', s: 111, a: 1, w: 1, why: 'حرف مدّ في آخر الكلمة والهمزة في أول التي تليها ⇐ مدّ منفصل' }, // يَدَآ
  { topic: 'madd', rule: 'munfasil', s: 109, a: 2, w: 0, why: 'حرف مدّ في آخر الكلمة والهمزة في أول التي تليها ⇐ مدّ منفصل' }, // لَآ
  { topic: 'madd', rule: 'munfasil', s: 97, a: 2, w: 0, why: 'حرف مدّ في آخر الكلمة والهمزة في أول التي تليها ⇐ مدّ منفصل' }, // وَمَآ
  { topic: 'madd', rule: 'munfasil', s: 106, a: 4, w: 0, why: 'حرف مدّ في آخر الكلمة والهمزة في أول التي تليها ⇐ مدّ منفصل' }, // ٱلَّذِيٓ
  { topic: 'madd', rule: 'lazim', s: 38, a: 1, w: 0, why: 'حرف «صاد» يُنطق بثلاثة أحرف أوسطها حرف مدّ ⇐ مدّ لازم حرفي' }, // صٓۚ
  { topic: 'madd', rule: 'lazim', s: 68, a: 1, w: 0, why: 'حرف «نون» يُنطق بثلاثة أحرف أوسطها حرف مدّ ⇐ مدّ لازم حرفي' }, // نٓۚ
  { topic: 'madd', rule: 'lazim', s: 79, a: 34, w: 2, why: 'حرف مدّ بعده حرف مشدّد في الكلمة نفسها ⇐ مدّ لازم' }, // ٱلطَّآمَّةُ
  { topic: 'madd', rule: 'lazim', s: 69, a: 3, w: 3, why: 'حرف مدّ بعده حرف مشدّد في الكلمة نفسها ⇐ مدّ لازم' }, // ٱلۡحَآقَّةُ
  { topic: 'madd', rule: 'lazim', s: 6, a: 38, w: 2, why: 'حرف مدّ بعده حرف مشدّد في الكلمة نفسها ⇐ مدّ لازم' }, // دَآبَّةٖ
  { topic: 'madd', rule: 'lazim', s: 2, a: 208, w: 6, why: 'حرف مدّ بعده حرف مشدّد في الكلمة نفسها ⇐ مدّ لازم' }, // كَآفَّةٗ
  { topic: 'madd', rule: 'arid', s: 1, a: 1, w: 3, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // ٱلرَّحِيمِ
  { topic: 'madd', rule: 'arid', s: 1, a: 5, w: 3, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // نَسۡتَعِينُ
  { topic: 'madd', rule: 'arid', s: 105, a: 1, w: 6, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // ٱلۡفِيلِ
  { topic: 'madd', rule: 'arid', s: 114, a: 1, w: 3, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // ٱلنَّاسِ
  { topic: 'madd', rule: 'arid', s: 102, a: 8, w: 4, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // ٱلنَّعِيمِ
  { topic: 'madd', rule: 'arid', s: 109, a: 2, w: 3, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // تَعۡبُدُونَ
  { topic: 'madd', rule: 'arid', s: 101, a: 4, w: 4, why: 'حرف مدّ بعده حرف سُكّن للوقف في آخر الآية ⇐ مدّ عارض للسكون' }, // ٱلۡمَبۡثُوثِ
  // qalqala
  { topic: 'qalqala', rule: 'sughra', s: 96, a: 1, w: 0, why: 'حرف قاف ساكن في وسط الكلمة ⇐ قلقلة صغرى' }, // ٱقۡرَأۡ
  { topic: 'qalqala', rule: 'sughra', s: 97, a: 3, w: 1, why: 'حرف دال ساكن في وسط الكلمة ⇐ قلقلة صغرى' }, // ٱلۡقَدۡرِ
  { topic: 'qalqala', rule: 'sughra', s: 97, a: 5, w: 3, why: 'حرف طاء ساكن في وسط الكلمة ⇐ قلقلة صغرى' }, // مَطۡلَعِ
  { topic: 'qalqala', rule: 'sughra', s: 111, a: 5, w: 2, why: 'حرف باء ساكن في وسط الكلمة ⇐ قلقلة صغرى' }, // حَبۡلٞ
  { topic: 'qalqala', rule: 'sughra', s: 110, a: 2, w: 2, why: 'حرف دال ساكن في وسط الكلمة ⇐ قلقلة صغرى' }, // يَدۡخُلُونَ
  { topic: 'qalqala', rule: 'sughra', s: 95, a: 4, w: 1, why: 'حرف قاف ساكن في وسط الكلمة ⇐ قلقلة صغرى' }, // خَلَقۡنَا
  { topic: 'qalqala', rule: 'kubra', s: 113, a: 1, w: 3, why: 'حرف قاف في آخر الآية يُسكَّن عند الوقف ⇐ قلقلة كبرى' }, // ٱلۡفَلَقِ
  { topic: 'qalqala', rule: 'kubra', s: 112, a: 1, w: 3, why: 'حرف دال في آخر الآية يُسكَّن عند الوقف ⇐ قلقلة كبرى' }, // أَحَدٌ
  { topic: 'qalqala', rule: 'kubra', s: 113, a: 3, w: 4, why: 'حرف باء في آخر الآية يُسكَّن عند الوقف ⇐ قلقلة كبرى' }, // وَقَبَ
  { topic: 'qalqala', rule: 'kubra', s: 113, a: 5, w: 4, why: 'حرف دال في آخر الآية يُسكَّن عند الوقف ⇐ قلقلة كبرى' }, // حَسَدَ
  { topic: 'qalqala', rule: 'kubra', s: 111, a: 2, w: 5, why: 'حرف باء في آخر الآية يُسكَّن عند الوقف ⇐ قلقلة كبرى' }, // كَسَبَ
  { topic: 'qalqala', rule: 'kubra', s: 90, a: 1, w: 3, why: 'حرف دال في آخر الآية يُسكَّن عند الوقف ⇐ قلقلة كبرى' }, // ٱلۡبَلَدِ
  // jalala
  { topic: 'jalala', rule: 'tafkhim', s: 112, a: 1, w: 1, n: 2, why: 'لام لفظ الجلالة بعد فتح ⇐ تفخيم' }, // هُوَ ٱللَّهُ
  { topic: 'jalala', rule: 'tafkhim', s: 110, a: 1, w: 2, n: 2, why: 'لام لفظ الجلالة بعد ضمّ ⇐ تفخيم' }, // نَصۡرُ ٱللَّهِ
  { topic: 'jalala', rule: 'tafkhim', s: 91, a: 13, w: 2, n: 2, why: 'لام لفظ الجلالة بعد ضمّ ⇐ تفخيم' }, // رَسُولُ ٱللَّهِ
  { topic: 'jalala', rule: 'tafkhim', s: 84, a: 23, w: 0, why: 'لام لفظ الجلالة بعد فتح ⇐ تفخيم' }, // وَٱللَّهُ
  { topic: 'jalala', rule: 'tafkhim', s: 2, a: 7, w: 0, n: 2, why: 'لام لفظ الجلالة بعد فتح ⇐ تفخيم' }, // خَتَمَ ٱللَّهُ
  { topic: 'jalala', rule: 'tafkhim', s: 96, a: 14, w: 2, n: 2, why: 'لام لفظ الجلالة بعد فتح ⇐ تفخيم' }, // بِأَنَّ ٱللَّهَ
  { topic: 'jalala', rule: 'tafkhim', s: 98, a: 2, w: 1, n: 2, why: 'لام لفظ الجلالة بعد فتح ⇐ تفخيم' }, // مِّنَ ٱللَّهِ
  { topic: 'jalala', rule: 'tarqiq', s: 1, a: 1, w: 0, n: 2, why: 'لام لفظ الجلالة بعد كسر ⇐ ترقيق' }, // بِسۡمِ ٱللَّهِ
  { topic: 'jalala', rule: 'tarqiq', s: 1, a: 2, w: 1, why: 'لام لفظ الجلالة بعد كسر ⇐ ترقيق' }, // لِلَّهِ
  { topic: 'jalala', rule: 'tarqiq', s: 110, a: 2, w: 4, n: 2, why: 'لام لفظ الجلالة بعد كسر ⇐ ترقيق' }, // دِينِ ٱللَّهِ
  { topic: 'jalala', rule: 'tarqiq', s: 85, a: 8, w: 6, why: 'لام لفظ الجلالة بعد كسر ⇐ ترقيق' }, // بِٱللَّهِ
  { topic: 'jalala', rule: 'tarqiq', s: 2, a: 23, w: 15, n: 2, why: 'لام لفظ الجلالة بعد كسر ⇐ ترقيق' }, // دُونِ ٱللَّهِ
  { topic: 'jalala', rule: 'tarqiq', s: 82, a: 19, w: 8, why: 'لام لفظ الجلالة بعد كسر ⇐ ترقيق' }, // لِّلَّهِ
  // lam
  { topic: 'lam', rule: 'shamsi', s: 101, a: 4, w: 2, why: 'بعد لام التعريف نون ⇐ لام شمسية: تُدغم ولا تُنطق' }, // ٱلنَّاسُ
  { topic: 'lam', rule: 'shamsi', s: 78, a: 19, w: 1, why: 'بعد لام التعريف سين ⇐ لام شمسية: تُدغم ولا تُنطق' }, // ٱلسَّمَآءُ
  { topic: 'lam', rule: 'shamsi', s: 97, a: 4, w: 2, why: 'بعد لام التعريف راء ⇐ لام شمسية: تُدغم ولا تُنطق' }, // وَٱلرُّوحُ
  { topic: 'lam', rule: 'shamsi', s: 103, a: 3, w: 8, why: 'بعد لام التعريف صاد ⇐ لام شمسية: تُدغم ولا تُنطق' }, // بِٱلصَّبۡرِ
  { topic: 'lam', rule: 'shamsi', s: 89, a: 19, w: 1, why: 'بعد لام التعريف تاء ⇐ لام شمسية: تُدغم ولا تُنطق' }, // ٱلتُّرَاثَ
  { topic: 'lam', rule: 'shamsi', s: 92, a: 3, w: 2, why: 'بعد لام التعريف ذال ⇐ لام شمسية: تُدغم ولا تُنطق' }, // ٱلذَّكَرَ
  { topic: 'lam', rule: 'shamsi', s: 82, a: 17, w: 4, why: 'بعد لام التعريف دال ⇐ لام شمسية: تُدغم ولا تُنطق' }, // ٱلدِّينِ
  { topic: 'lam', rule: 'qamari', s: 1, a: 2, w: 0, why: 'بعد لام التعريف حاء ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡحَمۡدُ
  { topic: 'lam', rule: 'qamari', s: 78, a: 20, w: 1, why: 'بعد لام التعريف جيم ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡجِبَالُ
  { topic: 'lam', rule: 'qamari', s: 79, a: 41, w: 1, why: 'بعد لام التعريف جيم ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡجَنَّةَ
  { topic: 'lam', rule: 'qamari', s: 81, a: 20, w: 4, why: 'بعد لام التعريف عين ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡعَرۡشِ
  { topic: 'lam', rule: 'qamari', s: 82, a: 6, w: 5, why: 'بعد لام التعريف كاف ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡكَرِيمِ
  { topic: 'lam', rule: 'qamari', s: 78, a: 6, w: 2, why: 'بعد لام التعريف همزة ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡأَرۡضَ
  { topic: 'lam', rule: 'qamari', s: 79, a: 40, w: 8, why: 'بعد لام التعريف هاء ⇐ لام قمرية: تُظهر وتُنطق' }, // ٱلۡهَوَىٰ
];
