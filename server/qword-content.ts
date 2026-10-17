/**
 * «كلمة قرآنية» — the hidden words: 5 letters once normalised (normWord), hand-picked from the words of the
 * Quran (server/data/quran-full.json, see qword-words.ts) among those families know: prophets and people
 * the Quran names, surah names, places, Names of Allah, animals, plants, nature and common Quranic nouns.
 * `word` is how the word is shown (today's spelling); `ref` optionally picks the verse shown after the round
 * (otherwise the first short verse where the word appears).
 */

export type QwordCat = 'prophet' | 'person' | 'surah' | 'place' | 'name' | 'animal' | 'plant' | 'nature' | 'word';

export const QWORD_CAT_LABEL: Record<QwordCat, string> = {
  prophet: 'اسم نبي',
  person: 'شخصية ذكرها القرآن',
  surah: 'اسم سورة',
  place: 'مكان',
  name: 'من أسماء الله الحسنى',
  animal: 'حيوان',
  plant: 'نبات أو ثمر',
  nature: 'من الكون والطبيعة',
  word: 'كلمة من القرآن',
};

export interface QwordEntry {
  word: string;
  cat: QwordCat;
  /** the verse shown after the round: [surah, ayah] */
  ref?: [number, number];
}

/**
 * Verses chosen by hand: the surah a name comes from, or the verse where the word has the meaning meant here
 * (the same letters can be another word: «الذكر» the Reminder, not «الذَّكَر» the male; «العليّ», not «العُلى»).
 */
const REFS: Record<string, [number, number]> = {
  البلد: [90, 1],
  العلي: [42, 4],
  الذكر: [15, 9],
  الأول: [57, 3],
  الملك: [67, 1],
  النجم: [53, 1],
  القمر: [54, 1],
  الفجر: [89, 1],
  الشمس: [91, 1],
  الليل: [92, 1],
  الفتح: [110, 1],
  الناس: [114, 1],
  الخيل: [16, 8],
};

const list = (cat: QwordCat, words: string) =>
  words
    .split(/\s+/)
    .filter(Boolean)
    .map((word): QwordEntry => (REFS[word] ? { word, cat, ref: REFS[word] } : { word, cat }));

export const QWORD_ANSWERS: QwordEntry[] = [
  ...list('prophet', 'إسحاق يعقوب زكريا إدريس هارون إلياس اليسع'),
  ...list('person', 'لقمان فرعون قارون هامان جالوت طالوت عمران جبريل ميكال إبليس هاروت يأجوج مأجوج'),
  ...list('surah', 'الرعد الحجر النحل الكهف النور النمل القصص الروم الفتح النجم القمر الحشر الملك القلم النبأ الفجر البلد الشمس الليل الضحى التين العصر الفيل الفلق الناس القدر النصر'),
  ...list('place', 'سيناء عرفات الصفا الطور البيت الجنة النار السجن'),
  ...list('name', 'الولي الغني العلي الأول الصمد القوي'),
  ...list('animal', 'بعوضة ثعبان الحوت الطير العجل البقر الإبل الخيل الكلب الضأن المعز أنعام'),
  ...list('plant', 'يقطين زيتون أعناب فاكهة سنابل سنبلة النخل الزرع حدائق ثمرات كافور'),
  ...list('nature', 'الأرض البحر الجبل الريح الماء الصبح البرق الطين حجارة صلصال رواسي ظلمات أنهار الصيف'),
  ...list(
    'word',
    'خليفة رمضان ميثاق شفاعة سكينة موعظة مغفرة برهان سلطان إيمان إحسان فرقان شهادة عاقبة مثقال أقلام ملكوت مساجد صلوات رسالة شهداء قربان أسباط أبواب أموال أزواج إخوان أبناء فقراء يتامى بنيان دراهم بضاعة قنطار مصباح زجاجة سفينة الحمد الذكر الهدى الخير العلم النبي الصبر العدل تجارة درجات رضوان ميراث كلمات تنزيل سبحان طيبات تذكرة الفوز الرزق الخلد العفو الرشد العسر اليسر القسط الغيب الروح السمع البصر الشهر الصور المهد الفلك العرش',
  ),
];
