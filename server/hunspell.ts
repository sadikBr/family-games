/**
 * A small Hunspell-compatible word checker for the Ayaspell Arabic dictionary
 * (server/data/hunspell/ar.aff + ar.dic, see the README there), written for this one dictionary so the
 * server needs no npm package: the Docker image runs plain Bun with no node_modules.
 *
 * It follows Hunspell's own lookup (hunspell 1.7 affixmgr/affentry): a word is right when it is a
 * dictionary entry, or an entry with
 *   - one prefix (و ف ب ك ل س ال أ… and their combinations, «وبال», «فلل»…), or one suffix (plurals,
 *     dual, feminine, attached pronouns, verb endings…), or a prefix and a suffix (cross product), or
 *   - two suffixes («twofold»: a suffix whose continuation class allows a second one), with or without
 *     a prefix,
 * each affix's condition checked, continuation classes honoured both ways (a prefix may enable a
 * suffix and the other way round). The dictionary's options are FLAG long, AF (flag aliases), IGNORE
 * (diacritics, tatweel) and ICONV (lam-alef ligatures); it uses no compounding, NEEDAFFIX, CIRCUMFIX
 * or FORBIDDENWORD, so those are not implemented. Its behaviour was checked against real Hunspell (the
 * hunspell-asm WebAssembly build) on the subtitle word list and on generated forms — see README.
 *
 * Memory: the dictionary stays one byte array (one byte per letter), words are found through a hash
 * table made of typed arrays (no Map/Set of 450k strings): ≈ 16 MB, loaded in ≈ 0.2 s.
 *
 * `fold` maps every letter before anything is compared — the dictionary, the affixes, their conditions
 * and the words looked up — so the server can check words the way players type them (the run-time
 * checker folds like src/shared/arabic.ts norm(): أ إ آ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي).
 */
import fs from 'node:fs';
import path from 'node:path';

/** The diacritics and tatweel the dictionary ignores (its IGNORE line), as a regex. */
const IGNORE_RE = /[ً-ْـٰ]/g;

/** Only the dictionary's IGNORE characters removed: the exact spelling (for the tools). */
export const foldExact = (s: string) => s.replace(IGNORE_RE, '');

/** Like norm() in src/shared/arabic.ts, letter for letter (but keeps tabs, newlines and spaces). */
const NORM_MAP: Record<string, string> = { أ: 'ا', إ: 'ا', آ: 'ا', ٱ: 'ا', ة: 'ه', ى: 'ي', ؤ: 'و', ئ: 'ي' };
export const foldNorm = (s: string) => s.replace(/[\u064B-\u0652\u0640\u0670أإآٱةىؤئ]/g, (c) => NORM_MAP[c] ?? '');

interface Cond {
  neg: boolean;
  /** null = any letter («.») */
  chars: string | null;
}

export interface Affix {
  flag: number;
  cross: boolean;
  strip: string;
  append: string;
  /** the appended letters as written in ar.aff (diacritics removed, not folded) */
  rawAppend: string;
  cond: Cond[];
  /** AF alias of the continuation class (0 = none) */
  cont: number;
}

/** Which prefixes may be part of a word: any, only the article «ال», or none at all. */
export type PrefixRule = 'all' | 'article' | 'none';

export interface CheckOptions {
  prefixes?: PrefixRule;
  /**
   * refuse the dictionary's grammar words («من», «في», «ما», «وبغير»…: the entries of its grammar
   * sections), even when they also read as some rare noun or verb («من» = manna), and use no entry of
   * those sections as a stem
   */
  noGrammar?: boolean;
}

const BUCKETS = 1 << 19;

/**
 * The dictionary is kept as one byte per letter (a third of a JS string's size): ASCII as is, the
 * Arabic block U+0600–U+067F as 128–255 (every letter and mark ar.dic uses), anything else 255.
 */
