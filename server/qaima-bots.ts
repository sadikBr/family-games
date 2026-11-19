/**
 * «املأ القائمة» — the bots. A bot knows a part of the list by its level (easy ~20–30%, smart ~40–55%,
 * expert ~60–75% of the items, fewer when the time is too short to type them all at a human pace),
 * picked mostly by fame: the famous items first, then the rarer ones. It types them spread over the
 * round, quickly at first and slower as it runs out of ideas, with now and then a miss a person would
 * make (an item of a neighbouring list, a word with two slips, an answer typed twice) and sometimes one
 * small slip the matching forgives. Every attempt is an ordinary «add» checked by the server.
 */
import type { BotLevel } from '../src/shared/protocol';
import { qaimaMatch, type QaimaListDef } from './qaima-match';

type Rnd = () => number;

export interface BotTry {
  /** ms after the round started */
  at: number;
  text: string;
}

/** Share of the list a bot knows, and its least time between two answers. */
export const QAIMA_BOT_LEVELS: Record<BotLevel, { from: number; to: number; gap: number; misses: number }> = {
  easy: { from: 0.2, to: 0.3, gap: 4200, misses: 0.2 },
  smart: { from: 0.4, to: 0.55, gap: 3100, misses: 0.13 },
  expert: { from: 0.6, to: 0.75, gap: 2300, misses: 0.08 },
};

/** The reading moment at the start, and the margin kept before the end. */
const START_MS = 3500;
const END_MS = 1500;

/** One letter changed, dropped or doubled inside a word (never the first letter). */
function slip(text: string, rnd: Rnd): string {
  const chars = [...text];
  const spots = chars.map((c, i) => (i > 0 && c !== ' ' && chars[i - 1] !== ' ' ? i : -1)).filter((i) => i >= 0);
  if (!spots.length) return text;
  const i = spots[Math.floor(rnd() * spots.length)];
  const r = rnd();
  if (r < 0.4) chars.splice(i, 1);
  else if (r < 0.7) chars.splice(i, 0, chars[i]);
  else chars[i] = 'ابتدرسعلمنهوي'[Math.floor(rnd() * 13)];
  return chars.join('');
}

/** `k` different items, drawn by fame (fame³ weights: 27 / 8 / 1), the famous ones tending to come first. */
function pickByFame(def: QaimaListDef, k: number, rnd: Rnd): number[] {
  // Efraimidis–Spirakis: key = u^(1/w), the k largest keys
  return def.items
    .map((it, i) => ({ i, key: Math.pow(Math.max(1e-9, rnd()), 1 / (it.fame * it.fame * it.fame)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.i);
}

/** Wrong answers a person could give for this list: its decoys, or items of the other lists of the topic. */
function missCandidates(def: QaimaListDef, others: readonly QaimaListDef[], rnd: Rnd): string[] {
  const pool = [...(def.decoys ?? []), ...others.filter((o) => o.topic === def.topic && o.id !== def.id).flatMap((o) => o.items.filter((it) => it.fame >= 2).map((it) => it.name))];
  const out: string[] = [];
  for (const t of pool.sort(() => rnd() - 0.5)) {
    if (out.length >= 6) break;
    if (qaimaMatch(def, t).kind === 'miss' && !out.includes(t)) out.push(t);
  }
  return out;
}

/** A bot's whole round: what it types, and when. */
export function planBotRound(level: BotLevel, def: QaimaListDef, seconds: number, rnd: Rnd, others: readonly QaimaListDef[] = []): BotTry[] {
  const p = QAIMA_BOT_LEVELS[level];
  const n = def.items.length;
  const window = seconds * 1000 - START_MS - END_MS;
  const share = p.from + (p.to - p.from) * rnd();
  const k = Math.max(1, Math.min(Math.round(n * share), Math.floor(window / p.gap)));
  const picks = pickByFame(def, k, rnd);
  const texts: string[] = picks.map((i) => {
    const it = def.items[i];
    // people type the short or other names too
    const names = [it.name, ...it.aliases.filter((a) => [...a].length >= 3)];
    let t = names[rnd() < 0.7 ? 0 : Math.floor(rnd() * names.length)];
    // a small slip, forgiven by the matching (only if it still leads to the same item)
    if (rnd() < 0.12 && [...t].length >= 6) {
      const s = slip(t, rnd);
      const m = qaimaMatch(def, s);
      if (m.kind !== 'miss' && m.item === i) t = s;
    }
    return t;
  });
  // the misses: a neighbouring item, a word with two slips, or the same answer again
  const misses: string[] = [];
  const wrong = missCandidates(def, others, rnd);
  const nMiss = Math.round(k * p.misses * (0.5 + rnd()));
  for (let j = 0; j < nMiss; j++) {
    const r = rnd();
    if (r < 0.5 && wrong.length) misses.push(wrong.splice(Math.floor(rnd() * wrong.length), 1)[0]);
    else if (r < 0.8) {
      const it = def.items[Math.floor(rnd() * n)].name;
      const twice = slip(slip(it, rnd), rnd);
      if (qaimaMatch(def, twice).kind === 'miss') misses.push(twice);
    } else if (texts.length) misses.push(texts[Math.floor(rnd() * texts.length)]);
  }
  // the order: the answers as picked (famous first), the misses slipped in among them
  const seq = [...texts];
  for (const m of misses) seq.splice(1 + Math.floor(rnd() * seq.length), 0, m);
  // the times: quick at first, slower later ((i/m)^1.35), with a little jitter, never closer than 0.9 s
  const total = seq.length;
  const out: BotTry[] = [];
  let last = 0;
  seq.forEach((text, i) => {
    const base = START_MS + window * Math.pow((i + 0.6) / total, 1.35);
    const at = Math.round(Math.min(START_MS + window, Math.max(last + 900, base + (rnd() - 0.5) * 1200)));
    if (at > seconds * 1000 - 600) return;
    out.push({ at, text });
    last = at;
  });
  return out;
}
