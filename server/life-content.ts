/** «مشوار الحياة» — cards: jobs, houses, life events, family members and risky projects. */
import type { LifeHouse, LifeJob, LifeTokenKind } from '../src/shared/games/life';

/** Jobs you can take without a degree (chosen at the first fork, «العمل مباشرة»). */
export const WORK_JOBS: LifeJob[] = [
  { id: 'farmer', title: 'فلاح', salary: 6000, icon: 'leaf', degree: false },
  { id: 'trader', title: 'تاجر', salary: 8000, icon: 'coins', degree: false },
  { id: 'artist', title: 'فنان', salary: 6000, icon: 'star', degree: false },
  { id: 'carpenter', title: 'نجار', salary: 7000, icon: 'box', degree: false },
  { id: 'taxi', title: 'سائق طاكسي', salary: 6000, icon: 'train', degree: false },
  { id: 'cook', title: 'طباخ', salary: 7000, icon: 'tea', degree: false },
  { id: 'mechanic', title: 'ميكانيكي', salary: 7000, icon: 'bolt', degree: false },
  { id: 'tailor', title: 'خياط', salary: 6000, icon: 'edit', degree: false },
  { id: 'artisan', title: 'صانع تقليدي', salary: 7000, icon: 'hand', degree: false },
  { id: 'baker', title: 'خباز', salary: 6000, icon: 'sun', degree: false },
  { id: 'footballer', title: 'لاعب كرة', salary: 9000, icon: 'target', degree: false },
];

/** Jobs for graduates (chosen at «التخرج»). */
export const DEGREE_JOBS: LifeJob[] = [
  { id: 'doctor', title: 'طبيب', salary: 16000, icon: 'heart', degree: true },
  { id: 'engineer', title: 'مهندس', salary: 14000, icon: 'bolt', degree: true },
  { id: 'teacher', title: 'معلم', salary: 11000, icon: 'book', degree: true },
  { id: 'lawyer', title: 'محامٍ', salary: 13000, icon: 'key', degree: true },
  { id: 'pharmacist', title: 'صيدلي', salary: 13000, icon: 'drop', degree: true },
  { id: 'programmer', title: 'مبرمج', salary: 14000, icon: 'calc', degree: true },
  { id: 'architect', title: 'مهندس معماري', salary: 13000, icon: 'house', degree: true },
  { id: 'pilot', title: 'طيار', salary: 15000, icon: 'globe', degree: true },
  { id: 'journalist', title: 'صحفي', salary: 11000, icon: 'mic', degree: true },
  { id: 'vet', title: 'طبيب بيطري', salary: 12000, icon: 'paw', degree: true },
];

export const HOUSES: LifeHouse[] = [
  { id: 'village', title: 'دار في البادية', price: 30000, sell: 45000, icon: 'leaf' },
  { id: 'flat', title: 'شقة صغيرة', price: 40000, sell: 55000, icon: 'key' },
  { id: 'apartment', title: 'شقة جديدة', price: 60000, sell: 80000, icon: 'house' },
  { id: 'medina', title: 'دار تقليدية', price: 70000, sell: 100000, icon: 'sun' },
  { id: 'sea', title: 'شقة على البحر', price: 90000, sell: 125000, icon: 'drop' },
  { id: 'riad', title: 'رياض', price: 110000, sell: 150000, icon: 'star' },
  { id: 'villa', title: 'فيلا', price: 150000, sell: 200000, icon: 'crown' },
];

export type LifeEffect =
  /** gain (+) or lose (−) money */
  | { t: 'money'; amount: number }
  /** a loss the insurance pays for */
  | { t: 'insured'; amount: number }
  /** a bonus: this many salaries */
  | { t: 'salary'; times: number }
  /** a raise */
  | { t: 'raise'; amount: number }
  /** every other player pays you (+), or you pay every other player (−) */
  | { t: 'each'; amount: number }
  /** per person: you and each of your family tokens */
  | { t: 'perHead'; amount: number }
  /** a new family token */
  | { t: 'token'; kind: LifeTokenKind };

