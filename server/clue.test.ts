/**
 * «من الفاعل؟» — dealing and the secret file, the disproving order and rules, the chooser for which
 * card to show (and its time limit), final accusations (right / wrong / out / nobody left), what each
 * phone may see, the notebook's certain facts, the bots' deduction (sound, never a wrong accusation,
 * the expert beating easy bots), bounded thinking time, players leaving, settings and the voice calls.
 */
import { afterEach, expect, test } from 'bun:test';

import {
  CLUE_CARDS,
  CLUE_DEFAULTS,
  CLUE_MYSTERIES,
  CLUE_WHAT,
  CLUE_WHERE,
  CLUE_WHO,
  clueCell,
  clueFacts,
  clueRow,
  clueTriple,
  type ClueSettings,
  type ClueTriple,
  type ClueView,
} from '../src/shared/games/clue';
import { botKnowledge, clueAfter, clueShow, clueTurn, knowledgeFrom, type BotLevelName } from './ai/clue-bot';
import { clue, clueView, deal, startClue, type ClueState } from './games/clue';
import type { GameCtx } from './types';
import { CLUE_MYSTERY_VOICE, CLUE_VOICE, voiceSolvedBy } from './voice-calls-clue';

type Said = { text: string; by?: string; voice?: string };
interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}

function fakeCtx(bots: string[] = [], level: BotLevelName = 'expert') {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fxs: [string, string | undefined][] = [];
  const said: Said[] = [];
  const ctx: GameCtx & { jobs: Job[]; fxs: typeof fxs; said: Said[] } = {
    now: 1_000_000,
    fx: (k, t) => fxs.push([k, t]),
    say: (text, by, voice) => said.push({ text, by, voice }),
    isConnected: () => true,
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    fxs,
    said,
  };
  return ctx;
}

/** A small seeded random (mulberry32), so a test can be replayed. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});

const view = (s: ClueState, me: string) => clueView(s, me) as ClueView;
const ALL = CLUE_CARDS.map((c) => c.id);

/**
 * A game with chosen hands: seats a, b, c, d (in that order), the file = zahra / spoon / salon.
 * a: hammou, tray, kitchen, roof, riad · b: ruqaya, stool, bedroom, library, guests
 * c: anas, basket, pantry, entrance · d: bouchaib, salma, umbrella, broom
 */
function fixed(settings: Partial<ClueSettings> = {}) {
  const ctx = fakeCtx();
  const s = startClue(ctx, ['a', 'b', 'c', 'd'], { ...CLUE_DEFAULTS, ...settings });
  s.order = ['a', 'b', 'c', 'd'];
  s.turnIdx = 0;
  s.envelope = { who: 'zahra', what: 'spoon', where: 'salon' };
  s.hands = {
    a: ['hammou', 'tray', 'kitchen', 'roof', 'riad'],
    b: ['ruqaya', 'stool', 'bedroom', 'library', 'guests'],
    c: ['anas', 'basket', 'pantry', 'entrance'],
    d: ['bouchaib', 'salma', 'umbrella', 'broom'],
  };
  s.rooms = { a: null, b: null, c: null, d: null };
  ctx.said.length = 0;
  ctx.fxs.length = 0;
  return { ctx, s };
}

const suggest = (ctx: GameCtx, s: ClueState, by: string, t: ClueTriple) => clue.act(ctx, s, by, { type: 'suggest', ...t });
const accuse = (ctx: GameCtx, s: ClueState, by: string, t: ClueTriple) => clue.act(ctx, s, by, { type: 'accuse', ...t });

/* —— dealing and the file ————————————————————————————————————————————————————————— */

test('deal: one card of each category in the file, the other 18 dealt once each, extra cards to the first seats', () => {
  for (let n = 3; n <= 6; n++) {
    for (let k = 0; k < 20; k++) {
      const order = Array.from({ length: n }, (_, i) => `p${i}`);
      const { envelope, hands } = deal(order);
      expect(CLUE_WHO).toContain(envelope.who);
      expect(CLUE_WHAT).toContain(envelope.what);
      expect(CLUE_WHERE).toContain(envelope.where);
      const dealt = order.flatMap((p) => hands[p]);
      expect(dealt.length).toBe(18);
      expect(new Set(dealt).size).toBe(18);
      expect([...dealt, ...clueTriple(envelope)].sort()).toEqual([...ALL].sort());
      const sizes = order.map((p) => hands[p].length);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      // non-increasing round the table: the first seats get the extra card
      for (let i = 1; i < n; i++) expect(sizes[i]).toBeLessThanOrEqual(sizes[i - 1]);
    }
  }
  const sizes = (n: number) => Object.values(deal(Array.from({ length: n }, (_, i) => `p${i}`)).hands).map((h) => h.length);
  expect(sizes(3)).toEqual([6, 6, 6]);
  expect(sizes(4)).toEqual([5, 5, 4, 4]);
  expect(sizes(5)).toEqual([4, 4, 4, 3, 3]);
  expect(sizes(6)).toEqual([3, 3, 3, 3, 3, 3]);
});

