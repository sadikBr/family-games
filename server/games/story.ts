/**
 * «قصة جماعية» — server rules.
 *
 * Seats are shuffled once; story b belongs to seats[b]. At round k the story b is in the hands of
 * seats[(b + k) % N]: every round each player holds a different story than the round before (and with
 * one lap holds every story exactly once), and the last sentence they see was always written by the
 * player just before them in the seat order — never by themselves. «جملة جاهزة»: each story starts with
 * an opening line dealt by the game (never two the same in a game), and round 0 is its owner adding the
 * first sentence; «يكتبها كل لاعب»: round 0 is each owner writing their story's first sentence.
 *
 * Everyone writes at once; a round ends when every connected holder has sent their sentence, or when
 * time runs out: what was typed is sent (phones save their draft as they type), an empty box becomes a
 * neutral filler. Sentences are only added to the stories at the end of a round, and a phone only ever
 * sees the last sentence of the story in its hands (a filler is skipped: the one before it is shown)
 * until the reveal. Then the stories are shown sentence by sentence to everyone with their authors (the
 * host or the story's owner moves on; optional auto-advance at the room's pace), then an optional vote
 * for «أجمل قصة»: one vote each, never for the story one started; every author of a story gets a point
 * for each vote it receives.
 *
 * A player who leaves: their pending sentence becomes what they had typed, or a filler; later the
 * rotation skips them — the story that would have reached them waits one round. Fewer than 3 players
 * left mid-game: the stories written so far go straight to the reveal.
 */
import {
  STORY_DEFAULTS,
  STORY_LENGTHS,
  STORY_SECONDS,
  STORY_TEXT_MAX,
  storyRounds,
  type StoryBook,
  type StoryLine,
  type StoryPhase,
  type StorySettings,
  type StoryView,
} from '../../src/shared/games/story';
import { dealOpenings, STORY_FILLERS } from '../story-content';
import { GameError, paced, type GameCtx, type GameModule } from '../types';
import { isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceAnd } from '../voice-calls-party';
import { SVOICE, voiceBestStory } from '../voice-calls-story';

/** «the stories move on» between two rounds */
export const PASS_MS = 2500;
/** before the reveal starts */
export const REVEAL_INTRO_MS = 3500;
/** auto-advance in the reveal: a sentence stays this long, plus a little per character (time to hear it read) */
export const AUTO_BASE_MS = 2500;
export const AUTO_CHAR_MS = 80;
/** extra time on a story's last sentence */
export const AUTO_END_MS = 3000;
export const VOTE_MS = 90000;

export interface StoryState {
  settings: StorySettings;
  /** seat order, fixed for the game (players who left stay here) */
  seats: string[];
  /** players still in the game */
  live: string[];
  names: Record<string, string>;
  stories: StoryBook[];
  rounds: number;
  round: number;
  phase: StoryPhase;
  endsAt: number;
  total: number;
  next: StoryView['next'];
  /** this round: who holds which story */
  tasks: Record<string, number>;
  /** this round: sentences sent */
  pending: Record<string, StoryLine>;
  /** this round: what each holder has typed so far */
  drafts: Record<string, string>;
  /** reveal: story and sentence shown */
  rs: number;
  rl: number;
  votes: Record<string, number>;
  result: StoryView['final'];
  /** fillers used so far (they take turns) */
  fillers: number;
}

/** Who holds story b at round k (with nobody gone). */
export const holderOf = (s: StoryState, story: number, round: number) => s.seats[(story + round) % s.seats.length];

/** The sentence the holder of a story sees: its last one that isn't a filler (null: nothing yet). */
export function promptFor(story: StoryBook): StoryLine | null {
  for (let i = story.lines.length - 1; i >= 0; i--) if (!story.lines[i].filler) return story.lines[i];
  return null;
}

const writing = (s: StoryState) => s.phase === 'write';

function nextFiller(s: StoryState) {
  const f = STORY_FILLERS[s.fillers % STORY_FILLERS.length];
  s.fillers += 1;
  return f;
}

