/** «قصة جماعية» — rotation, timers and fillers, leaving and reconnecting, openings, reveal, votes, settings, no leaks. */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { STORY_DEFAULTS, STORY_TEXT_MAX, storyRounds, type StorySettings, type StoryView } from '../src/shared/games/story';
import { PASS_MS, REVEAL_INTRO_MS, VOTE_MS, authorsOf, holderOf, promptFor, story, type StoryState } from './games/story';
import { dealOpenings, STORY_FILLERS, STORY_OPENINGS } from './story-content';
import { GameError, type GameCtx } from './types';
import { shuffle } from './util';
import { SVOICE, voiceBestStory } from './voice-calls-story';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Said = { text: string; by?: string; voice?: string };
type Ctx = GameCtx & { now: number; fxs: [string, string | undefined][]; said: Said[]; offline: Set<string> };

function fakeCtx(memo = new Map<string, unknown>()): Ctx {
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push([k, t]),
    say: (text, by, voice) => ctx.said.push({ text, by, ...(voice ? { voice } : {}) }),
    isConnected: (id) => !offline.has(id),
    isBot: () => false,
    playerName: (id) => `اسم-${id}`,
    memo,
    bot: () => {},
    fxs: [],
    said: [],
    offline,
  };
  return ctx;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function setup(n: number, settings: Partial<StorySettings> = {}, memo?: Map<string, unknown>) {
  const ctx = fakeCtx(memo);
  const s = story.start(ctx, ids(n), { ...STORY_DEFAULTS, ...settings });
  return { ctx, s };
}

const view = (ctx: GameCtx, s: StoryState, me: string) => story.view(ctx, s, me) as StoryView;
const act = (ctx: GameCtx, s: StoryState, by: string, type: string, payload: Record<string, unknown> = {}) => story.act(ctx, s, by, { type, ...payload });

/** Let the clock run to the end of the current timer and tick once. */
function timeout(ctx: Ctx, s: StoryState) {
  ctx.now = Math.max(ctx.now, s.endsAt) + 1;
  story.tick!(ctx, s);
}

/** Everyone still writing sends a unique sentence; returns them by author. */
function playRound(ctx: Ctx, s: StoryState, skip: string[] = []) {
  const sent: Record<string, string> = {};
  for (const id of story.turnOf!(s)) {
    if (skip.includes(id)) continue;
    sent[id] = `جملة ${s.round} من ${id}`;
    act(ctx, s, id, 'send', { text: sent[id] });
  }
  return sent;
}

function pass(ctx: Ctx, s: StoryState) {
  expect(s.phase as string).toBe('pass');
  timeout(ctx, s);
}

function playAll(ctx: Ctx, s: StoryState) {
  let guard = 0;
  while (s.phase !== 'reveal' && guard++ < 100) {
    playRound(ctx, s);
    if (s.phase === 'pass') pass(ctx, s);
  }
}

