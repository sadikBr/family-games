/**
 * «اسم ولد اسم بنت»: real answers are recognised however people usually spell them, gibberish isn't.
 * A corpus of answers a Moroccan family really writes (with their variant spellings), in every category.
 */
import { expect, test } from 'bun:test';

import { answerKey, startsWithLetter } from '../src/shared/arabic';
import { NAMES_DICT } from './bot-content';
import { knownWord, wordMatch } from './dictionary';
import { namesBotAnswer } from './games/names';
import { NAMES_EXTRA, NAMES_WORDS, type NamesWordCategory } from './names-words';

const ACCEPT: Record<NamesWordCategory, string> = {
  boy: `
    محمد أحمد يوسف ياسين آدم أنس إلياس الياس إدريس ادريس عبد_الصمد عبدالصمد عبدالرحيم عبد_الرحمان عبدالله مولاي_علي
    يوبا ماسين إيدير أكسيل أكسل ماسينيسا يوغرطة غيلاس أغيلاس أيور سيفاو جوبا مصطفى مصطفا موسى موسا يحيى يحيا
    عثمان عتمان هشام هيشام ريان رايان زكرياء زكريا إسماعيل اسماعين إبراهيم ابراهيم براهيم المهدي مهدي الحسين لحسن
    حمزة طه عمر علي سعيد رشيد مراد نبيل سفيان أيمن أيوب بلال خالد وليد طارق كريم أمين نوح جاد تيم سامي إيلان يانيس
    جون ديفيد دافيد مايكل توماس ألكسندر ماركو كريستيانو
  `,
  girl: `
    فاطمة فاطمة_الزهراء فاطمه غيثة غيثه غيته غيتة ياسمين ياسمينة ياسمينه سلمى سلما مريم خديجة خدوج إيمان ايمان أسماء
    اسماء أسما هبة هبه سارة ساره نور نور_الهدى شيماء شيما زينب حليمة سكينة رقية عائشة عايشة عيشة عويشة تيليلا ثيزيري
    تيزيري تانيرت ثانيرت تودة ديهيا داهيا تينهينان ماسيليا نوميديا تيفاوت إيطو يطو لينا ليلى ليلي صوفيا ريتال ملك
    ماريا جوليا إيما صوفي لورا جيسيكا سيلين نورة نوره هيفاء هيفا وفاء وفا كوثر حنان سناء سنا آية اية رجاء
  `,
  animal: `
    أسد الأسد زرافة زرافه دلفين دولفين دلفيين سلحفاة سلحفاه سلحفة تمساح كنغر كنغارو كانغارو غوريلا غوريللا شمبانزي
    شيمبانزي باندا كوالا هامستر همستر بطريق بنغوين فلامنغو فلامينغو لاما ألباكا جاغوار جاكوار فهد نمر ثعلب تعلب ضبع
    قنفذ قنفد بلارج فكرون قنفود سردوك عتروس جرانة حلوف قنية زعطوط بيبي ببوش دبانة سراق_الزيت بوبريص زرمومية حنش
    سردين سردينة شابل ميرلان كلامار قرنيط كروفيت فراشة جرادة صرصار صرصور عنكبوت نملة دعسوقة حسون بلبل كناري
    حمامة يمامة بومة غراب نسر صقر لقلق إوزة وزة بطة ديك_رومي هدهد نعامة جمل ناقة حصان عود فرس بغل حمار بقرة
    عجل خروف كبش ماعز معزة دجاجة ديك فروج قط قطة مش قطوس كلب أرنب فأر فار جرذ طوبة سمكة_قرش قرش حوت
  `,
  plant: `
    نعناع شيبة زعتر صعتر فليو لويزة سالمية معدنوس قصبر بقدونس كرافس بسباس كيوي أناناس اناناس موز بنان دلاح بطيخ
    شمام فقوس خيار كرموس هندية تين زيتون أركان خروب لوز كركاع جوز عنب تفاح تفاحة ليمون حامض برتقال مندرين
    مندارين كليمونتين كليمنتين فراولة فريز بطاطا بطاطس جزر خيزو بصل ثوم تومة طماطم مطيشة فلفل باذنجان بادنجال
    قرع كورجيت لفت كرنب شوفلور جلبانة فول حمص عدس لوبيا ورد وردة ياسمين قرنفل نرجس أقحوان عباد_الشمس زهرة
    توليب أوركيد خزامى لافندر نخلة أرز صنوبر كاليتوس زعفران كمون قرفة سكنجبير خرقوم حبة_حلاوة جنجلان سمسم
    حلبة ريحان حبق عطرشة مانجو مانغو أفوكادو افوكا كرز حب_الملوك مشمش مشماش برقوق خوخ إجاص بروكلي بروكولي
  `,
  thing: `
    جلابة جلابية قفطان بلغة طاجين طجين تلفزيون تلفاز تلفيزيون تلفزة كرسي طاولة طابلة فرشاة مشط مرآة مراية مخدة
    زربية حصيرة صينية براد كأس كاس طبسيل مغرفة ملعقة معلقة فرشيطة كسكاس طنجرة كوكوت بوطة ثلاجة تلاجة فريجيدير
    ميكروويف هاتف تلفون تيليفون بورطابل حاسوب كمبيوتر لابتوب تابليت تيليكوموند ساعة مكانة نظارة جاكيطة سروال
    تريكو صباط تشامير كبوط بيجامة سبرديلة صندالة كندورة تكشيطة حايك منديل تقاشر كاسكيطة ستيلو قلم كتاب
    كرطابلة دفتر سبورة بسطيلة بسطيلا بستيلة بسطيله كسكس حريرة رفيسة مسمن بغرير شباكية سفوف طنجية بندير
    دربوكة غيطة سيارة طوموبيل طاكسي تاكسي حافلة طوبيس كار دراجة بيكالة موطور قطار طيارة طائرة بابور فلوكة
    مقص مطرقة شاكوش مسمار برغي مفتاح قفل باب نافذة سرير وسادة بطانية لحاف ستارة خزانة مكنسة سطل دلو
  `,
  country: `
    نيوزيلاندا نيوزيلندا نيوزلاندا نيوزلندا فنزويلا فينيزويلا إندونيسيا اندونيسيا أستراليا استراليا أوستراليا إيطاليا
    ايطاليا ألمانيا المانيا بريطانيا إنجلترا انجلترا إنكلترا فرنسا فرانسا إسبانيا اسبانيا سبانيا هولندا هولاندا
    بلجيكا سويسرا البرتغال روسيا أمريكا امريكا أميركا كندا كانادا المكسيك البرازيل الأرجنتين كولومبيا تشيلي شيلي
    اليابان الصين كوريا الهند باكستان تركيا اليونان مصر السعودية الإمارات قطر الكويت عمان اليمن العراق سوريا سورية
    لبنان الأردن فلسطين ليبيا تونس الجزائر موريتانيا موريطانيا السنغال مالي النيجر نيجيريا الكاميرون كامرون إثيوبيا
    اثيوبيا كينيا تنزانيا مدغشقر أوكرانيا بولندا بولونيا السويد النرويج الدنمارك الدانمارك فنلندا فنلاندا أيرلندا
    ايرلاندا تايلاند تايلندا ماليزيا سنغافورة سنغافورا الفلبين فيتنام أفغانستان إيران المغرب
    الدار_البيضاء كازا كازابلانكا الرباط مراكش فاس مكناس طنجة تطوان أكادير اكادير وجدة القنيطرة الجديدة آسفي
    الصويرة ورزازات وارزازات الناظور الحسيمة شفشاون الشاون إفران العيون الداخلة كلميم جرسيف تازة بني_ملال
    خريبكة سطات المحمدية سلا تمارة العرائش تارودانت تيزنيت تزنيت زاكورة الرشيدية الراشيدية ميدلت أزرو سبتة مليلية
    باريس لندن مدريد برشلونة روما ميلانو ميلان برلين موسكو إسطنبول اسطنبول استانبول القاهرة دبي مكة الرياض جدة
    الدوحة نيويورك نيو_يورك واشنطن طوكيو توكيو بكين سيول أمستردام بروكسل بروكسيل جنيف لشبونة ليشبونة إشبيلية
    غرناطة قرطبة مرسيليا مارسيليا مانشستر ميونخ ميونيخ داكار دكار نواكشوط
  `,
  job: `
    معلم معلمة أستاذ استاذ أستاد طبيب طبيبة دكتور ممرض ممرضة فرملي مهندس شرطي بوليسي دركي جندي عسكري ميكانيكي
    ميكانيسيان نجار حداد خباز فران حلاق كوافور كوافورة خياط خياطة سباك بلومبي كهربائي تريسيان صباغ دهان بناء
    بناي زلايجي جزار بقال مول_الحانوت خضار عطار فلاح راعي صياد بحار سائق شيفور طاكسيست طيار محامي قاضي عدل
    موثق صيدلي فرماسيان بيطري صحفي صحافي مصور ممثل مغني رسام كاتب شاعر مترجم مبرمج محاسب موظف مدير سكرتيرة
    نادل سرباي طباخ شيف عساس حارس بواب كناس ساعي_البريد فاكتور مضيفة رائد_فضاء باحث لاعب مدرب حكم إمام مؤذن
    فقيه نكافة حجام دلال سمسار حمال صانع خراز دباغ نساج خزاف
  `,
};