function startRound(ctx: GameCtx, s: StoryState) {
  for (let guard = 0; guard <= s.rounds; guard++) {
    s.tasks = {};
    s.pending = {};
    s.drafts = {};
    s.stories.forEach((_story, b) => {
      const holder = holderOf(s, b, s.round);
      if (s.live.includes(holder)) s.tasks[holder] = b; // the rotation skips a player who left: this story waits
    });
    if (Object.keys(s.tasks).length) {
      s.phase = 'write';
      s.next = null;
      s.total = s.settings.seconds * 1000;
      s.endsAt = s.total ? ctx.now + s.total : 0;
      ctx.fx('start');
      if (s.round === 0) ctx.say?.(s.settings.opening === 'own' ? 'بداية القصص: أول جملة في كل قصة' : 'بداية القصص: أكمل الجملة الأولى', undefined, SVOICE.start);
      else ctx.say?.(`الجملة ${s.round + 1} من ${s.rounds}`);
      return;
    }
    s.round += 1;
    if (s.round >= s.rounds) break;
  }
  startReveal(ctx, s);
}

/** Every connected holder has sent their sentence (offline ones don't hold the table up). */
function allDone(ctx: GameCtx, s: StoryState) {
  const holders = Object.keys(s.tasks).filter((id) => s.live.includes(id));
  const waiting = holders.filter((id) => !s.pending[id]);
  if (!waiting.length) return true;
  return holders.some((id) => ctx.isConnected(id)) && waiting.every((id) => !ctx.isConnected(id));
}

/** Add this round's sentences to the stories (an unsent draft is sent, an empty box becomes a filler). Returns how many were not sent. */
function flushRound(s: StoryState): number {
  let missing = 0;
  for (const [id, b] of Object.entries(s.tasks)) {
    let line = s.pending[id];
    if (!line) {
      missing += 1;
      const draft = s.drafts[id] ?? '';
      line = draft ? { by: id, text: draft } : { by: id, text: nextFiller(s), filler: true };
    }
    s.stories[b].lines.push(line);
  }
  s.tasks = {};
  s.pending = {};
  s.drafts = {};
  return missing;
}

