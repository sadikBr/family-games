/**
 * Builds server/data/khalia-words.txt — the «خلية الحروف» answer words: the everyday words a hive's
 * answer list is made of (what counts toward a hive's maximum, what the bots find and what the end of
 * a round shows), each written the way it is spelled (hamza, ة, ى), one per line.
 *
 * Sources: server/data/common-words.txt (everyday words, normalised: أ إ آ → ا, ة → ه, ى/ئ → ي, ؤ → و;
 * see tools/common-words.mjs), the subtitle frequency list it was made from (ar_full.txt, OpenSubtitles
 * 2018 from github.com/hermitdave/FrequencyWords, spelled as written) and the Arabic Hunspell dictionary
 * (server/data/hunspell, exact spelling).
 *
 * The spelling: of the ways the subtitles write the word, the most frequent one the dictionary accepts
 * as it is, without any prefix («مدرسة», «ملابسه», «تتعافى», «طائري»). A word is left out when:
 * - it is said fewer than MIN times in the subtitles, or no written form is accepted without a prefix
 *   (words with «ال» like «البرونز», with و/ف/ب/ل in front like «والله», «لله», subtitle typos);
 * - it reads as a proper name: an entry of the dictionary's lists of countries, capitals and people, or
 *   of its «Condidate3.4.dic» part, made of names («هتلر», «لاهور», «هافانا»), unless the spelling is
 *   also an entry of the rest of the dictionary («ألف», «عماد»);
 * - it starts with «ال» and the subtitles mostly write it without a hamza: «ال» + a word (the article
 *   is not part of a hive word). Words that really start with «أل» stay («ألوان», «ألم», «آلة»);
 * - it is a dialect word, or on BLOCK;
 * - it is shorter than 3 letters, longer than 12, or uses more than 7 different letters.
 * A short list of everyday grammar words («هذا», «فوق», «حتى»…), which the dictionary keeps apart, is
 * added.
 *
 *   bun tools/khalia-words.ts path/to/ar_full.txt [MIN=150]
 */
import fs from 'node:fs';
import path from 'node:path';

import { isDialect } from '../server/boggle-grid';
import { Hunspell, foldExact } from '../server/hunspell';
import { khaliaKey } from '../src/shared/games/khalia';
import { DIALECT } from './wordle-dict.mjs';

const root = path.join(import.meta.dir, '..');
const dir = path.join(root, 'server', 'data', 'hunspell');
const subtitles = process.argv[2];
if (!subtitles) throw new Error('usage: bun tools/khalia-words.ts ar_full.txt [min]');
const MIN = Number(process.argv[3] ?? 150);

