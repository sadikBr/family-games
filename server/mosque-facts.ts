/**
 * «ابنِ المسجد» — a few questions about the parts of a mosque and Moroccan mosque architecture, added
 * to the Islamic question bank (content-islamic.ts). Only facts that are certain; questions already in
 * the bank (Koutoubia, Hassan tower, al-Qarawiyyin, Hassan II mosque…) are not repeated here.
 */
import type { Question } from './content-islamic';

export interface MosqueQuestion {
  q: string;
  a: string;
  w: string[];
  label: string;
}

const ARCH = 'عمارة المساجد';

export const MOSQUE_FACTS: MosqueQuestion[] = [
  { q: 'ما الاسم الذي يُطلق في المغرب عادةً على مئذنة المسجد؟', a: 'الصومعة', w: ['القبة', 'المحراب', 'الرواق'], label: ARCH },
  { q: 'ما اسم الفن المغربي الذي تُركَّب فيه قطع صغيرة ملوّنة من الخزف لتكوين أشكال هندسية؟', a: 'الزليج', w: ['الجبس المنقوش', 'النقش على الخشب', 'التطريز'], label: ARCH },
  { q: 'ما اسم المكان في جدار القبلة الذي يقف أمامه الإمام في الصلاة؟', a: 'المحراب', w: ['المنبر', 'الصحن', 'الرواق'], label: ARCH },
  { q: 'على ماذا يقف الخطيب يوم الجمعة ليخطب في الناس؟', a: 'المنبر', w: ['المحراب', 'الصومعة', 'العتبة'], label: ARCH },
  { q: 'ما اسم الساحة المكشوفة داخل المسجد التي تحيط بها الأروقة غالباً؟', a: 'الصحن', w: ['المحراب', 'القبة', 'الصومعة'], label: ARCH },
  { q: 'ما الذي يُرفع من الصومعة خمس مرات في اليوم؟', a: 'الأذان', w: ['الإقامة', 'الخطبة', 'الدعاء'], label: ARCH },
  { q: 'ما شكل قاعدة الصومعة في أغلب المساجد المغربية التقليدية؟', a: 'مربّعة', w: ['دائرية', 'مثمّنة', 'مثلّثة'], label: ARCH },
  { q: 'إلى أي جهة يُبنى جدار المحراب في كل مسجد؟', a: 'جهة القبلة (الكعبة)', w: ['جهة الشروق دائماً', 'جهة البحر', 'جهة باب المسجد'], label: ARCH },
  { q: 'لماذا تُبنى في كثير من المساجد المغربية نافورة أو ميضأة قرب الصحن؟', a: 'للوضوء', w: ['لسقي الحدائق', 'لتبريد الصومعة', 'لإطفاء الحرائق'], label: ARCH },
];

/** A bank question in the same shape. */
export function fromBank(q: Question, label: string): MosqueQuestion {
  return { q: q.q, a: q.a, w: [...q.w], label };
}
