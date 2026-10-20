/**
 * Countries for «الأعلام والعواصم»: the 193 member states of the United Nations, plus the two observer
 * states (Palestine and the Holy See), with their common Arabic names and capitals.
 *
 * - `code`: the ISO 3166-1 alpha-2 code (lowercase), also the name of the flag image in assets/flags
 *   (rendered from the MIT-licensed flag-icons set by tools/art/flags.mjs).
 * - `region` / `sub`: the part of the world, so the wrong options come from the same neighbourhood.
 * - `known`: well-known to a family (the «سهل» level asks only about these).
 * - `arab`: a member of the Arab League (the «العالم العربي» region).
 * - `noCapital`: never asked in a capital question — the capital has the country's own name (تونس،
 *   الكويت، سنغافورة…), or which city is the capital is not clear-cut (two capitals, a move under way).
 * - `noFlag`: never shown in a flag question (Afghanistan: which flag is in use is disputed).
 *
 * Not included: the territories whose status is disputed (they never appear, not even as an option),
 * and Israel (its capital is itself a disputed-territory statement; the app follows the family's own
 * view and lists Palestine with القدس).
 */
import type { FlagsRegion } from '../src/shared/games/flags';

export type Continent = Exclude<FlagsRegion, 'world' | 'arab'>;

export interface Country {
  code: string;
  name: string;
  capital: string;
  region: Continent;
  sub: string;
  known?: boolean;
  arab?: boolean;
  noCapital?: boolean;
  noFlag?: boolean;
}

type Tag = 'k' | 'a' | 'nc' | 'nf';

const c = (region: Continent, sub: string, code: string, name: string, capital: string, ...tags: Tag[]): Country => ({
  code,
  name,
  capital,
  region,
  sub,
  ...(tags.includes('k') ? { known: true } : {}),
  ...(tags.includes('a') ? { arab: true } : {}),
  ...(tags.includes('nc') ? { noCapital: true } : {}),
  ...(tags.includes('nf') ? { noFlag: true } : {}),
});