function endRound(ctx: GameCtx, s: StoryState) {
  const missing = flushRound(s);
  s.round += 1;
  s.phase = 'pass';
  ctx.fx('card');
  if (s.round >= s.rounds) {
    s.next = 'reveal';
    s.total = paced(ctx, REVEAL_INTRO_MS);
    ctx.say?.('اكتملت القصص: حان وقت القراءة!', undefined, voiceAnd(missing > 0 && PVOICE.timeUp, SVOICE.reveal));
  } else {
    s.next = 'write';
    s.total = paced(ctx, PASS_MS);
    ctx.say?.(missing ? 'انتهى الوقت: القصص تنتقل' : 'اكتملت الجمل: القصص تنتقل', undefined, missing ? PVOICE.timeUp : undefined);
  }
  s.endsAt = ctx.now + s.total;
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function revealTimer(ctx: GameCtx, s: StoryState) {
  if (!s.settings.autoReveal) {
    s.endsAt = 0;
    return;
  }
  const story = s.stories[s.rs];
  const line = story.lines[s.rl];
  s.total = paced(ctx, AUTO_BASE_MS + AUTO_CHAR_MS * line.text.length + (s.rl === story.lines.length - 1 ? AUTO_END_MS : 0));
  s.endsAt = ctx.now + s.total;
}

/** The line under the turn bar for story `b` («قصة بابا (2 من 5)»). */
function storyLine(s: StoryState, b: number) {
  const shown = s.stories.filter((x, i) => i <= b && x.lines.length).length;
  const all = s.stories.filter((x) => x.lines.length).length;
  return `قصة ${s.names[s.stories[b].owner] ?? '؟'} (${shown} من ${all})`;
}

function startReveal(ctx: GameCtx, s: StoryState) {
  s.phase = 'reveal';
  s.next = null;
  s.tasks = {};
  s.rs = s.stories.findIndex((x) => x.lines.length);
  s.rl = 0;
  if (s.rs < 0) {
    s.rs = 0;
    finish(ctx, s, false);
    return;
  }
  ctx.fx('reveal');
  // nothing read aloud by the server: the reveal screen reads the sentences itself
  ctx.say?.(storyLine(s, s.rs), s.stories[s.rs].owner);
  revealTimer(ctx, s);
}

function turnPage(ctx: GameCtx, s: StoryState) {
  const story = s.stories[s.rs];
  if (s.rl < story.lines.length - 1) {
    s.rl += 1;
    revealTimer(ctx, s);
    return;
  }
  let nb = s.rs + 1;
  while (nb < s.stories.length && !s.stories[nb].lines.length) nb += 1;
  if (nb >= s.stories.length) {
    endReveal(ctx, s);
    return;
  }
  s.rs = nb;
  s.rl = 0;
  ctx.fx('reveal');
  ctx.say?.(storyLine(s, nb), s.stories[nb].owner);
  revealTimer(ctx, s);
}

/** Stories `by` may vote for: someone else's, with something in it. */
const votable = (s: StoryState, b: number, by: string) => !!s.stories[b]?.lines.length && s.stories[b].owner !== by;

function endReveal(ctx: GameCtx, s: StoryState) {
  const anyone = s.live.some((id) => s.stories.some((_x, b) => votable(s, b, id)));
  if (s.settings.votes && s.live.length >= 2 && anyone) {
    s.phase = 'vote';
    s.total = VOTE_MS;
    s.endsAt = ctx.now + VOTE_MS;
    s.votes = {};
    ctx.fx('start');
    ctx.say?.('التصويت: أجمل قصة', undefined, SVOICE.vote);
    return;
  }
  finish(ctx, s, false);
}

/* ------------------------------------------------------------------ */
/* Votes and the end                                                   */
/* ------------------------------------------------------------------ */

/** The authors of a story: everyone who wrote a real sentence in it (fillers don't count), once each. */
export function authorsOf(story: StoryBook): string[] {
  return [...new Set(story.lines.filter((l) => l.by && !l.filler).map((l) => l.by!))];
}

function finish(ctx: GameCtx, s: StoryState, voted: boolean) {
  s.phase = 'final';
  s.endsAt = 0;
  s.tasks = {};
  const tally = s.stories.map(() => 0);
  const scores: Record<string, number> = {};
  if (voted) {
    for (const b of Object.values(s.votes)) {
      if (!s.stories[b]) continue;
      tally[b] += 1;
      for (const id of authorsOf(s.stories[b])) scores[id] = (scores[id] ?? 0) + 1;
    }
  }
  const top = Math.max(0, ...tally);
  const best = top > 0 ? tally.flatMap((n, b) => (n === top ? [b] : [])) : [];
  s.result = { votes: voted, tally, best, scores };
  ctx.fx('win');
  if (!voted) {
    ctx.say?.('انتهت القصص: شكراً على الضحك!');
    return;
  }
  if (best.length === 1) {
    const owner = s.names[s.stories[best[0]].owner] ?? '؟';
    ctx.say?.(`أجمل قصة: قصة ${owner}`, s.stories[best[0]].owner, voiceBestStory(owner));
  } else if (best.length > 1) ctx.say?.('تعادل في الأصوات بين أجمل القصص', undefined, SVOICE.tie);
  else ctx.say?.('انتهى التصويت بلا أصوات', undefined, SVOICE.none);
}

/** Players left mid-game: below 3, what was written so far goes to the reveal. */
function tooFew(ctx: GameCtx, s: StoryState) {
  if (writing(s)) {
    flushRound(s);
    s.round += 1;
  }
  if (s.live.length === 0) {
    finish(ctx, s, false);
    return;
  }
  s.rounds = Math.max(1, s.round); // no more rounds
  if (s.stories.some((b) => b.lines.some((l) => l.by && !l.filler))) startReveal(ctx, s);
  else finish(ctx, s, false);
}

export const cleanText = (v: unknown) => (isStr(v) ? v.replace(/\s+/g, ' ').trim().slice(0, STORY_TEXT_MAX) : '');

/** For result(): the highest `score` first; equal scores share a place. */
function placesByScore(ids: string[], score: (id: string) => number): string[][] {
  const out: string[][] = [];
  let prev: number | null = null;
  for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
    const v = score(id);
    if (v === prev) out[out.length - 1].push(id);
    else out.push([id]);
    prev = v;
  }
  return out;
}

