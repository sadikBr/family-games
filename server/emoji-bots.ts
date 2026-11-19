/**
 * «خمّن من الإيموجي» — the bots. A bot plays a person who decodes the emojis or doesn't: it knows the answer
 * with a chance set by «مستوى البوتات» and the puzzle's difficulty (1–3); a bot that doesn't know it may
 * still get it once the hint is out (half points, like everyone). Its timing is human: it looks at the
 * emojis (longer rows and harder puzzles take longer), thinks, then taps or types (the typing time grows
 * with the answer). A wrong typed answer is a plausible near miss — another answer of the same category,
 * or the proverb cut short — never something the matcher would accept.
 */
import type { EmojiMode } from '../src/shared/games/emoji';
import type { BotLevel } from '../src/shared/protocol';
import type { EmojiPuzzle } from './emoji-content';
import { emojiMatches } from './emoji-match';

type Rnd = () => number;

/** The chance a bot knows a puzzle before the hint, by difficulty 1, 2, 3. */
export const EMOJI_BOT_KNOWS: Record<BotLevel, [number, number, number]> = {
  easy: [0.55, 0.35, 0.2],
  smart: [0.8, 0.6, 0.42],
  expert: [0.93, 0.8, 0.62],
};

/** The chance a bot that didn't know it gets it once the hint is out. */
export const EMOJI_BOT_AFTER_HINT: Record<BotLevel, number> = { easy: 0.3, smart: 0.5, expert: 0.65 };

/** How much slower (or faster) than a calm player each level is. */
const PACE: Record<BotLevel, number> = { easy: 1.5, smart: 1.15, expert: 0.85 };

export interface BotMove {
  /** ms after the puzzle appeared */
  delay: number;
  /** typed mode */
  text?: string;
  /** options mode */
  choice?: number;
  /** whether the bot means to be right (tests) */
  right: boolean;
}

export interface BotItem {
  puzzle: EmojiPuzzle;
  options: string[] | null;
  correct: number | null;
  removed: number[];
}

const between = (rnd: Rnd, a: number, b: number) => a + (b - a) * rnd();

/** Time to look at the emojis and work it out: ~1.5 s, more per emoji and for a hard one. */
function thinkMs(rnd: Rnd, p: EmojiPuzzle): number {
  const graphemes = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(p.emojis)].length;
  return 1500 + graphemes * 450 + (p.difficulty - 1) * 1800 + between(rnd, 0, 2500);
}

/** Time to type an answer (~0.22 s a letter) or tap an option. */
function inputMs(rnd: Rnd, mode: EmojiMode, text: string): number {
  if (mode === 'options') return between(rnd, 500, 1200);
  return 1200 + Math.min(40, [...text].length) * 220 + between(rnd, 0, 1200);
}

/** A plausible wrong typed answer: the proverb cut short, or another answer of the same category. */
export function nearMiss(p: EmojiPuzzle, pool: readonly EmojiPuzzle[], rnd: Rnd): string {
  const words = p.answer.split(' ');
  const cands: string[] = [];
  if (words.length >= 3) cands.push(words.slice(0, Math.ceil(words.length / 2)).join(' '));
  const same = pool.filter((q) => q.cat === p.cat && q.id !== p.id);
  // prefer answers that share an emoji (the confusion a person makes)
  const shares = same.filter((q) => [...q.emojis].some((c) => c.codePointAt(0)! > 0x2000 && c !== '️' && p.emojis.includes(c)));
  for (const q of [...shares, ...same]) cands.push(q.answer);
  const ok = cands.filter((c) => !emojiMatches(c, p));
  if (!ok.length) return '؟';
  // the cut proverb or a sharing answer is most likely, then any other
  const head = ok.slice(0, Math.max(1, Math.min(3, ok.length)));
  return rnd() < 0.7 ? head[Math.floor(rnd() * head.length)] : ok[Math.floor(rnd() * ok.length)];
}

/**
 * The bot's move for this puzzle. `totalMs` = the answer time, `hintMs` = when the hint comes out
 * (both from the puzzle's start).
 */
export function botMove(level: BotLevel, mode: EmojiMode, it: BotItem, pool: readonly EmojiPuzzle[], totalMs: number, hintMs: number, rnd: Rnd): BotMove {
  const p = it.puzzle;
  const pace = PACE[level];
  const knows = rnd() < EMOJI_BOT_KNOWS[level][p.difficulty - 1];
  const late = !knows && rnd() < EMOJI_BOT_AFTER_HINT[level];
  const right = knows || late;
  let text: string | undefined;
  let choice: number | undefined;
  if (mode === 'typed') text = right ? (p.alt.length && rnd() < 0.25 ? p.alt[0] : p.answer) : nearMiss(p, pool, rnd);
  else {
    // a guess lands on one of the wrong options the hint keeps (a removed one couldn't be sent after it)
    const left = (it.options ?? []).map((_, i) => i).filter((i) => i !== it.correct && !it.removed.includes(i));
    choice = right ? (it.correct ?? 0) : left[Math.floor(rnd() * left.length)];
  }
  const input = inputMs(rnd, mode, text ?? '');
  let delay: number;
  if (knows) {
    // before the hint (a slow easy bot may run past it now and then)
    delay = (thinkMs(rnd, p) * pace + input) * between(rnd, 0.85, 1.1);
    if (level !== 'easy') delay = Math.min(delay, hintMs - 300);
  } else if (late) {
    // reads the hint, then answers
    delay = hintMs + (1200 + between(rnd, 0, 2500)) * pace + input;
  } else {
    // unsure: a guess somewhere in the second half
    delay = between(rnd, totalMs * 0.45, totalMs * 0.92);
  }
  return { delay: Math.round(Math.max(1500, Math.min(delay, totalMs - 400))), text, choice, right };
}
