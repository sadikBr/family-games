/**
 * Builds server/data/quran-full.json — the COMPLETE Quran text (all 114 surahs, 6236 verses), used by
 * «من القائل؟» and «كلمة قرآنية». (server/quran-data.json is a filtered copy for «من أي سورة؟».)
 * Source: the npm package quran-json@3.1.2 (Uthmani text from quranenc.com, CC BY-SA 4.0). The text is
 * copied as is, never edited. Install it in a temporary folder (not in the project), then run:
 *   mkdir /tmp/qj && cd /tmp/qj && npm i quran-json@3.1.2
 *   node tools/quran-full.mjs /tmp/qj/node_modules/quran-json/dist/quran.json
 */
import fs from 'node:fs';

const input = process.argv[2];
if (!input) throw new Error('usage: node tools/quran-full.mjs <path to quran-json/dist/quran.json>');
const chapters = JSON.parse(fs.readFileSync(input, 'utf8'));

const surahs = [];
const verses = [];
for (const c of chapters) {
  if (c.verses.length !== c.total_verses) throw new Error(`surah ${c.id}: ${c.verses.length} verses, expected ${c.total_verses}`);
  surahs.push({ n: c.id, name: c.name, type: c.type, count: c.total_verses });
  c.verses.forEach((v, i) => {
    if (v.id !== i + 1) throw new Error(`surah ${c.id}: verse ${v.id} out of order`);
    verses.push([c.id, v.id, v.text]);
  });
}
if (surahs.length !== 114) throw new Error(`${surahs.length} surahs, expected 114`);
if (verses.length !== 6236) throw new Error(`${verses.length} verses, expected 6236`);

const out = new URL('../server/data/quran-full.json', import.meta.url);
const json = `{"source":${JSON.stringify('quran-json 3.1.2 — Uthmani text from quranenc.com (The Noble Qur\'an Encyclopedia), CC BY-SA 4.0; complete: 114 surahs, 6236 verses')},\n"surahs":[\n${surahs.map((s) => JSON.stringify(s)).join(',\n')}\n],\n"verses":[\n${verses.map((v) => JSON.stringify(v)).join(',\n')}\n]}\n`;
fs.writeFileSync(out, json);
console.log(`wrote ${surahs.length} surahs, ${verses.length} verses`);
