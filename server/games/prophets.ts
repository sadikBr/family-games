/**
 * «قصص الأنبياء» — server rules. A cooperative story game: the family reads a prophet's story chapter
 * by chapter and answers one question per chapter together. Everyone votes on their own phone; the
 * option with the most votes is the family's answer (ties: the option that reached that count first).
 * A wrong answer (or no vote at all) dims one of the shared lanterns; reach the end with a lantern
 * still lit to complete the story.
 */
import {
  PROPHETS_DEFAULTS,
  PROPHETS_STORIES,
  type ProphetsAyah,
  type ProphetsScene,
  type ProphetsSettings,
  type ProphetsSource,
  type ProphetsStoryId,
  type ProphetsView,
} from '../../src/shared/games/prophets';
import { STORIES, type Chapter } from '../prophets-stories';
import { qdeck } from '../qdeck';
import { type GameCtx, type GameModule } from '../types';
import { clamp, isNum, randInt } from '../util';
import { botAnswerDelay, mcqOptions } from './mcq';
import { quranData } from './surah';
import { forFont } from './tajweed';

/** How long the answer stays on screen unless everyone presses «تابع» first. */
export const PROPHETS_REVEAL_MS = 16_000;
/** How often a bot team-mate votes for the right answer. */
export const PROPHETS_BOT_SKILL = 0.75;

const STORY_IDS = PROPHETS_STORIES.map((s) => s.key);
/** Surah names as usually written (the data file spells a couple without the hamza). */
const SURAH_NAME: Record<number, string> = { 14: 'إبراهيم', 34: 'سبأ' };

interface Prepared {
  title: string;
  scene: ProphetsScene;
  text: string;
  source: ProphetsSource[];
  question: string;
  options: string[];
  correct: number;
  after: string | null;
  ayah: ProphetsAyah | null;
}

export interface ProphetsState {
  settings: ProphetsSettings;
  participants: string[];
  story: ProphetsStoryId;
  chapters: Prepared[];
  /** 0-based */
  chapter: number;
  phase: ProphetsView['phase'];
  endsAt: number | null;
  seconds: number;
  votes: Record<string, { choice: number; at: number }>;
  chosen: number | null;
  ready: string[];
  lanterns: number;
  maxLanterns: number;
  history: boolean[];
  perPlayer: Record<string, number>;
  completed: boolean | null;
}

/** The verses of a chapter's quote, exactly as in the Quran data file (null if any verse is missing). */
export function ayahFor(ref: Chapter['ayah']): ProphetsAyah | null {
  if (!ref) return null;
  const [s, from, to = from] = ref;
  const { surahs, verses } = quranData();
  const out: { n: number; text: string }[] = [];
  for (let n = from; n <= to; n++) {
    const v = verses.find((x) => x[0] === s && x[1] === n);
    if (!v) return null;
    out.push({ n, text: forFont(v[2]) }); // open tanween as the Quran font draws it
  }
  const surah = SURAH_NAME[s] ?? surahs.find((x) => x.n === s)?.name;
  return surah ? { verses: out, surah } : null;
}

function prepare(c: Chapter): Prepared {
  const { options, correct } = mcqOptions(c.a, c.w);
  return {
    title: c.title,
    scene: c.scene,
    text: c.text,
    source: c.source.map(([surah, from, to]) => ({ surah, from, to })),
    question: c.q,
    options,
    correct,
    after: c.after ?? null,
    ayah: ayahFor(c.ayah),
  };
}

/**
 * The family's answer: the option with the most votes; on a tie, the one that reached that number of
 * votes first. Null when nobody voted.
 */
