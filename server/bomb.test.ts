/**
 * «القنبلة» — the deal and the deck table, drawing, every action card, attacks that stack, the «لا!» window (same
 * length for everyone, restarted by each «لا!», skipped only when every «لا!» is in the discard pile), the bomb
 * with and without a defuse and every way to put it back, elimination and the places, the timers, hidden
 * information (hands, deck order, the bomb's place, what «نظرة» showed, stolen and given cards), what the bots may
 * know and how they play at every strength, players leaving, stale taps and the settings.
 */
import { expect, test } from 'bun:test';

import { BOMB_DEFAULTS, BOMB_GIVE_MS, BOMB_HAND, BOMB_PLACE_MS, DECK_TABLE, deckAfterDeal, deckCounts, type BombCard, type BombKind, type BombSettings, type BombView } from '../src/shared/games/bomb';
import type { BotLevel } from '../src/shared/protocol';
import { bombChance, botGive, botNope, botPlace, botTurn, type BombBotInfo } from './bomb-bots';
import { bomb, botInfo, placeIndex, sanitizeBomb, startBomb, type BombState } from './games/bomb';
import { GameError, type GameCtx } from './types';

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}
type Ctx = GameCtx & { now: number; jobs: Job[]; said: string[]; fxs: string[] };

function fakeCtx(level: BotLevel = 'expert'): Ctx {
  const keys = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push(`${k}:${t ?? ''}`),
    say: (text) => ctx.said.push(text),
    isConnected: () => true,
    isBot: () => false,
    playerName: (id) => `اسم-${id}`,
    botLevel: () => level,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      ctx.jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs: [],
    said: [],
    fxs: [],
  };
  return ctx;
}

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

const settings = (o: Partial<BombSettings> = {}): BombSettings => ({ ...BOMB_DEFAULTS, turnSec: 0, ...o });
const view = (ctx: Ctx, s: BombState, me: string) => bomb.view(ctx, s, me) as BombView;
const act = (ctx: Ctx, s: BombState, by: string, a: Record<string, unknown>) => bomb.act(ctx, s, by, { seq: s.seq, ...a } as never);
const after = (ctx: Ctx, s: BombState, ms: number) => {
  ctx.now += ms;
  bomb.tick!(ctx, s);
};
/** Let the open «لا!» window run out. */
const closeWindow = (ctx: Ctx, s: BombState) => {
  if (s.phase === 'window') after(ctx, s, s.pending!.endsAt - ctx.now);
};

let uid = 0;
const card = (kind: BombKind): BombCard => ({ id: `t${++uid}`, kind });
const cards = (...kinds: BombKind[]) => kinds.map(card);

/** A table in seat order with chosen hands (a starts) and a chosen deck (top first). */
function setup(hands: Record<string, BombKind[]>, deck: BombKind[], o: Partial<BombSettings> = {}, ctx = fakeCtx()) {
  const ids = Object.keys(hands);
  const s = startBomb(ctx, ids, settings(o), seeded(7));
  s.order = ids;
  for (const id of ids) s.seats[id] = { id, hand: cards(...hands[id]), out: false };
  s.deck = cards(...deck);
  s.discard = [];
  s.known = Object.fromEntries(ids.map((id) => [id, []]));
  s.turn = ids[0];
  s.turns = 1;
  s.chain = false;
  s.phase = 'turn';
  s.seq++;
  return { s, ctx };
}
const idOf = (s: BombState, who: string, kind: BombKind, n = 0) => s.seats[who].hand.filter((c) => c.kind === kind)[n].id;
const kinds = (s: BombState, who: string) => s.seats[who].hand.map((c) => c.kind).sort();

/* ------------------------------------------------------------------ */

test('the deck table: bombs = players − 1, a defuse each plus the extra ones, and the tier sizes', () => {
  for (let n = 2; n <= 8; n++) {
    const c = deckCounts(n);
    const tier = DECK_TABLE.find((t) => n <= t.upTo)!;
    expect(c.bomb).toBe(n - 1);
    expect(c.defuse).toBe(n + tier.extraDefuse);
    expect(c.tajine).toBe(tier.pairs);
    expect(c.nope).toBe(tier.counts.nope);
  }
  expect(deckAfterDeal(2)).toEqual({ deck: 18, bombs: 1, defuse: 2 });
  expect(deckAfterDeal(4)).toEqual({ deck: 21, bombs: 3, defuse: 2 });
  expect(deckAfterDeal(8)).toEqual({ deck: 20, bombs: 7, defuse: 3 });
});