test('deal: every card can end up in the file', () => {
  const seen = new Set<string>();
  for (let k = 0; k < 600; k++) for (const c of clueTriple(deal(['a', 'b', 'c']).envelope)) seen.add(c);
  expect(seen.size).toBe(21);
});

test('start: the first seat plays, nobody in the house yet, the mystery is read aloud', () => {
  const ctx = fakeCtx();
  const s = startClue(ctx, ['a', 'b', 'c'], CLUE_DEFAULTS);
  expect(s.phase).toBe('turn');
  expect(clue.turnOf!(s)).toEqual([s.order[0]]);
  expect(Object.values(s.rooms)).toEqual([null, null, null]);
  expect(s.mystery).toBeGreaterThanOrEqual(0);
  expect(s.mystery).toBeLessThan(CLUE_MYSTERIES.length);
  expect(ctx.said[0]).toMatchObject({ text: CLUE_MYSTERIES[s.mystery].title, voice: CLUE_MYSTERY_VOICE[s.mystery] });
  expect(ctx.fxs).toContainEqual(['start', undefined]);
  expect([...new Set(s.order)].sort()).toEqual(['a', 'b', 'c']);
});

/* —— suggestions and disproving ———————————————————————————————————————————————————— */

test('suggest: only the player whose turn it is, with real cards, and never twice in the same room in a row', () => {
  const { ctx, s } = fixed();
  expect(() => suggest(ctx, s, 'b', { who: 'zahra', what: 'spoon', where: 'salon' })).toThrow('ليس دورك');
  expect(() => clue.act(ctx, s, 'a', { type: 'suggest', who: 'spoon', what: 'zahra', where: 'salon' })).toThrow();
  expect(() => clue.act(ctx, s, 'a', { type: 'suggest', who: 'zahra', what: 'spoon' })).toThrow();
  expect(() => clue.act(ctx, s, 'a', { type: 'end' })).toThrow();
  suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'library' });
  expect(s.rooms.a).toBe('library');
  expect(ctx.said[0].text).toContain('اتهام مؤقت');
  // a second suggestion in the same turn is refused
  expect(() => suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'kitchen' })).toThrow();
  clue.act(ctx, s, 'a', { type: 'end' });
  // b, c, d … then a again: not the library twice in a row
  for (const p of ['b', 'c', 'd']) {
    suggest(ctx, s, p, { who: 'zahra', what: 'spoon', where: 'riad' });
    if (s.phase === 'show') clue.act(ctx, s, s.pending!.id, { type: 'show', card: s.pending!.options[0] });
    clue.act(ctx, s, p, { type: 'end' });
  }
  expect(clue.turnOf!(s)).toEqual(['a']);
  expect(() => suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'library' })).toThrow('غرفة أخرى');
  suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'kitchen' });
  expect(s.rooms.a).toBe('kitchen');
});

test('disprove: asked in seat order after the suggester; the first holder with one match shows it at once; later seats are not asked', () => {
  const { ctx, s } = fixed();
  // b holds none of these, c holds the pantry only, d holds the umbrella (never asked)
  suggest(ctx, s, 'a', { who: 'zahra', what: 'umbrella', where: 'pantry' });
  const cur = s.cur!;
  expect(cur.passed).toEqual(['b']);
  expect(cur.shownBy).toBe('c');
  expect(cur.card).toBe('pantry');
  expect(cur.done).toBe(true);
  expect(s.phase).toBe('after');
  expect(clue.turnOf!(s)).toEqual(['a']);
  expect(ctx.fxs).toContainEqual(['card', 'a']);
  // the line everyone reads says that a card was shown, never which
  const line = ctx.said[ctx.said.length - 1].text;
  expect(line).toContain('c');
  expect(line).not.toContain('المخزن');
});

test('disprove: the order wraps round the table (c suggests: d, then a, then b)', () => {
  const { ctx, s } = fixed();
  s.turnIdx = 2;
  // d holds none, a holds the tray
  suggest(ctx, s, 'c', { who: 'zahra', what: 'tray', where: 'salon' });
  expect(s.cur!.passed).toEqual(['d']);
  expect(s.cur!.shownBy).toBe('a');
  expect(s.cur!.card).toBe('tray');
});