export function majority(votes: Record<string, { choice: number; at: number }>): number | null {
  const byOption = new Map<number, number[]>();
  for (const v of Object.values(votes)) {
    const list = byOption.get(v.choice) ?? [];
    list.push(v.at);
    byOption.set(v.choice, list);
  }
  let best: number | null = null;
  let bestCount = 0;
  let bestAt = Infinity;
  for (const [choice, times] of byOption) {
    times.sort((a, b) => a - b);
    const count = times.length;
    const reachedAt = times[count - 1];
    if (count > bestCount || (count === bestCount && reachedAt < bestAt)) {
      best = choice;
      bestCount = count;
      bestAt = reachedAt;
    }
  }
  return best;
}

/** Players we still wait for (people offline for a moment don't hold the family up). */
function active(ctx: GameCtx, s: ProphetsState) {
  return s.participants.filter((p) => ctx.isConnected(p) || ctx.isBot(p));
}

function ask(ctx: GameCtx, s: ProphetsState) {
  s.phase = 'ask';
  s.votes = {};
  s.chosen = null;
  s.ready = [];
  s.endsAt = ctx.now + s.seconds * 1000;
  ctx.fx('card');
}

function reveal(ctx: GameCtx, s: ProphetsState) {
  const ch = s.chapters[s.chapter];
  s.chosen = majority(s.votes);
  const right = s.chosen === ch.correct;
  s.history.push(right);
  if (!right) s.lanterns = Math.max(0, s.lanterns - 1);
  for (const [id, v] of Object.entries(s.votes)) if (v.choice === ch.correct) s.perPlayer[id] = (s.perPlayer[id] ?? 0) + 1;
  s.phase = 'reveal';
  s.ready = [];
  s.endsAt = ctx.now + PROPHETS_REVEAL_MS;
  ctx.fx(right ? 'correct' : 'buzz');
}

function finish(ctx: GameCtx, s: ProphetsState, completed: boolean) {
  s.phase = 'final';
  s.endsAt = null;
  s.completed = completed;
  // a team result: no target, so every phone celebrates (or hears the gentle ending)
  ctx.fx(completed ? 'win' : 'skip');
}

function next(ctx: GameCtx, s: ProphetsState) {
  if (s.lanterns <= 0) finish(ctx, s, false);
  else if (s.chapter >= s.chapters.length - 1) finish(ctx, s, true);
  else {
    s.chapter += 1;
    ask(ctx, s);
  }
}

/** Everyone has voted / pressed «تابع»: move on. */
function check(ctx: GameCtx, s: ProphetsState) {
  if (!s.participants.length) {
    if (s.phase !== 'final') {
      s.phase = 'final';
      s.endsAt = null;
      s.completed = false;
    }
    return;
  }
  const act = active(ctx, s);
  if (s.phase === 'ask' && act.every((p) => s.votes[p])) reveal(ctx, s);
  else if (s.phase === 'reveal' && act.every((p) => s.ready.includes(p))) next(ctx, s);
}

