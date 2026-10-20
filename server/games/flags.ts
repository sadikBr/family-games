/**
 * «الأعلام والعواصم» — flags and capitals. Each round one of four kinds of question (by the lobby's mode):
 * a flag → its country, a country → its capital, a capital → its country, a country → its flag among
 * four. The three wrong options come from the same part of the world (server/flags-content.ts), never
 * twice the same text, never a near-twin of another option. The countries are dealt from the room's
 * deck so they don't come back game after game. Scoring, reveal and bots: speedquiz.ts.
 */
import type { BotLevel } from '../../src/shared/protocol';
import {
  FLAGS_DEFAULTS,
  FLAGS_LEVELS,
  FLAGS_MODES,
  FLAGS_MODE_KINDS,
  FLAGS_REGIONS,
  FLAGS_ROUNDS,
  FLAGS_SECONDS,
  type FlagsKind,
  type FlagsLevel,
  type FlagsMode,
  type FlagsRegion,
  type FlagsResult,
  type FlagsSettings,
  type FlagsShown,
  type FlagsView,
} from '../../src/shared/games/flags';
import { COUNTRIES, UNCLEAR_CAPITAL, type Country } from '../flags-content';
import { qdeck } from '../qdeck';
import { paced } from '../types';
import { isStr } from '../util';
import { makeSpeedQuiz, snapTo, type SqItem } from './speedquiz';

export const FLAGS_REVEAL_MS = 6000;
/** the «سهل» level falls back to every country of the region when it knows fewer than this */
const MIN_EASY = 8;

type Rnd = () => number;

export interface FlagItem extends SqItem {
  kind: FlagsKind;
  country: Country;
  options: Country[];
}

/** How often a bot knows the answer (a well-known country / any other); otherwise it guesses. */
export const FLAGS_BOT_KNOWS: Record<BotLevel, [number, number]> = { easy: [0.45, 0.18], smart: [0.7, 0.4], expert: [0.88, 0.62] };

const oneOf = <T extends string>(v: unknown, keys: { key: T }[], d: T): T => (isStr(v) && keys.some((k) => k.key === v) ? (v as T) : d);

export function sanitizeFlags(raw: Partial<FlagsSettings> | undefined): FlagsSettings {
  return {
    rounds: snapTo(raw?.rounds, FLAGS_ROUNDS, FLAGS_DEFAULTS.rounds),
    mode: oneOf<FlagsMode>(raw?.mode, FLAGS_MODES, FLAGS_DEFAULTS.mode),
    region: oneOf<FlagsRegion>(raw?.region, FLAGS_REGIONS, FLAGS_DEFAULTS.region),
    level: oneOf<FlagsLevel>(raw?.level, FLAGS_LEVELS, FLAGS_DEFAULTS.level),
  };
}

/** The countries of a region. */
export function regionPool(region: FlagsRegion): Country[] {
  if (region === 'world') return COUNTRIES;
  if (region === 'arab') return COUNTRIES.filter((c) => c.arab);
  return COUNTRIES.filter((c) => c.region === region);
}

/** The countries a game asks about: the well-known ones at «سهل» (unless the region has too few). */
export function subjectPool(region: FlagsRegion, level: FlagsLevel): Country[] {
  const pool = regionPool(region);
  if (level === 'all') return pool;
  const known = pool.filter((c) => c.known);
  return known.length >= MIN_EASY ? known : pool;
}

/** Whether a country can be asked about in this kind of question. */
export function validFor(kind: FlagsKind, c: Country): boolean {
  return kind === 'flag' || kind === 'pickflag' ? !c.noFlag : !c.noCapital;
}

/** The text an option shows for this kind (null: shown as a flag). */
export function optionText(kind: FlagsKind, c: Country): string | null {
  if (kind === 'capital') return c.capital;
  if (kind === 'pickflag') return null;
  return c.name;
}

/** Loose spelling, to keep near-twins («كينغستون» / «كينغستاون») out of the same question. */
const loose = (s: string) => s.replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '');

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Two option texts too alike to be fair side by side. */
export function tooAlike(a: string, b: string): boolean {
  const x = loose(a);
  const y = loose(b);
  return x === y || x.includes(y) || y.includes(x) || editDistance(x, y) <= 2;
}

function shuffled<T>(xs: readonly T[], rnd: Rnd): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Three wrong options from the same neighbourhood (then the same region, then the world). */
export function pickDistractors(kind: FlagsKind, subject: Country, pool: Country[], rnd: Rnd, n = 3): Country[] {
  const out: Country[] = [];
  const texts = [optionText(kind, subject)];
  const ok = (c: Country) => {
    if (c === subject || out.includes(c)) return false;
    // a flag option must be a flag we show; a capital option a capital we ask about
    if ((kind === 'pickflag' && c.noFlag) || (kind === 'capital' && c.noCapital)) return false;
    const t = optionText(kind, c);
    return t === null || !texts.some((x) => x !== null && tooAlike(x, t));
  };
  const tiers = [
    pool.filter((c) => c.sub === subject.sub && c.region === subject.region),
    pool.filter((c) => c.region === subject.region),
    pool,
    COUNTRIES.filter((c) => c.region === subject.region),
    COUNTRIES,
  ];
  for (const tier of tiers) {
    for (const c of shuffled(tier, rnd)) {
      if (out.length >= n) return out;
      if (!ok(c)) continue;
      out.push(c);
      texts.push(optionText(kind, c));
    }
  }
  return out;
}

