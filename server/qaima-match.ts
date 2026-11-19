/**
 * «املأ القائمة» — how a typed answer is matched to an item of the round's list (on the server only).
 *
 * Both the typed text and every name / alias of the items go through the same key: the `norm` folding of
 * src/shared/arabic.ts (vowel marks, hamza shapes, ة/ه, ى/ي, ؤ/و, ئ/ي), Moroccan and Persian keyboard
 * letters (ڭ گ ک ی ڤ پ), punctuation and hyphens as spaces, Arabic-Indic digits as digits, «ال» dropped
 * from each word (not from «الله»), «و» + «ال» joined («والهرسك» = «و الهرسك»), «عبدالرحمن» = «عبد الرحمن»,
 * the list's own filler words dropped («سورة»، «نهر»، «بحر»…), then the spaces.
 *
 * Then: the exact key of a name or alias wins (when two items share one — «زينب»، «الكونغو»، «أنت» — the
 * first one I don't have yet); a known wrong answer (the list's decoys and blocked names: «غانا» in the
 * Americas, «المصرية» among the languages) is refused as it is; else one slip (a letter added, missing or
 * changed) is forgiven when both the typed key and the item's have 5+ letters and the slip leads to that
 * item alone.
 */
import { editDistance, norm, stripAl } from '../src/shared/arabic';

export interface QaimaItem {
  name: string;
  aliases: string[];
  /** 1 (few know it) … 3 (everyone does): the bots' choice and «أشهر ما فات الجميع» */
  fame: number;
}

export interface QaimaListDef {
  id: string;
  title: string;
  topic: import('../src/shared/games/qaima').QaimaTopic;
  items: QaimaItem[];
  /** the list has its own order (months, planets, surahs…): the reveal keeps it */
  ordered?: boolean;
  /** words dropped from answers and names («سورة»، «نهر»…) */
  drop?: string[];
  /** shown under the title while typing */
  hint?: string;
  /** shown at the reveal */
  note?: string;
  /** plausible wrong answers for the bots: never accepted, not even as a slip of an item */
  decoys?: string[];
  /** other names that are never accepted (the countries of the other lists…) */
  block?: string[];
}

const KEYBOARD: Record<string, string> = { ڭ: 'ك', ݣ: 'ك', گ: 'ك', ک: 'ك', ی: 'ي', ې: 'ي', ڤ: 'ف', پ: 'ب', چ: 'ش' };
const INDIC = '٠١٢٣٤٥٦٧٨٩';

/** The words of a text, folded, each without its «ال». */
export function qaimaWords(text: string): string[] {
  const t = norm(
    text
      .slice(0, 80)
      .replace(/[ڭݣگکیېڤپچ]/g, (c) => KEYBOARD[c] ?? c)
      .replace(/[٠-٩]/g, (d) => String(INDIC.indexOf(d)))
      .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
      .replace(/[ﷺ]/g, ' '),
  )
    .replace(/[^ء-ي0-9 ]/g, ' ')
    .replace(/(^| )(عبد|ابو|ابي|ابا|ذو|ذي|ذا)(ال)/g, '$1$2 $3')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return [];
  return t.split(' ').map((w) => (w === 'الله' ? w : w.startsWith('وال') && w.length > 4 ? `و${w.slice(3)}` : stripAl(w)));
}

/** The key a text is compared by (its words joined), without the list's filler words when others remain. */
export function qaimaKey(text: string, drop: readonly string[] = []): string {
  const words = qaimaWords(text);
  const kept = drop.length ? words.filter((w) => !drop.includes(w)) : words;
  return (kept.length ? kept : words).join('');
}

const len = (s: string) => [...s].length;

export interface QaimaIndex {
  def: QaimaListDef;
  drop: string[];
  exact: Map<string, number[]>;
  forms: { key: string; item: number }[];
  /** keys refused as they are */
  blocked: Set<string>;
}

const INDEX = new WeakMap<QaimaListDef, QaimaIndex>();

/** The list's lookup tables (built once per list). */
export function qaimaIndex(def: QaimaListDef): QaimaIndex {
  const cached = INDEX.get(def);
  if (cached) return cached;
  const drop = (def.drop ?? []).map((w) => stripAl(norm(w)));
  const exact = new Map<string, number[]>();
  const forms: { key: string; item: number }[] = [];
  def.items.forEach((it, i) => {
    for (const key of new Set([it.name, ...it.aliases].map((n) => qaimaKey(n, drop)).filter(Boolean))) {
      const at = exact.get(key) ?? [];
      if (!at.includes(i)) at.push(i);
      exact.set(key, at);
      forms.push({ key, item: i });
    }
  });
  const blocked = new Set([...(def.decoys ?? []), ...(def.block ?? [])].map((n) => qaimaKey(n, drop)).filter((k) => k && !exact.has(k)));
  const idx = { def, drop, exact, forms, blocked };
  INDEX.set(def, idx);
  return idx;
}

export type QaimaMatch = { kind: 'ok' | 'dup'; item: number } | { kind: 'miss' };

/** Which item a typed answer names, given the items I already have. */
export function qaimaMatch(def: QaimaListDef, typed: string, mine: ReadonlySet<number> = new Set()): QaimaMatch {
  const idx = qaimaIndex(def);
  const t = qaimaKey(typed, idx.drop);
  if (!t) return { kind: 'miss' };
  const pick = (items: number[]): QaimaMatch => {
    const free = items.find((i) => !mine.has(i));
    return free !== undefined ? { kind: 'ok', item: free } : { kind: 'dup', item: items[0] };
  };
  const exact = idx.exact.get(t);
  if (exact) return pick(exact);
  const n = len(t);
  if (n < 5 || idx.blocked.has(t)) return { kind: 'miss' };
  const near = new Set<number>();
  for (const f of idx.forms) {
    const m = len(f.key);
    if (m < 5 || Math.abs(m - n) > 1) continue;
    if (editDistance(t, f.key) <= 1) near.add(f.item);
  }
  if (near.size === 1) return pick([...near]);
  // as close to two items: only fine when I have them all already
  if (near.size > 1 && [...near].every((i) => mine.has(i))) return { kind: 'dup', item: [...near][0] };
  return { kind: 'miss' };
}