function revealAll(ctx: Ctx, s: StoryState) {
  let guard = 0;
  while (s.phase === 'reveal' && guard++ < 1000) act(ctx, s, s.live[0], 'next', { at: `${s.rs}:${s.rl}` });
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('story: 150+ distinct opening lines, Arabic, open-ended, not too long', () => {
  expect(STORY_OPENINGS.length).toBeGreaterThanOrEqual(150);
  expect(new Set(STORY_OPENINGS).size).toBe(STORY_OPENINGS.length);
  for (const p of STORY_OPENINGS) {
    expect(p.length).toBeLessThanOrEqual(90);
    expect(p.endsWith('…')).toBe(true);
    expect(p).toMatch(/^[؀-ۿ ،…:]+$/);
  }
  for (const f of STORY_FILLERS) expect(f.length).toBeLessThanOrEqual(STORY_TEXT_MAX);
});

test('story: openings are dealt without repeats in a game, and the pile goes round across games', () => {
  const memo = new Map<string, unknown>();
  const seen = new Set<string>();
  // 12 games of 12: 144 lines, never one twice while the list lasts
  for (let g = 0; g < 12; g++) {
    const { s } = setup(12, {}, memo);
    const lines = s.stories.map((b) => b.lines[0]);
    expect(lines.every((l) => l.by === null)).toBe(true);
    const texts = lines.map((l) => l.text);
    expect(new Set(texts).size).toBe(12);
    for (const t of texts) {
      expect(seen.has(t)).toBe(false);
      seen.add(t);
    }
  }
  // past the end of the list: still no repeat inside one game
  for (let g = 0; g < 5; g++) {
    const d = dealOpenings(memo, 12, shuffle);
    expect(new Set(d).size).toBe(12);
  }
});

test('story: «يكتبها كل لاعب» — no opening line, everyone writes the first sentence of their own story', () => {
  const { ctx, s } = setup(4, { opening: 'own' });
  for (const id of s.seats) {
    const t = view(ctx, s, id).task!;
    expect(t.mine).toBe(true);
    expect(t.prompt).toBeNull();
    expect(t.index).toBe(1);
  }
  expect(s.stories.every((b) => b.lines.length === 0)).toBe(true);
  expect(ctx.said[0].voice).toBe(SVOICE.start);
});

/* ------------------------------------------------------------------ */
/* Rotation                                                            */
/* ------------------------------------------------------------------ */

/**
 * The rotation: story b is with seat (b + k) mod N at round k. Every round every player holds exactly
 * one story; never the same story two rounds in a row; the sentence shown is the story's last one and
 * was written by the player just before in the seat order (never by the holder). One lap: each player
 * holds each story once (their own at round 0). Two laps: twice, their own at rounds 0 and N only.
 */
function checkRotation(n: number, length: StorySettings['length'], opening: StorySettings['opening'] = 'ready') {
  const { ctx, s } = setup(n, { length, opening });
  const rounds = storyRounds(n, length);
  expect(s.rounds).toBe(rounds);
  const held: Record<string, string[]> = Object.fromEntries(s.seats.map((id) => [id, []]));
  for (let k = 0; k < rounds; k++) {
    expect(s.round).toBe(k);
    expect(s.phase as string).toBe('write');
    expect(story.turnOf!(s).sort()).toEqual(s.seats.slice().sort());
    for (const id of s.seats) {
      const v = view(ctx, s, id);
      const t = v.task!;
      const b = s.tasks[id];
      const st = s.stories[b];
      held[id].push(st.owner);
      expect(holderOf(s, b, k)).toBe(id);
      // the previous round's story is never the same one
      if (k > 0) expect(held[id][k]).not.toBe(held[id][k - 1]);
      expect(t.mine).toBe(st.owner === id);
      const last = st.lines.at(-1);
      if (!last) expect(t.prompt).toBeNull();
      else {
        expect(t.prompt).toBe(last.text);
        // written by the seat just before me (or the game's opening line)
        if (last.by !== null) {
          expect(last.by).not.toBe(id);
          expect(last.by).toBe(s.seats[(s.seats.indexOf(id) - 1 + n) % n]);
        }
      }
      expect(t.index).toBe(k + 1);
    }
    playRound(ctx, s);
    pass(ctx, s);
  }
  expect(s.phase as string).toBe('reveal');
  for (const id of s.seats) {
    const counts = new Map<string, number>();
    for (const o of held[id]) counts.set(o, (counts.get(o) ?? 0) + 1);
    if (length === 'lap') {
      expect(held[id].slice().sort()).toEqual(s.seats.slice().sort());
      expect(held[id][0]).toBe(id);
    }
    if (length === 'two') {
      for (const o of s.seats) expect(counts.get(o)).toBe(2);
      held[id].forEach((o, k) => expect(o === id).toBe(k === 0 || k === n));
    }
  }
  for (const b of s.stories) {
    const written = b.lines.filter((l) => l.by !== null);
    expect(written.length).toBe(rounds);
    expect(b.lines.length).toBe(rounds + (opening === 'ready' ? 1 : 0));
    // consecutive sentences are always by different people
    for (let i = 1; i < written.length; i++) expect(written[i].by).not.toBe(written[i - 1].by);
    expect(written[0].by).toBe(b.owner);
  }
}

test('story: rotation for 3 players, one lap', () => checkRotation(3, 'lap'));
test('story: rotation for 4 players, one lap', () => checkRotation(4, 'lap'));
test('story: rotation for 7 players, one lap', () => checkRotation(7, 'lap'));
test('story: rotation for 3, 4 and 7 players, two laps', () => {
  checkRotation(3, 'two');
  checkRotation(4, 'two');
  checkRotation(7, 'two');
});
test('story: rotation with players writing the first sentence, and a fixed number of sentences', () => {
  checkRotation(4, 'lap', 'own');
  checkRotation(3, '8');
  checkRotation(7, '4');
});

test('story: rounds per length (two laps of 12 is the most)', () => {
  expect(storyRounds(5, 'lap')).toBe(5);
  expect(storyRounds(5, 'two')).toBe(10);
  expect(storyRounds(12, 'two')).toBe(24);
  expect(storyRounds(3, '6')).toBe(6);
  expect(storyRounds(12, '4')).toBe(4);
});

/* ------------------------------------------------------------------ */
/* Writing, timers and fillers                                         */
/* ------------------------------------------------------------------ */

test('story: sentences are cleaned and capped; too short is refused; a sent sentence can be taken back', () => {
  const { ctx, s } = setup(3);
  const [a, b] = s.seats;
  expect(() => act(ctx, s, a, 'send', { text: ' ا ' })).toThrow(GameError);
  act(ctx, s, a, 'send', { text: '  ثم   طار  الحمار   فوق السوق ' });
  expect(s.pending[a].text).toBe('ثم طار الحمار فوق السوق');
  expect(view(ctx, s, a).task!.done).toBe(true);
  expect(view(ctx, s, a).task!.sent).toBe('ثم طار الحمار فوق السوق');
  act(ctx, s, a, 'edit');
  expect(s.pending[a]).toBeUndefined();
  // the text stays in the box after «تعديل»
  expect(view(ctx, s, a).task!.draft).toBe('ثم طار الحمار فوق السوق');
  act(ctx, s, b, 'send', { text: 'ب'.repeat(500) });
  expect(s.pending[b].text.length).toBe(STORY_TEXT_MAX);
});

test('story: the round ends as soon as everyone is done, well before the timer', () => {
  const { ctx, s } = setup(4);
  const last = s.seats[3];
  playRound(ctx, s, [last]);
  expect(s.phase as string).toBe('write');
  expect(story.turnOf!(s)).toEqual([last]);
  expect(view(ctx, s, s.seats[0]).done.length).toBe(3);
  act(ctx, s, last, 'send', { text: 'وفي النهاية ضحك الجميع' });
  expect(s.phase as string).toBe('pass');
  expect(s.endsAt).toBe(ctx.now + PASS_MS);
});

test('story: time runs out — what was typed is sent, an empty box becomes a filler', () => {
  const { ctx, s } = setup(3, { seconds: 45 });
  const [a, b, c] = s.seats;
  expect(s.endsAt).toBe(ctx.now + 45_000);
  act(ctx, s, a, 'send', { text: 'جملة كاملة' });
  act(ctx, s, b, 'type', { text: 'نصف جمل' }); // typed, never pressed «تم»
  act(ctx, s, c, 'type', { text: 'شيء' });
  act(ctx, s, c, 'type', { text: '   ' }); // then erased it
  ctx.now += 44_000;
  story.tick!(ctx, s);
  expect(s.phase as string).toBe('write');
  timeout(ctx, s);
  expect(s.phase as string).toBe('pass');
  const lineOf = (id: string) => s.stories.flatMap((x) => x.lines).find((l) => l.by === id)!;
  expect(lineOf(a)).toEqual({ by: a, text: 'جملة كاملة' });
  expect(lineOf(b)).toEqual({ by: b, text: 'نصف جمل' });
  expect(lineOf(c).filler).toBe(true);
  expect(STORY_FILLERS).toContain(lineOf(c).text);
  expect(ctx.said.at(-1)!.text).toContain('انتهى الوقت');
  pass(ctx, s);
  // the next holder of c's story sees the sentence before the filler (the opening line), not the filler
  const next = s.seats.find((id) => s.stories[s.tasks[id]].lines.at(-1)!.by === c)!;
  const st = s.stories[s.tasks[next]];
  expect(view(ctx, s, next).task!.prompt).toBe(st.lines[0].text);
  expect(view(ctx, s, next).task!.opening).toBe(true);
  expect(promptFor(st)).toEqual(st.lines[0]);
});

test('story: «بلا حد» — no timer; the round waits for everyone, the host can end it', () => {
  const { ctx, s } = setup(3, { seconds: 0 });
  expect(s.endsAt).toBe(0);
  expect(view(ctx, s, s.seats[0]).endsAt).toBeNull();
  expect(view(ctx, s, s.seats[0]).noLimit).toBe(true);
  act(ctx, s, s.seats[0], 'send', { text: 'جملة أولى' });
  ctx.now += 60 * 60_000;
  story.tick!(ctx, s);
  expect(s.phase as string).toBe('write');
  act(ctx, s, s.seats[1], 'type', { text: 'نصف' });
  act(ctx, s, s.seats[0], 'endRound');
  expect(s.phase as string).toBe('pass');
  expect(story.hostOnly).toContain('endRound');
  // with a timer «endRound» does nothing
  const t = setup(3, { seconds: 60 });
  act(t.ctx, t.s, t.s.seats[0], 'endRound');
  expect(t.s.phase as string).toBe('write');
});

test('story: an offline player does not hold the round up once everyone else is done', () => {
  const { ctx, s } = setup(4);
  const off = s.seats[3];
  act(ctx, s, off, 'type', { text: 'كنت أكتب' });
  ctx.offline.add(off);
  playRound(ctx, s, [off]);
  expect(s.phase as string).toBe('pass');
  expect(s.stories.flatMap((b) => b.lines).find((l) => l.by === off)!.text).toBe('كنت أكتب');
});

/* ------------------------------------------------------------------ */
/* Leaving and reconnecting                                            */
/* ------------------------------------------------------------------ */

test('story: a player who leaves mid-round — their draft (or a filler) goes in, the rotation skips them', () => {
  const { ctx, s } = setup(5);
  const [a, , , , e] = s.seats;
  act(ctx, s, e, 'type', { text: 'كانت الجملة' });
  playRound(ctx, s, [e]);
  story.onLeave!(ctx, s, e);
  expect(s.phase as string).toBe('pass');
  const eLine = s.stories.flatMap((b) => b.lines).find((l) => l.by === e)!;
  expect(eLine).toEqual({ by: e, text: 'كانت الجملة', left: true });
  pass(ctx, s);
  // round 1: four players write, the story e would hold waits
  expect(Object.keys(s.tasks).sort()).toEqual(s.seats.filter((id) => id !== e).sort());
  const waiting = s.stories.findIndex((_x, b) => holderOf(s, b, 1) === e);
  expect(Object.values(s.tasks)).not.toContain(waiting);
  // a's turn to leave without typing anything: a filler
  playRound(ctx, s, [a]);
  story.onLeave!(ctx, s, a);
  expect(s.phase as string).toBe('pass');
  const aLine = s.stories.flatMap((b) => b.lines).filter((l) => l.by === a).at(-1)!;
  expect(aLine.filler).toBe(true);
  expect(aLine.left).toBe(true);
  pass(ctx, s);
  // the rest still play to the reveal, nobody ever sees their own last sentence
  let guard = 0;
  while (s.phase === 'write' && guard++ < 20) {
    for (const id of story.turnOf!(s)) {
      const st = s.stories[s.tasks[id]];
      const p = promptFor(st);
      if (p) expect(p.by).not.toBe(id);
    }
    playRound(ctx, s);
    pass(ctx, s);
  }
  expect(s.phase as string).toBe('reveal');
  expect(ctx.said.some((x) => x.text.includes('مغادرة'))).toBe(true);
});

test('story: fewer than 3 players left — the stories written so far go to the reveal', () => {
  const { ctx, s } = setup(3);
  playRound(ctx, s);
  pass(ctx, s);
  story.onLeave!(ctx, s, s.seats[2]);
  expect(s.phase as string).toBe('reveal');
  expect(s.stories.every((b) => b.lines.length === 3)).toBe(true); // opening + 2 rounds (the leaver's is a filler)
  // nothing written at all: straight to the end
  const m = setup(3, { opening: 'own' });
  story.onLeave!(m.ctx, m.s, m.s.seats[0]);
  expect(m.s.phase as string).toBe('final');
  expect(story.result!(m.s)).toEqual({ places: [m.s.live.slice()] });
});

test('story: a reconnecting phone sees the story it holds now, with its draft or what it sent', () => {
  const { ctx, s } = setup(4);
  playRound(ctx, s);
  pass(ctx, s);
  const me = s.seats[1];
  act(ctx, s, me, 'type', { text: 'ثم فجأة' });
  ctx.offline.add(me);
  // gone for a while, then back: the same view as before
  ctx.offline.delete(me);
  const v = view(ctx, s, me);
  const st = s.stories[s.tasks[me]];
  expect(v.task!.prompt).toBe(st.lines.at(-1)!.text);
  expect(v.task!.draft).toBe('ثم فجأة');
  act(ctx, s, me, 'send', { text: 'ثم فجأة انطفأت الأنوار' });
  expect(view(ctx, s, me).task!.sent).toBe('ثم فجأة انطفأت الأنوار');
  expect(view(ctx, s, me).task!.done).toBe(true);
});

/* ------------------------------------------------------------------ */
/* No leaks                                                            */
/* ------------------------------------------------------------------ */

test('story: before the reveal a phone never gets any sentence but the one it must continue (and its own)', () => {
  for (const opening of ['ready', 'own'] as const) {
    const { ctx, s } = setup(5, { opening });
    const all = new Set<string>(s.stories.flatMap((b) => b.lines.map((l) => l.text)));
    while (s.phase === 'write') {
      for (const id of s.seats) {
        const v = view(ctx, s, id);
        expect(v.reveal).toBeNull();
        expect(v.books).toBeNull();
        const json = JSON.stringify(v);
        const allowed = new Set([v.task?.prompt, v.task?.sent, v.task?.draft].filter(Boolean));
        for (const t of all) if (!allowed.has(t)) expect(json.includes(t)).toBe(false);
      }
      const sent = playRound(ctx, s);
      for (const t of Object.values(sent)) all.add(t);
      // during the pass nothing at all
      for (const id of s.seats) {
        const json = JSON.stringify(view(ctx, s, id));
        for (const t of all) expect(json.includes(t)).toBe(false);
      }
      pass(ctx, s);
    }
    expect(s.phase as string).toBe('reveal');
    // the reveal: only the current story, up to the sentence being read
    const v = view(ctx, s, s.seats[0]);
    expect(v.reveal!.lines.length).toBe(1);
    const json = JSON.stringify(v);
    for (const b of s.stories) for (const l of b.lines) if (l !== v.reveal!.lines[0]) expect(json.includes(l.text)).toBe(false);
  }
});

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

test('story: reveal — stories in order, sentence by sentence, the same on every phone, owner or host move on', () => {
  const { ctx, s } = setup(4);
  playAll(ctx, s);
  expect(ctx.said.some((x) => x.voice?.includes(SVOICE.reveal))).toBe(true);
  expect(ctx.fxs.some(([k]) => k === 'reveal')).toBe(true);
  const seen: string[] = [];
  let guard = 0;
  while (s.phase === 'reveal' && guard++ < 100) {
    const views = s.seats.map((id) => view(ctx, s, id));
    const r = views[0].reveal!;
    for (const v of views) expect(v.reveal!.lines).toEqual(r.lines);
    expect(r.lines).toEqual(s.stories[r.story].lines.slice(0, r.lines.length));
    expect(r.length).toBe(5);
    seen.push(`${r.story}:${r.lines.length - 1}`);
    views.forEach((v, i) => expect(v.reveal!.canTurn).toBe(s.seats[i] === r.owner));
    // someone else can't move on; a stale tap is ignored
    act(ctx, s, s.seats.find((id) => id !== r.owner)!, 'turn', { at: `${s.rs}:${s.rl}` });
    act(ctx, s, r.owner, 'turn', { at: 'x' });
    expect(`${s.rs}:${s.rl}`).toBe(seen.at(-1)!);
    act(ctx, s, r.owner, 'turn', { at: `${s.rs}:${s.rl}` });
  }
  expect(seen).toEqual([0, 1, 2, 3].flatMap((b) => [0, 1, 2, 3, 4].map((l) => `${b}:${l}`)));
  expect(s.phase as string).toBe('vote');
  // the server never reads a sentence aloud itself (the reveal screen does)
  const texts = new Set(s.stories.flatMap((b) => b.lines.map((l) => l.text)));
  for (const x of ctx.said) if (x.voice) for (const t of texts) expect(x.voice.includes(t)).toBe(false);
  expect(ctx.said.some((x) => x.text.startsWith('قصة اسم-'))).toBe(true);
});

test('story: two taps at the same moment move on only one sentence', () => {
  const { ctx, s } = setup(3);
  playAll(ctx, s);
  const at = `${s.rs}:${s.rl}`;
  act(ctx, s, s.seats[0], 'next', { at });
  act(ctx, s, s.stories[0].owner, 'turn', { at });
  expect(s.rl).toBe(1);
});

test('story: auto-advance moves on by itself (longer sentences stay longer), no timer without it', () => {
  const { ctx, s } = setup(3, { autoReveal: true, votes: false });
  playAll(ctx, s);
  expect(view(ctx, s, s.seats[0]).endsAt).not.toBeNull();
  let guard = 0;
  while (s.phase === 'reveal' && guard++ < 50) timeout(ctx, s);
  expect(s.phase as string).toBe('final');
  const m = setup(3);
  playAll(m.ctx, m.s);
  expect(view(m.ctx, m.s, m.s.seats[0]).endsAt).toBeNull();
  m.ctx.now += 10 * 60_000;
  story.tick!(m.ctx, m.s);
  expect(m.s.rl).toBe(0);
});

test('story: the last round is followed by the reveal intro pause, then the first story', () => {
  const { ctx, s } = setup(3);
  for (let k = 0; k < 2; k++) {
    playRound(ctx, s);
    pass(ctx, s);
  }
  playRound(ctx, s);
  expect(s.phase as string).toBe('pass');
  expect(s.next).toBe('reveal');
  expect(s.endsAt).toBe(ctx.now + REVEAL_INTRO_MS);
  expect(view(ctx, s, s.seats[0]).next).toBe('reveal');
  timeout(ctx, s);
  expect(s.phase as string).toBe('reveal');
  expect(view(ctx, s, s.seats[0]).reveal!.lines).toEqual([s.stories[0].lines[0]]);
});

/* ------------------------------------------------------------------ */
/* Votes and the result                                                */
/* ------------------------------------------------------------------ */

function toVote(n: number, settings: Partial<StorySettings> = {}) {
  const { ctx, s } = setup(n, { length: 'lap', ...settings });
  playAll(ctx, s);
  revealAll(ctx, s);
  expect(s.phase as string).toBe('vote');
  return { ctx, s };
}

test('story: votes — never for your own story, changeable, the end once everyone has voted', () => {
  const { ctx, s } = toVote(3);
  const [a, b, c] = s.seats;
  const own = (id: string) => s.stories.findIndex((x) => x.owner === id);
  expect(view(ctx, s, a).books!.length).toBe(3);
  expect(() => act(ctx, s, a, 'vote', { story: own(a) })).toThrow(GameError);
  act(ctx, s, a, 'vote', { story: 99 }); // ignored
  expect(s.votes[a]).toBeUndefined();
  act(ctx, s, a, 'vote', { story: own(b) });
  act(ctx, s, a, 'vote', { story: own(c) }); // changed my mind
  expect(view(ctx, s, a).vote!.mine).toBe(own(c));
  act(ctx, s, b, 'vote', { story: own(c) });
  expect(story.turnOf!(s)).toEqual([c]);
  act(ctx, s, c, 'vote', { story: own(a) });
  expect(s.phase as string).toBe('final');
  const f = view(ctx, s, a).final!;
  expect(f.votes).toBe(true);
  expect(f.tally[own(c)]).toBe(2);
  expect(f.best).toEqual([own(c)]);
  expect(ctx.said.at(-1)!.voice).toBe(voiceBestStory(`اسم-${c}`));
  // one lap: everyone wrote in every story, so every vote counts for everyone
  for (const id of s.seats) expect(f.scores[id]).toBe(3);
  expect(story.result!(s)).toEqual({ places: [s.live.slice()] });
});

test('story: votes — the authors of a story share its votes (shorter stories rank people apart)', () => {
  // 7 players, 4 sentences: story b is written by seats b, b+1, b+2, b+3
  const { ctx, s } = toVote(7, { length: '4' });
  const seat = (i: number) => s.seats[i % 7];
  for (let b = 0; b < 7; b++) expect(authorsOf(s.stories[b]).sort()).toEqual([0, 1, 2, 3].map((i) => seat(b + i)).sort());
  for (const id of s.seats) act(ctx, s, id, 'vote', { story: id === s.stories[0].owner ? 1 : 0 });
  expect(s.phase as string).toBe('final');
  const f = s.result!;
  expect(f.tally[0]).toBe(6);
  expect(f.tally[1]).toBe(1);
  expect(f.best).toEqual([0]);
  expect(f.scores[seat(0)]).toBe(6);
  expect(f.scores[seat(1)]).toBe(7);
  expect(f.scores[seat(4)]).toBe(1);
  expect(f.scores[seat(5)] ?? 0).toBe(0);
  const places = story.result!(s)!.places;
  expect(places[0].sort()).toEqual([seat(1), seat(2), seat(3)].sort());
  expect(places[1]).toEqual([seat(0)]);
  expect(places[2]).toEqual([seat(4)]);
  expect(places[3].sort()).toEqual([seat(5), seat(6)].sort());
});

test('story: votes — a tie between stories is shared', () => {
  const { ctx, s } = toVote(4);
  const own = (id: string) => s.stories.findIndex((x) => x.owner === id);
  const [a, b, c, d] = s.seats;
  act(ctx, s, a, 'vote', { story: own(b) });
  act(ctx, s, b, 'vote', { story: own(a) });
  act(ctx, s, c, 'vote', { story: own(a) });
  act(ctx, s, d, 'vote', { story: own(b) });
  expect(s.result!.best.sort()).toEqual([own(a), own(b)].sort());
  expect(ctx.said.at(-1)!.voice).toBe(SVOICE.tie);
});

test('story: scores follow authorship — a filler earns nothing, places by votes received', () => {
  const { ctx, s } = setup(3, { length: 'lap' });
  const [a, b, c] = s.seats;
  // c never writes anything: all of c's sentences are fillers
  let guard = 0;
  while (s.phase !== 'reveal' && guard++ < 20) {
    playRound(ctx, s, [c]);
    timeout(ctx, s);
    if (s.phase === 'pass') pass(ctx, s);
  }
  revealAll(ctx, s);
  const own = (id: string) => s.stories.findIndex((x) => x.owner === id);
  for (const st of s.stories) expect(authorsOf(st)).not.toContain(c);
  act(ctx, s, a, 'vote', { story: own(b) });
  act(ctx, s, b, 'vote', { story: own(c) });
  act(ctx, s, c, 'vote', { story: own(a) });
  expect(s.result!.scores[a]).toBe(3);
  expect(s.result!.scores[c] ?? 0).toBe(0);
  const places = story.result!(s)!.places;
  expect(places.at(-1)).toEqual([c]);
  expect(places[0].sort()).toEqual([a, b].sort());
});

test('story: the vote ends on its timer or by the host; nobody voted → no winner', () => {
  const { ctx, s } = toVote(3);
  expect(s.endsAt).toBe(ctx.now + VOTE_MS);
  timeout(ctx, s);
  expect(s.phase as string).toBe('final');
  expect(s.result!.best).toEqual([]);
  expect(ctx.said.at(-1)!.voice).toBe(SVOICE.none);
  const m = toVote(4);
  act(m.ctx, m.s, m.s.seats[1], 'vote', { story: m.s.stories.findIndex((x) => x.owner !== m.s.seats[1]) });
  act(m.ctx, m.s, m.s.seats[0], 'endVote');
  expect(m.s.phase as string).toBe('final');
  expect(m.s.result!.best.length).toBe(1);
});

test('story: a player leaving during the vote — their vote goes, the others finish it', () => {
  const { ctx, s } = toVote(4);
  const [a, b, c, d] = s.seats;
  const other = (id: string) => s.stories.findIndex((x) => x.owner !== id);
  act(ctx, s, a, 'vote', { story: other(a) });
  act(ctx, s, b, 'vote', { story: other(b) });
  act(ctx, s, d, 'vote', { story: other(d) });
  story.onLeave!(ctx, s, d);
  expect(s.votes[d]).toBeUndefined();
  expect(s.phase as string).toBe('vote');
  act(ctx, s, c, 'vote', { story: other(c) });
  expect(s.phase as string).toBe('final');
  expect(story.result!(s)!.places.flat().sort()).toEqual([a, b, c].sort());
});

test('story: without votes the game ends after the reveal and everyone shares first place', () => {
  const { ctx, s } = setup(3, { votes: false });
  playAll(ctx, s);
  revealAll(ctx, s);
  expect(s.phase as string).toBe('final');
  expect(view(ctx, s, s.seats[0]).final!.votes).toBe(false);
  expect(view(ctx, s, s.seats[0]).books!.length).toBe(3);
  expect(story.result!(s)).toEqual({ places: [s.live.slice()] });
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]);
});

