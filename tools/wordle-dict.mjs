/**
 * Builds server/data/wordle-valid.txt — every 5-letter word «كلمة السر» accepts as a guess.
 * Sources (download next to this script first):
 *   ar.dic / ar.aff  — the Ayaspell Arabic Hunspell dictionary (LibreOffice/dictionaries, ar/; GPL/LGPL/MPL)
 *   ar_full.txt      — Arabic word frequencies from OpenSubtitles (hermitdave/FrequencyWords, MIT)
 * A word is kept if the dictionary accepts it, or if it is common in real speech (≥30 uses).
 *   npm i nspell && node tools/wordle-dict.mjs 30 && mv valid5.txt server/data/wordle-valid.txt
 */
import fs from 'node:fs';
import readline from 'node:readline';
import nspell from 'nspell';
const sp = nspell(fs.readFileSync('ar.aff'), fs.readFileSync('ar.dic'));
const norm = (s) => s.replace(/[ً-ْٰـ\s]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و');
const freq = new Map(), ok = new Set();
const rl = readline.createInterface({ input: fs.createReadStream('ar_full.txt') });
for await (const line of rl) {
  const [w, c] = line.split(' ');
  const n = Number(c);
  if (n < 3) break; // the list is sorted by frequency
  if (!/^[ء-يً-ْ]+$/.test(w)) continue;
  const k = norm(w);
  if ([...k].length !== 5 || !/^[ء-ي]+$/.test(k)) continue;
  freq.set(k, (freq.get(k) ?? 0) + n);
  if (!ok.has(k) && sp.correct(w)) ok.add(k);
}
// dictionary stems of 5 letters
for (const line of fs.readFileSync('ar.dic', 'utf8').split('\n').slice(1)) {
  const w = line.split('/')[0].trim();
  if (!w || w.startsWith('#') || !/^[ء-ي]+$/.test(w)) continue;
  const k = norm(w);
  if ([...k].length === 5 && /^[ء-ي]+$/.test(k)) ok.add(k);
}
const MINF = Number(process.argv[2] ?? 30);
const words = new Set([...ok].filter((k) => k)); // dictionary-confirmed
for (const [k, n] of freq) if (n >= MINF) words.add(k); // common in real speech/subtitles
console.log('confirmed', ok.size, 'freq candidates', freq.size, 'final', words.size);
fs.writeFileSync('valid5.txt', [...words].sort().join('\n'));
const sample = [...words].sort(() => Math.random() - 0.5).slice(0, 60);
console.log(sample.join(' '));
const freqOnly = [...freq].filter(([k, n]) => n >= MINF && !ok.has(k)).sort(() => Math.random() - 0.5).slice(0, 60).map(([k, n]) => k + ':' + n);
console.log('freq-only sample:', freqOnly.join(' '));
