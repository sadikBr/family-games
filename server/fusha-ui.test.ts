/** Player-facing UI text is Modern Standard Arabic (الفصحى): no dialect words in the app or server strings. */
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/** Dialect words (Darija, Egyptian, Levantine, Gulf…) and their MSA replacements, for the error message. */
const DIALECT: Record<string, string> = {
  'ماشي': 'ليس', 'يلا': 'هيا', 'يالله': 'هيا', 'شفت': 'رأيت', 'شوف': 'انظر', 'يشوفك': 'يراك', 'بزاف': 'كثيراً',
  'ديال': 'لـ', 'واش': 'هل', 'دابا': 'الآن', 'مزيان': 'جيد', 'كيفاش': 'كيف', 'علاش': 'لماذا', 'فين': 'أين',
  'شنو': 'ماذا', 'صافي': 'انتهى', 'زعما': 'أي', 'برشا': 'كثيراً', 'دلوقتي': 'الآن', 'ازاي': 'كيف', 'إزاي': 'كيف',
  'كده': 'هكذا', 'عايز': 'تريد', 'بتاع': 'لـ', 'هلق': 'الآن', 'هيك': 'هكذا', 'بدّي': 'أريد', 'ليش': 'لماذا',
  'كمان': 'أيضاً', 'هادي': 'هذه', 'هادا': 'هذا', 'كارطة': 'ورق', 'الكارطة': 'الورق', 'بغيت': 'أريد', 'غادي': 'سـ',
  'عافاك': 'من فضلك', 'خاصك': 'يجب عليك', 'جوج': 'اثنان', 'لازم': 'يجب', 'طاكسي': 'سيارة أجرة', 'ستات': 'رميات 6',
  'غلط': 'خاطئ', 'غلطاً': 'خاطئاً', 'صح': 'صحيح', 'زرواطة': 'عصيّ', 'صوطا': 'الخادم', 'الصوطا': 'الخادم',
};
/** Dialect phrases. */
const PHRASES = ['تعال نلعب', 'بدون ما', 'الطريق السيار', 'إذا عندك', 'كل واحد يلعب'];

/** Word lists and other content (checked by their own tests; codenames-judge is a test fixture, never shown). */
const CONTENT = /^server\/(content[^/]*|bot-content|names-words|imposter-traits|charades-content|spy-content|survey-content|codenames-links|codenames-judge|scrabble-dict|dictionary|boggle-grid)\.ts$|^server\/data\//; // boggle-grid holds the dialect blocklist itself
const IN_PROGRESS = /^$/; // every game is checked now

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'server'))]
  .map((p) => relative(ROOT, p).split('\\').join('/'))
  .filter((f) => !CONTENT.test(f) && !IN_PROGRESS.test(f));

/** Arabic word boundaries: a word is a run of Arabic letters (diacritics included). */
const wordRe = (w: string) => new RegExp(`(^|[^\\u0621-\\u064A\\u064B-\\u0652])${w}($|[^\\u0621-\\u064A\\u064B-\\u0652])`);
const WORDS = Object.keys(DIALECT).map((w) => [w, wordRe(w)] as const);

test('fusha: the scan covers the app and the server', () => {
  expect(files.length).toBeGreaterThan(100);
  for (const f of ['src/games/meta.ts', 'src/app/index.tsx', 'server/games/ronda.ts', 'src/shared/estate.ts']) expect(files).toContain(f);
});

test('fusha: no dialect words or phrases in player-facing strings', () => {
  const hits: string[] = [];
  for (const f of files) {
    const lines = readFileSync(join(ROOT, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/[\u0621-\u064A]/.test(line)) return;
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // comments
      // exceptions: the tajweed term «مدّ لازم», the روندا calls «ف جوج» / «ف ثلاثة» (names of the game's own calls, like «روندا»),
      // and «صحّ» as the name and the button of «صح أم خطأ» (the textbook form «صحّ أم خطأ»)
      for (const [w, re] of WORDS) if (re.test(line) && !(w === 'لازم' && /مدّ? لازم|المد اللازم|اللازم/.test(line)) && !(w === 'جوج' && /ف جوج/.test(line)) && !(w === 'صح' && /truefalse/.test(f))) hits.push(`${f}:${i + 1}: «${w}» → «${DIALECT[w]}»`);
      for (const p of PHRASES) if (line.includes(p)) hits.push(`${f}:${i + 1}: «${p}»`);
    });
  }
  expect(hits).toEqual([]);
});

test('fusha: «ليس دورك» is the not-your-turn error everywhere', () => {
  for (const f of files.filter((x) => x.startsWith('server/games/'))) {
    expect(readFileSync(join(ROOT, f), 'utf8')).not.toContain('ماشي دورك');
  }
});

test('fusha: the card games group has an MSA title', () => {
  const meta = readFileSync(join(ROOT, 'src/games/meta.ts'), 'utf8');
  const group = meta.split('\n').find((l) => l.includes("games: ['ronda'"))!;
  expect(group).toContain("title: 'ألعاب الورق'");
  expect(group).toContain("short: 'الورق'");
});
