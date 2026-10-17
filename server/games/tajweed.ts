/**
 * «مسابقة التجويد» — server rules: the timed multiple-choice engine of «مسابقة إسلامية» (makeMcq), fed with
 * hand-checked examples (server/tajweed-content.ts) on verses from quran-data.json.
 */
import { TAJWEED_TOPICS, type TajweedSettings, type TajweedTopic, type TajweedView } from '../../src/shared/games/tajweed';
import { qdeck } from '../qdeck';
import { TAJWEED_EXAMPLES, TAJWEED_RULES, type TajweedExample } from '../tajweed-content';
import { type GameModule } from '../types';
import { clamp, isNum, shuffle } from '../util';
import { makeMcq, mcqOptions, type McqItem, type McqState } from './mcq';
import { quranData } from './surah';

/** Words shown on each side of the coloured spot (a long verse is cut, with «…»). */
const CONTEXT = 6;

export interface TajweedItem extends McqItem {
  topic: TajweedTopic;
  words: string[];
  hl: [number, number];
  cutStart: boolean;
  cutEnd: boolean;
  why: string;
}

/** How often bots get it right, by topic. */
export const TAJWEED_BOT_SKILL: Record<TajweedTopic | 'all', number> = {
  all: 0.62,
  noon: 0.6,
  meem: 0.68,
  madd: 0.55,
  qalqala: 0.7,
  jalala: 0.75,
  lam: 0.78,
};

let verseMap: Map<string, string> | null = null;
/** The Uthmani text of a verse, or undefined if it isn't in quran-data.json. */
export function verseText(s: number, a: number): string | undefined {
  verseMap ??= new Map(quranData().verses.map(([n, ayah, text]) => [`${n}:${ayah}`, text]));
  return verseMap.get(`${s}:${a}`);
}

export const verseWords = (text: string) => text.split(' ').filter(Boolean);

const topicLabel = (t: TajweedTopic) => TAJWEED_TOPICS.find((x) => x.key === t)?.label ?? '';
const ruleLabel = (t: TajweedTopic, rule: string) => TAJWEED_RULES[t].find((r) => r.key === rule)?.label ?? rule;

/** The examples of a topic (or all of them) whose verse exists. */
export function tajweedPool(topic: TajweedSettings['topic']): TajweedExample[] {
  return TAJWEED_EXAMPLES.filter((e) => (topic === 'all' || e.topic === topic) && verseText(e.s, e.a) !== undefined);
}

/** One question: the verse cut around the coloured words, and up to 4 rules of the topic to choose from. */
export function tajweedItem(e: TajweedExample): TajweedItem {
  const all = verseWords(verseText(e.s, e.a) ?? '');
  const n = e.n ?? 1;
  const from = Math.max(0, e.w - CONTEXT);
  const to = Math.min(all.length, e.w + n + CONTEXT);
  const right = ruleLabel(e.topic, e.rule);
  const others = shuffle(TAJWEED_RULES[e.topic].filter((r) => r.key !== e.rule).map((r) => r.label)).slice(0, 3);
  const surah = quranData().surahs[e.s - 1]?.name ?? '';
  return {
    text: all.slice(from, to).join(' '),
    ...mcqOptions(right, others),
    label: topicLabel(e.topic),
    ref: `سورة ${surah} — الآية ${e.a}`,
    topic: e.topic,
    words: all.slice(from, to),
    hl: [e.w - from, e.w - from + n - 1],
    cutStart: from > 0,
    cutEnd: to < all.length,
    why: e.why,
  };
}

type State = McqState<TajweedSettings>;

const base = makeMcq<TajweedSettings>(
  'quiz', // the engine only uses the id for its own view, which this game replaces
  (ctx, settings, rounds) => qdeck(ctx, `tajweed:${settings.topic}`, tajweedPool(settings.topic)).deal(rounds).map(tajweedItem),
  (settings) => TAJWEED_BOT_SKILL[settings.topic] ?? 0.6,
);

export const tajweed: GameModule<State, TajweedSettings> = {
  ...base,
  id: 'tajweed',

  /** Everyone who hasn't answered yet. */
  turnOf: (s) => (s.phase === 'ask' ? s.participants.filter((p) => !s.answers[p]) : []),

  view(_ctx, s, me): TajweedView {
    const item = s.items[Math.max(0, s.round - 1)] as TajweedItem;
    const shown = s.phase !== 'ask';
    return {
      game: 'tajweed',
      phase: s.phase,
      round: s.round,
      rounds: s.items.length,
      topic: item.topic,
      label: item.label,
      words: item.words,
      hl: item.hl,
      cutStart: item.cutStart,
      cutEnd: item.cutEnd,
      options: item.options,
      endsAt: s.endsAt,
      answered: Object.keys(s.answers),
      myAnswer: s.answers[me]?.choice ?? null,
      correct: shown ? item.correct : null,
      ref: shown ? (item.ref ?? null) : null,
      why: shown ? item.why : null,
      results: s.results,
      scores: s.scores,
      seconds: s.seconds,
    };
  },

  onLeave(ctx, s, id) {
    base.onLeave?.(ctx, s, id);
    // the leaver's score stays on the board; a game whose players all left ends
    if (s.phase !== 'final' && !s.participants.some((p) => p !== id && (ctx.isConnected(p) || ctx.isBot(p)))) {
      s.phase = 'final';
      s.endsAt = null;
    }
  },

  patchSettings(settings, patch) {
    if (isNum(patch.rounds)) settings.rounds = clamp(Math.round(patch.rounds), 5, 30);
    if (isNum(patch.seconds)) settings.seconds = clamp(Math.round(patch.seconds), 10, 40);
    if (TAJWEED_TOPICS.some((t) => t.key === patch.topic)) settings.topic = patch.topic as TajweedSettings['topic'];
  },
};
