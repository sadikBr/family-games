/**
 * Builds server/data/wordle-valid.txt — every 5-letter word «كلمة السر» accepts as a guess.
 * The guesses must be فصحى: dialect words (Egyptian, Tunisian, Levantine, Moroccan…) are refused.
 * Sources (download next to this script first):
 *   ar.dic / ar.aff  — the Ayaspell Arabic Hunspell dictionary (LibreOffice/dictionaries, ar/; GPL/LGPL/MPL)
 *   ar_full.txt      — Arabic word frequencies from OpenSubtitles (hermitdave/FrequencyWords, MIT)
 * Rule — a word (after normalising أ/إ/آ→ا, ى/ئ→ي, ؤ→و) is kept when:
 *   1. it is a 5-letter entry of ar.dic, or a subtitle word (≥3 uses) that Hunspell accepts with its
 *      affix rules (checked with spylls, a faithful Python port of Hunspell: nspell ignores most of
 *      this dictionary's prefixes/suffixes and rejects even «الأمر» or «كتابه»), or
 *   2. it is on the small hand-checked ALLOW list (very common, correctly spelled فصحى forms that
 *      Hunspell misses, e.g. «قتلوه», «حفيدة»), or
 *   3. it is an everyday form of an everyday dictionary entry: tools/hunspell-forms.ts expands the
 *      entries said ≥10 times in the subtitles with «ال» and one everyday ending (plurals, dual,
 *      feminine, the common pronouns on nouns, the subject endings on verbs — «جرذات», «قروده»,
 *      «خردلة», «شفقات»); forms ending in «يي» («يوميي») are left out,
 *   and it is not on the DIALECT blocklist below. Subtitle frequency alone no longer makes a word valid:
 *   that is how Egyptian/Tunisian forms («عايزة», «بتاعك», «علشان», «يقولو»…) and typos got in.
 *   (The «كلمة السر» answers are always accepted too: see server/games/wordle.ts.)
 *   (Whatever else Hunspell accepts is still checked at run time: see server/games/wordle.ts.)
 *   pip install spylls && node tools/wordle-dict.mjs && mv valid5.txt server/data/wordle-valid.txt
 *   (needs bun on the PATH for step 3)
 * tools/common-words.mjs imports DIALECT from here.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Common dialect forms (any length; each tool normalises them its own way). Words that are also
 * ordinary فصحى words («دول», «واش», «توا», «كمان», «عشانا» = our supper…) are left out on purpose,
 * unless the فصحى reading is rare and the dialect one is what everybody means («شوية», «بتعرف»).
 * Also left out: forms that normalise like a فصحى word in one of the lists («ايه» = «آية», «دي» = «دية»,
 * «ولاده» = «ولادة», «برده» = «بردة», «هلأ» = «هلا»).
 * The list lives in server/data/dialect-words.txt (whitespace-separated): the server reads it too, so a
 * guess the Hunspell check would let through (it reads «عايز», «بتقول», «كده» as rare فصحى forms) is refused.
 */
export const DIALECT = fs.readFileSync(new URL('../server/data/dialect-words.txt', import.meta.url), 'utf8').split(/\s+/).filter(Boolean);

/** Correct, very common فصحى forms (≥100 uses in the subtitles) that Hunspell does not know. */
export const ALLOW = `
  دعوني ظننتك ظننته يتحتم يتأذى تتأذى تأذيت بدأوا جاءوا قتلوه خذوها وضعوه هلموا مقززة مصدوم مخفوق هلوسة جينات
  دزينة سحلية راكون صافرة شوربة بيتزا تدمرت مضاءة يرونه عماذا أصريت حفيدة عطلات معبأة مماذا ضعوها خذوني جعلوه
  جعلوك حفاضة بمزحة تالفة وضعوك ندردش قسطرة ضيفتي لطخات ضربوه جبيرة مطلية سرقوه قيدوه طردوك أبقوه سناجب شراشف
  سكاكر كمزحة مطياف خليوي يتدمر تتدمر رأونا رأوني خذوهم تجدوه يجدوه يجدوك علموك ضعوهم حجيرة مفزوع سباكة صرصار
  ترتعب أرتعب كوالا غيتار شامبو توليب مانجو
`.split(/\s+/).filter(Boolean);