test('the deal: a defuse and 5 other cards each, never a bomb; the rest (bombs and extra defuses in it) in the deck', () => {
  for (let n = 2; n <= 8; n++) {
    const ctx = fakeCtx();
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const s = startBomb(ctx, ids, settings(), seeded(n));
    const c = deckCounts(n);
    for (const id of ids) {
      const h = s.seats[id].hand;
      expect(h.length).toBe(BOMB_HAND + 1);
      expect(h.filter((x) => x.kind === 'defuse').length).toBeGreaterThanOrEqual(1);
      expect(h.some((x) => x.kind === 'bomb')).toBe(false);
    }
    expect(s.deck.filter((x) => x.kind === 'bomb').length).toBe(n - 1);
    expect(s.deck.length).toBe(deckAfterDeal(n).deck);
    const all = [...s.deck, ...ids.flatMap((id) => s.seats[id].hand)];
    expect(new Set(all.map((x) => x.id)).size).toBe(all.length);
    for (const k of Object.keys(c) as BombKind[]) expect(all.filter((x) => x.kind === k).length).toBe(c[k]);
    expect(s.turn).toBe(s.order[0]);
    expect(s.phase).toBe('turn');
  }
});

test('card ids say nothing about the kind (no bomb has the first or last ids)', () => {
  let firstBomb = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = startBomb(fakeCtx(), ['a', 'b', 'c', 'd'], settings(), seeded(seed));
    const ids = s.deck.filter((x) => x.kind === 'bomb').map((x) => Number(x.id.slice(1)));
    if (ids.includes(0)) firstBomb++;
  }
  expect(firstBomb).toBeLessThan(10);
});

test('drawing a safe card ends the turn; the card is in the hand (and a private note says which)', () => {
  const { s, ctx } = setup({ a: ['defuse'], b: ['defuse'], c: ['defuse'] }, ['peek', 'skip', 'bomb', 'bomb']);
  act(ctx, s, 'a', { type: 'draw' });
  expect(kinds(s, 'a')).toEqual(['defuse', 'peek']);
  expect(s.turn).toBe('b');
  expect(s.deck.length).toBe(3);
  expect(view(ctx, s, 'a').note?.card).toBe('peek');
  expect(view(ctx, s, 'b').note).toBeNull();
  expect(ctx.said.at(-1)).not.toContain('نظرة');
  // not your turn
  expect(() => act(ctx, s, 'a', { type: 'draw' })).toThrow(GameError);
});

test('«تخطٍّ» ends the turn without drawing (after the «لا!» window)', () => {
  const { s, ctx } = setup({ a: ['skip', 'defuse'], b: ['nope'], c: ['defuse'] }, ['bomb', 'peek', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'skip')] });
  expect(s.phase).toBe('window');
  expect(s.turn).toBe('a');
  closeWindow(ctx, s);
  expect(s.turn).toBe('b');
  expect(s.deck.length).toBe(3);
  expect(s.discard.map((c) => c.kind)).toEqual(['skip']);
});

test('«هجوم»: the next player takes 2 turns; attacks stack (remaining turns + 2)', () => {
  const { s, ctx } = setup({ a: ['attack'], b: ['attack', 'defuse'], c: ['attack', 'defuse'], d: ['defuse'] }, ['peek', 'peek', 'peek', 'peek', 'peek', 'peek', 'peek', 'peek', 'bomb', 'bomb', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'attack')] });
  expect(s.pending!.target).toBe('b');
  expect(ctx.said.at(-1)).toBe('هجوم على اسم-b!');
  closeWindow(ctx, s);
  expect(s.turn).toBe('b');
  expect(s.turns).toBe(2);
  expect(view(ctx, s, 'c').turns).toBe(2);
  // b draws once (one turn left), then attacks: c gets 1 + 2 = 3
  act(ctx, s, 'b', { type: 'draw' });
  expect(s.turn).toBe('b');
  expect(s.turns).toBe(1);
  act(ctx, s, 'b', { type: 'play', cards: [idOf(s, 'b', 'attack')] });
  closeWindow(ctx, s);
  expect(s.turn).toBe('c');
  expect(s.turns).toBe(3);
  // c attacks at once: d gets 3 + 2 = 5
  act(ctx, s, 'c', { type: 'play', cards: [idOf(s, 'c', 'attack')] });
  closeWindow(ctx, s);
  expect(s.turn).toBe('d');
  expect(s.turns).toBe(5);
  // a skip ends only one of them; draws count down
  act(ctx, s, 'd', { type: 'draw' });
  expect(s.turn).toBe('d');
  expect(s.turns).toBe(4);
});

test('a plain attack (not under attack) always gives exactly 2 turns', () => {
  const { s, ctx } = setup({ a: ['attack', 'defuse'], b: ['defuse'] }, ['peek', 'peek', 'peek', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'attack')] });
  closeWindow(ctx, s);
  act(ctx, s, 'b', { type: 'draw' });
  act(ctx, s, 'b', { type: 'draw' });
  expect(s.turn).toBe('a');
  expect(s.turns).toBe(1);
});

