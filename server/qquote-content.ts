/**
 * «من القائل؟» — words the Quran reports someone saying. Each entry points to a verse (surah:ayah) and,
 * when only part of the verse is the quote, to a range of its words (1-based, inclusive). The text itself
 * is always read from server/data/quran-full.json — never typed here.
 *
 * Only speakers named in the verse or its immediate context, and agreed upon, are included; the shown words
 * never contain the speaker's own name. Wrong options are chosen so that none of them said the same words.
 * level: 1 = the best-known stories, 2 = well known, 3 = for those who know the stories in detail.
 */

export interface QquoteEntry {
  surah: number;
  ayah: number;
  /** first word of the quote (1-based); the whole verse when omitted */
  from?: number;
  /** last word of the quote (inclusive); the end of the verse when omitted */
  to?: number;
  speaker: string;
  /** at least 3; 3 of them are shown */
  wrong: string[];
  level: 1 | 2 | 3;
}

/** Speakers, written once so the same person is always spelled the same way. */
export const SP = {
  luqman: 'لقمان',
  yusuf: 'يوسف',
  yaqub: 'يعقوب',
  brothers: 'إخوة يوسف',
  eldest: 'كبير إخوة يوسف',
  azizWife: 'امرأة العزيز',
  women: 'نسوة المدينة',
  king: 'ملك مصر',
  aziz: 'عزيز مصر',
  prisoner: 'أحد صاحبَي يوسف في السجن',
  pharaoh: 'فرعون',
  pharaohWife: 'امرأة فرعون',
  musa: 'موسى',
  harun: 'هارون',
  samiri: 'السامري',
  qarun: 'قارون',
  qarunPeople: 'قوم قارون',
  believer: 'مؤمن آل فرعون',
  magicians: 'سحرة فرعون',
  khidr: 'العبد الصالح (الخضر)',
  israel: 'بنو إسرائيل',
  madyanGirls: 'ابنتا الشيخ الكبير في مدين',
  madyanGirl: 'إحدى ابنتَي الشيخ الكبير في مدين',
  madyanOld: 'الشيخ الكبير في مدين',
  ant: 'النملة',
  hoopoe: 'الهدهد',
  sulayman: 'سليمان',
  bilqis: 'بلقيس ملكة سبأ',
  ifrit: 'عفريت من الجن',
  ibrahim: 'إبراهيم',
  azar: 'آزر أبو إبراهيم',
  ibrahimPeople: 'قوم إبراهيم',
  ibrahimSon: 'ابن إبراهيم (الذبيح)',
  ibrahimIsmail: 'إبراهيم وإسماعيل',
  nuh: 'نوح',
  nuhSon: 'ابن نوح',
  maryam: 'مريم',
  zakariya: 'زكريا',
  isa: 'عيسى',
  disciples: 'الحواريون',
  imranWife: 'امرأة عمران',
  iblis: 'إبليس',
  adamHawwa: 'آدم وحواء',
  angels: 'الملائكة',
  cave: 'أصحاب الكهف',
  dhulqarnayn: 'ذو القرنين',
  gardens: 'صاحب الجنتين',
  hud: 'هود',
  salih: 'صالح',
  shuayb: 'شعيب',
  lut: 'لوط',
  yunus: 'يونس',
  ayyub: 'أيوب',
  talut: 'المؤمنون من جنود طالوت',
  prophet: 'النبي محمد ﷺ',
  yasin: 'الرجل المؤمن في سورة يس',
  dawud: 'داود',
  yahya: 'يحيى',
} as const;

const S = SP;

