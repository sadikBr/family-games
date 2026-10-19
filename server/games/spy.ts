/** «الجاسوس» — server rules (Spyfall-like, played out loud in the same room). */
import { SPY_MINUTES, type SpyHow, type SpyResult, type SpySettings, type SpyView } from '../../src/shared/games/spy';
import { SPY_LOCATIONS, type SpyLocation } from '../spy-content';
import { GameError, paced, type GameCtx, type GameModule } from '../types';
import { Deck, isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceAnd, voiceFinal, voiceOnly } from '../voice-calls-party';

/** Seconds the spy has to name the location after revealing themselves. */
export const SPY_GUESS_MS = 30_000;
/** How many locations are in play each round (the real one among them). */
export const SPY_LIST_SIZE = 24;
const NOTICE_MS = 7000;

interface Accusation {
  by: string;
  target: string;
  votes: Map<string, boolean>;
}

interface State {
  settings: SpySettings;
  phase: SpyView['phase'];
  round: number;
  participants: string[];
  location: SpyLocation;
  locations: string[];
  spies: string[];
  parts: Record<string, string>;
  ready: Set<string>;
  order: string[];
  askIdx: number;
  endsAt: number | null;
  pausedLeft: number | null;
  accusers: Set<string>;
  accusation: Accusation | null;
  failed: { by: string; target: string; yes: number; no: number; until: number } | null;
  finalVotes: Map<string, string>;
  guesserId: string | null;
  guessEndsAt: number | null;
  result: SpyResult | null;
  scores: Record<string, number>;
}

const totalMs = (s: State) => s.settings.minutes * 60_000;
const totalRounds = (s: State) => Math.max(1, s.settings.rounds);

export function spyCountFor(n: number, setting: number) {
  const want = setting === 1 || setting === 2 ? setting : n >= 7 ? 2 : 1;
  return Math.max(1, Math.min(want, Math.floor((n - 1) / 2)));
}

function deck(ctx: GameCtx): Deck<SpyLocation> {
  let d = ctx.memo.get('spy:locations') as Deck<SpyLocation> | undefined;
  if (!d) {
    d = new Deck(SPY_LOCATIONS);
    ctx.memo.set('spy:locations', d);
  }
  return d;
}

function newRound(ctx: GameCtx, s: State) {
  s.round += 1;
  s.location = deck(ctx).draw();
  const others = shuffle(SPY_LOCATIONS.filter((l) => l.name !== s.location.name)).slice(0, SPY_LIST_SIZE - 1);
  s.locations = [s.location.name, ...others.map((l) => l.name)].sort((a, b) => a.localeCompare(b, 'ar'));
  s.spies = shuffle(s.participants).slice(0, spyCountFor(s.participants.length, s.settings.spies));
  const roles = shuffle(s.location.roles);
  s.parts = {};
  let i = 0;
  for (const id of s.participants) if (!s.spies.includes(id)) s.parts[id] = roles[i++ % roles.length];
  s.ready = new Set();
  s.order = shuffle(s.participants);
  s.askIdx = 0;
  s.endsAt = null;
  s.pausedLeft = null;
  s.accusers = new Set();
  s.accusation = null;
  s.failed = null;
  s.finalVotes = new Map();
  s.guesserId = null;
  s.guessEndsAt = null;
  s.result = null;
  s.phase = 'reveal';
  ctx.fx('card');
}

function startPlay(ctx: GameCtx, s: State) {
  s.phase = 'play';
  s.endsAt = ctx.now + totalMs(s);
  s.pausedLeft = null;
  ctx.fx('start');
}

function pause(ctx: GameCtx, s: State) {
  if (s.endsAt !== null) s.pausedLeft = Math.max(0, s.endsAt - ctx.now);
  s.endsAt = null;
}

function resume(ctx: GameCtx, s: State) {
  s.phase = 'play';
  s.endsAt = ctx.now + (s.pausedLeft ?? 0);
  s.pausedLeft = null;
}

function connected(ctx: GameCtx, s: State) {
  return s.participants.filter((id) => ctx.isConnected(id));
}