test('disprove: nobody can — every other seat passes, read aloud, then the suggester decides', () => {
  const { ctx, s } = fixed();
  // the file's who and what, and a room a holds herself
  suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'kitchen' });
  expect(s.cur!.passed).toEqual(['b', 'c', 'd']);
  expect(s.cur!.shownBy).toBeNull();
  expect(s.phase).toBe('after');
  expect(ctx.said[ctx.said.length - 1]).toMatchObject({ voice: CLUE_VOICE.nobody });
  expect(ctx.fxs).toContainEqual(['reveal', undefined]);
  clue.act(ctx, s, 'a', { type: 'end' });
  expect(clue.turnOf!(s)).toEqual(['b']);
  expect(s.phase).toBe('turn');
});

test('chooser: a holder of several cards picks which one to show — only them, only one of those cards', () => {
  const { ctx, s } = fixed();
  // b holds ruqaya, stool and the library
  suggest(ctx, s, 'a', { who: 'ruqaya', what: 'stool', where: 'library' });
  expect(s.phase).toBe('show');
  expect(clue.turnOf!(s)).toEqual(['b']);
  expect(view(s, 'b').choose).toEqual({ to: 'a', options: ['ruqaya', 'stool', 'library'] });
  for (const p of ['a', 'c', 'd']) expect(view(s, p).choose).toBeNull();
  expect(view(s, 'a').current!.pending).toBe('b');
  expect(view(s, 'a').endsAt).toBe(ctx.now + CLUE_DEFAULTS.showSecs * 1000);
  // nobody else may answer, nor the suggester play on
  expect(() => clue.act(ctx, s, 'c', { type: 'show', card: 'anas' })).toThrow();
  expect(() => clue.act(ctx, s, 'a', { type: 'end' })).toThrow();
  expect(() => accuse(ctx, s, 'a', s.envelope)).toThrow();
  expect(() => clue.act(ctx, s, 'b', { type: 'show', card: 'guests' })).toThrow();
  expect(() => clue.act(ctx, s, 'b', { type: 'show', card: 'zahra' })).toThrow();
  clue.act(ctx, s, 'b', { type: 'show', card: 'stool' });
  expect(s.phase).toBe('after');
  expect(s.cur!.shownBy).toBe('b');
  expect(s.cur!.card).toBe('stool');
  expect(view(s, 'a').current!.card).toBe('stool');
  expect(view(s, 'b').current!.card).toBe('stool');
  expect(view(s, 'c').current!.card).toBeNull();
  expect(view(s, 'd').current!.card).toBeNull();
  expect(view(s, 'c').current!.shownBy).toBe('b');
});

test('chooser: when time is up the app shows a card for them — one already shown to the same player if there is one', () => {
  const { ctx, s } = fixed({ showSecs: 20 });
  // earlier, b showed ruqaya to a
  suggest(ctx, s, 'a', { who: 'ruqaya', what: 'spoon', where: 'kitchen' });
  expect(s.cur!.card).toBe('ruqaya');
  clue.act(ctx, s, 'a', { type: 'end' });
  for (const p of ['b', 'c', 'd']) {
    suggest(ctx, s, p, { who: 'zahra', what: 'spoon', where: 'salon' });
    clue.act(ctx, s, p, { type: 'end' });
  }
  suggest(ctx, s, 'a', { who: 'ruqaya', what: 'stool', where: 'library' });
  expect(s.phase).toBe('show');
  expect(clue.tick!(ctx, s)).toBe(false);
  ctx.now += 19_000;
  expect(clue.tick!(ctx, s)).toBe(false);
  ctx.now += 1_000;
  expect(clue.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('after');
  expect(s.cur!.shownBy).toBe('b');
  expect(s.cur!.card).toBe('ruqaya');
});

/* —— final accusations —————————————————————————————————————————————————————————————— */

test('accuse: right → the game is won and the file revealed to everyone', () => {
  const { ctx, s } = fixed();
  accuse(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'salon' });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('a');
  expect(ctx.fxs).toContainEqual(['win', 'a']);
  expect(ctx.said[ctx.said.length - 1].voice).toBe(voiceSolvedBy('a'));
  const v = view(s, 'c');
  expect(v.envelope).toEqual({ who: 'zahra', what: 'spoon', where: 'salon' });
  expect(v.hands!.d).toEqual(s.hands.d);
  expect(v.turn).toBeNull();
  expect(clue.turnOf!(s)).toEqual([]);
  expect(clue.result!(s)).toEqual({ places: [['a'], ['b', 'c', 'd']] });
  // nothing moves after the end
  clue.act(ctx, s, 'b', { type: 'accuse', who: 'zahra', what: 'spoon', where: 'salon' });
  expect(s.winner).toBe('a');
});

