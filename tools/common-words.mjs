/**
 * Builds server/data/common-words.txt — everyday Arabic words (normalised like names-dict.txt, «ال»
 * kept as written) that the «شبكة الكلمات» bots are allowed to play, so they don't play obscure
 * stems or subtitle typos. Players can still play anything in names-dict.txt.
 * A word is kept when it is said often (OpenSubtitles frequency ≥ minFrequency) AND it is a Hunspell
 * dictionary word (or «ال» + one), and isn't on the small family blocklist below.
 * Sources: ar.dic, ar_full.txt — see tools/names-dict.mjs.
 *   node tools/common-words.mjs [minFrequency=100] && mv common-words.txt server/data/
 */
import fs from 'node:fs';
const norm = (s) => s.trim().replace(/[ً-ْـٰ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
const dic = fs.readFileSync('ar.dic', 'utf8');
const stems = new Set();
let section = '';
for (const line of dic.split('\n').slice(1)) {
  const m = /^#\s*([\w.]+\.dic)\s*#/.exec(line); if (m) section = m[1];
  const w = line.split('/')[0].trim();
  if (!w || w.startsWith('#')) continue;
  if (section !== 'stopwords.dic' && section !== 'tools.dic') stems.add(norm(w));
}
const MIN = Number(process.argv[2] ?? 100);
// words a family game's bots should never play (alcohol, insults)
const BLOCK = new Set(['فودكا', 'خمر', 'خمور', 'نبيذ', 'ويسكي', 'بيره', 'شمبانيا', 'سكران', 'سكاري', 'ثمل', 'كحولي', 'حشيش', 'مخدرات', 'عاهره', 'قحبه', 'زاني', 'زنا', 'لعين', 'ملعون', 'حقير', 'غبي', 'احمق', 'وغد', 'سافل', 'تافه', 'قذر', 'لعنه'].map(norm));
const out = new Set(); let checked = 0;
const t = Date.now();
for (const line of fs.readFileSync('ar_full.txt', 'utf8').split('\n')) {
  const [w, c] = line.split(' ');
  if (Number(c) < MIN) break;
  if (!w || !/^[ء-يً-ْٰ]+$/.test(w)) continue;
  const k = norm(w);
  if (k.length < 2 || /(.)\1\1/.test(k) || BLOCK.has(k) || BLOCK.has(k.replace(/^ال/, ''))) continue;
  checked++;
  const rest = k.startsWith('ال') && k.length > 3 ? k.slice(2) : null;
  if (stems.has(k) || (rest && stems.has(rest))) out.add(k);
}
console.log('checked', checked, 'kept', out.size, 'ms', Date.now() - t);
const arr = [...out];
fs.writeFileSync('common-words.txt', arr.sort().join('\n') + '\n');
