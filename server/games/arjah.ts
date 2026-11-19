/**
 * «من الأرجح؟» — who at the table is most likely to… (rules at the top of src/shared/games/arjah.ts).
 *
 * Each round: one prompt (server/arjah-content.ts, dealt by server/arjah-bots.ts without repeats in the
 * room until the theme runs low). Everyone picks one player (oneself allowed), and may change the pick
 * while the vote is open; the vote ends at the timer or once everyone connected (and every bot) has voted.
 * The votes stay on the server: during the vote a phone only learns who has voted, never for whom. At the
 * reveal the counts are public; who voted for whom only with the open vote (never with «تصويت سري»).
 * One point per vote that matched the most chosen player(s); with «تصويت سري» the phones see only their own
 * points until the end (a point would tell who voted for the title holder).
 *
 * Bots vote at a human pace from what the earlier reveals showed (server/arjah-bots.ts).
 */
import {
  ARJAH_DEFAULTS,
  ARJAH_ROUNDS,
  ARJAH_SECONDS,
  ARJAH_THEME_SETTINGS,
  arjahQuestion,
  arjahTop,
  type ArjahSettings,
  type ArjahThemeSetting,
  type ArjahTitle,
  type ArjahView,
} from '../../src/shared/games/arjah';
import { botDelay, botVote, dealPrompts, type ArjahPast, type Rnd } from '../arjah-bots';
import type { ArjahPrompt } from '../arjah-content';
import { botLevel, paced, type GameCtx, type GameModule } from '../types';
import { isStr } from '../util';
import { voiceFinal, voiceOnly } from '../voice-calls-party';
import { placesByScore, soleWinner } from './mcq';
import { snapTo } from './speedquiz';

/** The reveal stays on the screens this long (at the room's pace). */
export const ARJAH_REVEAL_MS = 8000;
const SEEN_KEY = 'arjah:seen';

interface Reveal {
  tally: Record<string, number>;
  total: number;
  top: string[];
  /** for each player, who voted for them (server only; sent with the open vote) */
  voters: Record<string, string[]>;
  matched: string[];
}

interface Past extends ArjahPast {
  clause: string;
}

interface State {
  settings: ArjahSettings;
  participants: string[];
  prompts: ArjahPrompt[];
  /** 0-based */
  round: number;
  phase: ArjahView['phase'];
  endsAt: number | null;
  /** this round's votes: voter → chosen player. Never sent to another phone before the reveal. */
  votes: Record<string, string>;
  reveal: Reveal | null;
  history: Past[];
  scores: Record<string, number>;
  rnd: Rnd;
}

export function sanitizeArjah(raw: Partial<ArjahSettings> | undefined): ArjahSettings {
  const theme = isStr(raw?.theme) && (ARJAH_THEME_SETTINGS as string[]).includes(raw.theme) ? (raw.theme as ArjahThemeSetting) : ARJAH_DEFAULTS.theme;
  return {
    rounds: snapTo(raw?.rounds, ARJAH_ROUNDS, ARJAH_DEFAULTS.rounds),
    seconds: snapTo(raw?.seconds, ARJAH_SECONDS, ARJAH_DEFAULTS.seconds),
    theme,
    secret: typeof raw?.secret === 'boolean' ? raw.secret : ARJAH_DEFAULTS.secret,
  };
}

function roomSeen(ctx: GameCtx): Set<string> {
  let seen = ctx.memo.get(SEEN_KEY) as Set<string> | undefined;
  if (!seen) {
    seen = new Set();
    ctx.memo.set(SEEN_KEY, seen);
  }
  return seen;
}

const voteMs = (s: State) => s.settings.seconds * 1000;

function ask(ctx: GameCtx, s: State) {
  s.phase = 'vote';
  s.votes = {};
  s.reveal = null;
  s.endsAt = ctx.now + voteMs(s);
}