function endRound(ctx: GameCtx, s: State, winners: 'spies' | 'civilians', how: SpyHow, extra: { accused?: string | null; guessed?: string | null; accuser?: string | null } = {}) {
  const points: Record<string, number> = {};
  if (how !== 'spyLeft') {
    if (winners === 'spies') {
      const p = how === 'tie' ? 2 : 4;
      for (const id of s.spies) points[id] = p;
    } else {
      for (const id of s.participants) if (!s.spies.includes(id)) points[id] = id === extra.accuser ? 2 : 1;
    }
  }
  for (const [id, p] of Object.entries(points)) s.scores[id] = (s.scores[id] ?? 0) + p;
  s.result = {
    winners,
    how,
    spies: s.spies,
    location: s.location.name,
    parts: s.parts,
    accused: extra.accused ?? null,
    guessed: extra.guessed ?? null,
    votes: s.finalVotes.size ? Object.fromEntries(s.finalVotes) : null,
    points,
  };
  s.phase = 'result';
  s.endsAt = null;
  s.pausedLeft = null;
  s.accusation = null;
  s.guessEndsAt = null;
  s.failed = null;
  ctx.fx('reveal');
  const spies = s.spies.map((id) => ctx.playerName(id)).join(' و');
  // how it ended, then the winner side (never the location: the screens show it)
  const end: Partial<Record<SpyHow, string>> = { wrongAccuse: PVOICE.notSpy, tie: PVOICE.voteTie, guessRight: PVOICE.guessRight, guessWrong: PVOICE.guessWrong };
  ctx.say?.(
    winners === 'spies' ? `الفوز للجاسوس: ${spies}، والمكان: ${s.location.name}` : `الفوز للمواطنين! الجاسوس: ${spies}`,
    undefined,
    how === 'spyLeft' ? undefined : voiceAnd(end[how], winners === 'spies' ? PVOICE.winSpy : PVOICE.winCivilians),
  );
}

function finishGame(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  s.pausedLeft = null;
  s.accusation = null;
  s.guessEndsAt = null;
  const ids = s.participants;
  const best = Math.max(0, ...ids.map((id) => s.scores[id] ?? 0));
  const top = ids.filter((id) => (s.scores[id] ?? 0) === best);
  if (top.length === 1) ctx.fx('win', top[0]);
  else ctx.fx('win');
  if (ids.length) voiceOnly(ctx, voiceFinal(ctx, ids, (id) => s.scores[id] ?? 0));
}

/** Resolve the open accusation once its outcome is certain (or `force`: with the votes in so far). */
function checkAccusation(ctx: GameCtx, s: State, force = false) {
  const acc = s.accusation;
  if (s.phase !== 'accuse' || !acc) return;
  const voters = connected(ctx, s).filter((id) => id !== acc.target);
  for (const id of acc.votes.keys()) if (!voters.includes(id)) voters.push(id); // an offline player's vote still counts
  const need = Math.floor(voters.length / 2) + 1;
  let yes = 0;
  let no = 0;
  for (const v of acc.votes.values()) v ? yes++ : no++;
  const allIn = voters.every((id) => acc.votes.has(id));
  if (yes >= need) {
    if (s.spies.includes(acc.target)) endRound(ctx, s, 'civilians', 'caught', { accused: acc.target, accuser: acc.by });
    else endRound(ctx, s, 'spies', 'wrongAccuse', { accused: acc.target });
    return;
  }
  if (force || allIn || no > voters.length - need) {
    s.failed = { by: acc.by, target: acc.target, yes, no, until: ctx.now + paced(ctx, NOTICE_MS) };
    s.accusation = null;
    ctx.fx('skip');
    ctx.say?.(`فشل اتّهام ${ctx.playerName(acc.target)} (نعم ${yes} · لا ${no}) — يستمر اللعب`, undefined, PVOICE.accuseFailed);
    resume(ctx, s);
  }
}