const enc = (c: number) => (c < 128 ? c : c >= 0x600 && c < 0x67f ? 128 + c - 0x600 : 255);
const dec = (b: number) => (b < 128 ? b : b === 255 ? 0xfffd : 0x600 + b - 128);

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ enc(s.charCodeAt(i)), 16777619);
  return (h >>> 0) & (BUCKETS - 1);
}

export class Hunspell {
  private flagIds = new Map<string, number>();
  /** AF aliases as a bit table: afBits[alias * nFlags + flag] */
  private afBits: Uint8Array;
  private nFlags = 0;
  private nAf = 0;
  private pfx = new Map<string, Affix[]>();
  private sfx = new Map<string, Affix[]>();
  private maxPfx = 0;
  private maxSfx = 0;
  /** flags that appear in some affix's continuation class (they may be a second suffix) */
  private contFlags: Uint8Array;
  private iconv: [string, string][] = [];
  private fold: (s: string) => string;

  /** the folded dictionary (bytes, see enc) and its entries: [start, end), flags alias, section */
  private text: Uint8Array;
  private wStart: Int32Array;
  private wEnd: Int32Array;
  private wAf: Uint16Array;
  /** index in `sections` of the part of ar.dic each entry comes from («# verb.huns.dic #»…) */
  private wSection: Uint8Array;
  /** the parts of ar.dic: '' (before any header), 'stopwords.dic' (grammar words), 'tools.dic', 'names.dic' (nouns)… */
  readonly sections: string[] = [''];
  /** sections of grammar words: «# stopwords.dic #» and «# tools.dic #» (particles, pronouns…) */
  private grammarSections = new Uint8Array(256);
  private head: Int32Array;
  private next: Int32Array;
  readonly size: number;

  /** every affix entry, for tools that expand the dictionary */
  readonly prefixes: Affix[] = [];
  readonly suffixes: Affix[] = [];