export const story: GameModule<StoryState, StorySettings> = {
  id: 'story',
  hostOnly: ['next', 'endVote', 'endRound'],

  start(ctx, participants, settings) {
    const seats = shuffle(participants);
    const set = { ...STORY_DEFAULTS, ...settings };
    const openings = set.opening === 'ready' ? dealOpenings(ctx.memo, seats.length, shuffle) : [];
    const s: StoryState = {
      settings: set,
      seats,
      live: seats.slice(),
      names: Object.fromEntries(seats.map((id) => [id, ctx.playerName(id)])),
      stories: seats.map((owner, b) => ({ owner, lines: set.opening === 'ready' ? [{ by: null, text: openings[b] }] : [] })),
      rounds: storyRounds(seats.length, set.length),
      round: 0,
      phase: 'write',
      endsAt: 0,
      total: 0,
      next: null,
      tasks: {},
      pending: {},
      drafts: {},
      rs: 0,
      rl: 0,
      votes: {},
      result: null,
      fillers: Math.floor(Math.random() * STORY_FILLERS.length),
    };
    startRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (!s.live.includes(by)) return;
    const working = writing(s) && s.tasks[by] !== undefined;

    switch (a.type) {
      case 'type': {
        // the draft, saved as the player types: sent as it is if time runs out
        if (!working || s.pending[by]) return;
        s.drafts[by] = cleanText(a.text);
        return;
      }
      case 'send': {
        if (!working || s.pending[by]) return;
        const text = cleanText(a.text);
        if (text.length < 2) throw new GameError('اكتب جملة أطول قليلاً');
        s.pending[by] = { by, text };
        s.drafts[by] = text;
        break;
      }
      case 'edit': {
        // take back what I sent while the round is still running (the draft keeps the text)
        if (working) delete s.pending[by];
        return;
      }
      case 'endRound': {
        if (writing(s) && !s.endsAt) endRound(ctx, s);
        return;
      }
      case 'next':
      case 'turn': {
        if (s.phase !== 'reveal') return;
        if (a.type === 'turn' && by !== s.stories[s.rs].owner) return;
        // two people tapping at once must not skip a sentence
        if (a.at !== `${s.rs}:${s.rl}`) return;
        turnPage(ctx, s);
        return;
      }
      case 'vote': {
        if (s.phase !== 'vote' || !isNum(a.story)) return;
        const b = Math.round(a.story);
        if (s.stories[b]?.owner === by) throw new GameError('لا تصويت لقصتك: اختر قصة أخرى');
        if (!votable(s, b, by)) return;
        s.votes[by] = b;
        if (s.live.every((id) => s.votes[id] !== undefined)) finish(ctx, s, true);
        return;
      }
      case 'endVote': {
        if (s.phase === 'vote') finish(ctx, s, true);
        return;
      }
      default:
        return;
    }
    if (writing(s) && allDone(ctx, s)) endRound(ctx, s);
  },

  tick(ctx, s) {
    if (writing(s)) {
      if ((s.endsAt && ctx.now >= s.endsAt) || allDone(ctx, s)) {
        endRound(ctx, s);
        return true;
      }
      return false;
    }
    if (s.phase === 'pass' && ctx.now >= s.endsAt) {
      if (s.next === 'reveal' || s.round >= s.rounds) startReveal(ctx, s);
      else startRound(ctx, s);
      return true;
    }
    if (s.phase === 'reveal' && s.settings.autoReveal && s.endsAt && ctx.now >= s.endsAt) {
      turnPage(ctx, s);
      return true;
    }
    if (s.phase === 'vote' && ctx.now >= s.endsAt) {
      finish(ctx, s, true);
      return true;
    }
    return false;
  },

  view(_ctx, s, me): StoryView {
    const b = s.tasks[me];
    const stepping = writing(s);
    const mine = s.pending[me];
    const shown = s.stories[s.rs];
    const working = stepping ? Object.keys(s.tasks).filter((id) => s.live.includes(id)) : [];
    const task: StoryView['task'] =
      stepping && b !== undefined
        ? (() => {
            const st = s.stories[b];
            const prompt = promptFor(st);
            return {
              index: st.lines.filter((l) => l.by !== null).length + 1,
              mine: st.owner === me,
              prompt: prompt?.text ?? null,
              opening: !!prompt && prompt.by === null,
              done: !!mine,
              sent: mine?.text ?? null,
              draft: s.drafts[me] ?? '',
            };
          })()
        : null;
    return {
      game: 'story',
      phase: s.phase,
      players: s.live,
      owners: s.stories.map((x) => x.owner),
      names: s.names,
      round: Math.min(s.round, s.rounds - 1),
      rounds: s.rounds,
      endsAt: stepping || s.phase === 'pass' || s.phase === 'vote' || (s.phase === 'reveal' && s.settings.autoReveal) ? s.endsAt || null : null,
      total: s.total,
      noLimit: !s.settings.seconds,
      task,
      working,
      done: working.filter((id) => !!s.pending[id]),
      next: s.phase === 'pass' ? s.next : null,
      reveal:
        s.phase === 'reveal' && shown
          ? {
              story: s.rs,
              stories: s.stories.length,
              owner: shown.owner,
              lines: shown.lines.slice(0, s.rl + 1),
              length: shown.lines.length,
              canTurn: me === shown.owner,
              auto: s.settings.autoReveal,
            }
          : null,
      vote: s.phase === 'vote' ? { mine: s.votes[me] ?? null, voted: s.live.filter((id) => s.votes[id] !== undefined) } : null,
      books: s.phase === 'vote' || s.phase === 'final' ? s.stories.map((x) => ({ owner: x.owner, lines: x.lines })) : null,
      final: s.phase === 'final' ? s.result : null,
    };
  },

  turnOf(s) {
    if (writing(s)) return Object.keys(s.tasks).filter((id) => s.live.includes(id) && !s.pending[id]);
    if (s.phase === 'vote') return s.live.filter((id) => s.votes[id] === undefined);
    return [];
  },

  onLeave(ctx, s, id) {
    if (!s.live.includes(id)) return;
    s.live = s.live.filter((x) => x !== id);
    ctx.say?.(`مغادرة ${s.names[id] ?? '؟'}: القصص تكمل الدوران`);
    const stepping = writing(s);
    if (stepping && s.tasks[id] !== undefined && !s.pending[id]) {
      // the leaver's sentence: what they had typed, or a filler
      const draft = s.drafts[id] ?? '';
      s.pending[id] = draft ? { by: id, text: draft, left: true } : { by: id, text: nextFiller(s), filler: true, left: true };
    }
    if (s.phase === 'final') return;
    if (s.live.length < 3 && (stepping || s.phase === 'pass')) {
      tooFew(ctx, s);
      return;
    }
    if (s.live.length === 0) {
      finish(ctx, s, false);
      return;
    }
    if (stepping && allDone(ctx, s)) endRound(ctx, s);
    if (s.phase === 'vote') {
      delete s.votes[id];
      if (s.live.every((x) => s.votes[x] !== undefined)) finish(ctx, s, true);
    }
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (patch.opening === 'ready' || patch.opening === 'own') settings.opening = patch.opening;
    if (isStr(patch.length) && (STORY_LENGTHS as string[]).includes(patch.length)) settings.length = patch.length as StorySettings['length'];
    if (isNum(patch.seconds) && (STORY_SECONDS as readonly number[]).includes(patch.seconds)) settings.seconds = patch.seconds;
    for (const k of ['votes', 'autoReveal'] as const) if (typeof patch[k] === 'boolean') settings[k] = patch[k];
  },

  result(s) {
    if (s.phase !== 'final' || !s.live.length) return null;
    // with the votes: ranked by the votes the stories one wrote in received; without them everyone shares first place
    const scores = s.result?.votes ? s.result.scores : null;
    return { places: scores ? placesByScore(s.live, (id) => scores[id] ?? 0) : [[...s.live]] };
  },
};
