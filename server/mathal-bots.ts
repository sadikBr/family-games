/**
 * «أكمل المثل» — the bots. A bot plays a person who knows the proverb or not: the chance grows with the
 * room's «مستوى البوتات» and with how famous the proverb is. Knowing it, a bot taps the right ending, or
 * types it (now and then with a small slip or a missing word, as people do); not knowing it, it guesses an
 * option, or types a near miss (the start of the ending then a wrong word, or another proverb's ending).
 * It takes the time a person needs to read the beginning and the options, and to type.
 */
import type { BotLevel } from '../src/shared/protocol';
import { quizDelay } from './ai/social-quiz';
import type { MathalItem } from './mathal-deck';
import { gradeTyped } from './mathal-match';
import { clamp, randInt } from './util';

type Rnd = () => number;

/** How often a bot knows the proverb: [famous, less known]. */
export const MATHAL_BOT_KNOWS: Record<BotLevel, [number, number]> = { easy: [0.5, 0.2], smart: [0.78, 0.45], expert: [0.92, 0.7] };

/** Milliseconds a character takes to type on a phone. */
const TYPE_MS: Record<BotLevel, number> = { easy: 420, smart: 320, expert: 230 };

export const botKnows = (level: BotLevel, it: MathalItem) => MATHAL_BOT_KNOWS[level][it.p.famous ? 0 : 1];

/** Characters read before answering: the beginning, and (options mode) a quick look at the options. */
export function readChars(it: MathalItem, typed: boolean): number {
  return it.p.start.length + 8 + (typed ? 0 : Math.round(0.6 * it.options.reduce((n, o) => n + o.length, 0)));
}

/** A small slip in a word of 5+ letters (one letter dropped), or the text unchanged. */
function slip(text: string, rnd: Rnd): string {
  const words = text.split(' ');
  const long = words.map((w, i) => [w, i] as const).filter(([w]) => [...w].length >= 5);
  if (!long.length) return text;
  const [w, i] = long[Math.floor(rnd() * long.length)];
  const k = 1 + Math.floor(rnd() * ([...w].length - 2));
  words[i] = [...w].filter((_, j) => j !== k).join('');
  return words.join(' ');
}

/** What a bot types: the ending (maybe with a slip or a word less) or a near miss. */
export function botTyped(it: MathalItem, sure: boolean, rnd: Rnd): string {
  const { p } = it;
  if (sure) {
    const r = rnd();
    const words = p.end.split(' ');
    let t = p.end;
    if (r < 0.2) t = slip(p.end, rnd);
    else if (r < 0.3 && words.length >= 3) t = words.filter((_, i) => i !== words.length - 1).join(' ');
    return gradeTyped(t, p) === 'wrong' ? p.end : t;
  }
  const others = it.options.filter((_, i) => i !== it.correct);
  const other = others[Math.floor(rnd() * others.length)] ?? '';
  const words = p.end.split(' ');
  const tries = [
    // the start of the ending, then words of another one
    words.length >= 2 ? `${words[0]} ${other.split(' ').slice(-1)[0] ?? ''}` : '',
    other,
  ];
  for (const t of rnd() < 0.5 ? tries : tries.reverse()) if (t.trim() && gradeTyped(t, p) === 'wrong') return t.trim();
  return other || '؟';
}

/** A bot's answer for a round: what it sends and after how long. */
export function botAnswer(level: BotLevel, it: MathalItem, typed: boolean, seconds: number, rnd: Rnd): { choice?: number; text?: string; delay: number } {
  const sure = rnd() < botKnows(level, it);
  const total = seconds * 1000;
  const think = quizDelay(level, seconds, readChars(it, typed), sure);
  if (!typed) {
    const choice = sure ? it.correct : Math.floor(rnd() * it.options.length);
    return { choice, delay: think };
  }
  const text = botTyped(it, sure, rnd);
  const typing = [...text].length * TYPE_MS[level] + randInt(300, 1200);
  return { text, delay: Math.round(clamp(think + typing, 2500, total - 800)) };
}
