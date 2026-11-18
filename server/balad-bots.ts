/**
 * «البلد الغامض» — how a bot plays a round: like a person who reads the clues and recognises the country
 * at some clue (early for the expert, late for the easy bot, a little later for a less-known country),
 * sometimes after a wrong guess or two from the same part of the world, sometimes not at all. Each
 * guess comes a human moment after its clue appeared (reading it, then typing), never during a lock.
 *
 * The plan is drawn once per round from the room's random; the bot "knows" the answer the way a quiz
 * bot knows it (it plays a person who knows the subject well or less well) — it never sees anything
 * else hidden, and it only sends ordinary guesses.
 */
import { BALAD_CLUES, BALAD_LOCK_MS } from '../src/shared/games/balad';
import { BALAD_COUNTRIES, BALAD_BY_CODE } from '../src/shared/games/balad-countries';
import type { BotLevel } from '../src/shared/protocol';
import { COUNTRIES } from './flags-content';

type Rnd = () => number;

/** The chance of each clue (0-based) being the one a bot recognises the country at. */
export const BALAD_BOT_CLUE: Record<BotLevel, readonly number[]> = {
  expert: [0.28, 0.34, 0.22, 0.1, 0.06, 0],
  smart: [0.06, 0.16, 0.3, 0.28, 0.14, 0.06],
  easy: [0, 0.05, 0.15, 0.3, 0.3, 0.2],
};
/** The chance a bot never finds it. */
export const BALAD_BOT_MISS: Record<BotLevel, number> = { expert: 0.03, smart: 0.1, easy: 0.25 };
/** The chance of a wrong guess before the right one (and of a second one after that). */
export const BALAD_BOT_WRONG: Record<BotLevel, number> = { expert: 0.2, smart: 0.4, easy: 0.55 };

export interface BotGuess {
  /** ms after the round started */
  at: number;
  code: string;
}

function weighted(ws: readonly number[], rnd: Rnd): number {
  const total = ws.reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (let i = 0; i < ws.length; i++) {
    r -= ws[i];
    if (r < 0) return i;
  }
  return ws.length - 1;
}

/** A country a person could confuse with this one: same neighbourhood first, then the same continent. */
export function plausibleWrong(code: string, rnd: Rnd, avoid: string[] = []): string {
  const me = COUNTRIES.find((c) => c.code === code);
  const cont = BALAD_BY_CODE[code]?.continent;
  const ok = (c: string) => c !== code && !avoid.includes(c) && !!BALAD_BY_CODE[c];
  const near = COUNTRIES.filter((c) => me && c.region === me.region && c.sub === me.sub && ok(c.code)).map((c) => c.code);
  const same = BALAD_COUNTRIES.filter((c) => c.continent === cont && ok(c.code)).map((c) => c.code);
  const pool = near.length && rnd() < 0.7 ? near : same.length ? same : BALAD_COUNTRIES.filter((c) => ok(c.code)).map((c) => c.code);
  return pool[Math.floor(rnd() * pool.length)];
}

/** Reading a clue and typing a name: 2–5.5 s after it appeared, inside the clue's window. */
const reply = (interval: number, rnd: Rnd) => Math.min(interval - 400, 2000 + Math.round(rnd() * 3500));

/**
 * The guesses of one bot for a round: wrong ones first (at least the lock apart), then the right one at
 * its clue — or only wrong ones for a round it doesn't find. `known`: a well-known country (a clue sooner).
 */
export function planBotRound(level: BotLevel, code: string, interval: number, rnd: Rnd, known = true): BotGuess[] {
  const miss = rnd() < BALAD_BOT_MISS[level];
  let clue = weighted(BALAD_BOT_CLUE[level], rnd);
  if (!known && clue < BALAD_CLUES - 1 && rnd() < 0.6) clue++;
  const rightAt = clue * interval + reply(interval, rnd);
  const out: BotGuess[] = [];
  const wrongs: string[] = [];
  const wrongN = rnd() < BALAD_BOT_WRONG[level] ? (rnd() < 0.3 ? 2 : 1) : miss ? 1 : 0;
  // wrong guesses go back from the right one (or from the end of a missed round), a lock and a pause apart
  let t = miss ? BALAD_CLUES * interval - 1500 : rightAt;
  for (let i = 0; i < wrongN; i++) {
    t -= BALAD_LOCK_MS + 600 + Math.round(rnd() * 2500);
    if (t < 1800) break;
    const w = plausibleWrong(code, rnd, wrongs);
    wrongs.push(w);
    out.unshift({ at: t, code: w });
  }
  if (!miss) out.push({ at: rightAt, code });
  return out;
}
