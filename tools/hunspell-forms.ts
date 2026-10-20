/**
 * Expands the Ayaspell Hunspell dictionary (server/data/hunspell) into the written forms of one length
 * («unmunch», restricted to that length): every entry with its prefixes, suffixes, prefix + suffix and
 * two suffixes, exactly the combinations server/hunspell.ts accepts. Each form is checked again with the
 * checker (they must all pass) and printed normalised the way «كلمة السر» stores words (normWord:
 * أ/إ/آ → ا, ى/ئ → ي, ؤ → و; ة kept), one per line, sorted.
 *
 *   bun tools/hunspell-forms.ts [--len 5] [--prefixes all|article|none] [--stems stems.txt] [--everyday] > forms.txt
 *
 *   --prefixes  which prefixes may be used: any, only the article «ال» (default), or none
 *   --stems     a file of dictionary entries (normalised like norm() in src/shared/arabic.ts, one per
 *               line): only their forms are made — wordle-dict.mjs passes the entries people really use
 *   --everyday  only one suffix (no second one: «يعطونكموه») and only everyday endings: on nouns
 *               (every part of ar.dic but its verb part) plurals, dual, feminine and the pronouns
 *               «-ي -ك -ه -ها -نا -هم -كم» (not «كتابكن», «ضرسيّ»); on verbs the subject endings only
 *               («كتبوا», «يكتبون», «كتبت», «كتبنا»), no object pronoun («أبزّكم»)
 *   --raw       print the forms as Hunspell spells them (hamza, ة, ى), not normalised
 *
 * The dictionary's grammar-word section («# stopwords.dic #») is always left out: its entries are
 * already fully written forms of a few hundred function words, plenty of them odd («أفلغير»).
 * tools/wordle-dict.mjs merges the 5-letter forms into server/data/wordle-valid.txt.
 */
import fs from 'node:fs';
import path from 'node:path';

import { Hunspell, foldExact, foldNorm, type Affix, type PrefixRule } from '../server/hunspell';
import { normWord } from '../src/shared/wordle';

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const LEN = Number(arg('--len') ?? 5);
const RULE = (arg('--prefixes') ?? 'article') as PrefixRule;
const STEMS = arg('--stems') ? new Set(fs.readFileSync(arg('--stems')!, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) : null;
const EVERYDAY = process.argv.includes('--everyday');
const RAW = process.argv.includes('--raw');
/** the suffixes --everyday keeps (as written in ar.aff, diacritics removed) */
const NOUN_END = new Set(['', 'ات', 'ون', 'ين', 'ان', 'ة', 'تان', 'تين', 'ي', 'ك', 'ه', 'ها', 'نا', 'هم', 'كم']);
const VERB_END = new Set(['', 'وا', 'ون', 'ين', 'ان', 'ا', 'ت', 'تم', 'نا', 'ن', 'تا']);

const dir = path.join(import.meta.dir, '..', 'server', 'data', 'hunspell');
const h = new Hunspell(fs.readFileSync(path.join(dir, 'ar.aff'), 'utf8'), fs.readFileSync(path.join(dir, 'ar.dic'), 'utf8'), foldExact);

const okPfx = (p: Affix) => RULE === 'all' || (RULE === 'article' && p.rawAppend === 'ال');
const pfxs = h.prefixes.filter(okPfx);
const sfxs = h.suffixes;

/** The affix combinations a flags alias allows (the flag tests of server/hunspell.ts, conditions apart). */
interface Combos {
  sfx: Affix[];
  pfx: Affix[];
  cross: [Affix, Affix][]; // prefix, suffix
  two: [Affix, Affix][]; // inner suffix, outer suffix
  pfxTwo: [Affix, Affix, Affix][]; // prefix, inner suffix, outer suffix
}
const has = (a: number, f: number) => h.aliasHas(a, f);
/** suffixes whose continuation class holds a flag: the inner suffixes an outer one may follow */
const inners = new Map<Affix, Affix[]>();
for (const o of sfxs) if (h.isContFlag(o.flag)) inners.set(o, sfxs.filter((i) => has(i.cont, o.flag)));
const crossPfx = pfxs.filter((p) => p.cross);

const combos = new Map<number, Combos>();
function combosOf(af: number, verb: boolean): Combos {
  const key = verb ? -af : af;
  let c = combos.get(key);
  if (c) return c;
  const ends = EVERYDAY ? sfxs.filter((s) => (verb ? VERB_END : NOUN_END).has(s.rawAppend)) : sfxs;
  const sfx = ends.filter((s) => has(af, s.flag));
  const crossSfx = ends.filter((s) => s.cross);
  const pfx = pfxs.filter((p) => has(af, p.flag));
  const cross: [Affix, Affix][] = [];
  for (const p of crossPfx)
    for (const s of crossSfx) if ((has(af, s.flag) || has(p.cont, s.flag)) && (has(af, p.flag) || has(s.cont, p.flag))) cross.push([p, s]);
  const two: [Affix, Affix][] = [];
  for (const [o, ins] of inners) for (const i of ins) if (has(af, i.flag)) two.push([i, o]);
  const pfxTwo: [Affix, Affix, Affix][] = [];
  for (const [o, ins] of inners) {
    if (!o.cross) continue;
    for (const p of crossPfx)
      for (const i of ins) {
        const ok = has(o.cont, p.flag)
          ? has(af, i.flag)
          : i.cross && (has(af, i.flag) || has(p.cont, i.flag)) && (has(af, p.flag) || has(i.cont, p.flag));
        if (ok) pfxTwo.push([p, i, o]);
      }
  }
  c = { sfx, pfx, cross, two, pfxTwo };
  combos.set(key, c);
  return c;
}

const out = new Set<string>();
let made = 0, refused = 0;
const add = (f: string | null) => {
  if (f === null || f.length !== LEN || !/^[ء-ي]+$/.test(f)) return;
  made++;
  if (!h.check(f, { prefixes: RULE, noGrammar: true })) {
    refused++;
    return;
  }
  out.add(RAW ? f : normWord(f));
};
const maxStrip = Math.max(...[...pfxs, ...sfxs].map((a) => a.strip.length));

h.forEachEntry((root, af, section) => {
  if (section === 'stopwords.dic' || root.length > LEN + 3 * maxStrip || !/^[ء-ي]+$/.test(root)) return;
  if (STEMS && !STEMS.has(foldNorm(root))) return;
  add(root);
  if (!af) return;
  const c = combosOf(af, section === 'verb.huns.dic');
  for (const s of c.sfx) add(h.applySfx(s, root));
  for (const p of c.pfx) add(h.applyPfx(p, root));
  for (const [p, s] of c.cross) {
    const f = h.applySfx(s, root);
    if (f !== null && f.length + p.append.length - p.strip.length === LEN) add(h.applyPfx(p, f));
  }
  if (EVERYDAY) return;
  for (const [i, o] of c.two) {
    const f = h.applySfx(i, root);
    if (f !== null) add(h.applySfx(o, f));
  }
  for (const [p, i, o] of c.pfxTwo) {
    const f = h.applySfx(i, root);
    const g = f === null ? null : h.applySfx(o, f);
    if (g !== null && g.length + p.append.length - p.strip.length === LEN) add(h.applyPfx(p, g));
  }
});

console.error(`length ${LEN}, prefixes ${RULE}${STEMS ? `, ${STEMS.size} stems` : ''}${EVERYDAY ? ', everyday' : ''}: ${made} forms made, ${refused} refused by the checker, ${out.size} distinct normalised`);
process.stdout.write([...out].sort().join('\n') + '\n');
