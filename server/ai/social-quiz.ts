/**
 * Bots for the quiz family (مسابقة، معلومات عامة، من أي سورة؟، من القائل؟، التجويد، الأسماء الحسنى، قصص الأنبياء،
 * ابنِ المسجد، حروف…): how often a bot knows the answer and how long it takes to answer, by the room's
 * bot strength («مستوى البوتات»).
 *
 * A quiz bot can't "work out" an answer: it plays a person who knows the subject well or less well.
 * - easy: the old relaxed bot (the game's own skill, answers mostly in the second half of the timer);
 * - smart: mostly right, answers at a calm human pace;
 * - expert: almost always right and quick, but never faster than a person who reads the question and the
 *   options (reading time grows with the text), and a little slower on the rare question it doesn't know.
 */
import type { BotLevel } from '../../src/shared/protocol';
import { clamp, randInt } from '../util';

/** Share of easy-bot answers that come in the second half of the timer (people get the speed points). */
const EASY_LATE = 0.7;

/** Chance that a bot knows the answer, from the game's old (casual) skill. */
export function quizSkill(level: BotLevel, easy: number): number {
  if (level === 'easy') return easy;
  if (level === 'smart') return clamp(0.78 + 0.1 * easy, 0.8, 0.88);
  return clamp(0.93 + 0.05 * easy, 0.94, 0.97);
}

/** The old relaxed timing: mostly in the second half of the timer, sometimes earlier. */
export function easyDelay(seconds: number): number {
  const total = seconds * 1000;
  return Math.random() < EASY_LATE ? randInt(total * 0.5, total * 0.92) : randInt(Math.min(2500, total * 0.25), total * 0.5);
}

/**
 * How long a person needs to read `chars` characters of question and options and tap: about 1 s to take
 * it in, ~28 ms a character, plus a little jitter.
 */
export function readMs(chars: number): number {
  return 900 + chars * 28 + randInt(0, 900);
}

/** Characters a player reads before answering: the whole question and (a quick look at) the options. */
export function readChars(text: string, options: readonly string[] = []): number {
  return text.length + Math.round(0.6 * options.reduce((n, o) => n + o.length, 0));
}

/**
 * When a bot answers (ms after the question appears).
 * `sure`: whether it knows the answer (an unsure bot hesitates a little longer).
 */
export function quizDelay(level: BotLevel, seconds: number, chars: number, sure = true): number {
  const total = seconds * 1000;
  if (level === 'easy') return easyDelay(seconds);
  const read = readMs(chars);
  if (level === 'smart') {
    const ms = read * 1.5 + randInt(800, 2800) + (sure ? 0 : randInt(1500, 3500));
    return Math.round(clamp(ms, Math.min(2500, total * 0.3), total * 0.8));
  }
  const ms = read + (sure ? randInt(0, 600) : randInt(1500, 4000));
  return Math.round(clamp(ms, Math.min(1800, total * 0.2), total * 0.55));
}

/** A multiple-choice answer: the right option with the bot's chance of knowing it, else another one. */
export function quizChoice(correct: number, count: number, skill: number): { choice: number; sure: boolean } {
  if (Math.random() < skill || count < 2) return { choice: correct, sure: true };
  const wrong = [...Array(count).keys()].filter((k) => k !== correct);
  return { choice: wrong[randInt(0, wrong.length - 1)], sure: false };
}

/** Everything a quiz bot decides for one question. */
export function quizAnswer(
  level: BotLevel,
  easySkill: number,
  item: { text: string; options: readonly string[]; correct: number },
  seconds: number,
): { choice: number; delay: number } {
  const { choice, sure } = quizChoice(item.correct, item.options.length, quizSkill(level, easySkill));
  return { choice, delay: quizDelay(level, seconds, readChars(item.text, item.options), sure) };
}