/* ------------------------------------------------------------------ */
/* Settings, voice                                                     */
/* ------------------------------------------------------------------ */

test('story: settings validation — only known values are taken', () => {
  const set: StorySettings = { ...DEFAULT_SETTINGS.story };
  expect(set).toEqual(STORY_DEFAULTS);
  story.patchSettings!(set, { opening: 'own', length: 'two', seconds: 90, votes: false, autoReveal: true });
  expect(set).toEqual({ opening: 'own', length: 'two', seconds: 90, votes: false, autoReveal: true });
  story.patchSettings!(set, { opening: 'mine', length: '5', seconds: 30, votes: 'yes', autoReveal: 1 });
  expect(set).toEqual({ opening: 'own', length: 'two', seconds: 90, votes: false, autoReveal: true });
  story.patchSettings!(set, { seconds: 0, length: '8' });
  expect(set.seconds).toBe(0);
  expect(set.length).toBe('8');
});

test('story: players who are not in the game (joined later) cannot act', () => {
  const { ctx, s } = setup(3);
  act(ctx, s, 'stranger', 'send', { text: 'جملة من الخارج' });
  expect(Object.keys(s.pending)).toEqual([]);
  expect(view(ctx, s, 'stranger').task).toBeNull();
});

const ARABIC_CALL = /^[ء-غف-يً-ْ]+( [ء-غف-يً-ْ]+)*$/;
test('story: voice calls are short, vowelled Arabic', () => {
  for (const v of [...Object.values(SVOICE), voiceBestStory('ماما')]) {
    for (const part of v.split('، ')) {
      expect(part).toMatch(ARABIC_CALL);
      expect(part).toMatch(/[ً-ْ]/);
      expect(part.split(' ').length).toBeLessThanOrEqual(5);
    }
  }
});

test('story: a full game of 6 with timeouts, a leaver and votes ends with a result', () => {
  const { ctx, s } = setup(6, { length: 'lap', seconds: 45 });
  let round = 0;
  while (s.phase === 'write' || s.phase === 'pass') {
    if (s.phase === 'write') {
      playRound(ctx, s, round % 2 ? [s.live[0]] : []);
      if (s.phase === 'write') timeout(ctx, s);
      round += 1;
      if (round === 3) story.onLeave!(ctx, s, s.live.at(-1)!);
    } else pass(ctx, s);
  }
  revealAll(ctx, s);
  expect(s.phase as string).toBe('vote');
  for (const id of s.live) act(ctx, s, id, 'vote', { story: s.stories.findIndex((x) => x.owner !== id && x.lines.length) });
  expect(s.phase as string).toBe('final');
  const r = story.result!(s)!;
  expect(r.places.flat().sort()).toEqual(s.live.slice().sort());
});