export interface LifeEvent {
  title: string;
  text: string;
  fx: LifeEffect;
}

/** School and university years. */
export const SCHOOL_EVENTS: LifeEvent[] = [
  { title: 'جائزة التفوق', text: 'نلت جائزة التفوق في آخر السنة!', fx: { t: 'money', amount: 2000 } },
  { title: 'رحلة مدرسية', text: 'رحلة مدرسية إلى مراكش… ومعها الحلويات والصور.', fx: { t: 'money', amount: -1000 } },
  { title: 'عمل صيفي', text: 'ساعدت في دكان العائلة طول الصيف.', fx: { t: 'money', amount: 2000 } },
  { title: 'حاسوب جديد', text: 'اشتريت حاسوباً للدراسة.', fx: { t: 'money', amount: -3000 } },
  { title: 'مسابقة الرسم', text: 'فزت في مسابقة الحي للرسم.', fx: { t: 'money', amount: 2000 } },
  { title: 'الهاتف ضاع', text: 'نسيت هاتفك في الحافلة…', fx: { t: 'insured', amount: -1500 } },
  { title: 'منحة دراسية', text: 'حصلت على منحة دراسية. مبروك!', fx: { t: 'money', amount: 4000 } },
  { title: 'دروس إضافية', text: 'دروس إضافية في الرياضيات قبل الامتحان.', fx: { t: 'money', amount: -2000 } },
  { title: 'عيدية', text: 'عيدية الجدّة في العيد الصغير.', fx: { t: 'money', amount: 1000 } },
  { title: 'بطولة الحي', text: 'فريقك ربح دوري كرة القدم في الحي!', fx: { t: 'money', amount: 1500 } },
  { title: 'نظارات جديدة', text: 'كثرة القراءة… نظارات جديدة.', fx: { t: 'money', amount: -1000 } },
  { title: 'تدريب مدفوع', text: 'تدريب صيفي مدفوع الأجر في شركة كبيرة.', fx: { t: 'money', amount: 3000 } },
  { title: 'حفلة النجاح', text: 'نجحت! وحفلة صغيرة مع الأصدقاء على حسابك.', fx: { t: 'money', amount: -1000 } },
];