export const norm = (s) => s.replace(/[ً-ْٰـ\s]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/[ىئ]/g, 'ي').replace(/ؤ/g, 'و');
const is5 = (k) => [...k].length === 5 && /^[ء-ي]+$/.test(k);

// reads written forms (one per line) from argv[2], writes 1/0 per line (Hunspell accepts it?) to argv[3]
const HUNSPELL_PY = `
import sys
from spylls.hunspell import Dictionary
d = Dictionary.from_files('ar')
with open(sys.argv[1], encoding='utf-8') as f, open(sys.argv[2], 'w') as o:
    for line in f:
        o.write(('1' if d.lookup(line.rstrip('\\n')) else '0') + '\\n')
`;

function build() {
  // 1. subtitle words of 5 letters (sorted by frequency, stop at 3 uses)
  const cand = []; // [written form, normalised]
  for (const line of fs.readFileSync('ar_full.txt', 'utf8').split('\n')) {
    const [w, c] = line.split(' ');
    if (Number(c) < 3) break;
    if (!w || !/^[ء-يً-ْ]+$/.test(w)) continue;
    const k = norm(w);
    if (is5(k)) cand.push([w, k]);
  }
  fs.writeFileSync('cand5.txt', cand.map(([w]) => w).join('\n') + '\n');
  const py = spawnSync('python3', ['-I', '-c', HUNSPELL_PY, 'cand5.txt', 'cand5.ok'], { stdio: 'inherit' });
  if (py.status !== 0) throw new Error('spylls failed — pip install spylls');
  const flags = fs.readFileSync('cand5.ok', 'utf8').split('\n');
  const hunspell = new Set(cand.filter((_, i) => flags[i] === '1').map(([, k]) => k));
  // 2. dictionary entries of 5 letters
  const stems = new Set();
  for (const line of fs.readFileSync('ar.dic', 'utf8').split('\n').slice(1)) {
    const w = line.split('/')[0].trim();
    if (!w || w.startsWith('#') || !/^[ء-ي]+$/.test(w)) continue;
    const k = norm(w);
    if (is5(k)) stems.add(k);
  }
  // 3. everyday forms of the entries said ≥10 times (stems normalised like norm(): ة → ه too)
  const everyday = new Set();
  for (const line of fs.readFileSync('ar_full.txt', 'utf8').split('\n')) {
    const [w, c] = line.split(' ');
    if (Number(c) < 10) break;
    const k = norm(w ?? '').replace(/ة/g, 'ه');
    if (/^[ء-ي]+$/.test(k)) everyday.add(k);
  }
  fs.writeFileSync('stems10.txt', [...everyday].join('\n') + '\n');
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), 'hunspell-forms.ts');
  const gen = spawnSync('bun', [tool, '--len', '5', '--prefixes', 'article', '--stems', 'stems10.txt', '--everyday'], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] });
  if (gen.status !== 0) throw new Error('tools/hunspell-forms.ts failed (is bun installed?)');
  const forms = new Set(gen.stdout.split('\n').filter((k) => is5(k) && !k.endsWith('يي')));
  const block = new Set(DIALECT.map(norm));
  const words = new Set([...stems, ...hunspell, ...ALLOW.map(norm), ...forms].filter((k) => !block.has(k)));
  console.log('dictionary entries', stems.size, 'hunspell-accepted subtitle words', hunspell.size, 'allowed', ALLOW.length,
    'everyday forms', forms.size, 'blocked', [...block].filter((k) => stems.has(k) || hunspell.has(k) || forms.has(k)).length, 'final', words.size);
  fs.writeFileSync('valid5.txt', [...words].sort().join('\n'));
  console.log('sample:', [...words].sort(() => Math.random() - 0.5).slice(0, 60).join(' '));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) build();