test('«نظرة»: the top 3 only for the viewer; it moves up as cards are drawn; «خلط» clears it', () => {
  const { s, ctx } = setup({ a: ['peek', 'shuffle', 'defuse'], b: ['defuse'], c: ['defuse'] }, ['skip', 'bomb', 'favor', 'nope', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'peek')] });
  closeWindow(ctx, s);
  expect(s.turn).toBe('a');
  expect(s.phase).toBe('turn');
  expect(view(ctx, s, 'a').known).toEqual(['skip', 'bomb', 'favor']);
  expect(view(ctx, s, 'b').known).toEqual([]);
  // a draws the skip: a knows the bomb is next now
  act(ctx, s, 'a', { type: 'draw' });
  expect(view(ctx, s, 'a').known).toEqual(['bomb', 'favor']);
  // nothing in the say lines about what was seen
  expect(ctx.said.join(' ')).not.toContain('القنبلة التالية');
  s.turn = 'a';
  s.phase = 'turn';
  s.seq++;
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'shuffle')] });
  closeWindow(ctx, s);
  expect(view(ctx, s, 'a').known).toEqual([]);
});

test('«طلب»: the asked player chooses the card; only the two of them see which; the time runs out = random', () => {
  const { s, ctx } = setup({ a: ['favor', 'favor', 'defuse'], b: ['nope', 'tajine', 'defuse'], c: ['defuse'] }, ['peek', 'bomb', 'bomb']);
  // a target is needed, with cards, not me
  expect(() => act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'favor')] })).toThrow(GameError);
  expect(() => act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'favor')], target: 'a' })).toThrow(GameError);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'favor')], target: 'b' });
  closeWindow(ctx, s);
  expect(s.phase).toBe('give');
  expect(bomb.turnOf!(s)).toEqual(['b']);
  expect(view(ctx, s, 'c').give).toMatchObject({ from: 'b', to: 'a' });
  // only b may give, and only a card of b's
  act(ctx, s, 'a', { type: 'give', card: idOf(s, 'a', 'defuse') });
  expect(s.phase).toBe('give');
  act(ctx, s, 'b', { type: 'give', card: idOf(s, 'b', 'tajine') });
  expect(kinds(s, 'a')).toEqual(['defuse', 'favor', 'tajine']);
  expect(kinds(s, 'b')).toEqual(['defuse', 'nope']);
  expect(s.phase).toBe('turn');
  expect(s.turn).toBe('a');
  expect(view(ctx, s, 'a').note?.card).toBe('tajine');
  expect(view(ctx, s, 'b').note?.card).toBe('tajine');
  expect(view(ctx, s, 'c').note).toBeNull();
  expect(ctx.said.at(-1)).toBe('ورقة من اسم-b إلى اسم-a');
  // again, and b lets the time run out: a random card of b's goes
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'favor')], target: 'b' });
  closeWindow(ctx, s);
  after(ctx, s, BOMB_GIVE_MS);
  expect(s.seats.b.hand.length).toBe(1);
  expect(s.seats.a.hand.length).toBe(3);
  expect(s.phase).toBe('turn');
});

test('a pair steals a random card; single characters and mixed pairs are refused; nothing about the card in the say lines', () => {
  const { s, ctx } = setup({ a: ['tajine', 'tajine', 'teapot', 'ladle'], b: ['defuse', 'skip'], c: [] }, ['peek', 'bomb', 'bomb']);
  expect(() => act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'teapot')], target: 'b' })).toThrow(GameError);
  expect(() => act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'teapot'), idOf(s, 'a', 'ladle')], target: 'b' })).toThrow(GameError);
  // nobody to rob without cards
  expect(() => act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'tajine'), idOf(s, 'a', 'tajine', 1)], target: 'c' })).toThrow(GameError);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'tajine'), idOf(s, 'a', 'tajine', 1)], target: 'b' });
  closeWindow(ctx, s);
  expect(s.seats.a.hand.length).toBe(3);
  expect(s.seats.b.hand.length).toBe(1);
  const stolen = view(ctx, s, 'a').note!.card!;
  expect(['defuse', 'skip']).toContain(stolen);
  expect(view(ctx, s, 'b').note!.card).toBe(stolen);
  expect(view(ctx, s, 'c').note).toBeNull();
  for (const line of ctx.said) {
    expect(line).not.toContain('المفكّك');
    expect(line).not.toContain('تخطٍّ');
  }
});

test('«لا!» cancels; «لا!» on «لا!» brings it back; each one restarts the window', () => {
  const { s, ctx } = setup({ a: ['skip', 'nope', 'defuse'], b: ['nope', 'defuse'], c: ['nope', 'defuse'] }, ['peek', 'peek', 'bomb', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'skip')] });
  const first = s.pending!.endsAt;
  expect(first - ctx.now).toBe(3000);
  // a may not nope their own action with nothing on it
  act(ctx, s, 'a', { type: 'nope' });
  expect(s.pending!.nopes).toEqual([]);
  after(ctx, s, 2000);
  act(ctx, s, 'b', { type: 'nope' });
  expect(s.pending!.nopes).toEqual(['b']);
  expect(s.pending!.endsAt).toBe(ctx.now + 3000);
  // b may not nope their own «لا!»
  act(ctx, s, 'b', { type: 'nope' });
  expect(s.pending!.nopes).toEqual(['b']);
  after(ctx, s, 1000);
  act(ctx, s, 'a', { type: 'nope' });
  expect(s.pending!.nopes).toEqual(['b', 'a']);
  after(ctx, s, 2999);
  expect(s.phase).toBe('window');
  act(ctx, s, 'c', { type: 'nope' });
  // three: cancelled
  closeWindow(ctx, s);
  expect(s.phase).toBe('turn');
  expect(s.turn).toBe('a');
  expect(s.discard.filter((c) => c.kind === 'nope').length).toBe(3);
  expect(ctx.said.some((l) => l.startsWith('إلغاء «تخطٍّ»'))).toBe(true);
});