test('accuse: wrong → out of the guessing, the turn passes; an out player is skipped but still shows cards', () => {
  const { ctx, s } = fixed();
  suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'kitchen' });
  accuse(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'kitchen' });
  expect(s.out).toEqual(['a']);
  expect(s.phase).toBe('turn');
  expect(clue.turnOf!(s)).toEqual(['b']);
  expect(ctx.said[ctx.said.length - 1].voice).toBe(CLUE_VOICE.wrong);
  expect(ctx.fxs).toContainEqual(['buzz', 'a']);
  const v = view(s, 'c');
  expect(v.out).toEqual(['a']);
  const last = v.log[v.log.length - 1];
  expect(last).toMatchObject({ kind: 'accuse', by: 'a', correct: false, where: 'kitchen' });
  // b, c and d play; a is skipped
  for (const p of ['b', 'c']) {
    suggest(ctx, s, p, { who: 'zahra', what: 'spoon', where: 'salon' });
    clue.act(ctx, s, p, { type: 'end' });
  }
  // d asks about the tray: a (out) still has to show it
  suggest(ctx, s, 'd', { who: 'zahra', what: 'tray', where: 'salon' });
  expect(s.cur!.shownBy).toBe('a');
  expect(s.cur!.card).toBe('tray');
  clue.act(ctx, s, 'd', { type: 'end' });
  expect(clue.turnOf!(s)).toEqual(['b']);
  expect(() => accuse(ctx, s, 'a', s.envelope)).toThrow();
});

test('accuse: allowed at the start of a turn or after the suggestion, once; everybody out → unsolved', () => {
  const { ctx, s } = fixed();
  const wrongT = { who: 'anas', what: 'spoon', where: 'salon' };
  accuse(ctx, s, 'a', wrongT);
  accuse(ctx, s, 'b', wrongT);
  suggest(ctx, s, 'c', { who: 'zahra', what: 'spoon', where: 'riad' });
  accuse(ctx, s, 'c', wrongT);
  expect(s.phase).toBe('turn');
  expect(clue.turnOf!(s)).toEqual(['d']);
  accuse(ctx, s, 'd', wrongT);
  expect(s.phase).toBe('final');
  expect(s.winner).toBeNull();
  expect(ctx.said[ctx.said.length - 1].voice).toBe(CLUE_VOICE.unsolved);
  // the last one out ranks best
  expect(clue.result!(s)).toEqual({ places: [['d'], ['c'], ['b'], ['a']] });
});

test('result: winner, then those still guessing, then the players out (the last out first)', () => {
  const { ctx, s } = fixed();
  accuse(ctx, s, 'a', { who: 'anas', what: 'spoon', where: 'salon' });
  accuse(ctx, s, 'b', { who: 'anas', what: 'spoon', where: 'salon' });
  expect(clue.result!(s)).toBeNull();
  accuse(ctx, s, 'c', s.envelope);
  expect(clue.result!(s)).toEqual({ places: [['c'], ['d'], ['b'], ['a']] });
});

/* —— what each phone sees ——————————————————————————————————————————————————————————— */

/** Every rule of hiding, checked on one view. */
function checkHidden(s: ClueState, me: string) {
  const v = view(s, me);
  if (s.phase === 'final') return;
  expect(v.envelope).toBeNull();
  expect(v.hands).toBeNull();
  expect(v.myHand).toEqual(s.hands[me] ?? []);
  expect(Object.keys(v).sort()).toEqual(
    ['game', 'phase', 'gameKey', 'mystery', 'order', 'names', 'turn', 'rooms', 'handCounts', 'out', 'myHand', 'current', 'choose', 'endsAt', 'timerTotal', 'log', 'helper', 'revealed', 'winner', 'envelope', 'hands'].sort(),
  );
  for (const e of [...v.log, ...(v.current ? [v.current] : [])]) {
    expect(Object.keys(e)).not.toContain('queue');
    if (e.kind === 'suggest' && e.card !== null) expect(me === e.by || me === e.shownBy).toBe(true);
  }
  if (v.choose) expect(s.pending?.id).toBe(me);
  // no card of another hand or of the file anywhere but in the public suggestion / accusation triples
  const allowed = new Set<string>([...v.myHand, ...v.revealed.map((r) => r.card)]);
  for (const e of v.log) if (e.kind === 'suggest' && e.card) allowed.add(e.card);
  const json = JSON.stringify({ ...v, rooms: {}, log: v.log.map((e) => (e.kind === 'suggest' ? { ...e, who: '', what: '', where: '' } : { ...e, who: '', what: '', where: '' })), current: v.current ? { ...v.current, who: '', what: '', where: '' } : null, choose: v.choose ? { ...v.choose, options: v.choose.options.filter((c) => !allowed.has(c)) } : null });
  for (const c of ALL) if (!allowed.has(c)) expect(json.includes(`"${c}"`)).toBe(false);
}

