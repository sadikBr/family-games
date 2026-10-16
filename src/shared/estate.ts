/**
 * «ملك العقار» — a property-trading board game with Moroccan cities (own board, own names).
 * 40 squares, clockwise from «انطلاق».
 */

export type EstateGroup = 'brown' | 'sky' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'navy';

export type EstateSquare =
  | { kind: 'go'; name: string }
  | { kind: 'city'; name: string; group: EstateGroup; price: number; rent: number[]; house: number }
  | { kind: 'station'; name: string; price: number }
  | { kind: 'utility'; name: string; price: number; icon: 'power' | 'water' }
  | { kind: 'tax'; name: string; amount: number }
  | { kind: 'luck'; name: string } // حظ
  | { kind: 'family'; name: string } // صندوق العائلة
  | { kind: 'jail'; name: string }
  | { kind: 'rest'; name: string }
  | { kind: 'gotojail'; name: string };

const city = (name: string, group: EstateGroup, price: number, rent: number[], house: number): EstateSquare => ({ kind: 'city', name, group, price, rent, house });

export const BOARD: EstateSquare[] = [
  { kind: 'go', name: 'انطلاق' },
  city('ورزازات', 'brown', 60, [2, 10, 30, 90, 160, 250], 50),
  { kind: 'family', name: 'صندوق العائلة' },
  city('الرشيدية', 'brown', 60, [4, 20, 60, 180, 320, 450], 50),
  { kind: 'tax', name: 'ضريبة الدخل', amount: 200 },
  { kind: 'station', name: 'محطة طنجة', price: 200 },
  city('الحسيمة', 'sky', 100, [6, 30, 90, 270, 400, 550], 50),
  { kind: 'luck', name: 'حظ' },
  city('شفشاون', 'sky', 100, [6, 30, 90, 270, 400, 550], 50),
  city('تطوان', 'sky', 120, [8, 40, 100, 300, 450, 600], 50),
  { kind: 'jail', name: 'السجن' },
  city('بني ملال', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  { kind: 'utility', name: 'الكهرباء', price: 150, icon: 'power' },
  city('خريبكة', 'pink', 140, [10, 50, 150, 450, 625, 750], 100),
  city('الجديدة', 'pink', 160, [12, 60, 180, 500, 700, 900], 100),
  { kind: 'station', name: 'محطة فاس', price: 200 },
  city('مكناس', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  { kind: 'family', name: 'صندوق العائلة' },
  city('إفران', 'orange', 180, [14, 70, 200, 550, 750, 950], 100),
  city('فاس', 'orange', 200, [16, 80, 220, 600, 800, 1000], 100),
  { kind: 'rest', name: 'استراحة' },
  city('الصويرة', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  { kind: 'luck', name: 'حظ' },
  city('أكادير', 'red', 220, [18, 90, 250, 700, 875, 1050], 150),
  city('العيون', 'red', 240, [20, 100, 300, 750, 925, 1100], 150),
  { kind: 'station', name: 'محطة الرباط', price: 200 },
  city('القنيطرة', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  city('المحمدية', 'yellow', 260, [22, 110, 330, 800, 975, 1150], 150),
  { kind: 'utility', name: 'الماء', price: 150, icon: 'water' },
  city('طنجة', 'yellow', 280, [24, 120, 360, 850, 1025, 1200], 150),
  { kind: 'gotojail', name: 'إلى السجن' },
  city('سلا', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  city('الرباط', 'green', 300, [26, 130, 390, 900, 1100, 1275], 200),
  { kind: 'family', name: 'صندوق العائلة' },
  city('أكدال', 'green', 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { kind: 'station', name: 'محطة الدار البيضاء', price: 200 },
  { kind: 'luck', name: 'حظ' },
  city('مراكش', 'navy', 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { kind: 'tax', name: 'ضريبة الرفاهية', amount: 100 },
  city('الدار البيضاء', 'navy', 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export const JAIL = 10;
export const GO_BONUS = 200;
export const JAIL_FINE = 50;
export const STATION_RENT = [25, 50, 100, 200];

export const GROUP_COLOR: Record<EstateGroup, string> = {
  brown: '#8A5A33',
  sky: '#6EC6F0',
  pink: '#E86FA6',
  orange: '#F08A3E',
  red: '#E2475F',
  yellow: '#F2C23D',
  green: '#2FB67C',
  navy: '#3B4FC4',
};

export const isOwnable = (sq: EstateSquare) => sq.kind === 'city' || sq.kind === 'station' || sq.kind === 'utility';
export const priceOf = (i: number) => {
  const sq = BOARD[i];
  return sq.kind === 'city' || sq.kind === 'station' || sq.kind === 'utility' ? sq.price : 0;
};
export const groupSquares = (g: EstateGroup) => BOARD.map((s, i) => (s.kind === 'city' && s.group === g ? i : -1)).filter((i) => i >= 0);

export interface EstateCard {
  text: string;
  /** what happens: money (+/-), move to a square, move back, jail, free-jail card, repairs, from each player… */
  act:
    | { t: 'money'; amount: number }
    | { t: 'goto'; to: number }
    | { t: 'back'; n: number }
    | { t: 'jail' }
    | { t: 'free' }
    | { t: 'repairs'; house: number; hotel: number }
    | { t: 'each'; amount: number } // every other player pays you (negative: you pay each)
    | { t: 'nearest'; kind: 'station' | 'utility' };
}

export const LUCK_CARDS: EstateCard[] = [
  { text: 'تقدّم إلى «انطلاق» وخذ 200', act: { t: 'goto', to: 0 } },
  { text: 'رحلة إلى الدار البيضاء! تقدّم إليها', act: { t: 'goto', to: 39 } },
  { text: 'زيارة للعائلة في فاس: تقدّم إلى فاس', act: { t: 'goto', to: 19 } },
  { text: 'تقدّم إلى أقرب محطة قطار', act: { t: 'nearest', kind: 'station' } },
  { text: 'تقدّم إلى أقرب شركة (الماء أو الكهرباء)', act: { t: 'nearest', kind: 'utility' } },
  { text: 'نسيت شيئاً في البيت! ارجع 3 خانات', act: { t: 'back', n: 3 } },
  { text: 'مخالفة سرعة على الطريق السيار: ادفع 15', act: { t: 'money', amount: -15 } },
  { text: 'ربحت مسابقة الطبخ بطاجين رائع: خذ 50', act: { t: 'money', amount: 50 } },
  { text: 'إصلاحات في عقاراتك: 25 لكل منزل و 100 لكل فندق', act: { t: 'repairs', house: 25, hotel: 100 } },
  { text: 'اذهب إلى السجن مباشرة', act: { t: 'jail' } },
  { text: 'بطاقة الخروج من السجن مجاناً', act: { t: 'free' } },
  { text: 'انتخبوك رئيس جمعية الحي: ادفع لكل لاعب 50', act: { t: 'each', amount: -50 } },
  { text: 'استثمار ناجح في السوق: خذ 150', act: { t: 'money', amount: 150 } },
];

export const FAMILY_CARDS: EstateCard[] = [
  { text: 'خطأ من البنك لصالحك: خذ 200', act: { t: 'money', amount: 200 } },
  { text: 'زيارة الطبيب: ادفع 50', act: { t: 'money', amount: -50 } },
  { text: 'بعت زربية قديمة في السوق: خذ 50', act: { t: 'money', amount: 50 } },
  { text: 'عيد ميلادك! كل لاعب يعطيك 10', act: { t: 'each', amount: 10 } },
  { text: 'مصاريف المدرسة: ادفع 50', act: { t: 'money', amount: -50 } },
  { text: 'هدية العيد من الجدة: خذ 100', act: { t: 'money', amount: 100 } },
  { text: 'استرجاع الضريبة: خذ 20', act: { t: 'money', amount: 20 } },
  { text: 'تقدّم إلى «انطلاق» وخذ 200', act: { t: 'goto', to: 0 } },
  { text: 'بطاقة الخروج من السجن مجاناً', act: { t: 'free' } },
  { text: 'اذهب إلى السجن مباشرة', act: { t: 'jail' } },
  { text: 'حفل زفاف ابن العم: ادفع 100', act: { t: 'money', amount: -100 } },
  { text: 'ورثت مبلغاً صغيراً: خذ 100', act: { t: 'money', amount: 100 } },
  { text: 'إصلاح سقف الدار: 40 لكل منزل و 115 لكل فندق', act: { t: 'repairs', house: 40, hotel: 115 } },
  { text: 'فزت في مسابقة الحي: خذ 10', act: { t: 'money', amount: 10 } },
];