export const QQUOTES: QquoteEntry[] = [
  // ——— لقمان
  { surah: 31, ayah: 13, from: 7, speaker: S.luqman, wrong: [S.yaqub, S.nuh, S.ibrahim], level: 1 },
  { surah: 31, ayah: 17, speaker: S.luqman, wrong: [S.yaqub, S.zakariya, S.nuh], level: 1 },

  // ——— يوسف
  { surah: 12, ayah: 4, from: 5, speaker: S.yusuf, wrong: [S.ibrahimSon, S.nuhSon, S.brothers], level: 1 },
  { surah: 12, ayah: 5, from: 2, speaker: S.yaqub, wrong: [S.luqman, S.ibrahim, S.nuh], level: 1 },
  { surah: 12, ayah: 8, from: 3, speaker: S.brothers, wrong: [S.women, S.israel, S.ibrahimPeople], level: 2 },
  { surah: 12, ayah: 9, speaker: S.brothers, wrong: [S.pharaoh, S.ibrahimPeople, S.women], level: 1 },
  { surah: 12, ayah: 11, from: 2, speaker: S.brothers, wrong: [S.madyanGirls, S.israel, S.cave], level: 3 },
  { surah: 12, ayah: 13, from: 2, speaker: S.yaqub, wrong: [S.imranWife, S.ibrahim, S.zakariya], level: 2 },
  { surah: 12, ayah: 17, from: 2, speaker: S.brothers, wrong: [S.madyanGirls, S.cave, S.israel], level: 2 },
  { surah: 12, ayah: 18, from: 7, speaker: S.yaqub, wrong: [S.ayyub, S.nuh, S.ibrahim], level: 1 },
  { surah: 12, ayah: 23, from: 14, speaker: S.yusuf, wrong: [S.musa, S.sulayman, S.yahya], level: 2 },
  { surah: 12, ayah: 31, from: 23, speaker: S.women, wrong: [S.azizWife, S.madyanGirls, S.angels], level: 2 },
  { surah: 12, ayah: 32, from: 2, to: 10, speaker: S.azizWife, wrong: [S.bilqis, S.pharaohWife, S.women], level: 3 },
  { surah: 12, ayah: 33, from: 2, speaker: S.yusuf, wrong: [S.musa, S.yunus, S.ayyub], level: 1 },
  { surah: 12, ayah: 36, from: 7, to: 10, speaker: S.prisoner, wrong: [S.king, S.aziz, S.samiri], level: 3 },
  { surah: 12, ayah: 39, speaker: S.yusuf, wrong: [S.ibrahim, S.musa, S.believer], level: 2 },
  { surah: 12, ayah: 43, from: 3, to: 15, speaker: S.king, wrong: [S.pharaoh, S.aziz, S.yaqub], level: 2 },
  { surah: 12, ayah: 21, from: 7, to: 14, speaker: S.aziz, wrong: [S.pharaoh, S.king, S.zakariya], level: 3 },
  { surah: 12, ayah: 51, from: 20, speaker: S.azizWife, wrong: [S.bilqis, S.maryam, S.pharaohWife], level: 1 },
  { surah: 12, ayah: 54, from: 3, to: 6, speaker: S.king, wrong: [S.pharaoh, S.sulayman, S.aziz], level: 3 },
  { surah: 12, ayah: 55, from: 2, speaker: S.yusuf, wrong: [S.sulayman, S.musa, S.dhulqarnayn], level: 2 },
  { surah: 12, ayah: 63, from: 6, speaker: S.brothers, wrong: [S.israel, S.cave, S.madyanGirls], level: 3 },
  { surah: 12, ayah: 77, from: 2, to: 9, speaker: S.brothers, wrong: [S.israel, S.ibrahimPeople, S.qarunPeople], level: 3 },
  { surah: 12, ayah: 80, from: 24, speaker: S.eldest, wrong: [S.harun, S.ibrahimSon, S.nuhSon], level: 3 },
  { surah: 12, ayah: 84, from: 4, to: 6, speaker: S.yaqub, wrong: [S.azizWife, S.king, S.brothers], level: 2 },
  { surah: 12, ayah: 86, from: 2, speaker: S.yaqub, wrong: [S.ayyub, S.zakariya, S.maryam], level: 2 },
  { surah: 12, ayah: 87, speaker: S.yaqub, wrong: [S.ibrahim, S.nuh, S.luqman], level: 2 },
  { surah: 12, ayah: 91, from: 2, speaker: S.brothers, wrong: [S.magicians, S.israel, S.cave], level: 3 },
  { surah: 12, ayah: 92, from: 2, speaker: S.yusuf, wrong: [S.musa, S.sulayman, S.ibrahim], level: 1 },
  { surah: 12, ayah: 94, from: 6, speaker: S.yaqub, wrong: [S.ibrahim, S.zakariya, S.brothers], level: 1 },
  { surah: 12, ayah: 97, from: 2, speaker: S.brothers, wrong: [S.cave, S.disciples, S.israel], level: 2 },
  { surah: 12, ayah: 100, from: 9, to: 18, speaker: S.yusuf, wrong: [S.ibrahimSon, S.madyanGirl, S.nuhSon], level: 2 },
  { surah: 12, ayah: 101, from: 1, to: 9, speaker: S.yusuf, wrong: [S.dhulqarnayn, S.musa, S.zakariya], level: 3 },

  // ——— موسى وفرعون
  { surah: 79, ayah: 24, from: 2, speaker: S.pharaoh, wrong: [S.qarun, S.iblis, S.samiri], level: 1 },
  { surah: 28, ayah: 38, from: 3, to: 10, speaker: S.pharaoh, wrong: [S.qarun, S.king, S.bilqis], level: 2 },
  { surah: 40, ayah: 36, from: 3, speaker: S.pharaoh, wrong: [S.qarun, S.sulayman, S.dhulqarnayn], level: 2 },
  { surah: 10, ayah: 90, from: 15, speaker: S.pharaoh, wrong: [S.magicians, S.bilqis, S.believer], level: 2 },
  { surah: 26, ayah: 18, from: 2, speaker: S.pharaoh, wrong: [S.madyanOld, S.aziz, S.harun], level: 3 },
  { surah: 43, ayah: 51, from: 6, speaker: S.pharaoh, wrong: [S.king, S.qarun, S.aziz], level: 3 },
  { surah: 28, ayah: 9, from: 4, to: 15, speaker: S.pharaohWife, wrong: [S.azizWife, S.imranWife, S.maryam], level: 2 },
  { surah: 66, ayah: 11, from: 10, speaker: S.pharaohWife, wrong: [S.maryam, S.bilqis, S.imranWife], level: 2 },
  { surah: 20, ayah: 25, from: 2, speaker: S.musa, wrong: [S.yunus, S.sulayman, S.zakariya], level: 1 },
  { surah: 20, ayah: 29, speaker: S.musa, wrong: [S.sulayman, S.dhulqarnayn, S.yusuf], level: 3 },
  { surah: 20, ayah: 18, from: 2, speaker: S.musa, wrong: [S.harun, S.salih, S.dawud], level: 1 },
  { surah: 28, ayah: 15, from: 31, speaker: S.musa, wrong: [S.yusuf, S.harun, S.lut], level: 3 },
  { surah: 28, ayah: 22, from: 6, speaker: S.musa, wrong: [S.ibrahim, S.yunus, S.lut], level: 3 },
  { surah: 28, ayah: 23, from: 20, speaker: S.madyanGirls, wrong: [S.women, S.brothers, S.azizWife], level: 3 },
  { surah: 28, ayah: 24, from: 8, speaker: S.musa, wrong: [S.ayyub, S.yunus, S.zakariya], level: 2 },
  { surah: 28, ayah: 25, from: 7, to: 14, speaker: S.madyanGirl, wrong: [S.maryam, S.azizWife, S.bilqis], level: 3 },
  { surah: 28, ayah: 26, from: 3, speaker: S.madyanGirl, wrong: [S.pharaohWife, S.azizWife, S.bilqis], level: 2 },
  { surah: 28, ayah: 27, from: 2, to: 13, speaker: S.madyanOld, wrong: [S.aziz, S.king, S.zakariya], level: 3 },
  { surah: 28, ayah: 34, speaker: S.musa, wrong: [S.yusuf, S.isa, S.ibrahim], level: 3 },
  { surah: 26, ayah: 62, from: 2, speaker: S.musa, wrong: [S.nuh, S.lut, S.hud], level: 1 },
  { surah: 7, ayah: 143, from: 8, to: 11, speaker: S.musa, wrong: [S.isa, S.zakariya, S.yunus], level: 2 },
  { surah: 2, ayah: 67, from: 15, speaker: S.musa, wrong: [S.yusuf, S.lut, S.salih], level: 2 },
  { surah: 2, ayah: 55, from: 3, to: 10, speaker: S.israel, wrong: [S.magicians, S.cave, S.disciples], level: 2 },
  { surah: 2, ayah: 68, from: 2, to: 8, speaker: S.israel, wrong: [S.brothers, S.cave, S.disciples], level: 3 },
  { surah: 7, ayah: 138, from: 13, to: 19, speaker: S.israel, wrong: [S.magicians, S.ibrahimPeople, S.cave], level: 3 },
  { surah: 5, ayah: 24, from: 10, speaker: S.israel, wrong: [S.qarunPeople, S.brothers, S.magicians], level: 2 },
  { surah: 20, ayah: 94, from: 2, to: 7, speaker: S.harun, wrong: [S.yusuf, S.eldest, S.nuhSon], level: 2 },
  { surah: 20, ayah: 96, from: 2, to: 6, speaker: S.samiri, wrong: [S.iblis, S.qarun, S.hoopoe], level: 2 },
  { surah: 28, ayah: 76, from: 23, speaker: S.qarunPeople, wrong: [S.ibrahimPeople, S.magicians, S.angels], level: 3 },
  { surah: 28, ayah: 78, from: 2, to: 6, speaker: S.qarun, wrong: [S.pharaoh, S.samiri, S.gardens], level: 2 },
  { surah: 40, ayah: 28, from: 9, to: 19, speaker: S.believer, wrong: [S.harun, S.yasin, S.magicians], level: 2 },
  { surah: 40, ayah: 44, speaker: S.believer, wrong: [S.harun, S.lut, S.yusuf], level: 3 },
  { surah: 26, ayah: 47, from: 2, speaker: S.magicians, wrong: [S.cave, S.israel, S.angels], level: 2 },
  { surah: 20, ayah: 72, from: 11, speaker: S.magicians, wrong: [S.cave, S.disciples, S.believer], level: 2 },

  // ——— موسى والخضر
  { surah: 18, ayah: 60, from: 5, speaker: S.musa, wrong: [S.dhulqarnayn, S.yunus, S.sulayman], level: 2 },
  { surah: 18, ayah: 66, from: 4, speaker: S.musa, wrong: [S.harun, S.sulayman, S.yusuf], level: 2 },
  { surah: 18, ayah: 67, from: 2, speaker: S.khidr, wrong: [S.luqman, S.dhulqarnayn, S.madyanOld], level: 2 },
  { surah: 18, ayah: 70, from: 2, speaker: S.khidr, wrong: [S.luqman, S.madyanOld, S.dhulqarnayn], level: 3 },
  { surah: 18, ayah: 71, from: 9, speaker: S.musa, wrong: [S.nuh, S.harun, S.yunus], level: 3 },
  { surah: 18, ayah: 73, from: 2, speaker: S.musa, wrong: [S.harun, S.yusuf, S.yunus], level: 3 },

  // ——— سليمان وبلقيس
  { surah: 27, ayah: 18, from: 9, speaker: S.ant, wrong: [S.hoopoe, S.ifrit, S.bilqis], level: 1 },
  { surah: 27, ayah: 20, from: 4, speaker: S.sulayman, wrong: [S.dawud, S.dhulqarnayn, S.musa], level: 2 },
  { surah: 27, ayah: 22, from: 5, speaker: S.hoopoe, wrong: [S.ant, S.ifrit, S.angels], level: 1 },
  { surah: 27, ayah: 23, speaker: S.hoopoe, wrong: [S.ant, S.ifrit, S.sulayman], level: 2 },
  { surah: 27, ayah: 28, speaker: S.sulayman, wrong: [S.bilqis, S.dhulqarnayn, S.yusuf], level: 3 },
  { surah: 27, ayah: 29, from: 2, speaker: S.bilqis, wrong: [S.azizWife, S.pharaoh, S.king], level: 2 },
  { surah: 27, ayah: 34, from: 2, to: 11, speaker: S.bilqis, wrong: [S.pharaoh, S.king, S.hoopoe], level: 3 },
  { surah: 27, ayah: 35, speaker: S.bilqis, wrong: [S.pharaohWife, S.king, S.azizWife], level: 3 },
  { surah: 27, ayah: 39, from: 5, speaker: S.ifrit, wrong: [S.hoopoe, S.iblis, S.samiri], level: 2 },
  { surah: 27, ayah: 40, from: 20, to: 27, speaker: S.sulayman, wrong: [S.qarun, S.gardens, S.dhulqarnayn], level: 2 },
  { surah: 27, ayah: 44, from: 19, speaker: S.bilqis, wrong: [S.pharaohWife, S.maryam, S.azizWife], level: 3 },
  { surah: 38, ayah: 35, from: 2, speaker: S.sulayman, wrong: [S.dhulqarnayn, S.yusuf, S.zakariya], level: 2 },

  // ——— إبراهيم وإسماعيل
  { surah: 6, ayah: 76, from: 13, speaker: S.ibrahim, wrong: [S.nuh, S.musa, S.yusuf], level: 1 },
  { surah: 21, ayah: 63, from: 2, speaker: S.ibrahim, wrong: [S.musa, S.hud, S.salih], level: 1 },
  { surah: 21, ayah: 68, from: 2, speaker: S.ibrahimPeople, wrong: [S.brothers, S.magicians, S.qarunPeople], level: 2 },
  { surah: 19, ayah: 42, from: 4, speaker: S.ibrahim, wrong: [S.yusuf, S.ibrahimSon, S.nuh], level: 3 },
  { surah: 19, ayah: 46, from: 2, speaker: S.azar, wrong: [S.pharaoh, S.ibrahimPeople, S.qarun], level: 3 },
  { surah: 19, ayah: 47, from: 2, speaker: S.ibrahim, wrong: [S.yusuf, S.musa, S.isa], level: 3 },
  { surah: 26, ayah: 80, speaker: S.ibrahim, wrong: [S.ayyub, S.yunus, S.zakariya], level: 2 },
  { surah: 37, ayah: 102, from: 6, to: 15, speaker: S.ibrahim, wrong: [S.yaqub, S.nuh, S.luqman], level: 1 },
  { surah: 37, ayah: 102, from: 17, speaker: S.ibrahimSon, wrong: [S.yusuf, S.nuhSon, S.cave], level: 2 },
  { surah: 37, ayah: 100, speaker: S.ibrahim, wrong: [S.imranWife, S.lut, S.musa], level: 3 },
  { surah: 2, ayah: 127, from: 8, speaker: S.ibrahimIsmail, wrong: [S.adamHawwa, S.madyanGirls, S.cave], level: 2 },
  { surah: 2, ayah: 128, from: 1, to: 9, speaker: S.ibrahimIsmail, wrong: [S.adamHawwa, S.disciples, S.cave], level: 3 },
  { surah: 2, ayah: 258, from: 26, to: 35, speaker: S.ibrahim, wrong: [S.musa, S.nuh, S.yusuf], level: 3 },
  { surah: 2, ayah: 260, from: 4, to: 8, speaker: S.ibrahim, wrong: [S.zakariya, S.yusuf, S.nuh], level: 2 },
  { surah: 14, ayah: 35, from: 4, speaker: S.ibrahim, wrong: [S.musa, S.yusuf, S.nuh], level: 2 },
  { surah: 14, ayah: 37, from: 1, to: 12, speaker: S.ibrahim, wrong: [S.yaqub, S.musa, S.zakariya], level: 3 },

  // ——— نوح
  { surah: 11, ayah: 42, from: 13, speaker: S.nuh, wrong: [S.luqman, S.yaqub, S.ibrahim], level: 1 },
  { surah: 11, ayah: 43, from: 2, to: 7, speaker: S.nuhSon, wrong: [S.ibrahimSon, S.qarun, S.eldest], level: 1 },
  { surah: 11, ayah: 45, from: 5, speaker: S.nuh, wrong: [S.yaqub, S.ibrahim, S.zakariya], level: 2 },
  { surah: 71, ayah: 26, from: 3, speaker: S.nuh, wrong: [S.musa, S.lut, S.yunus], level: 2 },
  { surah: 71, ayah: 10, from: 2, speaker: S.nuh, wrong: [S.lut, S.yusuf, S.isa], level: 3 },
  { surah: 54, ayah: 10, from: 3, speaker: S.nuh, wrong: [S.yusuf, S.ayyub, S.zakariya], level: 3 },

  // ——— آل عمران: مريم وزكريا وعيسى
  { surah: 3, ayah: 35, from: 5, to: 12, speaker: S.imranWife, wrong: [S.maryam, S.pharaohWife, S.azizWife], level: 2 },
  { surah: 3, ayah: 36, from: 4, to: 7, speaker: S.imranWife, wrong: [S.maryam, S.pharaohWife, S.bilqis], level: 3 },
  { surah: 3, ayah: 37, from: 24, speaker: S.maryam, wrong: [S.imranWife, S.pharaohWife, S.madyanGirl], level: 2 },
  { surah: 19, ayah: 20, from: 2, speaker: S.maryam, wrong: [S.imranWife, S.azizWife, S.bilqis], level: 2 },
  { surah: 19, ayah: 23, from: 7, speaker: S.maryam, wrong: [S.azizWife, S.pharaohWife, S.bilqis], level: 1 },
  { surah: 19, ayah: 4, from: 2, to: 9, speaker: S.zakariya, wrong: [S.ibrahim, S.yaqub, S.nuh], level: 2 },
  { surah: 21, ayah: 89, from: 5, speaker: S.zakariya, wrong: [S.musa, S.yunus, S.sulayman], level: 2 },
  { surah: 3, ayah: 38, from: 6, speaker: S.zakariya, wrong: [S.yusuf, S.musa, S.sulayman], level: 2 },
  { surah: 19, ayah: 30, from: 2, speaker: S.isa, wrong: [S.yahya, S.musa, S.yusuf], level: 1 },
  { surah: 3, ayah: 52, from: 7, to: 10, speaker: S.isa, wrong: [S.musa, S.nuh, S.yasin], level: 2 },
  { surah: 3, ayah: 52, from: 13, speaker: S.disciples, wrong: [S.magicians, S.cave, S.angels], level: 3 },

  // ——— آدم وإبليس والملائكة
  { surah: 7, ayah: 12, from: 9, speaker: S.iblis, wrong: [S.pharaoh, S.qarun, S.samiri], level: 1 },
  { surah: 38, ayah: 82, from: 2, speaker: S.iblis, wrong: [S.pharaoh, S.samiri, S.ifrit], level: 2 },
  { surah: 7, ayah: 23, from: 2, speaker: S.adamHawwa, wrong: [S.ibrahimIsmail, S.angels, S.cave], level: 2 },
  { surah: 2, ayah: 30, from: 11, to: 22, speaker: S.angels, wrong: [S.iblis, S.disciples, S.cave], level: 2 },
  { surah: 2, ayah: 32, from: 2, speaker: S.angels, wrong: [S.cave, S.disciples, S.adamHawwa], level: 1 },

  // ——— أصحاب الكهف وذو القرنين وصاحب الجنتين
  { surah: 18, ayah: 10, from: 7, speaker: S.cave, wrong: [S.disciples, S.magicians, S.brothers], level: 2 },
  { surah: 18, ayah: 14, from: 7, to: 15, speaker: S.cave, wrong: [S.magicians, S.angels, S.disciples], level: 3 },
  { surah: 18, ayah: 95, from: 2, speaker: S.dhulqarnayn, wrong: [S.sulayman, S.yusuf, S.qarun], level: 3 },
  { surah: 18, ayah: 98, from: 2, to: 5, speaker: S.dhulqarnayn, wrong: [S.qarun, S.pharaoh, S.gardens], level: 2 },
  { surah: 18, ayah: 35, from: 7, speaker: S.gardens, wrong: [S.qarun, S.pharaoh, S.sulayman], level: 3 },

  // ——— أنبياء آخرون
  { surah: 11, ayah: 56, from: 1, to: 13, speaker: S.hud, wrong: [S.lut, S.yusuf, S.ayyub], level: 3 },
  { surah: 26, ayah: 128, speaker: S.hud, wrong: [S.lut, S.musa, S.yunus], level: 3 },
  { surah: 11, ayah: 64, from: 2, to: 6, speaker: S.salih, wrong: [S.hud, S.lut, S.shuayb], level: 2 },
  { surah: 26, ayah: 149, speaker: S.salih, wrong: [S.lut, S.shuayb, S.yunus], level: 3 },
  { surah: 26, ayah: 181, speaker: S.shuayb, wrong: [S.hud, S.salih, S.lut], level: 3 },
  { surah: 11, ayah: 88, from: 22, speaker: S.shuayb, wrong: [S.lut, S.yunus, S.ayyub], level: 3 },
  { surah: 11, ayah: 78, from: 23, speaker: S.lut, wrong: [S.hud, S.salih, S.shuayb], level: 3 },
  { surah: 11, ayah: 80, from: 2, speaker: S.lut, wrong: [S.hud, S.yusuf, S.ayyub], level: 2 },
  { surah: 21, ayah: 87, from: 15, speaker: S.yunus, wrong: [S.ayyub, S.nuh, S.lut], level: 1 },
  { surah: 21, ayah: 83, from: 5, speaker: S.ayyub, wrong: [S.yunus, S.yaqub, S.zakariya], level: 2 },
  { surah: 38, ayah: 41, from: 7, speaker: S.ayyub, wrong: [S.yunus, S.yusuf, S.lut], level: 3 },

  // ——— قصص أخرى
  { surah: 2, ayah: 249, from: 49, to: 57, speaker: S.talut, wrong: [S.magicians, S.israel, S.cave], level: 3 },
  { surah: 9, ayah: 40, from: 19, to: 23, speaker: S.prophet, wrong: [S.musa, S.yusuf, S.ibrahim], level: 2 },
  { surah: 36, ayah: 20, from: 8, speaker: S.yasin, wrong: [S.magicians, S.disciples, S.cave], level: 3 },
  { surah: 36, ayah: 26, from: 5, speaker: S.yasin, wrong: [S.magicians, S.gardens, S.cave], level: 3 },
];
