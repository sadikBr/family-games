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

/** Edit distance (insert / delete / replace one letter). */
export function editDistance(a: string, b: string): number {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[y.length];
}

/** A typed answer, compared word by word without «ال», hamza shapes, ة/ه, spaces or honorifics. */
function typedKey(s: string): string {
  return norm(s.replace(/[ﷺ()«»"'.,،؛!?؟-]/g, ' '))
    .split(' ')
    .filter(Boolean)
    .map((w) => (w === 'الله' ? w : stripAl(w)))
    .join('');
}

/** Short forms people really say: «عمر» for «عمر بن الخطاب», «أبو بكر» for «أبو بكر الصديق». */
function acceptedForms(answer: string): string[] {
  const words = norm(answer.replace(/[ﷺ()]/g, ' ')).split(' ').filter(Boolean);
  const forms = [words.join(' ')];
  const bin = words.findIndex((w) => w === 'بن' || w === 'بنت');
  if (bin > 0) forms.push(words.slice(0, bin).join(' '));
  if (words.length >= 3 && words[words.length - 1].startsWith('ال')) forms.push(words.slice(0, -1).join(' '));
  return forms.map(typedKey).filter((f) => [...f].length >= 3 || f === typedKey(answer));
}

/** Is a typed answer close enough? Allows one slip in 4–7 letters, two from 8 letters. */
export function answerMatches(typed: string, answer: string): boolean {
  const t = typedKey(typed);
  if (!t) return false;
  return acceptedForms(answer).some((f) => {
    if (t === f) return true;
    const n = [...f].length;
    const slack = n >= 8 ? 2 : n >= 4 ? 1 : 0;
    return slack > 0 && editDistance(t, f) <= slack;
  });
}

/** Is the typed answer exactly the answer (or one of its short forms), with no spelling slip? */
export function answerExact(typed: string, answer: string): boolean {
  const t = typedKey(typed);
  return !!t && acceptedForms(answer).includes(t);
}

/** The word without its long vowels (ا و ي): «زيمبابوي» and «زمبابوي» share «زمبب». */
const skeleton = (k: string) => k.replace(/[اوي]/g, '');

/**
 * «اسم ولد اسم بنت»: two answers count as the same word spelled differently (and share the points)
 * when they match after normalising, or — for words of 5+ letters — differ only by long vowels or by
 * one letter (two from 8 letters). Short names stay strict, so «سعد» ≠ «سعيد» and «سلمى» ≠ «سلوى».
 */
export function similarAnswers(a: string, b: string): boolean {
  const x = answerKey(a), y = answerKey(b);
  if (x === y) return true;
  const n = Math.min([...x].length, [...y].length);
  if (n < 5) return false;
  if (skeleton(x) === skeleton(y)) return true;
  return editDistance(x, y) <= (n >= 8 ? 2 : 1);
}

/**
 * «اسم ولد اسم بنت»: does the answer really start with this letter? The article «ال» is not skipped,
 * so «الرباط» does not count for ر — and, being just the article, not for ا either. A hamza on the
 * alif means it is part of the word: «ألمانيا» and «إلياس» count for ا.
 */
export function startsWithLetter(word: string, letter: string): boolean {
  const raw = word.trim().replace(DIACRITICS, '');
  if (raw.startsWith('ال') && raw.length > 3) return false;
  return norm(raw)[0] === letter;
}