/**
 * Usual spellings that are in no list on purpose: found only through the spelling-tolerant lookup
 * (long vowels written or not, ة/ه/ا at the end, ط/ت, ث/ت, ذ/د, ق/ك, a doubled letter).
 */
const VARIANTS: [string, NamesWordCategory][] = (
  [
    ['country', 'نيوزيلاندة فينزويلا اندونسيا الأرجانتين بريطانية انكلترة اسكتلاندا سويسرة كولومبية أوكرانية ماليزية موريتانية تنزانية تايلاندا أفغانسطان طاجكستان كزاخستان فيطنام الفيلبين سنغافوره ستوكهلم امستيردام برشلونا مادريد ميلانوا موسكوا واشنطون نيوورك مراكيش الصويره تيطوان شفشاوان القنيطره الحسيمه الراشدية تانتان'],
    ['boy', 'ياسيين يوسوف ابرهيم عتمان هيشام اسماعيين مصطفا موسا عيسا يحيا حمزا'],
    ['girl', 'خديجا مريام حليما نعيما كوتر تزيري ثيليلا فاطيما زينابة_لا سميرا'],
    ['animal', 'زرافا تيمساح شامبانزي عنكبوط بطريك خنفسا دلفيين كانغاروا هامسطر فلامانغو'],
    ['plant', 'بطاطيس ليمونة قرنبيت بروكلى سبانيخ زعطر فراوله ملوخيا بقدونيس زنجابيل قرنفول أوركيدة'],
    ['thing', 'تلفيزيون كمبيوطر ميكرويف كفطان جلابا بلغا تليفون تابلة سباط سطيلو كاسكيتة جاكيتة بيجاما تيشيرت بنطالون بسطيلا'],
    ['job', 'ميكانسيان تاكسيست أستاد صيدلانى مهندسة_لا فرماسيانة'],
  ] as [NamesWordCategory, string][]
).flatMap(([cat, text]) => text.split(' ').filter((w) => !w.endsWith('_لا')).map((w) => [w, cat] as [string, NamesWordCategory]));