const norm = (s: string) =>
  s.replace(/[ً-ْـٰ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');

// the dictionary without its lists of proper names (kept apart as keys)
const kept: string[] = [];
const nameKeys = new Set<string>();
let names = false;
for (const l of fs.readFileSync(path.join(dir, 'ar.dic'), 'utf8').split('\n')) {
  if (l.startsWith('###أسماء') || l.startsWith('# Condidate3.4.dic')) names = true;
  if (l.startsWith('####الأسماء####') || l.startsWith('# verb.huns.dic')) names = false;
  if (names && !l.startsWith('#')) {
    const k = khaliaKey(l.split('/')[0].split('\t')[0]);
    nameKeys.add(k);
    if (k.startsWith('ال') && k.length > 4) nameKeys.add(k.slice(2));
    continue;
  }
  kept.push(l);
}
kept[0] = String(kept.length - 1);
const h = new Hunspell(fs.readFileSync(path.join(dir, 'ar.aff'), 'utf8'), kept.join('\n'), foldExact);
const accepted = (s: string) => h.check(s, { prefixes: 'none', noGrammar: true });

// the subtitles: how often each normalised word is said, and its written forms by frequency
const said = new Map<string, number>();
const forms = new Map<string, [string, number][]>();
for (const line of fs.readFileSync(subtitles, 'utf8').split('\n')) {
  const [raw, c] = line.split(' ');
  const n = Number(c);
  if (!(n >= 3)) break;
  if (!/^[ء-يً-ْٰـ]+$/.test(raw)) continue;
  const w = raw.replace(/[ً-ْـٰ]/g, '');
  const k = norm(w);
  said.set(k, (said.get(k) ?? 0) + n);
  const list = forms.get(k) ?? [];
  const same = list.find(([f]) => f === w);
  if (same) same[1] += n;
  else list.push([w, n]);
  forms.set(k, list);
}

/** Words a family game should not list, interjections, and names. */
const BLOCK = new Set(
  ('خمر خمور نبيذ سكران ثمل حشيش مخدرات عاهرة مومس قحبة زنا لعين ملعون حقير غبي أحمق وغد سافل تافه قذر لعنة غبية ' +
    'حمقاء أوه آه آهة هاء أها ' +
    // names the checks above miss (they read as some rare form too)
    'ألاباما ألكسندر إليزابيث إليان ألدن ألدو ألتق ألغ ألق بوبي لوتي ترودي إيان كالب كونج توكر دارسي بورت فالا نيم ترا ' +
    'أوشن عصام لانا ناسا مانشستر بومباي إسطنبول أكسفورد أورشليم برشلونة سوبرمان كارولينا كامبردج كوبنهاغن كولمبيا ' +
    'هيروشيما تضاجعين').split(' '),
);

/**
 * Names from the films (people, places, brands) and English words the subtitles transliterate: the
 * dictionary reads them as some rare verb form or a stem with an ending («جوني», «كيفن», «هومر»). As
 * keys; the list was made by reading the short words of every hive the game can choose.
 */
const FILM_NAMES = new Set(
  (
    'ادام ايس ايك ابيب اتو اتون اكو اموس انتا انجل اندو انكي اوكس اوو ايمي ايون ادي ادا انجي ايدن ايرك ايرن ارتو اكس ' +
    'اسوي بابل بروك بروم بريم برين بوب بوري بوس بوسي بولو بوم بون بوني بيتن بيس بيست تران تشاد تشاك تشان تشو تشوك ' +
    'تشون تشي تشيت تشين توبر توبن توبي توتي توش توشي تونج توني توين تيب تيد تيدي تيل تيلا تيلي تيم تيمي جاس جاني ' +
    'جاوا جستن جسنا جلين جنسن جوان جوب جوبي جوزي جوس جوسي جون جونس جوني جوين جيري جيز جيس جينز داد دادي دارن داف ' +
    'داك دانا داني داو داون داين ديا ديان ديث ديدن ديس ديف ديفا ديل ديم دينا دوت دورن دوسن دوف دوق دوك دوين روب ' +
    'روبن روبي روت روك رول رون ريان ريج ريمي رين رينا ريني ساغا ساو سان ساند سلون سوتر سوك سولي سون سوير سيج سيجن ' +
    'سيم شاد شادي شات شاك شاكا شوت شون شونا شيتا شيتي شيفا شيكا شين شينا شيه صني غاما غاي غرين غلين غوين غيل فيتا ' +
    'فيتو فيرا فيز فيش فيشي كار كارا كارت كاري كال كالا كالي كايد كايل كروت كرون كريك كرين كوبر كود كودا كور كورا ' +
    'كورت كورن كوري كوس كوك كوكا كوكي كولا كوم كوين كير كيرا كيرت كيرن كيري كيسي كيفن كيلي كين كينا كينت لاب لادن ' +
    'لاك لاكي لاما لاين لوت لوك لوكا لوكي لوين ليا ليان ليك مادن ماي مايو مدام مرن مور مورت موري موس مون مونت موني ' +
    'ميج ميد مير ميس ميسا ميسن ميسي ميق نوب نوبي نوت نوكس نويل نيد نيدي نيس نيسا نيشا نيف هارت هارد هالي هانا هاما ' +
    'هامر هورن هولي هوم هومر هوود هيب هيبي هيث هيد هير هيرا هيل هيلي وارن واتر ووتر وولف وولي ييل يون يوني يوه يودا ' +
    'يورك يوري يوشي انسون اشتون انتون انجلينا اوديت اودين ايدان ايلين ادوين انطون ايدين ايرين تريان تسطيع'
  ).split(' '),
);

/** Everyday grammar words (the dictionary keeps them in its grammar part). */
const GRAMMAR = (
  'هذا هذه ذلك تلك الذي التي هنا هناك كيف متى أين منذ حتى على إلى عند لدى بين فوق تحت أمام خلف وراء بعض غير نعم ' +
  'الله كلا ليس ليست قبل بعد حول دون ضمن أيضا ربما سوف كان كانت صار مثل كما حيث لكن إذا عندما بينما معا جميع لماذا ماذا'
).split(' ');

const DIA = new Set(DIALECT.map((w: string) => khaliaKey(w)));

/** Every spelling a normalised word may stand for (capped): to test «ال» + something. */
function spellings(w: string): string[] {
  let out = [''];
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    const last = i === w.length - 1;
    const opts = c === 'ا' ? ['ا', 'أ', 'إ', 'آ'] : c === 'ه' && last ? ['ه', 'ة'] : c === 'ي' ? (last ? ['ي', 'ى', 'ئ'] : ['ي', 'ئ']) : c === 'و' ? ['و', 'ؤ'] : [c];
    out = out.flatMap((o) => opts.map((x) => o + x));
    if (out.length > 4096) return [];
  }
  return out;
}

const common = fs.readFileSync(path.join(root, 'server', 'data', 'common-words.txt'), 'utf8').split('\n').filter(Boolean);
const commonSet = new Set(common);
const out = new Map<string, string>(); // key → spelled
const left = { rare: 0, article: 0, spelling: 0, name: 0, other: 0 };
for (const w of common) {
  const key = khaliaKey(w);
  const len = [...key].length;
  if (len < 3 || len > 12 || new Set(key).size > 7) continue;
  if ((said.get(w) ?? 0) < MIN) {
    left.rare++;
    continue;
  }
  if (isDialect(w) || DIA.has(key)) {
    left.other++;
    continue;
  }
  const ok = (forms.get(w) ?? []).sort((a, b) => b[1] - a[1]).filter(([f]) => accepted(f));
  if (!ok.length) {
    left.spelling++;
    continue;
  }
  const total = said.get(w) ?? 0;
  let best = ok[0][0];
  if (w.startsWith('ال')) {
    // a word that really starts with «أل», «آل», «إل» is mostly written with its hamza («ألوان», «ألم»);
    // the others are «ال» + a word (the article is not part of a hive word) or names («ألدن»)
    const hamza = ok.find(([f]) => /^[أإآ]ل/.test(f));
    if (!hamza || hamza[1] < total * 0.5 || (nameKeys.has(key) && !h.isEntry(hamza[0]))) {
      left.article++;
      continue;
    }
    best = hamza[0];
  }
  // a name («هتلر», «لاهور»), unless it is also a word of the dictionary as it is («ألف», «عماد»)
  if (nameKeys.has(key) && !h.isEntry(best)) {
    left.name++;
    continue;
  }
  if (BLOCK.has(best) || FILM_NAMES.has(key) || out.has(key)) {
    left.other++;
    continue;
  }
  out.set(key, best);
}
for (const g of GRAMMAR) out.set(khaliaKey(g), g);
const words = [...out.values()].sort((a, b) => (khaliaKey(a) < khaliaKey(b) ? -1 : 1));
fs.writeFileSync(path.join(root, 'server', 'data', 'khalia-words.txt'), words.join('\n') + '\n');
console.log(`kept ${words.length}, left out`, left);