test('hiding: no view shows the file, another hand, or the card shown to someone else (a whole game, every step)', () => {
  Math.random = seeded(7);
  const ctx = fakeCtx();
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const s = startClue(ctx, ids, CLUE_DEFAULTS);
  const lv: Record<string, BotLevelName> = { a: 'easy', b: 'smart', c: 'expert', d: 'easy', e: 'smart' };
  for (let step = 0; step < 600 && s.phase !== 'final'; step++) {
    for (const p of ids) checkHidden(s, p);
    checkHidden(s, 'spectator');
    if (s.phase === 'show') {
      const p = s.pending!;
      // the chooser's options are only their own matching cards
      for (const c of p.options) expect(s.hands[p.id]).toContain(c);
      clue.act(ctx, s, p.id, { type: 'show', card: clueShow(view(s, p.id), p.id, p.to, p.options, lv[p.id]) });
      continue;
    }
    const me = s.order[s.turnIdx];
    const move = s.phase === 'turn' ? clueTurn(view(s, me), me, lv[me]) : clueAfter(view(s, me), me, lv[me]);
    clue.act(ctx, s, me, move);
  }
  expect(s.phase).toBe('final');
  const v = view(s, 'spectator');
  expect(v.myHand).toEqual([]);
  expect(v.envelope).toEqual(s.envelope);
});

test('hiding: the said lines never name the card that was shown', () => {
  const { ctx, s } = fixed();
  suggest(ctx, s, 'a', { who: 'ruqaya', what: 'stool', where: 'library' });
  clue.act(ctx, s, 'b', { type: 'show', card: 'stool' });
  const last = ctx.said[ctx.said.length - 1];
  expect(last.text).not.toContain('الكرسي');
  expect(last.voice).toBeUndefined();
});

/* —— the notebook ————————————————————————————————————————————————————————————————— */

test('notebook: my cards, the cards shown to me and (with the helper) who could not disprove are written by themselves', () => {
  const { ctx, s } = fixed();
  suggest(ctx, s, 'a', { who: 'zahra', what: 'umbrella', where: 'pantry' });
  const fa = clueFacts(view(s, 'a'), 'a');
  expect(fa[clueCell('hammou', 'a')]).toBe('y');
  expect(fa[clueCell('hammou', 'b')]).toBe('n');
  expect(fa[clueCell('zahra', 'a')]).toBe('n');
  // shown to me by c
  expect(fa[clueCell('pantry', 'c')]).toBe('y');
  expect(fa[clueCell('pantry', 'd')]).toBe('n');
  // b could not disprove: ✗ for the three cards
  for (const c of ['zahra', 'umbrella', 'pantry']) expect(fa[clueCell(c, 'b')]).toBe('n');
  // d was not asked: nothing written
  expect(fa[clueCell('umbrella', 'd')]).toBeUndefined();
  // another player's notebook never learns the pantry is c's
  const fd = clueFacts(view(s, 'd'), 'd');
  expect(fd[clueCell('pantry', 'c')]).toBeUndefined();
  expect(fd[clueCell('zahra', 'b')]).toBe('n');
  // without the helper, the passes are left to the player
  const { ctx: ctx2, s: s2 } = fixed({ helper: false });
  suggest(ctx2, s2, 'a', { who: 'zahra', what: 'umbrella', where: 'pantry' });
  const f2 = clueFacts(view(s2, 'a'), 'a');
  expect(f2[clueCell('zahra', 'b')]).toBeUndefined();
  expect(f2[clueCell('pantry', 'c')]).toBe('y');
  // a row: someone holds it → out; every seat ✗ → in the file
  const cell = (card: string, p: string) => fa[clueCell(card, p)];
  expect(clueRow('pantry', s.order, cell)).toBe('out');
  expect(clueRow('zahra', s.order, cell)).toBeNull();
  expect(clueRow('zahra', s.order, (c, p) => (p === 'c' || p === 'd' ? 'n' : cell(c, p)))).toBe('in');
});