  /**
   * `dic` is the file's text or its bytes (UTF-8): bytes are read without a JS string of 7 MB — and
   * overwritten (the folded text is written over them), so pass a buffer of your own.
   */
  constructor(aff: string, dic: string | Uint8Array, fold: (s: string) => string = foldExact) {
    this.fold = fold;
    const afLists = this.parseAff(aff);
    // AF table (alias 0 = no flags)
    this.nAf = afLists.length;
    this.afBits = new Uint8Array((this.nAf + 1) * Math.max(1, this.nFlags));
    afLists.forEach((flags, i) => {
      for (const f of flags) this.afBits[(i + 1) * this.nFlags + f] = 1;
    });
    this.contFlags = new Uint8Array(this.nFlags);
    for (const a of [...this.prefixes, ...this.suffixes])
      if (a.cont) for (let f = 0; f < this.nFlags; f++) if (this.has(a.cont, f)) this.contFlags[f] = 1;

    // dictionary: UTF-8 decoded, folded letter by letter and stored as bytes
    const raw = typeof dic === 'string' ? new TextEncoder().encode(dic) : dic;
    const folded = new Int16Array(0x10000).fill(-2); // code point → byte, -1 = dropped
    const buf = raw; // written in place: one output byte never needs more than its input bytes
    let o = 0;
    for (let i = 0; i < raw.length; ) {
      const b = raw[i];
      let c: number;
      if (b < 0x80) (c = b), i++;
      else if (b < 0xe0) (c = ((b & 0x1f) << 6) | (raw[i + 1] & 0x3f)), (i += 2);
      else if (b < 0xf0) (c = ((b & 0x0f) << 12) | ((raw[i + 1] & 0x3f) << 6) | (raw[i + 2] & 0x3f)), (i += 3);
      else (c = 0xfffd), (i += 4);
      if (c < 128) {
        if (c !== 13) buf[o++] = c;
        continue;
      }
      let f = folded[c];
      if (f === -2) {
        const s = fold(String.fromCharCode(c));
        folded[c] = f = s ? enc(s.charCodeAt(0)) : -1;
      }
      if (f >= 0) buf[o++] = f;
    }
    const text = buf.slice(0, o);
    this.text = text;
    let lines = 0;
    for (let i = text.indexOf(10); i >= 0; i = text.indexOf(10, i + 1)) lines++;
    const ws = new Int32Array(lines + 1), we = new Int32Array(lines + 1), wa = new Uint16Array(lines + 1), wsec = new Uint8Array(lines + 1);
    let n = 0;
    let at = text.indexOf(10) + 1; // the first line is the entry count
    let section = 0;
    while (at > 0 && at < text.length) {
      let end = text.indexOf(10, at);
      if (end < 0) end = text.length;
      // the word, then «/flags», then (after a tab) a morphological field
      let lineEnd = end, slash = -1;
      for (let j = at; j < end; j++) {
        const c = text[j];
        if (c === 9 /* \t */) {
          lineEnd = j;
          break;
        }
        if (c === 47 /* / */ && slash < 0 && j > at) slash = j;
      }
      if (text[at] === 35 /* # */) {
        // section headers: «# stopwords.dic #» (the grammar words), «# names.dic #» (nouns)…
        const m = /^# (\S+\.dic) #/.exec(this.decode(at, lineEnd));
        if (m && this.sections.length < 255) {
          section = this.sections.push(m[1]) - 1;
          if (m[1] === 'stopwords.dic' || m[1] === 'tools.dic') this.grammarSections[section] = 1;
        }
      }
      let wordEnd = slash >= 0 ? slash : lineEnd;
      while (wordEnd > at && text[wordEnd - 1] === 32) wordEnd--;
      if (wordEnd > at) {
        let af = 0;
        if (slash >= 0) for (let j = slash + 1; j < lineEnd && text[j] >= 48 && text[j] <= 57; j++) af = af * 10 + text[j] - 48;
        ws[n] = at;
        we[n] = wordEnd;
        wa[n] = Math.min(this.nAf, af);
        wsec[n] = section;
        n++;
      }
      at = end + 1;
    }
    this.size = n;
    this.wStart = ws.subarray(0, n);
    this.wEnd = we.subarray(0, n);
    this.wAf = wa.subarray(0, n);
    this.wSection = wsec.subarray(0, n);
    const head = new Int32Array(BUCKETS).fill(-1);
    const next = new Int32Array(n).fill(-1);
    for (let i = n - 1; i >= 0; i--) {
      let h = 2166136261;
      for (let j = ws[i]; j < we[i]; j++) h = Math.imul(h ^ text[j], 16777619);
      h = (h >>> 0) & (BUCKETS - 1);
      next[i] = head[h];
      head[h] = i;
    }
    this.head = head;
    this.next = next;
  }

  private decode(s: number, e: number): string {
    let out = '';
    for (let i = s; i < e; i++) out += String.fromCharCode(dec(this.text[i]));
    return out;
  }

  private flagId(f: string): number {
    let id = this.flagIds.get(f);
    if (id === undefined) this.flagIds.set(f, (id = this.nFlags++));
    return id;
  }