/** Random letters, keyboard mashing, real words with 2+ letters changed: never real. */
const REJECT = `
  كخبتر سشيبلا زززز ببببب تتتت ممم ههههه ضصثق صثقفغ فغعهخ عهخحج شسيبل شسيبلت نمكطتن تنمكط ءؤرلا ىةوزظ ضشصس
  جدكط ثقثقثق لبلبلب سيسيسي قفقفقف كمنتب جحخهع فرخشقل بزنقطو مطشخرف غضفزل جخطفش تخزمطق صكظبن دغفلشت زقنطحو
  ظشمغلي حزقبيط شفطكزر تمشاخ كرحفي برخقاث ثلاخظ مراغخ فاخمغ يوشخ طاغلم نعخاغ مهغدش مخرغ قفغاب جلاحم سلخفغة
  دلغيب إندوخيشيا فنزخيغا نيوزيمحدا نيوزيلغفا بسطيغمة طاجخم تلفغبون زرقفظ كنغجح شمبخغي بنغخيش دولفغق ياسمخغ
  غيثحك فطامغ خديحغ مريغخ يوسغق محمخغ قنفخب ثعلغف خيزرغ كمبخطر طمخطم
`.trim().split(/\s+/);

const corpus = () =>
  (Object.entries(ACCEPT) as [NamesWordCategory, string][]).flatMap(([cat, text]) =>
    text.trim().split(/\s+/).map((w) => [w.replace(/_/g, ' '), cat] as const),
  );

