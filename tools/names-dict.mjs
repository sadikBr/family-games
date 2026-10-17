/**
 * Builds server/data/names-dict.txt — the words «اسم ولد اسم بنت» recognises, one normalised word
 * per line (no diacritics, أإآ→ا, ة→ه, ى→ي, ؤ→و, ئ→ي, without the article «ال»), so the server
 * only needs a Set lookup.
 * Sources (download next to this script first, same as tools/wordle-dict.mjs):
 *   ar.dic      — the Ayaspell Arabic Hunspell dictionary (LibreOffice/dictionaries, ar/; GPL/LGPL/MPL): every stem
 *   ar_full.txt — Arabic word frequencies from OpenSubtitles (hermitdave/FrequencyWords, MIT): words people
 *                 really say, which brings in inflected forms, names and everyday Moroccan words
 * The curated lists in server/names-words.ts are checked separately at run time.
 *   node tools/names-dict.mjs [minFrequency=10] && mv names-dict.txt server/data/names-dict.txt
 */
import fs from 'node:fs';

const norm = (s) =>
  s.trim().replace(/[ً-ْـٰ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
const key = (w) => {
  const n = norm(w);
  return n.startsWith('ال') && n.length > 3 ? n.slice(2) : n;
};
const ARABIC = /^[ء-يً-ْٰ]+$/;
const words = new Set();
// grammar words and particles («ما», «في», «هذا»…) are real but no answer to anything
const stop = new Set();
let section = '';
for (const line of fs.readFileSync('ar.dic', 'utf8').split('\n').slice(1)) {
  const m = /^#\s*([\w.]+\.dic)\s*#/.exec(line);
  if (m) section = m[1];
  const w = line.split('/')[0].trim();
  if (!w || w.startsWith('#') || !ARABIC.test(w)) continue;
  if (section === 'stopwords.dic' || section === 'tools.dic') stop.add(key(w));
  else words.add(key(w));
}
for (const w of stop) words.delete(w);
const stems = words.size;
// interjections and laughter from subtitles: «ممم», «ههههه», «اااه»
const noise = (w) => /(.)\1\1/.test(w) || /^(ه|ا|ي|و|م|ء)+$/.test(w);

const MIN = Number(process.argv[2] ?? 10);
const freq = new Map();
for (const line of fs.readFileSync('ar_full.txt', 'utf8').split('\n')) {
  const [w, c] = line.split(' ');
  if (!w || !ARABIC.test(w)) continue;
  const k = key(w);
  freq.set(k, (freq.get(k) ?? 0) + Number(c));
}
for (const [k, n] of freq) if (n >= MIN && !stop.has(k) && !noise(k) && [...k].length >= 3) words.add(k);

const out = [...words].filter((w) => [...w].length >= 2 && /^[ء-ي]+$/.test(w)).sort();
fs.writeFileSync('names-dict.txt', out.join('\n') + '\n');
console.log(`stems ${stems}, with frequent words (≥${MIN}) ${out.length}`);