/** Count the votes (only for players still at the table), the title, the points. */
export function countVotes(participants: readonly string[], votes: Record<string, string>): Reveal {
  const tally: Record<string, number> = Object.fromEntries(participants.map((p) => [p, 0]));
  const voters: Record<string, string[]> = Object.fromEntries(participants.map((p) => [p, []]));
  let total = 0;
  for (const by of participants) {
    const t = votes[by];
    if (t === undefined || !(t in tally)) continue;
    tally[t]++;
    voters[t].push(by);
    total++;
  }
  const top = arjahTop(tally);
  const matched = participants.filter((by) => votes[by] !== undefined && top.includes(votes[by]));
  return { tally, total, top, voters, matched };
}

function reveal(ctx: GameCtx, s: State) {
  const r = countVotes(s.participants, s.votes);
  for (const id of r.matched) s.scores[id] = (s.scores[id] ?? 0) + 1;
  const p = s.prompts[s.round];
  s.history.push({ theme: p.theme, tag: p.tag, clause: p.clause, tally: { ...r.tally }, total: r.total, top: [...r.top] });
  s.reveal = r;
  s.phase = 'reveal';
  s.endsAt = ctx.now + paced(ctx, ARJAH_REVEAL_MS);
  ctx.fx('reveal', r.top.length === 1 ? r.top[0] : undefined);
  if (!r.total) ctx.say?.('لا أصوات في هذه الجولة');
  else if (!r.top.length) ctx.say?.('أصوات متفرّقة: لا لقب في هذه الجولة');
  else if (r.top.length === 1) ctx.say?.(`لقب الجولة: ${ctx.playerName(r.top[0])}`, r.top[0]);
  else ctx.say?.(`لقب الجولة مشترك: ${r.top.map((id) => ctx.playerName(id)).join(' و')}`);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  if (!s.participants.length) return;
  ctx.fx('win', soleWinner(s.scores));
  voiceOnly(ctx, voiceFinal(ctx, s.participants, (p) => s.scores[p] ?? 0));
}

function next(ctx: GameCtx, s: State) {
  if (s.round + 1 >= s.prompts.length) return finish(ctx, s);
  s.round++;
  ask(ctx, s);
}

/** Everyone who can vote has voted: the reveal comes at once. */
function maybeReveal(ctx: GameCtx, s: State) {
  if (s.phase !== 'vote') return;
  const waiting = s.participants.filter((p) => s.votes[p] === undefined && (ctx.isConnected(p) || ctx.isBot(p)));
  if (!waiting.length) reveal(ctx, s);
}

/** «الألقاب»: for each player, the prompt the family chose them most for (a round title first on a tie). */
export function titlesOf(participants: readonly string[], history: readonly Past[]): ArjahTitle[] {
  return participants.map((id) => {
    let best: ArjahTitle = { id, clause: null, count: 0, top: false };
    for (const h of history) {
      const v = h.tally[id] ?? 0;
      const top = h.top.includes(id);
      if (v > best.count || (v === best.count && v > 0 && top && !best.top)) best = { id, clause: h.clause, count: v, top };
    }
    return best;
  });
}

export function startArjah(ctx: GameCtx, participants: string[], raw: ArjahSettings, rnd: Rnd = Math.random): State {
  const settings = sanitizeArjah(raw);
  const s: State = {
    settings,
    participants: [...participants],
    prompts: dealPrompts(settings.theme, settings.rounds, rnd, roomSeen(ctx)),
    round: 0,
    phase: 'vote',
    endsAt: null,
    votes: {},
    reveal: null,
    history: [],
    scores: Object.fromEntries(participants.map((p) => [p, 0])),
    rnd,
  };
  ctx.fx('start');
  ask(ctx, s);
  return s;
}