test('corpus is big enough', () => {
  expect(corpus().length).toBeGreaterThanOrEqual(250);
  expect(REJECT.length).toBeGreaterThanOrEqual(50);
});

test('real answers in every category are accepted, however they are spelled', () => {
  const missed = corpus().filter(([w, cat]) => !knownWord(w, cat)).map(([w, cat]) => `${cat}:${w}`);
  expect(missed).toEqual([]);
});

test('usual spelling variants that are in no list are accepted too', () => {
  const missed = VARIANTS.filter(([w, cat]) => !knownWord(w, cat)).map(([w, cat]) => `${cat}:${w}`);
  expect(missed).toEqual([]);
  // they really come from the tolerant lookup, not from the lists
  const tolerant = VARIANTS.filter(([w, cat]) => wordMatch(w, cat) !== 'list').length;
  expect(tolerant / VARIANTS.length).toBeGreaterThan(0.8);
});

test('gibberish, keyboard mashing and badly mangled words are refused', () => {
  const passed = REJECT.filter((w) => knownWord(w)).map((w) => `${w}:${wordMatch(w)}`);
  expect(passed).toEqual([]);
});

test('spelling tolerance: the examples from the players', () => {
  // the dictionary has «نيوزيلندا»; any usual spelling counts
  for (const w of ['نيوزيلاندا', 'نيوزلاندا', 'نيوزيلندا', 'نيوزلندا', 'نيوزيلاندة']) expect([w, knownWord(w, 'country')]).toEqual([w, true]);
  // ة/ه/ا at the end, ط/ت, ث/ت, a long vowel more or less
  expect(wordMatch('بسطيلا', 'thing')).not.toBeNull();
  expect(wordMatch('غيته', 'girl')).not.toBeNull();
  expect(wordMatch('دلفيين', 'animal')).not.toBeNull();
  // Moroccan/Persian keyboard letters: ڭ is ك/ق/ج/غ, ڤ is ف, ی is ي, ک is ك
  for (const w of ['ڭرسيف', 'أڭادير', 'ڭلميم', 'ݣرسيف', 'ڤرنسا', 'نیوزیلندا', 'کندا']) expect([w, knownWord(w, 'country')]).toEqual([w, true]);
  // …and they count for the round's letter
  expect([startsWithLetter('ڭلميم', 'ك'), startsWithLetter('ڭرسيف', 'ج'), startsWithLetter('ڤرنسا', 'ف'), startsWithLetter('ڭلميم', 'ب')]).toEqual([true, true, true, false]);
  // invisible marks some keyboards add
  expect(knownWord('نيوز\u200cيلندا', 'country')).toBe(true);
  // short words stay strict: no tolerance under 4 letters or 3 consonants
  for (const w of ['قلمم', 'سممر', 'ررج']) expect([w, knownWord(w)]).toEqual([w, false]);
});

test('extra spellings: Arabic letters only, no duplicates, nothing already in the bot lists', () => {
  for (const [cat, words] of Object.entries(NAMES_EXTRA) as [NamesWordCategory, string[]][]) {
    const bot = new Set(NAMES_WORDS[cat].map(answerKey));
    const seen = new Set<string>();
    for (const w of words) {
      expect([cat, w, /^[ء-ي][ء-يً-ْ]*( [ء-ي][ء-يً-ْ]*)*$/.test(w)]).toEqual([cat, w, true]);
      const k = answerKey(w);
      expect([cat, w, bot.has(k) || seen.has(k)]).toEqual([cat, w, false]);
      seen.add(k);
    }
  }
});

test('bots only answer with their own list: right letter, right category, never an extra spelling', () => {
  for (const [cat, byLetter] of Object.entries(NAMES_DICT)) {
    const extra = new Set(NAMES_EXTRA[cat as NamesWordCategory].map(answerKey));
    for (const [letter, words] of Object.entries(byLetter)) {
      for (let i = 0; i < 20; i++) {
        const a = namesBotAnswer({ letter }, cat, i % 2 ? 'expert' : 'easy', () => (i % 10) / 10);
        if (a === null) continue;
        expect([cat, letter, a, startsWithLetter(a, letter), words.includes(a)]).toEqual([cat, letter, a, true, true]);
        expect([cat, a, extra.has(answerKey(a))]).toEqual([cat, a, false]);
      }
    }
  }
});