const shownText = (s: string) => s.length;

/** One question: the country, its kind, the four options in a random order. */
export function makeItem(kind: FlagsKind, country: Country, pool: Country[], rnd: Rnd): FlagItem {
  const options = shuffled([country, ...pickDistractors(kind, country, pool, rnd)], rnd);
  const prompt = kind === 'country' ? country.capital : kind === 'flag' ? '' : country.name;
  const chars = 14 + shownText(prompt) + options.reduce((n, c) => n + (optionText(kind, c)?.length ?? 6), 0);
  return { kind, country, options, correct: options.indexOf(country), count: options.length, chars };
}

/** The game's questions: kinds mixed in turn, each country at most once while the region has enough. */
export function buildFlags(ctx: Parameters<typeof qdeck>[0], settings: FlagsSettings, rnd: Rnd): FlagItem[] {
  const pool = regionPool(settings.region);
  const subjects = subjectPool(settings.region, settings.level);
  const modeKinds = FLAGS_MODE_KINDS[settings.mode];
  const deck = qdeck(ctx, `flags:${settings.region}:${settings.level}`, subjects);
  const usedCodes = new Set<string>();
  const usedPairs = new Set<string>();
  const items: FlagItem[] = [];
  let kinds: FlagsKind[] = [];
  for (let i = 0; i < settings.rounds; i++) {
    if (!kinds.length) kinds = shuffled(modeKinds, rnd);
    let kind = kinds.pop() as FlagsKind;
    let country = deck.draw((c) => usedCodes.has(c.code) || !validFor(kind, c));
    if (usedCodes.has(country.code) || !validFor(kind, country)) {
      // every country of the region has had its question: another kind for one of them
      const pairs = subjects.flatMap((c) => modeKinds.filter((k) => validFor(k, c) && !usedPairs.has(`${c.code}:${k}`)).map((k) => [c, k] as const));
      if (!pairs.length) break;
      [country, kind] = pairs[Math.floor(rnd() * pairs.length)];
    }
    usedCodes.add(country.code);
    usedPairs.add(`${country.code}:${kind}`);
    items.push(makeItem(kind, country, pool, rnd));
  }
  return items;
}

/** What the question shows above the options (never the answer itself). */
export function promptOf(it: FlagItem): FlagsShown {
  switch (it.kind) {
    case 'flag':
      return { flag: it.country.code };
    case 'capital':
      return it.country.noFlag ? { text: it.country.name } : { text: it.country.name, flag: it.country.code };
    case 'country':
      return { text: it.country.capital };
    case 'pickflag':
      return { text: it.country.name };
  }
}

export function optionsOf(it: FlagItem): FlagsShown[] {
  return it.options.map((c) => (it.kind === 'pickflag' ? { flag: c.code } : { text: optionText(it.kind, c) as string }));
}

const quiz = makeSpeedQuiz<FlagsSettings, FlagItem, FlagsView>({
  id: 'flags',
  sanitize: sanitizeFlags,
  patch(settings, patch) {
    const next = sanitizeFlags({ ...settings, ...patch } as Partial<FlagsSettings>);
    if (patch.rounds !== undefined) settings.rounds = next.rounds;
    if (patch.mode !== undefined) settings.mode = next.mode;
    if (patch.region !== undefined) settings.region = next.region;
    if (patch.level !== undefined) settings.level = next.level;
  },
  seconds: () => FLAGS_SECONDS,
  revealMs: FLAGS_REVEAL_MS,
  build: (ctx, settings, rnd) => buildFlags(ctx, settings, rnd),
  botKnows: (level, it) => FLAGS_BOT_KNOWS[level][it.country.known ? 0 : 1],
  view(ctx, s, me, it, shown): FlagsView {
    const results: FlagsResult[] | null = shown && s.results ? s.results.map((r) => ({ id: r.id, choice: r.choice, correct: r.correct, points: r.points })) : null;
    return {
      game: 'flags',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.items.length,
      kind: it.kind,
      prompt: promptOf(it),
      options: optionsOf(it),
      endsAt: s.endsAt,
      timerTotal: s.phase === 'ask' ? FLAGS_SECONDS * 1000 : paced(ctx, FLAGS_REVEAL_MS),
      answered: s.participants.filter((p) => !!s.answers[p]),
      myChoice: s.answers[me]?.choice ?? null,
      correct: shown ? it.correct : null,
      answer: shown
        ? { name: it.country.name, capital: UNCLEAR_CAPITAL.has(it.country.code) ? null : it.country.capital, flag: it.country.noFlag ? null : it.country.code }
        : null,
      results,
      scores: s.scores,
      players: s.participants,
      rights: s.rights,
    };
  },
});

export const flags = quiz.module;
export const startFlags = quiz.start;
export const flagsBotAnswer = quiz.botAnswer;
export type FlagsState = ReturnType<typeof quiz.start>;