function resolveFinalVote(ctx: GameCtx, s: State) {
  const tally = new Map<string, number>();
  for (const t of s.finalVotes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
  let max = 0;
  let top: string[] = [];
  for (const [id, c] of tally) {
    if (c > max) {
      max = c;
      top = [id];
    } else if (c === max) top.push(id);
  }
  const accused = top.length === 1 ? top[0] : null;
  if (!accused) endRound(ctx, s, 'spies', 'tie');
  else if (s.spies.includes(accused)) endRound(ctx, s, 'civilians', 'caught', { accused });
  else endRound(ctx, s, 'spies', 'wrongAccuse', { accused });
}

function checkFinalVotes(ctx: GameCtx, s: State) {
  if (s.phase === 'finalVote' && connected(ctx, s).every((id) => s.finalVotes.has(id))) resolveFinalVote(ctx, s);
}

function checkReady(ctx: GameCtx, s: State) {
  if (s.phase === 'reveal' && connected(ctx, s).every((id) => s.ready.has(id))) startPlay(ctx, s);
}

function spyGuess(ctx: GameCtx, s: State, guessed: string) {
  if (guessed === s.location.name) endRound(ctx, s, 'spies', 'guessRight', { guessed });
  else endRound(ctx, s, 'civilians', 'guessWrong', { guessed });
}

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

export const spy: GameModule<State, SpySettings> = {
  id: 'spy',
  hostOnly: ['skipReady', 'forceResolve', 'next'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      phase: 'reveal',
      round: 0,
      participants,
      location: SPY_LOCATIONS[0],
      locations: [],
      spies: [],
      parts: {},
      ready: new Set(),
      order: [],
      askIdx: 0,
      endsAt: null,
      pausedLeft: null,
      accusers: new Set(),
      accusation: null,
      failed: null,
      finalVotes: new Map(),
      guesserId: null,
      guessEndsAt: null,
      result: null,
      scores: Object.fromEntries(participants.map((id) => [id, 0])),
    };
    newRound(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    const isPlayer = s.participants.includes(by);
    if (!isPlayer && a.type !== 'skipReady' && a.type !== 'forceResolve' && a.type !== 'next') return;
    switch (a.type) {
      case 'ready':
        if (s.phase !== 'reveal') return;
        s.ready.add(by);
        checkReady(ctx, s);
        return;
      case 'skipReady':
        if (s.phase === 'reveal') startPlay(ctx, s);
        return;
      case 'nextAsker': {
        // `idx` guards against two phones tapping at once
        if ((s.phase !== 'play' && s.phase !== 'accuse') || !s.order.length) return;
        if (isNum(a.idx) && a.idx !== s.askIdx) return;
        s.askIdx = (s.askIdx + 1) % s.order.length;
        ctx.say?.(`السؤال الآن عند ${ctx.playerName(s.order[s.askIdx])}`, s.order[s.askIdx]);
        return;
      }
      case 'accuse': {
        if (s.phase !== 'play') return;
        const target = a.target;
        if (!isStr(target) || target === by || !s.participants.includes(target)) throw new GameError('اختر لاعباً آخر');
        if (s.accusers.has(by)) throw new GameError('استعملت اتهامك في هذه الجولة');
        s.accusers.add(by);
        s.accusation = { by, target, votes: new Map([[by, true]]) };
        s.failed = null;
        pause(ctx, s);
        s.phase = 'accuse';
        ctx.fx('buzz', target);
        ctx.say?.(`اتّهام من ${ctx.playerName(by)} لـ${ctx.playerName(target)}: صوّتوا!`, by, PVOICE.accuse);
        checkAccusation(ctx, s);
        return;
      }
      case 'accuseVote': {
        const acc = s.accusation;
        if (s.phase !== 'accuse' || !acc || typeof a.yes !== 'boolean') return;
        if (by === acc.target) throw new GameError('المتّهم لا يصوّت');
        if (acc.votes.has(by)) return;
        acc.votes.set(by, a.yes);
        checkAccusation(ctx, s);
        return;
      }
      case 'forceResolve':
        if (s.phase === 'accuse') checkAccusation(ctx, s, true);
        else if (s.phase === 'finalVote') resolveFinalVote(ctx, s);
        return;
      case 'spyReveal':
        if ((s.phase !== 'play' && s.phase !== 'finalVote') || !s.spies.includes(by)) return;
        pause(ctx, s);
        s.phase = 'spyGuess';
        s.guesserId = by;
        s.guessEndsAt = ctx.now + SPY_GUESS_MS;
        s.failed = null;
        ctx.fx('reveal', by);
        ctx.say?.(`انكشاف ${ctx.playerName(by)}: الجاسوس! فرصة لتخمين المكان`, by, PVOICE.spyCaught);
        return;
      case 'spyGuess':
        if (s.phase !== 'spyGuess' || by !== s.guesserId || !isStr(a.location) || !s.locations.includes(a.location)) return;
        spyGuess(ctx, s, a.location);
        return;
      case 'finalVote': {
        if (s.phase !== 'finalVote') return;
        const target = a.target;
        if (!isStr(target) || target === by || !s.participants.includes(target)) throw new GameError('لا يمكنك التصويت على نفسك');
        s.finalVotes.set(by, target);
        checkFinalVotes(ctx, s);
        return;
      }
      case 'next':
        if (s.phase !== 'result') return;
        if (s.round >= totalRounds(s)) finishGame(ctx, s);
        else newRound(ctx, s);
        return;
    }
  },

  tick(ctx, s) {
    if (s.phase === 'spyGuess' && s.guessEndsAt !== null && ctx.now >= s.guessEndsAt) {
      spyGuess(ctx, s, ''); // time is up: a missed guess
      return true;
    }
    if (s.phase === 'play' && s.endsAt !== null && ctx.now >= s.endsAt) {
      s.phase = 'finalVote';
      s.endsAt = null;
      s.finalVotes = new Map();
      ctx.fx('tick');
      ctx.say?.('انتهى الوقت: صوّتوا على من تشكّون فيه', undefined, voiceAnd(PVOICE.timeUp, PVOICE.vote));
      return true;
    }
    if (s.failed && ctx.now >= s.failed.until) {
      s.failed = null;
      return true;
    }
    return false;
  },

  view(_ctx, s, me): SpyView {
    const inGame = s.participants.includes(me);
    const isSpy = s.spies.includes(me);
    const acc = s.accusation;
    return {
      game: 'spy',
      phase: s.phase,
      round: s.round,
      totalRounds: totalRounds(s),
      participants: s.participants,
      spyCount: s.spies.length,
      secret: !inGame
        ? null
        : isSpy
          ? { role: 'spy', partners: s.spies.filter((id) => id !== me) }
          : { role: 'civilian', location: s.location.name, part: s.parts[me] ?? '' },
      locations: s.locations,
      ready: [...s.ready],
      order: s.order,
      askerId: s.order.length ? s.order[s.askIdx % s.order.length] : null,
      endsAt: s.endsAt,
      pausedLeft: s.pausedLeft,
      totalMs: totalMs(s),
      accusers: [...s.accusers],
      accusation: acc ? { by: acc.by, target: acc.target, voted: [...acc.votes.keys()] } : null,
      myAccuseVote: acc?.votes.get(me) ?? null,
      failed: s.failed ? { by: s.failed.by, target: s.failed.target, yes: s.failed.yes, no: s.failed.no } : null,
      finalVoted: [...s.finalVotes.keys()],
      myFinalVote: s.finalVotes.get(me) ?? null,
      guesserId: s.guesserId,
      guessEndsAt: s.phase === 'spyGuess' ? s.guessEndsAt : null,
      result: s.result,
      scores: s.scores,
    };
  },

  turnOf(s) {
    switch (s.phase) {
      case 'play':
        return s.order.length ? [s.order[s.askIdx % s.order.length]] : [];
      // votes: everyone answers at once (the screen lists who is still voting)
      case 'spyGuess':
        return s.guesserId ? [s.guesserId] : [];
      default:
        return [];
    }
  },

  onLeave(ctx, s, id) {
    if (!s.participants.includes(id)) return;
    const orderIdx = s.order.indexOf(id);
    s.participants = s.participants.filter((p) => p !== id);
    s.order = s.order.filter((p) => p !== id);
    if (orderIdx !== -1 && orderIdx < s.askIdx) s.askIdx -= 1;
    if (s.order.length) s.askIdx %= s.order.length;
    else s.askIdx = 0;
    s.ready.delete(id);
    s.finalVotes.delete(id);
    for (const [from, to] of [...s.finalVotes]) if (to === id) s.finalVotes.delete(from); // they vote again
    if (s.accusation) s.accusation.votes.delete(id);
    if (s.phase === 'final') return;
    if (s.participants.length < 3) {
      finishGame(ctx, s);
      return;
    }
    if (s.phase === 'result') return;
    const wasSpy = s.spies.includes(id);
    if (wasSpy) {
      s.spies = s.spies.filter((p) => p !== id);
      if (!s.spies.length) {
        endRound(ctx, s, 'civilians', 'spyLeft');
        return;
      }
      if (s.phase === 'spyGuess' && s.guesserId === id) {
        spyGuess(ctx, s, ''); // the revealed spy walked away: a missed guess
        return;
      }
    } else {
      delete s.parts[id];
    }
    if (s.phase === 'accuse' && s.accusation?.target === id) {
      // the accused is gone: the accusation is dropped and the accuser keeps their turn
      s.accusers.delete(s.accusation.by);
      s.accusation = null;
      resume(ctx, s);
      return;
    }
    checkReady(ctx, s);
    checkAccusation(ctx, s);
    checkFinalVotes(ctx, s);
  },

  patchSettings(settings, patch) {
    if (isNum(patch.spies)) settings.spies = Math.max(0, Math.min(2, Math.round(patch.spies)));
    if (isNum(patch.minutes) && (SPY_MINUTES as readonly number[]).includes(patch.minutes)) settings.minutes = patch.minutes;
    if (isNum(patch.rounds)) settings.rounds = Math.max(1, Math.min(10, Math.round(patch.rounds)));
  },

  result(s) {
    if (s.phase !== 'final' || !s.participants.length) return null;
    return { places: placesByScore(s.participants, (id) => s.scores[id] ?? 0) };
  },
};
