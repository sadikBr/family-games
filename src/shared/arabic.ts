/** Small helpers to compare Arabic words the way players expect. */

const DIACRITICS = /[ً-ْـٰ]/g;

export function norm(s: string): string {
  return s
    .trim()
    .replace(DIACRITICS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ');
}

/** "الأسد" → "اسد", but keeps short words like "ال" alone. */
export function stripAl(s: string): string {
  return s.startsWith('ال') && s.length > 3 ? s.slice(2) : s;
}

export function firstLetter(word: string): string {
  return stripAl(norm(word))[0] ?? '';
}

/** Two answers count as the same if they match after normalising. */
export function answerKey(word: string): string {
  return stripAl(norm(word)).replace(/ /g, '');
}

/** Letters used by "اسم ولد اسم بنت" (hard ones like ث ذ ض ظ are skipped). */
export const GAME_LETTERS = [
  'ا', 'ب', 'ت', 'ج', 'ح', 'خ', 'د', 'ر', 'ز', 'س', 'ش', 'ص',
  'ط', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي',
];

/** How a letter is shown to players. */
export function displayLetter(l: string): string {
  return l === 'ا' ? 'أ' : l;
}