/* —— bots ——————————————————————————————————————————————————————————————————————————— */

interface Run {
  s: ClueState;
  winnerLevel: BotLevelName | null;
  wrong: { level: BotLevelName; by: string }[];
  maxMs: number;
}

/** A whole game between bots, every decision made from the bot's own view. */
function runGame(levels: BotLevelName[], seed: number, check?: (s: ClueState) => void): Run {
  Math.random = seeded(seed);
  const ctx = fakeCtx();
  const ids = levels.map((_, i) => `p${i}`);
  const lv: Record<string, BotLevelName> = Object.fromEntries(ids.map((id, i) => [id, levels[i]]));
  const s = startClue(ctx, ids, CLUE_DEFAULTS);
  const wrong: Run['wrong'] = [];
  let maxMs = 0;
  for (let step = 0; step < 1500 && s.phase !== 'final'; step++) {
    check?.(s);
    const t0 = performance.now();
    if (s.phase === 'show') {
      const p = s.pending!;
      const card = clueShow(view(s, p.id), p.id, p.to, p.options, lv[p.id]);
      maxMs = Math.max(maxMs, performance.now() - t0);
      clue.act(ctx, s, p.id, { type: 'show', card });
      continue;
    }
    const me = s.order[s.turnIdx];
    const move = s.phase === 'turn' ? clueTurn(view(s, me), me, lv[me]) : clueAfter(view(s, me), me, lv[me]);
    maxMs = Math.max(maxMs, performance.now() - t0);
    if (move.type === 'accuse' && (move.who !== s.envelope.who || move.what !== s.envelope.what || move.where !== s.envelope.where)) wrong.push({ level: lv[me], by: me });
    clue.act(ctx, s, me, move);
  }
  Math.random = realRandom;
  return { s, winnerLevel: s.winner ? lv[s.winner] : null, wrong, maxMs };
}

test('bots: deduction is sound — the true owner of every card is always still possible', () => {
  const owner = (s: ClueState, card: string) => {
    const p = s.order.find((x) => s.hands[x].includes(card));
    return p ? s.order.indexOf(p) : s.order.length;
  };
  let checks = 0;
  for (const seed of [1, 2, 3]) {
    runGame(['expert', 'smart', 'easy', 'expert'], seed, (s) => {
      if (s.log.length % 3 !== 0) return;
      for (const me of s.order) {
        for (const level of ['smart', 'expert'] as const) {
          const k = botKnowledge(view(s, me), me, level);
          expect(k.ok).toBe(true);
          CLUE_CARDS.forEach((c, i) => {
            expect(k.poss[i] & (1 << owner(s, c.id))).not.toBe(0);
          });
          checks++;
        }
      }
    });
  }
  expect(checks).toBeGreaterThan(50);
});

test('bots: with every hand known the expert accuses the file at once, never a wrong one', () => {
  const { ctx, s } = fixed();
  // a has seen every other card (shown, one by one) → only the file is left
  const v = view(s, 'a');
  const others = ['b', 'c', 'd'];
  v.log = others.flatMap((p, i) => s.hands[p].map((card, j) => ({ kind: 'suggest' as const, n: i * 10 + j, by: 'a', who: 'zahra', what: 'spoon', where: 'salon', passed: [], shownBy: p, card, pending: null, done: true })));
  for (const level of ['smart', 'expert', 'easy'] as const) {
    expect(clueTurn(v, 'a', level)).toEqual({ type: 'accuse', ...s.envelope });
    expect(clueAfter(v, 'a', level)).toEqual({ type: 'accuse', ...s.envelope });
  }
  void ctx;
});

test('bots: the expert deduces the file from passes and hand sizes, not only from cards it saw', () => {
  const { ctx, s } = fixed();
  // a: nobody could disprove zahra / spoon / kitchen (a holds the kitchen) → zahra and spoon are in the file
  suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'kitchen' });
  const k = knowledgeFrom(view(s, 'a'), 'a');
  const E = 1 << 4;
  expect(k.poss[CLUE_CARDS.findIndex((c) => c.id === 'zahra')]).toBe(E);
  expect(k.poss[CLUE_CARDS.findIndex((c) => c.id === 'spoon')]).toBe(E);
  // the bot then only asks about rooms (with blanks for the solved categories) — never a pointless suggestion
  clue.act(ctx, s, 'a', { type: 'end' });
  const v = view(s, 'a');
  for (let i = 0; i < 20; i++) {
    const m = clueTurn(v, 'a', 'expert');
    expect(m.type).toBe('suggest');
    if (m.type !== 'suggest') continue;
    expect(['zahra', 'hammou']).toContain(m.who);
    expect(['spoon', 'tray']).toContain(m.what);
    expect(['kitchen', 'roof', 'riad']).not.toContain(m.where);
  }
});