export const COUNTRIES: Country[] = [
  /* ---------- أفريقيا: الشمال ---------- */
  c('africa', 'north', 'ma', 'المغرب', 'الرباط', 'k', 'a'),
  c('africa', 'north', 'dz', 'الجزائر', 'الجزائر', 'k', 'a', 'nc'),
  c('africa', 'north', 'tn', 'تونس', 'تونس', 'k', 'a', 'nc'),
  c('africa', 'north', 'ly', 'ليبيا', 'طرابلس', 'k', 'a'),
  c('africa', 'north', 'eg', 'مصر', 'القاهرة', 'k', 'a'),
  c('africa', 'north', 'sd', 'السودان', 'الخرطوم', 'k', 'a'),
  c('africa', 'north', 'mr', 'موريتانيا', 'نواكشوط', 'k', 'a'),
  /* ---------- أفريقيا: الغرب ---------- */
  c('africa', 'west', 'sn', 'السنغال', 'داكار', 'k'),
  c('africa', 'west', 'gm', 'غامبيا', 'بانجول'),
  c('africa', 'west', 'gw', 'غينيا بيساو', 'بيساو', 'nc'),
  c('africa', 'west', 'gn', 'غينيا', 'كوناكري'),
  c('africa', 'west', 'sl', 'سيراليون', 'فريتاون'),
  c('africa', 'west', 'lr', 'ليبيريا', 'مونروفيا'),
  c('africa', 'west', 'ci', 'ساحل العاج', 'ياموسوكرو', 'k'),
  c('africa', 'west', 'gh', 'غانا', 'أكرا', 'k'),
  c('africa', 'west', 'tg', 'توغو', 'لومي'),
  c('africa', 'west', 'bj', 'بنين', 'بورتو نوفو'),
  c('africa', 'west', 'ng', 'نيجيريا', 'أبوجا', 'k'),
  c('africa', 'west', 'ne', 'النيجر', 'نيامي', 'k'),
  c('africa', 'west', 'ml', 'مالي', 'باماكو', 'k'),
  c('africa', 'west', 'bf', 'بوركينا فاسو', 'واغادوغو'),
  c('africa', 'west', 'cv', 'الرأس الأخضر', 'برايا'),
  /* ---------- أفريقيا: الوسط ---------- */
  c('africa', 'central', 'cm', 'الكاميرون', 'ياوندي', 'k'),
  c('africa', 'central', 'cf', 'جمهورية أفريقيا الوسطى', 'بانغي'),
  c('africa', 'central', 'td', 'تشاد', 'نجامينا', 'k'),
  c('africa', 'central', 'cd', 'الكونغو الديمقراطية', 'كينشاسا', 'k'),
  c('africa', 'central', 'cg', 'الكونغو', 'برازافيل'),
  c('africa', 'central', 'ga', 'الغابون', 'ليبرفيل'),
  c('africa', 'central', 'gq', 'غينيا الاستوائية', 'مالابو'),
  c('africa', 'central', 'st', 'ساو تومي وبرينسيب', 'ساو تومي', 'nc'),
  c('africa', 'central', 'ao', 'أنغولا', 'لواندا'),
  /* ---------- أفريقيا: الشرق ---------- */
  c('africa', 'east', 'et', 'إثيوبيا', 'أديس أبابا', 'k'),
  c('africa', 'east', 'er', 'إريتريا', 'أسمرة'),
  c('africa', 'east', 'dj', 'جيبوتي', 'جيبوتي', 'k', 'a', 'nc'),
  c('africa', 'east', 'so', 'الصومال', 'مقديشو', 'k', 'a'),
  c('africa', 'east', 'ke', 'كينيا', 'نيروبي', 'k'),
  c('africa', 'east', 'ug', 'أوغندا', 'كمبالا'),
  c('africa', 'east', 'rw', 'رواندا', 'كيغالي'),
  c('africa', 'east', 'bi', 'بوروندي', 'غيتيغا', 'nc'),
  c('africa', 'east', 'tz', 'تنزانيا', 'دودوما', 'k'),
  c('africa', 'east', 'ss', 'جنوب السودان', 'جوبا'),
  c('africa', 'east', 'km', 'جزر القمر', 'موروني', 'k', 'a'),
  c('africa', 'east', 'mg', 'مدغشقر', 'أنتاناناريفو', 'k'),
  c('africa', 'east', 'mu', 'موريشيوس', 'بورت لويس'),
  c('africa', 'east', 'sc', 'سيشل', 'فيكتوريا'),
  /* ---------- أفريقيا: الجنوب ---------- */
  c('africa', 'south', 'za', 'جنوب أفريقيا', 'بريتوريا', 'k', 'nc'),
  c('africa', 'south', 'na', 'ناميبيا', 'ويندهوك'),
  c('africa', 'south', 'bw', 'بوتسوانا', 'غابورون'),
  c('africa', 'south', 'zw', 'زيمبابوي', 'هراري'),
  c('africa', 'south', 'zm', 'زامبيا', 'لوساكا'),
  c('africa', 'south', 'mw', 'مالاوي', 'ليلونغوي'),
  c('africa', 'south', 'mz', 'موزمبيق', 'مابوتو'),
  c('africa', 'south', 'ls', 'ليسوتو', 'ماسيرو'),
  c('africa', 'south', 'sz', 'إسواتيني', 'مبابان', 'nc'),

  /* ---------- آسيا: الخليج واليمن ---------- */
  c('asia', 'gulf', 'sa', 'السعودية', 'الرياض', 'k', 'a'),
  c('asia', 'gulf', 'ae', 'الإمارات', 'أبوظبي', 'k', 'a'),
  c('asia', 'gulf', 'kw', 'الكويت', 'الكويت', 'k', 'a', 'nc'),
  c('asia', 'gulf', 'qa', 'قطر', 'الدوحة', 'k', 'a'),
  c('asia', 'gulf', 'bh', 'البحرين', 'المنامة', 'k', 'a'),
  c('asia', 'gulf', 'om', 'عُمان', 'مسقط', 'k', 'a'),
  c('asia', 'gulf', 'ye', 'اليمن', 'صنعاء', 'k', 'a'),
  /* ---------- آسيا: الشام والعراق ---------- */
  c('asia', 'levant', 'ps', 'فلسطين', 'القدس', 'k', 'a'),
  c('asia', 'levant', 'jo', 'الأردن', 'عمّان', 'k', 'a'),
  c('asia', 'levant', 'lb', 'لبنان', 'بيروت', 'k', 'a'),
  c('asia', 'levant', 'sy', 'سوريا', 'دمشق', 'k', 'a'),
  c('asia', 'levant', 'iq', 'العراق', 'بغداد', 'k', 'a'),
  /* ---------- آسيا: الغرب والقوقاز ---------- */
  c('asia', 'west', 'tr', 'تركيا', 'أنقرة', 'k'),
  c('asia', 'west', 'ir', 'إيران', 'طهران', 'k'),
  c('asia', 'west', 'ge', 'جورجيا', 'تبليسي'),
  c('asia', 'west', 'am', 'أرمينيا', 'يريفان'),
  c('asia', 'west', 'az', 'أذربيجان', 'باكو'),
  /* ---------- آسيا: الوسط ---------- */
  c('asia', 'central', 'kz', 'كازاخستان', 'أستانا', 'k'),
  c('asia', 'central', 'uz', 'أوزبكستان', 'طشقند', 'k'),
  c('asia', 'central', 'tm', 'تركمانستان', 'عشق آباد'),
  c('asia', 'central', 'tj', 'طاجيكستان', 'دوشنبه'),
  c('asia', 'central', 'kg', 'قيرغيزستان', 'بيشكك'),
  c('asia', 'central', 'af', 'أفغانستان', 'كابل', 'k', 'nf'),
  /* ---------- آسيا: الجنوب ---------- */
  c('asia', 'south', 'in', 'الهند', 'نيودلهي', 'k'),
  c('asia', 'south', 'pk', 'باكستان', 'إسلام آباد', 'k'),
  c('asia', 'south', 'bd', 'بنغلاديش', 'دكا', 'k'),
  c('asia', 'south', 'lk', 'سريلانكا', 'سري جاياواردنابورا كوتي', 'k', 'nc'),
  c('asia', 'south', 'np', 'نيبال', 'كاتماندو', 'k'),
  c('asia', 'south', 'bt', 'بوتان', 'تيمفو'),
  c('asia', 'south', 'mv', 'جزر المالديف', 'ماليه'),
  /* ---------- آسيا: الشرق ---------- */
  c('asia', 'east', 'cn', 'الصين', 'بكين', 'k'),
  c('asia', 'east', 'jp', 'اليابان', 'طوكيو', 'k'),
  c('asia', 'east', 'kr', 'كوريا الجنوبية', 'سول', 'k'),
  c('asia', 'east', 'kp', 'كوريا الشمالية', 'بيونغ يانغ', 'k'),
  c('asia', 'east', 'mn', 'منغوليا', 'أولان باتور'),
  /* ---------- آسيا: الجنوب الشرقي ---------- */
  c('asia', 'southeast', 'th', 'تايلاند', 'بانكوك', 'k'),
  c('asia', 'southeast', 'vn', 'فيتنام', 'هانوي', 'k'),
  c('asia', 'southeast', 'la', 'لاوس', 'فيينتيان'),
  c('asia', 'southeast', 'kh', 'كمبوديا', 'بنوم بنه'),
  c('asia', 'southeast', 'mm', 'ميانمار', 'نايبيداو'),
  c('asia', 'southeast', 'my', 'ماليزيا', 'كوالالمبور', 'k'),
  c('asia', 'southeast', 'sg', 'سنغافورة', 'سنغافورة', 'k', 'nc'),
  c('asia', 'southeast', 'id', 'إندونيسيا', 'جاكرتا', 'k', 'nc'),
  c('asia', 'southeast', 'ph', 'الفلبين', 'مانيلا', 'k'),
  c('asia', 'southeast', 'bn', 'بروناي', 'بندر سري بكاوان'),
  c('asia', 'southeast', 'tl', 'تيمور الشرقية', 'ديلي'),

  /* ---------- أوروبا: الغرب ---------- */
  c('europe', 'west', 'fr', 'فرنسا', 'باريس', 'k'),
  c('europe', 'west', 'gb', 'المملكة المتحدة', 'لندن', 'k'),
  c('europe', 'west', 'ie', 'أيرلندا', 'دبلن', 'k'),
  c('europe', 'west', 'be', 'بلجيكا', 'بروكسل', 'k'),
  c('europe', 'west', 'nl', 'هولندا', 'أمستردام', 'k'),
  c('europe', 'west', 'lu', 'لوكسمبورغ', 'لوكسمبورغ', 'nc'),
  c('europe', 'west', 'de', 'ألمانيا', 'برلين', 'k'),
  c('europe', 'west', 'at', 'النمسا', 'فيينا', 'k'),
  c('europe', 'west', 'ch', 'سويسرا', 'برن', 'k'),
  c('europe', 'west', 'li', 'ليختنشتاين', 'فادوز'),
  c('europe', 'west', 'mc', 'موناكو', 'موناكو', 'nc'),
  /* ---------- أوروبا: الجنوب ---------- */
  c('europe', 'south', 'es', 'إسبانيا', 'مدريد', 'k'),
  c('europe', 'south', 'pt', 'البرتغال', 'لشبونة', 'k'),
  c('europe', 'south', 'it', 'إيطاليا', 'روما', 'k'),
  c('europe', 'south', 'gr', 'اليونان', 'أثينا', 'k'),
  c('europe', 'south', 'mt', 'مالطا', 'فاليتا'),
  c('europe', 'south', 'cy', 'قبرص', 'نيقوسيا'),
  c('europe', 'south', 'ad', 'أندورا', 'أندورا لا فيلا', 'nc'),
  c('europe', 'south', 'sm', 'سان مارينو', 'سان مارينو', 'nc'),
  c('europe', 'south', 'va', 'الفاتيكان', 'الفاتيكان', 'nc'),
  /* ---------- أوروبا: الشمال ---------- */
  c('europe', 'north', 'no', 'النرويج', 'أوسلو', 'k'),
  c('europe', 'north', 'se', 'السويد', 'ستوكهولم', 'k'),
  c('europe', 'north', 'fi', 'فنلندا', 'هلسنكي', 'k'),
  c('europe', 'north', 'dk', 'الدنمارك', 'كوبنهاغن', 'k'),
  c('europe', 'north', 'is', 'آيسلندا', 'ريكيافيك', 'k'),
  c('europe', 'north', 'ee', 'إستونيا', 'تالين'),
  c('europe', 'north', 'lv', 'لاتفيا', 'ريغا'),
  c('europe', 'north', 'lt', 'ليتوانيا', 'فيلنيوس'),
  /* ---------- أوروبا: الشرق والوسط ---------- */
  c('europe', 'east', 'pl', 'بولندا', 'وارسو', 'k'),
  c('europe', 'east', 'cz', 'التشيك', 'براغ', 'k'),
  c('europe', 'east', 'sk', 'سلوفاكيا', 'براتيسلافا'),
  c('europe', 'east', 'hu', 'المجر', 'بودابست', 'k'),
  c('europe', 'east', 'ro', 'رومانيا', 'بوخارست', 'k'),
  c('europe', 'east', 'md', 'مولدوفا', 'كيشيناو'),
  c('europe', 'east', 'ua', 'أوكرانيا', 'كييف', 'k'),
  c('europe', 'east', 'by', 'بيلاروسيا', 'مينسك'),
  c('europe', 'east', 'ru', 'روسيا', 'موسكو', 'k'),
  /* ---------- أوروبا: البلقان ---------- */
  c('europe', 'balkan', 'hr', 'كرواتيا', 'زغرب', 'k'),
  c('europe', 'balkan', 'si', 'سلوفينيا', 'ليوبليانا'),
  c('europe', 'balkan', 'ba', 'البوسنة والهرسك', 'سراييفو'),
  c('europe', 'balkan', 'rs', 'صربيا', 'بلغراد'),
  c('europe', 'balkan', 'me', 'الجبل الأسود', 'بودغوريتسا'),
  c('europe', 'balkan', 'mk', 'مقدونيا الشمالية', 'سكوبيه'),
  c('europe', 'balkan', 'al', 'ألبانيا', 'تيرانا'),
  c('europe', 'balkan', 'bg', 'بلغاريا', 'صوفيا'),

  /* ---------- الأمريكتان: الشمال ---------- */
  c('americas', 'north', 'us', 'الولايات المتحدة', 'واشنطن', 'k'),
  c('americas', 'north', 'ca', 'كندا', 'أوتاوا', 'k'),
  c('americas', 'north', 'mx', 'المكسيك', 'مكسيكو سيتي', 'k', 'nc'),
  /* ---------- الأمريكتان: الوسطى ---------- */
  c('americas', 'central', 'gt', 'غواتيمالا', 'غواتيمالا', 'nc'),
  c('americas', 'central', 'bz', 'بليز', 'بلموبان'),
  c('americas', 'central', 'sv', 'السلفادور', 'سان سلفادور', 'nc'),
  c('americas', 'central', 'hn', 'هندوراس', 'تيغوسيغالبا'),
  c('americas', 'central', 'ni', 'نيكاراغوا', 'ماناغوا'),
  c('americas', 'central', 'cr', 'كوستاريكا', 'سان خوسيه'),
  c('americas', 'central', 'pa', 'بنما', 'بنما', 'nc'),
  /* ---------- الأمريكتان: الكاريبي ---------- */
  c('americas', 'caribbean', 'cu', 'كوبا', 'هافانا', 'k'),
  c('americas', 'caribbean', 'jm', 'جامايكا', 'كينغستون', 'k'),
  c('americas', 'caribbean', 'ht', 'هايتي', 'بورت أو برنس'),
  c('americas', 'caribbean', 'do', 'جمهورية الدومينيكان', 'سانتو دومينغو'),
  c('americas', 'caribbean', 'bs', 'جزر البهاما', 'ناساو'),
  c('americas', 'caribbean', 'bb', 'باربادوس', 'بريدجتاون'),
  c('americas', 'caribbean', 'tt', 'ترينيداد وتوباغو', 'بورت أوف سبين'),
  c('americas', 'caribbean', 'ag', 'أنتيغوا وباربودا', 'سانت جونز'),
  c('americas', 'caribbean', 'dm', 'دومينيكا', 'روزو'),
  c('americas', 'caribbean', 'gd', 'غرينادا', 'سانت جورجز'),
  c('americas', 'caribbean', 'kn', 'سانت كيتس ونيفيس', 'باستير'),
  c('americas', 'caribbean', 'lc', 'سانت لوسيا', 'كاستريس'),
  c('americas', 'caribbean', 'vc', 'سانت فينسنت والغرينادين', 'كينغستاون'),
  /* ---------- الأمريكتان: الجنوب ---------- */
  c('americas', 'south', 'br', 'البرازيل', 'برازيليا', 'k', 'nc'),
  c('americas', 'south', 'ar', 'الأرجنتين', 'بوينس آيرس', 'k'),
  c('americas', 'south', 'cl', 'تشيلي', 'سانتياغو', 'k'),
  c('americas', 'south', 'uy', 'الأوروغواي', 'مونتيفيديو', 'k'),
  c('americas', 'south', 'py', 'باراغواي', 'أسونسيون'),
  c('americas', 'south', 'bo', 'بوليفيا', 'سوكري', 'nc'),
  c('americas', 'south', 'pe', 'بيرو', 'ليما', 'k'),
  c('americas', 'south', 'ec', 'الإكوادور', 'كيتو'),
  c('americas', 'south', 'co', 'كولومبيا', 'بوغوتا', 'k'),
  c('americas', 'south', 've', 'فنزويلا', 'كاراكاس', 'k'),
  c('americas', 'south', 'gy', 'غيانا', 'جورجتاون'),
  c('americas', 'south', 'sr', 'سورينام', 'باراماريبو'),

  /* ---------- أوقيانوسيا ---------- */
  c('oceania', 'oceania', 'au', 'أستراليا', 'كانبرا', 'k'),
  c('oceania', 'oceania', 'nz', 'نيوزيلندا', 'ويلينغتون', 'k'),
  c('oceania', 'oceania', 'pg', 'بابوا غينيا الجديدة', 'بورت مورسبي'),
  c('oceania', 'oceania', 'fj', 'فيجي', 'سوفا'),
  c('oceania', 'oceania', 'sb', 'جزر سليمان', 'هونيارا'),
  c('oceania', 'oceania', 'vu', 'فانواتو', 'بورت فيلا'),
  c('oceania', 'oceania', 'ws', 'ساموا', 'أبيا'),
  c('oceania', 'oceania', 'to', 'تونغا', 'نوكوالوفا'),
  c('oceania', 'oceania', 'ki', 'كيريباتي', 'تاراوا'),
  c('oceania', 'oceania', 'tv', 'توفالو', 'فونافوتي'),
  c('oceania', 'oceania', 'nr', 'ناورو', 'يارين', 'nc'),
  c('oceania', 'oceania', 'mh', 'جزر مارشال', 'ماجورو'),
  c('oceania', 'oceania', 'fm', 'ميكرونيزيا', 'باليكير'),
  c('oceania', 'oceania', 'pw', 'بالاو', 'نجيرولمود'),
];

/** Countries whose capital is not one clear-cut city: the reveal doesn't name one. */
export const UNCLEAR_CAPITAL = new Set(['bo', 'za', 'lk', 'sz', 'bi', 'nr', 'id']);