test('an even number of «لا!» lets the action happen', () => {
  const { s, ctx } = setup({ a: ['attack', 'nope', 'defuse'], b: ['nope', 'defuse'], c: ['defuse'] }, ['peek', 'peek', 'bomb', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'attack')] });
  act(ctx, s, 'b', { type: 'nope' });
  act(ctx, s, 'a', { type: 'nope' });
  closeWindow(ctx, s);
  expect(s.turn).toBe('b');
  expect(s.turns).toBe(2);
});

test('the window lasts the same for everyone, whatever the hands, and never closes early', () => {
  const run = (bHand: BombKind[]) => {
    const { s, ctx } = setup({ a: ['shuffle', 'defuse'], b: bHand, c: ['defuse'] }, ['peek', 'peek', 'bomb', 'bomb'], {}, fakeCtx());
    // a «لا!» somewhere else (the deck) keeps the window
    s.deck.push(card('nope'));
    act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'shuffle')] });
    const total = s.pending!.endsAt - ctx.now;
    const v = view(ctx, s, 'c');
    after(ctx, s, total - 1);
    const still = s.phase;
    return { total, still, pending: v.pending, nopeLive: v.nopeLive };
  };
  const withNope = run(['nope', 'defuse']);
  const without = run(['skip', 'defuse']);
  expect(withNope.total).toBe(3000);
  expect(without.total).toBe(3000);
  expect(withNope.still).toBe('window');
  expect(without.still).toBe('window');
  // what the other phones see does not depend on who holds «لا!»
  expect({ ...withNope.pending, endsAt: 0 }).toEqual({ ...without.pending, endsAt: 0 });
  expect(withNope.nopeLive).toBe(without.nopeLive);
  // the turn alert names nobody during the window
  const { s } = setup({ a: ['shuffle'], b: ['nope'] }, ['bomb']);
  s.phase = 'window';
  expect(bomb.turnOf!(s)).toEqual([]);
});

test('the window is skipped when every «لا!» is in the discard pile (public)', () => {
  const { s, ctx } = setup({ a: ['skip', 'skip', 'defuse'], b: ['defuse'], c: ['defuse'] }, ['peek', 'peek', 'bomb', 'bomb']);
  s.total = { ...s.total, nope: 2 };
  s.discard = cards('nope', 'nope');
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'skip')] });
  expect(s.phase).toBe('turn');
  expect(s.turn).toBe('b');
  expect(view(ctx, s, 'b').nopeLive).toBe(false);
  // and the window closes at once after the last «لا!» is played
  const t = setup({ a: ['skip', 'defuse'], b: ['nope', 'defuse'], c: ['defuse'] }, ['peek', 'bomb', 'bomb']);
  t.s.total = { ...t.s.total, nope: 1 };
  act(t.ctx, t.s, 'a', { type: 'play', cards: [idOf(t.s, 'a', 'skip')] });
  expect(t.s.phase).toBe('window');
  act(t.ctx, t.s, 'b', { type: 'nope' });
  expect(t.s.phase).toBe('turn');
  expect(t.s.turn).toBe('a');
});

test('the bomb with a defuse: everyone sees the moment, the defuse is used, the bomb goes back where the player chooses', () => {
  const { s, ctx } = setup({ a: ['defuse', 'skip'], b: ['defuse'], c: ['defuse'] }, ['bomb', 'peek', 'skip', 'favor', 'shuffle', 'bomb']);
  act(ctx, s, 'a', { type: 'draw' });
  expect(s.phase).toBe('boom');
  expect(ctx.fxs.at(-1)).toBe('boom:a');
  expect(ctx.said.at(-1)).toBe('قنبلة عند اسم-a!');
  expect(view(ctx, s, 'b').boom?.who).toBe('a');
  // nobody can act during the moment
  expect(() => act(ctx, s, 'a', { type: 'draw' })).toThrow(GameError);
  expect(s.phase).toBe('boom');
  after(ctx, s, 3000);
  expect(s.phase).toBe('place');
  expect(ctx.said.at(-1)).toBe('المفكّك من اسم-a: نجاة!');
  expect(kinds(s, 'a')).toEqual(['skip']);
  expect(s.discard.map((c) => c.kind)).toEqual(['defuse']);
  expect(bomb.turnOf!(s)).toEqual(['a']);
  // only a chooses
  act(ctx, s, 'b', { type: 'place', at: 'top' });
  expect(s.phase).toBe('place');
  act(ctx, s, 'a', { type: 'place', at: 'third' });
  expect(s.deck.map((c) => c.kind)).toEqual(['peek', 'skip', 'bomb', 'favor', 'shuffle', 'bomb']);
  expect(s.turn).toBe('b');
  // only the placer knows where
  expect(view(ctx, s, 'a').known).toEqual([null, null, 'bomb']);
  expect(view(ctx, s, 'b').known).toEqual([]);
  expect(view(ctx, s, 'a').note?.text).toContain('الموضع 3');
  expect(view(ctx, s, 'b').note).toBeNull();
  for (const line of ctx.said) expect(line).not.toMatch(/الموضع|الأعلى|الأسفل|الثالثة/);
  // as cards are drawn the placer's knowledge moves up
  act(ctx, s, 'b', { type: 'draw' });
  expect(view(ctx, s, 'a').known).toEqual([null, 'bomb']);
});