test('bots: smart and expert never accuse wrongly, and every game between bots finishes', () => {
  const mixes: BotLevelName[][] = [
    ['expert', 'expert', 'expert'],
    ['smart', 'expert', 'smart', 'expert'],
    ['expert', 'smart', 'smart', 'expert', 'smart'],
    ['smart', 'smart', 'expert', 'expert', 'smart', 'expert'],
    ['easy', 'expert', 'smart'],
  ];
  let games = 0;
  for (let seed = 1; seed <= 8; seed++) {
    for (const mix of mixes) {
      const r = runGame(mix, seed * 31 + mix.length);
      expect(r.s.phase).toBe('final');
      expect(r.wrong.filter((w) => w.level !== 'easy')).toEqual([]);
      if (r.s.winner) expect(r.s.envelope).toBeDefined();
      games++;
    }
  }
  expect(games).toBe(40);
});

test('bots: the expert beats easy bots most of the time', () => {
  let wins = 0;
  const N = 40;
  for (let g = 0; g < N; g++) {
    // the expert's seat moves round the table
    const levels: BotLevelName[] = ['easy', 'easy', 'easy'];
    levels[g % 3] = 'expert';
    const r = runGame(levels, 1000 + g);
    if (r.winnerLevel === 'expert') wins++;
  }
  expect(wins / N).toBeGreaterThanOrEqual(0.7);
});

test('bots: the expert beats smart bots more often than its share', () => {
  let wins = 0;
  const N = 30;
  for (let g = 0; g < N; g++) {
    const levels: BotLevelName[] = ['smart', 'smart', 'smart'];
    levels[g % 3] = 'expert';
    if (runGame(levels, 5000 + g).winnerLevel === 'expert') wins++;
  }
  expect(wins / N).toBeGreaterThan(1 / 3);
});

test('bots: every decision takes well under 200 ms', () => {
  let worst = 0;
  for (let seed = 1; seed <= 4; seed++) worst = Math.max(worst, runGame(['expert', 'expert', 'expert', 'expert', 'expert', 'expert'], 900 + seed).maxMs);
  expect(worst).toBeLessThan(200);
});

test('bots: decide from their own view only — hidden changes that leave the view alike change nothing', () => {
  const { ctx, s } = fixed();
  suggest(ctx, s, 'a', { who: 'ruqaya', what: 'umbrella', where: 'pantry' });
  expect(s.cur!.card).toBe('ruqaya');
  clue.act(ctx, s, 'a', { type: 'end' });
  // swap two cards between c and d (same hand sizes): b's view is identical
  const before = JSON.stringify(view(s, 'b'));
  const twin = structuredClone(s);
  twin.hands.c = ['anas', 'umbrella', 'pantry', 'entrance'];
  twin.hands.d = ['bouchaib', 'salma', 'basket', 'broom'];
  expect(JSON.stringify(view(twin, 'b'))).toBe(before);
  for (const level of ['easy', 'smart', 'expert'] as const) {
    Math.random = seeded(3);
    const m1 = clueTurn(view(s, 'b'), 'b', level);
    Math.random = seeded(3);
    const m2 = clueTurn(view(twin, 'b'), 'b', level);
    expect(m2).toEqual(m1);
  }
});

test('bots: when showing, a card already shown to the same player is shown again; easy may show any', () => {
  const { ctx, s } = fixed();
  suggest(ctx, s, 'a', { who: 'zahra', what: 'spoon', where: 'library' });
  clue.act(ctx, s, 'a', { type: 'end' });
  const v = view(s, 'b');
  for (let i = 0; i < 20; i++) {
    expect(clueShow(v, 'b', 'a', ['ruqaya', 'stool', 'library'], 'expert')).toBe('library');
    expect(clueShow(v, 'b', 'a', ['ruqaya', 'stool', 'library'], 'smart')).toBe('library');
  }
  // to another player: the card shown before (to anyone) is still the one that tells least
  expect(clueShow(v, 'b', 'c', ['ruqaya', 'library'], 'expert')).toBe('library');
  const easy = new Set<string>();
  for (let i = 0; i < 60; i++) easy.add(clueShow(v, 'b', 'a', ['ruqaya', 'stool', 'library'], 'easy'));
  expect(easy.size).toBeGreaterThan(1);
});