  /** Reads ar.aff; returns the AF alias lists (flag ids). */
  private parseAff(aff: string): number[][] {
    const af: number[][] = [];
    const pending: { raw: string[]; kind: 'PFX' | 'SFX'; cross: boolean }[] = [];
    const headers = new Map<string, boolean>(); // `${kind} ${flag}` → cross product
    for (const raw of aff.split(/\r?\n/)) {
      const f = raw.trim().split(/\s+/);
      if (!f[0] || f[0].startsWith('#')) continue;
      if (f[0] === 'FLAG' && f[1] !== 'long') throw new Error('only FLAG long is supported');
      if (f[0] === 'AF' && f.length >= 2 && !/^\d+$/.test(f[1])) {
        const flags: number[] = [];
        for (let i = 0; i + 2 <= f[1].length; i += 2) flags.push(this.flagId(f[1].slice(i, i + 2)));
        af.push(flags);
      } else if (f[0] === 'ICONV' && f.length >= 3) {
        this.iconv.push([f[1], f[2]]);
      } else if (f[0] === 'PFX' || f[0] === 'SFX') {
        const key = `${f[0]} ${f[1]}`;
        if (f.length === 4 && (f[2] === 'Y' || f[2] === 'N') && /^\d+$/.test(f[3])) {
          headers.set(key, f[2] === 'Y');
          continue;
        }
        if (f.length >= 4) pending.push({ raw: f, kind: f[0], cross: headers.get(key) ?? false });
      }
    }
    for (const { raw: f, kind, cross } of pending) {
      const [append0, contStr] = f[3].split('/');
      const strip = f[2] === '0' ? '' : this.fold(foldExact(f[2]));
      const rawAppend = append0 === '0' ? '' : foldExact(append0);
      const a: Affix = {
        flag: this.flagId(f[1]),
        cross,
        strip,
        append: this.fold(rawAppend),
        rawAppend,
        cond: this.parseCond(f[4] ?? '.'),
        cont: contStr ? Math.min(af.length, parseInt(contStr, 10) || 0) : 0,
      };
      const map = kind === 'PFX' ? this.pfx : this.sfx;
      const list = map.get(a.append);
      if (list) list.push(a);
      else map.set(a.append, [a]);
      (kind === 'PFX' ? this.prefixes : this.suffixes).push(a);
      if (kind === 'PFX') this.maxPfx = Math.max(this.maxPfx, a.append.length);
      else this.maxSfx = Math.max(this.maxSfx, a.append.length);
    }
    return af;
  }

  private parseCond(s: string): Cond[] {
    if (s === '.') return [];
    const out: Cond[] = [];
    for (let i = 0; i < s.length; ) {
      if (s[i] === '[') {
        const close = s.indexOf(']', i);
        let body = s.slice(i + 1, close < 0 ? s.length : close);
        const neg = body.startsWith('^');
        if (neg) body = body.slice(1);
        out.push({ neg, chars: this.fold(body) });
        i = close < 0 ? s.length : close + 1;
      } else {
        out.push(s[i] === '.' ? { neg: false, chars: null } : { neg: false, chars: this.fold(s[i]) });
        i++;
      }
    }
    return out;
  }

  private has(af: number, flag: number): boolean {
    return af > 0 && this.afBits[af * this.nFlags + flag] === 1;
  }

  private condOk(cond: Cond[], w: string, atEnd: boolean): boolean {
    if (cond.length > w.length) return false;
    const off = atEnd ? w.length - cond.length : 0;
    for (let i = 0; i < cond.length; i++) {
      const c = cond[i];
      if (c.chars === null) continue;
      if (c.chars.includes(w[off + i]) === c.neg) return false;
    }
    return true;
  }

  /** Does some entry spelled `w` pass `test(flags alias)`? */
  private root(w: string, noGrammar: boolean, test: (af: number) => boolean): boolean {
    const t = this.text;
    for (let i = this.head[strHash(w)]; i >= 0; i = this.next[i]) {
      const s = this.wStart[i];
      if (this.wEnd[i] - s !== w.length) continue;
      let j = 0;
      while (j < w.length && t[s + j] === enc(w.charCodeAt(j))) j++;
      if (j === w.length && !(noGrammar && this.grammarSections[this.wSection[i]]) && test(this.wAf[i])) return true;
    }
    return false;
  }

  /** Is this word (folded) one of the dictionary's grammar words (an entry of its grammar sections)? */
  isGrammarWord(word: string): boolean {
    return this.grammarWord(this.fold(word));
  }

  private grammarWord(w: string): boolean {
    const t = this.text;
    for (let i = this.head[strHash(w)]; i >= 0; i = this.next[i]) {
      const s = this.wStart[i];
      if (this.wEnd[i] - s !== w.length || !this.grammarSections[this.wSection[i]]) continue;
      let j = 0;
      while (j < w.length && t[s + j] === enc(w.charCodeAt(j))) j++;
      if (j === w.length) return true;
    }
    return false;
  }