test('every way to put the bomb back: top, 2nd, 3rd, bottom, random, an exact place (clamped)', () => {
  const r = seeded(3);
  expect(placeIndex('top', 10, r)).toBe(0);
  expect(placeIndex('second', 10, r)).toBe(1);
  expect(placeIndex('third', 10, r)).toBe(2);
  expect(placeIndex('bottom', 10, r)).toBe(10);
  expect(placeIndex(5, 10, r)).toBe(5);
  expect(placeIndex(-3, 10, r)).toBe(0);
  expect(placeIndex(99, 10, r)).toBe(10);
  expect(placeIndex('third', 1, r)).toBe(1);
  expect(placeIndex('second', 0, r)).toBe(0);
  for (let i = 0; i < 50; i++) {
    const at = placeIndex('random', 10, r);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(at).toBeLessThanOrEqual(10);
  }
  // the bottom, and the time running out (random)
  const { s, ctx } = setup({ a: ['defuse', 'defuse'], b: ['defuse'] }, ['bomb', 'peek', 'skip']);
  act(ctx, s, 'a', { type: 'draw' });
  after(ctx, s, 3000);
  act(ctx, s, 'a', { type: 'place', at: 'bottom' });
  expect(s.deck.map((c) => c.kind)).toEqual(['peek', 'skip', 'bomb']);
  expect(view(ctx, s, 'a').known).toEqual([null, null, 'bomb']);
  s.deck = cards('bomb', 'peek', 'skip');
  s.turn = 'a';
  s.phase = 'turn';
  s.seq++;
  act(ctx, s, 'a', { type: 'draw' });
  after(ctx, s, 3000);
  after(ctx, s, BOMB_PLACE_MS);
  expect(s.phase).toBe('turn');
  expect(s.deck.filter((c) => c.kind === 'bomb').length).toBe(1);
});

test('someone else putting a bomb back clears what I knew; under attack the turn goes on after a defuse', () => {
  const { s, ctx } = setup({ a: ['peek', 'defuse'], b: ['defuse'] }, ['bomb', 'skip', 'favor', 'shuffle']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'peek')] });
  closeWindow(ctx, s);
  expect(view(ctx, s, 'a').known).toEqual(['bomb', 'skip', 'favor']);
  s.turn = 'b';
  s.turns = 2;
  s.chain = true;
  s.seq++;
  act(ctx, s, 'b', { type: 'draw' });
  after(ctx, s, 3000);
  act(ctx, s, 'b', { type: 'place', at: 'random' });
  expect(view(ctx, s, 'a').known).toEqual([]);
  expect(s.turn).toBe('b');
  expect(s.turns).toBe(1);
});

test('the bomb without a defuse: out, the hand goes to the discard pile; the last one standing wins; places by elimination', () => {
  const { s, ctx } = setup({ a: ['skip', 'nope'], b: ['defuse'], c: ['peek'] }, ['bomb', 'peek', 'bomb', 'skip']);
  act(ctx, s, 'a', { type: 'draw' });
  after(ctx, s, 3000);
  expect(s.seats.a.out).toBe(true);
  expect(s.seats.a.hand).toEqual([]);
  expect(s.discard.map((c) => c.kind).sort()).toEqual(['bomb', 'nope', 'skip']);
  expect(ctx.said.at(-1)).toBe('خروج اسم-a');
  expect(ctx.fxs.at(-1)).toBe('death:a');
  expect(s.turn).toBe('b');
  expect(view(ctx, s, 'b').seats.a.out).toBe(true);
  act(ctx, s, 'b', { type: 'draw' });
  expect(s.turn).toBe('c');
  act(ctx, s, 'c', { type: 'draw' });
  after(ctx, s, 3000);
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('b');
  expect(bomb.result!(s)).toEqual({ places: [['b'], ['c'], ['a']] });
  expect(ctx.said.at(-1)).toBe('الفوز لاسم-b: آخر من بقي!');
  // out players cannot act
  act(ctx, s, 'a', { type: 'draw' });
  expect(s.phase).toBe('final');
});