export const prophets: GameModule<ProphetsState, ProphetsSettings> = {
  id: 'prophets',

  start(ctx, participants, settings) {
    const story = settings.story !== 'random' && STORIES[settings.story] ? settings.story : qdeck(ctx, 'prophets:story', STORY_IDS).draw();
    const lanterns = clamp(Math.round(settings.lanterns ?? PROPHETS_DEFAULTS.lanterns), 1, 5);
    const s: ProphetsState = {
      settings,
      participants: [...participants],
      story,
      chapters: STORIES[story].chapters.map(prepare),
      chapter: 0,
      phase: 'ask',
      endsAt: null,
      seconds: clamp(Math.round(settings.seconds ?? PROPHETS_DEFAULTS.seconds), 15, 60),
      votes: {},
      chosen: null,
      ready: [],
      lanterns,
      maxLanterns: lanterns,
      history: [],
      perPlayer: Object.fromEntries(participants.map((p) => [p, 0])),
      completed: null,
    };
    ctx.fx('start');
    ask(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (!s.participants.includes(by)) return;
    if (a.type === 'vote') {
      if (s.phase !== 'ask' || s.votes[by]) return;
      const ch = s.chapters[s.chapter];
      if (!isNum(a.choice) || !Number.isInteger(a.choice) || a.choice < 0 || a.choice >= ch.options.length) return;
      s.votes[by] = { choice: a.choice, at: ctx.now };
      check(ctx, s);
    } else if (a.type === 'ready') {
      if (s.phase !== 'reveal' || s.ready.includes(by)) return;
      s.ready.push(by);
      check(ctx, s);
    }
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'ask') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    return true;
  },

  botPlan(ctx, s, bots) {
    const mine = bots.filter((b) => s.participants.includes(b));
    if (!mine.length) return;
    if (s.phase === 'ask') {
      const ch = s.chapters[s.chapter];
      // bots are team-mates, not leaders: they leave the people time to think, unless everyone else has voted
      const peopleWaiting = s.participants.some((p) => !bots.includes(p) && !s.votes[p] && ctx.isConnected(p));
      for (const b of mine) {
        if (s.votes[b]) continue;
        const right = Math.random() < PROPHETS_BOT_SKILL;
        const wrong = ch.options.map((_, i) => i).filter((i) => i !== ch.correct);
        const choice = right ? ch.correct : wrong[randInt(0, wrong.length - 1)];
        if (peopleWaiting) ctx.bot(b, `vote:${s.chapter}`, botAnswerDelay(s.seconds), { type: 'vote', choice });
        else ctx.bot(b, `vote-now:${s.chapter}`, randInt(700, 1800), { type: 'vote', choice });
      }
    } else if (s.phase === 'reveal') {
      for (const b of mine) if (!s.ready.includes(b)) ctx.bot(b, `ready:${s.chapter}`, randInt(3500, 6000), { type: 'ready' });
    }
  },

  turnOf(s) {
    return s.phase === 'ask' ? s.participants.filter((p) => !s.votes[p]) : [];
  },

  view(_ctx, s, me): ProphetsView {
    const ch = s.chapters[s.chapter];
    const shown = s.phase !== 'ask';
    const myVote = s.votes[me]?.choice ?? null;
    const story = STORIES[s.story];
    return {
      game: 'prophets',
      phase: s.phase,
      story: s.story,
      storyTitle: story.title,
      chapter: s.chapter + 1,
      chapters: s.chapters.length,
      scene: ch.scene,
      title: ch.title,
      text: ch.text,
      source: ch.source,
      question: ch.question,
      options: ch.options,
      endsAt: s.endsAt,
      timerTotal: s.seconds * 1000,
      participants: s.participants,
      voted: Object.keys(s.votes),
      myVote,
      votes: shown || myVote !== null ? Object.fromEntries(Object.entries(s.votes).map(([id, v]) => [id, v.choice])) : null,
      chosen: shown ? s.chosen : null,
      correct: shown ? ch.correct : null,
      after: shown ? ch.after : null,
      ayah: shown ? ch.ayah : null,
      ready: s.ready,
      lanterns: s.lanterns,
      maxLanterns: s.maxLanterns,
      history: s.history,
      final:
        s.phase === 'final'
          ? { completed: !!s.completed, lessons: story.lessons, right: s.history.filter(Boolean).length, perPlayer: s.perPlayer }
          : null,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.votes[id];
    s.ready = s.ready.filter((p) => p !== id);
    if (s.phase !== 'final') check(ctx, s);
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (patch.story === 'random' || STORY_IDS.includes(patch.story as ProphetsStoryId)) settings.story = patch.story as ProphetsSettings['story'];
    if (isNum(patch.seconds)) settings.seconds = clamp(Math.round(patch.seconds / 5) * 5, 15, 60);
    if (isNum(patch.lanterns)) settings.lanterns = clamp(Math.round(patch.lanterns), 1, 5);
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    // the family wins when it reaches the end of the story with a lantern still lit
    return { places: [[...s.participants]], coop: { won: !!s.completed } };
  },
};