  /** Is `w` itself an entry? */
  isEntry(w: string, noGrammar = false): boolean {
    return this.root(this.fold(w), noGrammar, () => true);
  }

  /** Is this a word? */
  check(word: string, opts: CheckOptions = {}): boolean {
    let w = word;
    for (const [a, b] of this.iconv) if (w.includes(a)) w = w.split(a).join(b);
    w = this.fold(w);
    if (!w) return false;
    const ng = opts.noGrammar ?? false;
    if (ng && this.grammarWord(w)) return false;
    if (this.root(w, ng, () => true)) return true;
    const rule = opts.prefixes ?? 'all';
    const allow = rule === 'all' ? null : rule === 'none' ? () => false : (p: Affix) => p.rawAppend === 'ال';
    // a prefix (alone, or crossed with a suffix)
    if (this.eachPfx(w, allow, (pe) => this.pfxCheck(pe, w, ng))) return true;
    // a suffix
    if (this.sfxCheck(w, false, null, -1, ng)) return true;
    // two suffixes, then a prefix with two suffixes
    if (this.sfxCheckTwo(w, false, null, ng)) return true;
    return this.eachPfx(w, allow, (pe) => {
      if (!pe.cross) return false;
      const tmp = this.pfxStrip(pe, w);
      return tmp !== null && this.sfxCheckTwo(tmp, true, pe, ng);
    });
  }

  private eachPfx(w: string, allow: ((p: Affix) => boolean) | null, fn: (pe: Affix) => boolean): boolean {
    for (let l = 0; l < w.length && l <= this.maxPfx; l++) {
      const list = this.pfx.get(w.slice(0, l));
      if (list) for (const pe of list) if ((!allow || allow(pe)) && fn(pe)) return true;
    }
    return false;
  }

  /** The word without prefix `pe` (its strip put back), or null when the condition fails. */
  private pfxStrip(pe: Affix, w: string): string | null {
    if (w.length - pe.append.length <= 0) return null;
    const tmp = pe.strip + w.slice(pe.append.length);
    return this.condOk(pe.cond, tmp, false) ? tmp : null;
  }

  private pfxCheck(pe: Affix, w: string, ng: boolean): boolean {
    const tmp = this.pfxStrip(pe, w);
    if (tmp === null) return false;
    if (this.root(tmp, ng, (af) => this.has(af, pe.flag))) return true;
    return pe.cross && this.sfxCheck(tmp, true, pe, -1, ng);
  }

  /** Suffix entries matching the end of `w` (the zero-length ones first, like Hunspell). */
  private eachSfx(w: string, fn: (se: Affix) => boolean): boolean {
    for (let l = 0; l < w.length && l <= this.maxSfx; l++) {
      const list = this.sfx.get(l ? w.slice(w.length - l) : '');
      if (list) for (const se of list) if (fn(se)) return true;
    }
    return false;
  }

  private sfxCheck(w: string, xprod: boolean, ppfx: Affix | null, cclass: number, ng: boolean): boolean {
    return this.eachSfx(w, (se) => {
      if (xprod && !se.cross) return false;
      if (cclass >= 0 && !this.has(se.cont, cclass)) return false;
      const tmpl = w.length - se.append.length;
      if (tmpl <= 0) return false;
      const tmp = w.slice(0, tmpl) + se.strip;
      if (!this.condOk(se.cond, tmp, true)) return false;
      return this.root(
        tmp,
        ng,
        (af) =>
          (this.has(af, se.flag) || (ppfx !== null && this.has(ppfx.cont, se.flag))) &&
          (!xprod || (ppfx !== null && (this.has(af, ppfx.flag) || this.has(se.cont, ppfx.flag)))),
      );
    });
  }