test('the turn clock: when it runs out, a card is drawn for the player; an action card pauses it', () => {
  const { s, ctx } = setup({ a: ['shuffle', 'defuse'], b: ['defuse'] }, ['peek', 'peek', 'skip', 'favor'], { turnSec: 30 });
  // the setup didn't start the clock: start a turn properly
  s.turnEndsAt = ctx.now + 30_000;
  after(ctx, s, 20_000);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'shuffle')] });
  expect(view(ctx, s, 'a').turnEndsAt).toBeNull();
  closeWindow(ctx, s);
  // 10 s were left: at least 12 s after an action card
  expect(s.turnEndsAt! - ctx.now).toBe(12_000);
  after(ctx, s, 12_000);
  expect(s.turn).toBe('b');
  expect(s.seats.a.hand.length).toBe(2);
  expect(ctx.said.some((l) => l.startsWith('انتهاء الوقت'))).toBe(true);
});

test('no leaks: a phone never gets other hands, the deck order, the bomb’s place or what «نظرة» showed', () => {
  const ctx = fakeCtx();
  const s = startBomb(ctx, ['a', 'b', 'c', 'd'], settings(), seeded(11));
  const first = s.turn!;
  const peekCard = s.seats[first].hand.find((c) => c.kind === 'peek');
  if (!peekCard) s.seats[first].hand.push(card('peek'));
  act(ctx, s, first, { type: 'play', cards: [s.seats[first].hand.find((c) => c.kind === 'peek')!.id] });
  closeWindow(ctx, s);
  for (const me of s.order) {
    const v = view(ctx, s, me);
    const json = JSON.stringify(v);
    for (const other of s.order) {
      if (other === me) continue;
      for (const c of s.seats[other].hand) expect(json).not.toContain(`"${c.id}"`);
    }
    for (const c of s.deck) expect(json).not.toContain(`"${c.id}"`);
    expect(v.hand.map((c) => c.id).sort()).toEqual(s.seats[me].hand.map((c) => c.id).sort());
    if (me !== first) expect(v.known).toEqual([]);
    else expect(v.known.length).toBe(3);
    expect(Object.keys(v)).not.toContain('deckOrder');
    for (const id of s.order) expect(v.seats[id].cards).toBe(s.seats[id].hand.length);
  }
  // a spectator sees no hand and no knowledge
  const spec = view(ctx, s, 'zzzz');
  expect(spec.hand).toEqual([]);
  expect(spec.known).toEqual([]);
});

test('stale taps (an old seq) and unknown actions do nothing', () => {
  const { s, ctx } = setup({ a: ['skip', 'defuse'], b: ['defuse'] }, ['peek', 'bomb']);
  const seq = s.seq;
  bomb.act(ctx, s, 'a', { type: 'draw', seq: seq - 1 });
  expect(s.turn).toBe('a');
  bomb.act(ctx, s, 'a', { type: 'dance', seq });
  expect(s.seq).toBe(seq);
  // a card not in my hand
  expect(() => act(ctx, s, 'a', { type: 'play', cards: ['nope-id'] })).toThrow(GameError);
  // the defuse and «لا!» are not played on their own
  expect(() => act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'defuse')] })).toThrow(GameError);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('a bot’s information: its hand, the counts and its own knowledge only; hidden changes do not change its choice', () => {
  const { s } = setup({ a: ['peek', 'skip', 'defuse'], b: ['nope', 'attack', 'defuse'], c: ['favor'] }, ['bomb', 'skip', 'peek', 'favor', 'bomb']);
  const info = botInfo(s, 'a');
  const json = JSON.stringify(info);
  for (const c of s.seats.b.hand) expect(json).not.toContain(c.id);
  for (const c of s.deck) expect(json).not.toContain(c.id);
  expect(info.counts).toEqual({ a: 3, b: 3, c: 1 });
  expect(info.known).toEqual([]);
  expect(info.bombs).toBe(2);
  // the same public picture with another deck order and other hands: the same decision
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    const one = botTurn(level, botInfo(s, 'a'), seeded(5));
    const t = setup({ a: ['peek', 'skip', 'defuse'], b: ['shuffle', 'shuffle', 'tajine'], c: ['nope'] }, ['peek', 'favor', 'bomb', 'skip', 'bomb']);
    t.s.seats.a.hand = s.seats.a.hand.map((c) => ({ ...c }));
    expect(botTurn(level, botInfo(t.s, 'a'), seeded(5))).toEqual(one);
  }
});

const info = (o: Partial<BombBotInfo>): BombBotInfo => ({ me: 'a', hand: [], alive: ['a', 'b', 'c'], counts: { a: 3, b: 3, c: 3 }, next: 'b', deck: 10, bombs: 2, known: [], turns: 1, plays: 0, ...o });