export const arjah: GameModule<State, ArjahSettings> = {
  id: 'arjah',
  hostOnly: ['next'],

  start(ctx, participants, raw) {
    return startArjah(ctx, participants, raw);
  },

  act(ctx, s, by, a) {
    if (a.type === 'next') {
      if (s.phase === 'reveal') next(ctx, s);
      return;
    }
    if (a.type !== 'vote' || s.phase !== 'vote' || !s.participants.includes(by)) return;
    if (a.round !== undefined && a.round !== s.round + 1) return;
    if (!isStr(a.target) || !s.participants.includes(a.target)) return;
    if (ctx.now > (s.endsAt ?? 0)) return;
    s.votes[by] = a.target;
    maybeReveal(ctx, s);
  },

  tick(ctx, s) {
    if (s.endsAt === null || ctx.now < s.endsAt) return false;
    if (s.phase === 'vote') reveal(ctx, s);
    else if (s.phase === 'reveal') next(ctx, s);
    return true;
  },

  // everyone votes at once: no «your turn» chime
  turnOf() {
    return [];
  },

  botPlan(ctx, s, bots) {
    if (s.phase !== 'vote') return;
    const level = botLevel(ctx);
    const p = s.prompts[s.round];
    const chars = arjahQuestion(p.clause).length;
    for (const b of s.participants) {
      if (s.votes[b] !== undefined || !(bots.includes(b) || ctx.isBot(b))) continue;
      // only the earlier reveals: the votes of this round stay unseen
      const target = botVote(level, b, s.participants, p, s.history, s.rnd);
      const delay = botDelay(level, s.settings.seconds, chars, s.participants.length, s.rnd);
      ctx.bot(b, `arjah:${s.round}:${s.participants.length}`, delay, { type: 'vote', round: s.round + 1, target });
    }
  },

  view(ctx, s, me): ArjahView {
    const p = s.prompts[s.round];
    const r = s.phase === 'reveal' ? s.reveal : null;
    const open = !s.settings.secret;
    const final = s.phase === 'final';
    const playing = s.participants.includes(me);
    const mine = playing ? (s.votes[me] ?? null) : null;
    return {
      game: 'arjah',
      phase: s.phase,
      round: s.round + 1,
      rounds: s.prompts.length,
      secret: s.settings.secret,
      theme: s.settings.theme,
      prompt: final ? null : { id: p.id, theme: p.theme, clause: p.clause },
      endsAt: s.endsAt,
      timerTotal: s.phase === 'vote' ? voteMs(s) : paced(ctx, ARJAH_REVEAL_MS),
      voted: final ? [] : s.participants.filter((id) => s.votes[id] !== undefined),
      mine: final ? null : mine,
      reveal: r
        ? {
            tally: { ...r.tally },
            total: r.total,
            top: [...r.top],
            voters: open ? Object.fromEntries(Object.entries(r.voters).map(([k, v]) => [k, [...v]])) : null,
            matched: open ? [...r.matched] : null,
            mineMatched: mine === null ? null : r.top.includes(mine),
          }
        : null,
      scores: open || final ? { ...s.scores } : playing ? { [me]: s.scores[me] ?? 0 } : {},
      myScore: s.scores[me] ?? 0,
      players: [...s.participants],
      titles: final ? titlesOf(s.participants, s.history) : null,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    s.participants = s.participants.filter((p) => p !== id);
    delete s.scores[id];
    delete s.votes[id];
    // a vote for the one who left: its voter picks again
    for (const [by, t] of Object.entries(s.votes)) if (t === id) delete s.votes[by];
    if (s.phase === 'final') return;
    if (s.participants.length < 2) return finish(ctx, s);
    maybeReveal(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.rounds !== undefined) settings.rounds = snapTo(patch.rounds, ARJAH_ROUNDS, settings.rounds);
    if (patch.seconds !== undefined) settings.seconds = snapTo(patch.seconds, ARJAH_SECONDS, settings.seconds);
    if (isStr(patch.theme) && (ARJAH_THEME_SETTINGS as string[]).includes(patch.theme)) settings.theme = patch.theme as ArjahThemeSetting;
    if (typeof patch.secret === 'boolean') settings.secret = patch.secret;
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, s.scores) };
  },
};

export type { State as ArjahState };