test('bots: botPlan schedules the turn, the card to show and the decision after, once each', () => {
  const { s } = fixed();
  const ctx = fakeCtx(['a', 'b', 'c', 'd'], 'expert');
  clue.botPlan!(ctx, s, ['a', 'b', 'c', 'd']);
  clue.botPlan!(ctx, s, ['a', 'b', 'c', 'd']);
  expect(ctx.jobs.length).toBe(1);
  expect(ctx.jobs[0]).toMatchObject({ by: 'a', a: { type: 'suggest' } });
  // a person's turn: nothing for the bots
  const ctx2 = fakeCtx(['b'], 'expert');
  clue.botPlan!(ctx2, s, ['b']);
  expect(ctx2.jobs).toEqual([]);
  // b must choose: the bot answers with one of its options
  suggest(ctx2, s, 'a', { who: 'ruqaya', what: 'stool', where: 'library' });
  clue.botPlan!(ctx2, s, ['b']);
  expect(ctx2.jobs.length).toBe(1);
  expect(ctx2.jobs[0].a.type).toBe('show');
  expect(['ruqaya', 'stool', 'library']).toContain(ctx2.jobs[0].a.card as string);
  clue.act(ctx2, s, 'b', ctx2.jobs[0].a);
  const ctx3 = fakeCtx(['a'], 'smart');
  clue.botPlan!(ctx3, s, ['a']);
  expect(ctx3.jobs[0]).toMatchObject({ by: 'a' });
  expect(['end', 'accuse']).toContain(ctx3.jobs[0].a.type);
});

/* —— leaving, settings, voice ——————————————————————————————————————————————————————— */

test('leave: the cards of a player who left are shown to everyone; a pending choice moves on; their turn passes', () => {
  const { ctx, s } = fixed();
  suggest(ctx, s, 'a', { who: 'ruqaya', what: 'stool', where: 'library' });
  expect(s.pending!.id).toBe('b');
  clue.onLeave!(ctx, s, 'b');
  expect(s.order).toEqual(['a', 'c', 'd']);
  expect(view(s, 'd').revealed.map((r) => r.card).sort()).toEqual(['bedroom', 'guests', 'library', 'ruqaya', 'stool'].sort());
  // c and d hold none of the three: nobody could disprove
  expect(s.phase).toBe('after');
  expect(s.cur!.shownBy).toBeNull();
  // the notebook marks revealed cards as out of the file
  const f = clueFacts(view(s, 'c'), 'c');
  expect(f[clueCell('stool', 'a')]).toBe('n');
  clue.act(ctx, s, 'a', { type: 'end' });
  expect(clue.turnOf!(s)).toEqual(['c']);
  clue.onLeave!(ctx, s, 'c');
  expect(clue.turnOf!(s)).toEqual(['d']);
  expect(s.phase).toBe('turn');
  // the bots' knowledge leaves revealed cards out of the file
  const k = knowledgeFrom(view(s, 'd'), 'd');
  expect(k.ok).toBe(true);
});

test('settings: the helper and the time to choose a card are validated', () => {
  const st: ClueSettings = { ...CLUE_DEFAULTS };
  clue.patchSettings!(st, { helper: false, showSecs: 45 });
  expect(st).toEqual({ helper: false, showSecs: 45 });
  clue.patchSettings!(st, { helper: 'no', showSecs: 31 });
  expect(st).toEqual({ helper: false, showSecs: 45 });
  const ctx = fakeCtx();
  const s = startClue(ctx, ['a', 'b', 'c'], { helper: 1, showSecs: 999 } as unknown as ClueSettings);
  expect(s.settings).toEqual(CLUE_DEFAULTS);
});

test('voice: every call is short, Arabic-only and vowelled, never a card', () => {
  const calls = [...Object.values(CLUE_VOICE), ...CLUE_MYSTERY_VOICE, voiceSolvedBy('ماما'), voiceSolvedBy('الحسن')];
  for (const v of calls) {
    expect(v).toMatch(/^[ء-غف-يً-ْ]+(،? [ء-غف-يً-ْ]+)*$/);
    expect(v).toMatch(/[ً-ْ]/);
    expect(v.length).toBeLessThanOrEqual(40);
  }
  expect(CLUE_MYSTERY_VOICE.length).toBe(CLUE_MYSTERIES.length);
  expect(voiceSolvedBy('الحسن')).toBe('اتِّهَامٌ صَحِيحٌ، الفَوْزُ لِلحسن');
});