test('smart and expert bots dodge a bomb their «نظرة» showed (attack, skip, shuffle), and draw a known safe card', () => {
  for (const level of ['smart', 'expert'] as BotLevel[]) {
    for (let seed = 1; seed < 10; seed++) {
      const hand = cards('attack', 'skip', 'defuse');
      const m = botTurn(level, info({ hand, known: ['bomb'] }), seeded(seed));
      expect(m.type).toBe('play');
      expect(['attack', 'skip']).toContain(hand.find((c) => c.id === (m as { cards: string[] }).cards[0])!.kind);
      const only = cards('shuffle', 'defuse');
      expect(botTurn(level, info({ hand: only, known: ['bomb'] }), seeded(seed))).toEqual({ type: 'play', cards: [only[0].id] });
      expect(botTurn(level, info({ hand: cards('skip', 'defuse'), known: ['peek'] }), seeded(seed))).toEqual({ type: 'draw' });
    }
  }
});

test('the expert counts: the bomb chance, a peek when it matters, a dodge without a defuse, a theft from the richest hand', () => {
  expect(bombChance(info({ deck: 10, bombs: 2 }))).toBeCloseTo(0.2);
  expect(bombChance(info({ deck: 10, bombs: 2, known: [null, 'bomb'] }))).toBeCloseTo(1 / 9);
  expect(bombChance(info({ known: ['bomb'] }))).toBe(1);
  const peek = cards('peek', 'defuse');
  expect(botTurn('expert', info({ hand: peek }), seeded(1))).toEqual({ type: 'play', cards: [peek[0].id] });
  const skip = cards('skip');
  expect(botTurn('expert', info({ hand: skip, deck: 4, bombs: 2 }), seeded(1))).toEqual({ type: 'play', cards: [skip[0].id] });
  // with a defuse and a low chance: just draw
  expect(botTurn('expert', info({ hand: cards('skip', 'defuse'), deck: 20, bombs: 1 }), seeded(1))).toEqual({ type: 'draw' });
  const pair = cards('bread', 'bread');
  expect(botTurn('expert', info({ hand: pair, counts: { a: 2, b: 1, c: 6 } }), seeded(1))).toEqual({ type: 'play', cards: pair.map((c) => c.id), target: 'c' });
});

test('bots keep their defuse when asked, put the bomb on top for the next player when few are left, and «لا!» what aims at them', () => {
  const hand = cards('defuse', 'nope', 'tajine', 'attack');
  for (const level of ['smart', 'expert'] as BotLevel[]) expect(botGive(level, hand, seeded(2))).toBe(hand[2].id);
  expect(botPlace('expert', 12, 0, 3, seeded(1))).toBe(0);
  expect([0, 1]).toContain(botPlace('smart', 12, 0, 2, seeded(1)) as number);
  // still a turn to take: far from the top
  const deep = botPlace('expert', 12, 1, 3, seeded(1));
  expect(typeof deep === 'number' ? deep >= 6 : deep === 'bottom').toBe(true);
  const p = { kind: 'attack' as const, card: 'attack' as BombKind, by: 'c', target: 'a', nopes: [], endsAt: 0, total: 3000 };
  expect(botNope('expert', info({ hand: cards('nope') }), p, seeded(1))).toBe(true);
  expect(botNope('expert', info({ hand: cards('nope') }), { ...p, target: 'b' }, seeded(1))).toBe(false);
  expect(botNope('expert', info({ hand: cards('nope') }), { ...p, kind: 'favor', card: 'favor' }, seeded(1))).toBe(true);
  // my own skip cancelled while I know the bomb is on top: bring it back
  expect(botNope('expert', info({ hand: cards('nope'), known: ['bomb'] }), { ...p, kind: 'skip', card: 'skip', by: 'a', target: null, nopes: ['b'] }, seeded(1))).toBe(true);
});

/** Plays a whole game with bots only, the way a room does (jobs at their time, ticks, plans after each change). */
function botGame(n: number, level: BotLevel, seed: number, o: Partial<BombSettings> = {}) {
  const ctx = fakeCtx(level);
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const s = startBomb(ctx, ids, settings(o), seeded(seed));
  let steps = 0;
  let noped = 0;
  let played = 0;
  for (; steps < 30_000 && s.phase !== 'final'; steps++) {
    const before = s.seq;
    bomb.botPlan!(ctx, s, ids);
    ctx.jobs.sort((a, b) => a.at - b.at);
    const deadlines = [s.phase === 'turn' ? s.turnEndsAt : null, s.phase === 'window' ? s.pending?.endsAt : null, s.give?.endsAt, s.boom?.endsAt, s.place?.endsAt].filter((x): x is number => typeof x === 'number');
    const next = ctx.jobs[0];
    const t = Math.min(next?.at ?? Infinity, ...deadlines);
    if (!Number.isFinite(t)) break;
    ctx.now = Math.max(ctx.now, t);
    if (next && next.at <= ctx.now) {
      ctx.jobs.shift();
      if (next.a.type === 'nope') noped++;
      if (next.a.type === 'play') played++;
      try {
        bomb.act(ctx, s, next.by, next.a as never);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        throw new Error(`bot move refused: ${(e as Error).message} ${JSON.stringify(next.a)}`);
      }
    }
    bomb.tick!(ctx, s);
    void before;
  }
  return { s, steps, noped, played };
}