/** Working life. */
export const LIFE_EVENTS: LifeEvent[] = [
  { title: 'عرس ابن عمك', text: 'عرس ابن عمك: قدّمت هدية محترمة.', fx: { t: 'money', amount: -2000 } },
  { title: 'مسابقة الحي', text: 'ربحت مسابقة الحي في الطبخ بطاجين البرقوق!', fx: { t: 'money', amount: 3000 } },
  { title: 'تعطلت السيارة', text: 'تعطلت السيارة في طريق إفران.', fx: { t: 'insured', amount: -4000 } },
  { title: 'هدية من الخارج', text: 'عمك المهاجر أرسل لك هدية من الخارج.', fx: { t: 'money', amount: 5000 } },
  { title: 'جاء دورك في دارت', text: 'جاء دورك في «دارت» مع الجيران.', fx: { t: 'money', amount: 6000 } },
  { title: 'تسرّب الماء', text: 'تسرّب الماء من السطح بعد المطر.', fx: { t: 'insured', amount: -5000 } },
  { title: 'فاتورة الكهرباء', text: 'المكيّف لم يتوقف طول الصيف… فاتورة الكهرباء!', fx: { t: 'money', amount: -1500 } },
  { title: 'ضيوف بلا موعد', text: 'ضيوف بلا موعد: مشوي وشاي للجميع.', fx: { t: 'money', amount: -2000 } },
  { title: 'خروف العيد', text: 'ثمن خروف العيد هذه السنة…', fx: { t: 'money', amount: -3000 } },
  { title: 'مخالفة', text: 'مخالفة السرعة على الطريق السيار.', fx: { t: 'money', amount: -1000 } },
  { title: 'حفلة في الدار', text: 'حفلة في الدار: كل لاعب يهديك 1000.', fx: { t: 'each', amount: 1000 } },
  { title: 'كسكس الجمعة', text: 'عزمت الجميع على الكسكس يوم الجمعة: تعطي كل لاعب 500.', fx: { t: 'each', amount: -500 } },
  { title: 'مكافأة آخر السنة', text: 'مكافأة آخر السنة: راتب إضافي!', fx: { t: 'salary', times: 1 } },
  { title: 'ترقية مفاجئة', text: 'المدير معجب بعملك: راتبك يزيد 1000.', fx: { t: 'raise', amount: 1000 } },
  { title: 'سُرقت الدراجة', text: 'سُرقت الدراجة النارية من أمام الدار.', fx: { t: 'insured', amount: -3000 } },
  { title: 'عطلة في الشمال', text: 'عطلة صيفية في الشمال مع الأحباب: 1000 لكل واحد (وأنت معهم).', fx: { t: 'perHead', amount: -1000 } },
  { title: 'زيت الزيتون', text: 'بعت زيت الزيتون من أرض الجد.', fx: { t: 'money', amount: 4000 } },
  { title: 'جائزة المهرجان', text: 'ربحت جائزة في المهرجان المحلي.', fx: { t: 'money', amount: 3000 } },
  { title: 'قط تائه', text: 'وجدتم قطاً تائهاً… وصار من العائلة.', fx: { t: 'token', kind: 'pet' } },
  { title: 'الثلاجة', text: 'إصلاح الثلاجة قبل رمضان.', fx: { t: 'money', amount: -2000 } },
  { title: 'هزة خفيفة', text: 'هزة أرضية خفيفة: شقوق في الحائط.', fx: { t: 'insured', amount: -6000 } },
  { title: 'تحدّي الشاي', text: 'ربحت تحدّي «أحسن أتاي» في المقهى.', fx: { t: 'money', amount: 1000 } },
  { title: 'دين قديم', text: 'جارك أرجع لك مالاً أقرضته قبل سنوات!', fx: { t: 'money', amount: 2500 } },
  { title: 'الحقيبة ضاعت', text: 'ضاعت حقيبتك في المطار.', fx: { t: 'insured', amount: -2500 } },
  { title: 'دورة تكوينية', text: 'دورة تكوينية في العمل… وتعلمت الكثير.', fx: { t: 'money', amount: -1500 } },
  { title: 'جلد الخروف', text: 'بعت جلد الخروف بعد العيد. ثروة!', fx: { t: 'money', amount: 500 } },
  { title: 'صديق الطفولة', text: 'التقيت صديق الطفولة… وصار يزوركم كل أسبوع.', fx: { t: 'token', kind: 'friend' } },
  { title: 'سوق الأحد', text: 'بعت أغراضاً قديمة في سوق الأحد.', fx: { t: 'money', amount: 1500 } },
];

/** The family space: a new member, a friend or a pet. */
export const FAMILY_CARDS: { text: string; kind: LifeTokenKind }[] = [
  { text: 'عضو جديد في العائلة!', kind: 'family' },
  { text: 'الجدّة جاءت لتسكن معكم.', kind: 'family' },
  { text: 'ابن أختك جاء ليدرس في مدينتكم ويسكن عندكم.', kind: 'family' },
  { text: 'عضو جديد في العائلة… والكل فرحان!', kind: 'family' },
  { text: 'تبنّيتم قطاً صغيراً اسمه «مشمش».', kind: 'pet' },
  { text: 'جرو صغير صار حارس الدار.', kind: 'pet' },
  { text: 'سلحفاة في الحديقة… لن تغادر أبداً.', kind: 'pet' },
  { text: 'صديق عمر جديد.', kind: 'friend' },
  { text: 'جيران جدد صاروا كالعائلة.', kind: 'friend' },
];

/** «مشروع مغامر» titles. */
export const RISK_PROJECTS = [
  'مقهى في الحي',
  'تصدير الزرابي',
  'تطبيق على الهاتف',
  'مزرعة نحل في الأطلس',
  'مطعم سمك في الصويرة',
  'محل عصير في الساحة',
  'ورشة فخار في آسفي',
  'قناة طبخ على الإنترنت',
];
