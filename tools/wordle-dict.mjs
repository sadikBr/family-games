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
 *      Hunspell misses, e.g. «قتلوه», «حفيدة»),
 *   and it is not on the DIALECT blocklist below. Subtitle frequency alone no longer makes a word valid:
 *   that is how Egyptian/Tunisian forms («عايزة», «بتاعك», «علشان», «يقولو»…) and typos got in.
 *   (The «كلمة السر» answers are always accepted too: see server/games/wordle.ts.)
 *   pip install spylls && node tools/wordle-dict.mjs && mv valid5.txt server/data/wordle-valid.txt
 * tools/common-words.mjs imports DIALECT from here.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Common dialect forms (any length; each tool normalises them its own way). Words that are also
 * ordinary فصحى words («دول», «واش», «توا», «كمان», «عشانا» = our supper…) are left out on purpose,
 * unless the فصحى reading is rare and the dialect one is what everybody means («شوية», «بتعرف»).
 * Also left out: forms that normalise like a فصحى word in one of the lists («ايه» = «آية», «دي» = «دية»,
 * «ولاده» = «ولادة», «برده» = «بردة», «هلأ» = «هلا»).
 */
export const DIALECT = `
  شو ليش هيك هلق كتير كتيرة كتيره كتار منيح منيحة منيحه منيحين بدي بدك بدها بدنا بدهم بدكن بدكم بدكو
  شلون شلونك شلونكم مشان منشان مشانك منشانك عنجد قديش اديش زلمة زلمي تعا هيدا هيدي هادا هاي هاذا هاذي هاذاكا
  بحكي بتحكي بيحكي منحكي عمبحكي عمبقول شوية شويه اشوفك تشوفي يشوفك شوفي شوفوا شوفو شوف شفتو شايف شايفة شايفه
  شايفين شايفك شايفني شوفيه شوفها شوفهم اشوفه تشوفك تشوفه تشوفيه يشوفه نشوفك نشوفه شفتني مبارح امبارح بكرا وين وينك وينو وينه وينها وينكم وينهم شي
  ده فين ليه كده كدا كدة عشان علشان عشانك عشانه عشاني عشانها عشانكم عشانهم يلا يالا ازاي إزاي ازيك
  ازيكم ازيكو إزيك ازيكي بردو برضه برضو لسه لسة دلوقت دلوقتي النهارده النهاردة مفيش مافيش معرفش ماعرفش
  مقدرش ماقدرش مكنتش ماكنتش مكانش ماكانش مشفتش متقلقش ماتقلقش متخافش ماتخافش متزعلش معملتش مقولتش متعرفش
  ماتعرفش ميهمنيش مايهمنيش مش موش مانيش ماناش ماهوش ماهيش عايز عاوز عايزة عايزه عاوزة عاوزه عايزين عاوزين
  عايزاك عاوزاك بتاع بتاعي بتاعك بتاعه بتاعة بتاعت بتاعتي بتاعتك بتاعته بتاعها بتاعنا بتاعهم بتوع بتوعي بتوعك
  بتوعه بتوعنا عيلتي عيلتك عيلته اوضة اوضه اوضتي اوضتك اوضته مراتي مراتك مراته اخويا ابويا ياريت معايا معاك
  معاكي معاكو معاكم معانا معاه معاها معاهم عليكي إليكي اليكي عندكي ليكي فيكي بيكي منكي عنكي عليكو عندكو ليكو
  منكو بيكو فيكو عنكو ويايا وياك وياكي ولادي ولادك هدومي هدومك هدومه فاكر فاكرة فاكره فاكرين فاكراني
  فاكرني مستني مستنية مستنيه مستنيك مستنياك اتفضل اتفضلي اتفضلوا اتفضلو اتجوز اتجوزت اتجوزنا اتجوزها كويس
  كويسة كويسه كويسين جعان جعانة جعانه بيعمل بتعمل بنعمل بيقول بتقول بنقول بيحب بتحب بنحب بتحبني بيحبني بتعرف
  بيعرف بنعرف بتروح بيروح بنروح بتشوف بيشوف بنشوف بتاكل بياكل بتلعب بيلعب بتكلم بيتكلم بتتكلم بتفكر بيفكر
  بتدور بيدور بتعملي بتعمله هعمل هيعمل هتعمل هنعمل هقول هيقول هتقول هنقول هروح هيروح هتروح هنروح هشوف هيشوف
  هتشوف هنشوف هيكون هتكون هنكون هيموت هتموت هموت هقتلك هتندم هتعرف هيعرف هنعرف هتيجي هييجي هاجي هيجي
  برشا برشة ياسرة توة هكا هكاكة هكاكا هكاكه زادة باش شنوة شنوا شنية شنيا علاش كيفاش وقتاش فماش مافماش نحكيو
  نمشيو نعملو تعملو يعملو تحبو نحبو يحبو نقولو تقولو يقولو نجيو تجيو يجيو شكون اشكون شبيك شبيكم خويا ياخي
  ماعادش نورمال منغير
  بزاف دابا شنو بغيت بغيتو بغا كنبغيك كيبغي كتبغي كنبغي كنعرف كيعرف كتعرف كنقول كيقول كتقول كندير كيدير كتدير
  كنشوف كيشوف كتشوف ديال ديالي ديالك ديالو ديالها ديالنا ديالهم ديالكم واخا مزيان مزيانة مزيانه زوين زوينة
  زوينه ختي هادشي داكشي هاكا هاكداك بلاتي دغيا حيت خاصو ماكاين ماكاينش عطيني عطيتك عطيتي عطاني خليني خلينا
  خليها خليهم خليك خليكم ياك ياكما كاع
`.split(/\s+/).filter(Boolean);

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
  const block = new Set(DIALECT.map(norm));
  const words = new Set([...stems, ...hunspell, ...ALLOW.map(norm)].filter((k) => !block.has(k)));
  console.log('dictionary entries', stems.size, 'hunspell-accepted subtitle words', hunspell.size, 'allowed', ALLOW.length,
    'blocked', [...block].filter((k) => stems.has(k) || hunspell.has(k)).length, 'final', words.size);
  fs.writeFileSync('valid5.txt', [...words].sort().join('\n'));
  console.log('sample:', [...words].sort(() => Math.random() - 0.5).slice(0, 60).join(' '));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) build();