  private sfxCheckTwo(w: string, xprod: boolean, ppfx: Affix | null, ng: boolean): boolean {
    return this.eachSfx(w, (se) => {
      if (!this.contFlags[se.flag]) return false;
      if (xprod && !se.cross) return false;
      const tmpl = w.length - se.append.length;
      if (tmpl <= 0) return false;
      const tmp = w.slice(0, tmpl) + se.strip;
      if (!this.condOk(se.cond, tmp, true)) return false;
      if (ppfx && !this.has(se.cont, ppfx.flag)) return this.sfxCheck(tmp, xprod, ppfx, se.flag, ng);
      return this.sfxCheck(tmp, false, null, se.flag, ng);
    });
  }

  /* ---------------- for the tools: expanding the dictionary ---------------- */

  /** Calls fn(word, flags alias, section name) for every entry. */
  forEachEntry(fn: (word: string, af: number, section: string) => void): void {
    for (let i = 0; i < this.size; i++) fn(this.decode(this.wStart[i], this.wEnd[i]), this.wAf[i], this.sections[this.wSection[i]]);
  }

  /** Does the AF alias contain this flag? */
  aliasHas(af: number, flag: number): boolean {
    return this.has(af, flag);
  }

  /** May an affix with this flag come as a second suffix (is it in some continuation class)? */
  isContFlag(flag: number): boolean {
    return this.contFlags[flag] === 1;
  }

  /** `root` with suffix `se` (null when it does not apply). */
  applySfx(se: Affix, root: string): string | null {
    if (!root.endsWith(se.strip) || root.length - se.strip.length <= 0 || !this.condOk(se.cond, root, true)) return null;
    return root.slice(0, root.length - se.strip.length) + se.append;
  }

  /** `root` with prefix `pe` (null when it does not apply). */
  applyPfx(pe: Affix, root: string): string | null {
    if (!root.startsWith(pe.strip) || root.length - pe.strip.length <= 0 || !this.condOk(pe.cond, root, false)) return null;
    return pe.append + root.slice(pe.strip.length);
  }
}

/* ------------------------------------------------------------------ */
/* The server's checker                                                */
/* ------------------------------------------------------------------ */

let shared: Hunspell | null | undefined;

/**
 * The Arabic checker the games use, folded like norm() (so «مدرسه», «مدرسة», «الاسد» and «الأسد» are
 * the same), loaded the first time a word is checked (≈ 0.2 s, ≈ 16 MB). null when the files are
 * missing or unreadable: the games then go on with their word lists alone, as before.
 */
export function arabicSpeller(): Hunspell | null {
  if (shared !== undefined) return shared;
  try {
    const t = performance.now();
    const dir = path.join(import.meta.dir, 'data', 'hunspell');
    shared = new Hunspell(fs.readFileSync(path.join(dir, 'ar.aff'), 'utf8'), fs.readFileSync(path.join(dir, 'ar.dic')), foldNorm);
    if (process.env.NODE_ENV !== 'test') console.log(`hunspell: ${shared.size} entries in ${Math.round(performance.now() - t)} ms`);
  } catch (e) {
    console.warn('hunspell: dictionary not loaded, word lists only:', (e as Error).message);
    shared = null;
  }
  return shared;
}

const cache = new Map<string, boolean>();

/**
 * Is this ONE word right for the Arabic Hunspell dictionary, written any way players write it (no
 * diacritics, أ/إ/آ/ا, ة/ه, ى/ي, ؤ/ئ mixed)? False for anything that is not Arabic letters only, and
 * when the dictionary could not be loaded. Results are cached.
 */
export function spellArabic(word: string, opts: CheckOptions = {}): boolean {
  const w = foldNorm(word.trim());
  if (w.length < 2 || !/^[ء-ي]+$/.test(w)) return false;
  const key = `${opts.prefixes ?? 'all'}${opts.noGrammar ? '-' : '+'}${w}`;
  let v = cache.get(key);
  if (v === undefined) {
    const h = arabicSpeller();
    v = h ? h.check(w, opts) : false;
    if (cache.size >= 50_000) cache.clear();
    cache.set(key, v);
  }
  return v;
}