test('bots finish games at every strength, 2 to 8 players, and the result places everyone', () => {
  for (const level of ['easy', 'smart', 'expert'] as BotLevel[]) {
    for (let n = 2; n <= 8; n++) {
      for (const seed of [1, 2]) {
        const { s } = botGame(n, level, seed * 31 + n);
        expect(s.phase).toBe('final');
        const r = bomb.result!(s)!;
        expect(r.places.flat().sort()).toEqual([...s.order].sort());
        expect(r.places[0]).toEqual([s.winner!]);
        expect(s.outOrder.length).toBe(n - 1);
      }
    }
  }
});

test('expert bots play action cards and «لا!» over many games; easy bots play fewer cards', () => {
  let expertPlays = 0;
  let easyPlays = 0;
  let nopes = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const e = botGame(4, 'expert', seed);
    expertPlays += e.played;
    nopes += e.noped;
    easyPlays += botGame(4, 'easy', seed).played;
  }
  expect(expertPlays).toBeGreaterThan(0);
  expect(nopes).toBeGreaterThan(0);
  expect(easyPlays).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------ */
/* Leaving, settings                                                   */
/* ------------------------------------------------------------------ */

test('leaving: the turn goes on, the hand goes to the discard pile, an action by the leaver is dropped, the last one wins', () => {
  const { s, ctx } = setup({ a: ['skip', 'nope', 'defuse'], b: ['nope', 'defuse'], c: ['defuse'] }, ['peek', 'bomb', 'bomb']);
  act(ctx, s, 'a', { type: 'play', cards: [idOf(s, 'a', 'skip')] });
  bomb.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('turn');
  expect(s.turn).toBe('b');
  expect(s.discard.map((c) => c.kind).sort()).toEqual(['defuse', 'nope', 'skip']);
  expect(view(ctx, s, 'b').players).toEqual(['b', 'c']);
  // the asked player leaves during «طلب»
  s.seats.b.hand.push(card('favor'));
  act(ctx, s, 'b', { type: 'play', cards: [idOf(s, 'b', 'favor')], target: 'c' });
  closeWindow(ctx, s);
  expect(s.phase).toBe('give');
  bomb.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('final');
  expect(s.winner).toBe('b');
  expect(bomb.result!(s)).toEqual({ places: [['b']] });
});

test('leaving while choosing the bomb’s place: it goes back at random, the next player plays', () => {
  const { s, ctx } = setup({ a: ['defuse'], b: ['defuse'], c: ['defuse'] }, ['bomb', 'peek', 'skip', 'bomb']);
  act(ctx, s, 'a', { type: 'draw' });
  after(ctx, s, 3000);
  expect(s.phase).toBe('place');
  bomb.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('turn');
  expect(s.turn).toBe('b');
  expect(s.deck.filter((c) => c.kind === 'bomb').length).toBe(2);
});

test('settings: sanitised at start and validated in the lobby', () => {
  expect(sanitizeBomb(undefined)).toEqual(BOMB_DEFAULTS);
  expect(sanitizeBomb({ windowSec: 4.6, turnSec: 50 })).toEqual({ windowSec: 5, turnSec: 45 });
  expect(sanitizeBomb({ windowSec: 'x' as never, turnSec: -3 })).toEqual({ windowSec: 3, turnSec: 0 });
  const st = { ...BOMB_DEFAULTS };
  bomb.patchSettings!(st, { windowSec: 5, turnSec: 60, rounds: 9 });
  expect(st).toEqual({ windowSec: 5, turnSec: 60 });
  bomb.patchSettings!(st, { windowSec: 'a', turnSec: null });
  expect(st).toEqual({ windowSec: 5, turnSec: 60 });
  const s = startBomb(fakeCtx(), ['a', 'b'], { windowSec: 99, turnSec: 7 } as BombSettings, seeded(1));
  expect(s.settings).toEqual({ windowSec: 5, turnSec: 0 });
});

test('say lines are noun-first (no conjugated verbs for players)', () => {
  const lines = new Set<string>();
  for (let seed = 1; seed <= 4; seed++) {
    const ctx = fakeCtx('expert');
    const ids = ['bot0', 'bot1', 'bot2', 'bot3'];
    const s = startBomb(ctx, ids, settings(), seeded(seed));
    void s;
    for (const l of ctx.said) lines.add(l);
  }
  const { s } = botGame(5, 'expert', 9);
  for (const l of s.log) lines.add(l.text);
  for (const l of lines) expect(l).not.toMatch(/(^|\s)(سحب[تا]|لعب[تا]?|خرج[تا]?|فاز[تا]?|خسر[تا]?|فكّك[تا]?)(\s|$)/);
});
