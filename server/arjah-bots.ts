/**
 * «من الأرجح؟» — the bots and the deal of the prompts.
 *
 * A bot votes like a person at the table: it reads the prompt, looks over the faces and picks one. Its
 * pick is a weighted draw over the players, from what everyone saw at the earlier reveals only (never the
 * votes of the current round, which stay on the server):
 * - every other player starts at weight 1, the bot itself lower (people vote for themselves now and then);
 * - a player the family chose for a similar earlier prompt (same tag: sleep, forgetting, kindness…) gains
 *   a lot, one chosen for a prompt of the same theme a little — more so for a stronger bot, which
 *   remembers better;
 * - smart and expert bots lean a little toward the game's favourite so far (the player who held the most
 *   round titles), and sharpen the weights (they follow the family's taste more closely).
 */
import { ARJAH_THEMES, type ArjahTheme, type ArjahThemeSetting } from '../src/shared/games/arjah';
import type { BotLevel } from '../src/shared/protocol';
import { themePrompts, type ArjahPrompt } from './arjah-content';
import { clamp } from './util';

export type Rnd = () => number;

/** What a bot remembers of an earlier round: the public counts of its reveal. */
export interface ArjahPast {
  theme: ArjahTheme;
  tag: string;
  tally: Record<string, number>;
  total: number;
  top: string[];
}

interface Strength {
  /** the bot's own weight next to 1 for the others */
  self: number;
  /** weight gained per share of votes in an earlier round with the same tag / same theme / any */
  sameTag: number;
  sameTheme: number;
  other: number;
  /** extra weight for the game's favourite so far */
  favourite: number;
  /** the weights are raised to this power */
  sharpen: number;
}

export const ARJAH_BOT: Record<BotLevel, Strength> = {
  easy: { self: 0.5, sameTag: 1, sameTheme: 0.3, other: 0.1, favourite: 0, sharpen: 1 },
  smart: { self: 0.35, sameTag: 2.5, sameTheme: 0.8, other: 0.2, favourite: 0.4, sharpen: 1.3 },
  expert: { self: 0.25, sameTag: 4, sameTheme: 1.2, other: 0.3, favourite: 0.8, sharpen: 1.6 },
};

/** The player with the most round titles so far (null when nobody leads alone). */
export function favourite(history: readonly ArjahPast[], players: readonly string[]): string | null {
  const titles = new Map<string, number>();
  for (const h of history) for (const id of h.top) if (players.includes(id)) titles.set(id, (titles.get(id) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  let shared = false;
  for (const [id, c] of titles) {
    if (c > n) {
      best = id;
      n = c;
      shared = false;
    } else if (c === n) shared = true;
  }
  return shared ? null : best;
}

/** The weight of each player for this bot's vote on `prompt`. */
export function botWeights(level: BotLevel, me: string, players: readonly string[], prompt: Pick<ArjahPrompt, 'theme' | 'tag'>, history: readonly ArjahPast[]): Record<string, number> {
  const k = ARJAH_BOT[level];
  const w: Record<string, number> = {};
  for (const p of players) w[p] = p === me ? k.self : 1;
  for (const h of history) {
    if (h.total <= 0) continue;
    const sim = h.tag === prompt.tag ? k.sameTag : h.theme === prompt.theme ? k.sameTheme : k.other;
    for (const p of players) w[p] += sim * ((h.tally[p] ?? 0) / h.total);
  }
  const fav = favourite(history, players);
  if (fav && k.favourite) w[fav] += k.favourite;
  for (const p of players) w[p] = Math.pow(w[p], k.sharpen);
  return w;
}

/** The bot's vote: one weighted draw. */
export function botVote(level: BotLevel, me: string, players: readonly string[], prompt: Pick<ArjahPrompt, 'theme' | 'tag'>, history: readonly ArjahPast[], rnd: Rnd = Math.random): string {
  const w = botWeights(level, me, players, prompt, history);
  const sum = players.reduce((n, p) => n + w[p], 0);
  let r = rnd() * sum;
  for (const p of players) {
    r -= w[p];
    if (r <= 0) return p;
  }
  return players[players.length - 1];
}

/**
 * When the bot's vote comes (ms after the prompt appears): reading the question, a look over the faces
 * (longer with more players), a moment to decide. An easy bot is more relaxed. Never before 2.5 s, and
 * well before the end of the timer.
 */
export function botDelay(level: BotLevel, seconds: number, chars: number, players: number, rnd: Rnd = Math.random): number {
  const total = seconds * 1000;
  const look = players * 260;
  const think = level === 'easy' ? 3000 + rnd() * 7000 : level === 'smart' ? 1500 + rnd() * 4500 : 800 + rnd() * 3200;
  // ~1 s to take the question in, ~28 ms a character (as the quiz bots read)
  const read = (900 + chars * 28 + rnd() * 900) * (level === 'easy' ? 1.4 : level === 'smart' ? 1.2 : 1);
  return Math.round(clamp(read + look + think, 2500, total * 0.85));
}

/* ------------------------------------------------------------------ */
/* The deal                                                            */
/* ------------------------------------------------------------------ */

function shuffled<T>(arr: readonly T[], rnd: Rnd): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** «منوّع»: the themes in turn (a shuffled order), so the prompts keep changing subject. */
function interleave(list: ArjahPrompt[], rnd: Rnd): ArjahPrompt[] {
  const buckets = new Map<ArjahTheme, ArjahPrompt[]>();
  for (const p of list) buckets.set(p.theme, [...(buckets.get(p.theme) ?? []), p]);
  const order = shuffled(ARJAH_THEMES, rnd);
  const out: ArjahPrompt[] = [];
  while (out.length < list.length) {
    for (const t of order) {
      const b = buckets.get(t);
      if (b?.length) out.push(b.shift()!);
    }
  }
  return out;
}

/**
 * `n` prompts for the theme: first the ones this room hasn't seen yet; when the theme runs low, the rest
 * of it (and the theme starts over in `seen`). The dealt prompts are added to `seen`.
 */
export function dealPrompts(theme: ArjahThemeSetting, n: number, rnd: Rnd, seen: Set<string>): ArjahPrompt[] {
  const pool = themePrompts(theme);
  const fresh = shuffled(
    pool.filter((p) => !seen.has(p.id)),
    rnd,
  );
  let picked: ArjahPrompt[];
  if (fresh.length >= n) {
    picked = theme === 'mix' ? interleave(fresh, rnd).slice(0, n) : fresh.slice(0, n);
  } else {
    const rest = shuffled(
      pool.filter((p) => seen.has(p.id)),
      rnd,
    );
    const mixed = (l: ArjahPrompt[]) => (theme === 'mix' ? interleave(l, rnd) : l);
    picked = [...mixed(fresh), ...mixed(rest)].slice(0, n);
    for (const p of pool) seen.delete(p.id);
  }
  for (const p of picked) seen.add(p.id);
  return picked;
}
