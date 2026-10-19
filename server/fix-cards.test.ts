/** Card games: announcements, ronda base, konkan discard rule, kdab stale calls. */
import { expect, test } from 'bun:test';

import type { Card, Suit } from '../src/shared/cards';
import type { KdabView, KonkanView, RondaView, TrisView } from '../src/shared/protocol';
import { kanza } from './games/kanza';
import { kdab } from './games/kdab';
import { konkan } from './games/konkan';
import { ronda } from './games/ronda';
import { tris } from './games/tris';

const c = (suit: Suit, rank: number): Card => ({ id: `${suit}-${rank}`, suit, rank });

interface Sched {
  by: string;
  key: string;
  delay: number;
  a: any;
}

function fakeCtx() {
  const fx: { kind: string; target?: string }[] = [];
  const sched: Sched[] = [];
  const ctx: any = {
    now: 0,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, key, delay, a }),
  };
  return { ctx, fx, sched };
}

/* ------------------------------------------------------------------ */
/* ronda                                                               */
/* ------------------------------------------------------------------ */

test('ronda: a روندا at the deal is announced in the view with a fresh id', () => {
  const { ctx } = fakeCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 41 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  s.hands = { [p]: [c('cups', 5)], [q]: [] };
  s.table = [];
  s.lastPlayed = null;
  const first = s.seats[(s.dealerIdx + 1) % 2];
  // first dealt player gets a pair of 3s, the other nothing special
  s.deck = [c('coins', 3), c('cups', 3), c('swords', 7), c('clubs', 12), c('coins', 1), c('cups', 2), c('swords', 4), c('clubs', 6)];
  const before = s.announce?.id ?? 0;
  const score = s.scores[first];
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-5' });
  const v = ronda.view(ctx, s, p) as RondaView;
  expect(v.announce).not.toBeNull();
  expect(v.announce!.id).toBeGreaterThan(before);
  expect(v.announce!.by).toBe(first);
  expect(v.announce!.text).toContain('روندا');
  expect(s.scores[first]).toBe(score + 1);
});

test('ronda: ميسا is announced, and a deal right after a capture does not cover its sound', () => {
  const { ctx, fx } = fakeCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 41 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  // capture the whole table with the last card in hand → ميسا, then the next deal happens
  s.hands = { [p]: [c('coins', 5)], [q]: [] };
  s.table = [c('cups', 5), c('cups', 6)];
  s.lastPlayed = null;
  s.deck = [c('coins', 1), c('cups', 2), c('swords', 4), c('clubs', 6), c('coins', 2), c('cups', 4), c('swords', 7), c('clubs', 11)];
  const before = s.announce?.id ?? 0;
  fx.length = 0;
  ronda.act(ctx, s, p, { type: 'play', card: 'coins-5' });
  expect(s.announce.id).toBe(before + 1);
  expect(s.announce.by).toBe(p);
  expect(s.announce.text).toContain('ميسا');
  expect(s.hands[p].length + s.hands[q].length).toBe(8); // the deal happened
  expect(fx.map((f) => f.kind)).not.toContain('card');
  expect(fx.at(-1)!.kind).toBe('reveal');
  // the view shows what was played and taken
  const v = ronda.view(ctx, s, q) as RondaView;
  expect(v.lastPlay!.by).toBe(p);
  expect(v.lastPlay!.took.map((x) => x.id).sort()).toEqual(['cups-5', 'cups-6']);
});

test('ronda: a drop pushes a feed line', () => {
  const { ctx } = fakeCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 41 });
  const p = s.seats[s.turnIdx];
  s.table = [];
  s.hands[p] = [c('cups', 5), ...s.hands[p].filter((x: Card) => x.id !== 'cups-5')].slice(0, 2);
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-5' });
  const feed = (ronda.view(ctx, s, p) as RondaView).feed;
  expect(feed.at(-1)!.text).toContain('رمى');
  expect(feed.at(-1)!.by).toBe(p);
});

test('ronda: the base is 20 with two sides and 13 with three, and the hand end uses it', () => {
  for (const [seats, base] of [[['a', 'b'], 20], [['a', 'b', 'c', 'd'], 20], [['a', 'b', 'c'], 13]] as const) {
    const { ctx } = fakeCtx();
    const s: any = ronda.start(ctx, [...seats], { target: 41 });
    expect((ronda.view(ctx, s, 'a') as RondaView).base).toBe(base);
  }
  const { ctx } = fakeCtx();
  const s: any = ronda.start(ctx, ['a', 'b', 'c'], { target: 41 });
  const p = s.seats[s.turnIdx];
  for (const id of s.seats) s.hands[id] = [];
  s.hands[p] = [c('cups', 5)];
  s.deck = [];
  s.table = [];
  s.lastCapturer = null;
  const filler = (['coins', 'swords', 'clubs', 'cups'] as Suit[]).flatMap((su) => [1, 2, 3, 4].map((r) => c(su, r)));
  s.captured[p] = filler.slice(0, 15);
  s.scores = { a: 0, b: 0, c: 0 };
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-5' });
  expect(s.phase).toBe('handEnd');
  expect(s.handSummary.find((r: any) => r.side === p).points).toBe(2); // 15 - 13
});

test('ronda / kanza: a solo winner is the target of the win sound', () => {
  const { ctx, fx } = fakeCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 41 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  s.scores = { a: 0, b: 0, [p]: 40 };
  s.hands = { [p]: [c('coins', 5)], [q]: [c('cups', 1)] };
  s.table = [c('cups', 5)];
  s.lastPlayed = null;
  ronda.act(ctx, s, p, { type: 'play', card: 'coins-5' }); // ميسا → 41
  expect(s.phase).toBe('final');
  expect(fx.at(-1)).toEqual({ kind: 'win', target: p });

  const k = fakeCtx();
  const ks: any = kanza.start(k.ctx, ['a', 'b'], { hands: 1 });
  for (const id of ks.seats) ks.hands[id] = [];
  const kp = ks.seats[ks.turnIdx];
  ks.hands[kp] = [c('coins', 5)];
  ks.table = [c('cups', 10)];
  ks.deck = [];
  ks.lastCapturer = null;
  for (const side of Object.keys(ks.captured)) ks.captured[side] = [];
  ks.captured[kp] = [c('coins', 1)];
  k.fx.length = 0;
  kanza.act(k.ctx, ks, kp, { type: 'play', card: 'coins-5', take: ['cups-10'] });
  expect(ks.phase).toBe('final');
  expect(ks.winner).toBe(kp);
  expect(k.fx.map((f) => f.kind)).not.toContain('card');
  expect(k.fx.at(-1)).toEqual({ kind: 'win', target: kp });

  // kanza: a capture followed by the next deal keeps the capture sound
  const k2 = fakeCtx();
  const s2: any = kanza.start(k2.ctx, ['a', 'b'], { hands: 3 });
  for (const id of s2.seats) s2.hands[id] = [];
  const p2 = s2.seats[s2.turnIdx];
  s2.hands[p2] = [c('coins', 5)];
  s2.table = [c('cups', 10), c('cups', 2)];
  k2.fx.length = 0;
  kanza.act(k2.ctx, s2, p2, { type: 'play', card: 'coins-5', take: ['cups-10'] });
  expect(s2.hands[p2].length).toBe(3); // dealt again
  expect(k2.fx.map((f) => f.kind)).toEqual(['correct']);
});

test('tris: the collected trick stays visible until the next one starts', () => {
  const { ctx } = fakeCtx();
  const s: any = tris.start(ctx, ['a', 'b', 'c', 'd'], { target: 41 });
  for (let k = 0; k < 4; k++) {
    const by = s.seats[s.turnIdx];
    const v = tris.view(ctx, s, by) as TrisView;
    tris.act(ctx, s, by, { type: 'play', card: v.playable[0] });
  }
  expect(s.phase).toBe('trickEnd');
  ctx.now += 5000;
  tris.tick!(ctx, s);
  const v = tris.view(ctx, s, 'a') as TrisView;
  expect(v.trick.length).toBe(0);
  expect(v.lastTrick!.cards.length).toBe(4);
  expect(v.lastTrick!.winner).toBe(v.turn);
});

/* ------------------------------------------------------------------ */
/* konkan                                                              */
/* ------------------------------------------------------------------ */

test('konkan: the card just taken from the discard pile cannot be thrown back', () => {
  const { ctx } = fakeCtx();
  const s: any = konkan.start(ctx, ['a', 'b'], { limit: 100 });
  const p = s.turn;
  const top = s.discard.at(-1);
  konkan.act(ctx, s, p, { type: 'drawDiscard' });
  expect((konkan.view(ctx, s, p) as KonkanView).takenDiscard).toBe(top.id);
  expect(() => konkan.act(ctx, s, p, { type: 'discard', card: top.id })).toThrow('لا يمكنك رمي الورقة التي أخذتها للتو');
  expect(s.hands[p].some((x: Card) => x.id === top.id)).toBe(true);
  expect(s.turn).toBe(p);
  const other = s.hands[p].find((x: Card) => x.id !== top.id);
  konkan.act(ctx, s, p, { type: 'discard', card: other.id });
  expect(s.turn).not.toBe(p);
  expect(s.takenDiscard).toBeNull();
  // a card drawn from the stock can be thrown straight away
  const q = s.turn;
  konkan.act(ctx, s, q, { type: 'drawStock' });
  const drawn = s.hands[q].at(-1);
  konkan.act(ctx, s, q, { type: 'discard', card: drawn.id });
  expect(s.discard.at(-1).id).toBe(drawn.id);
});

test('konkan: bots never try to discard the card they just took', () => {
  const { ctx, sched } = fakeCtx();
  const s: any = konkan.start(ctx, ['a', 'b'], { limit: 100 });
  const p = s.turn;
  // the taken card would otherwise be the obvious throw: high value, fits nothing
  s.hands[p] = [c('cups', 1), c('cups', 2), c('coins', 1), c('coins', 2), c('clubs', 12)];
  s.melds = [];
  s.step = 'play';
  s.takenDiscard = 'clubs-12';
  konkan.botPlan!(ctx, s, [p]);
  expect(sched.length).toBe(1);
  expect(sched[0].a.type).toBe('discard');
  expect(sched[0].a.card).not.toBe('clubs-12');

  // and whole bot games never hit the rule
  for (let g = 0; g < 20; g++) {
    const f = fakeCtx();
    const seats = ['a', 'b', 'c', 'd'].slice(0, 2 + (g % 3));
    const st: any = konkan.start(f.ctx, seats, { limit: 100 });
    for (let k = 0; k < 3000 && st.phase === 'play'; k++) {
      f.sched.length = 0;
      konkan.botPlan!(f.ctx, st, seats);
      expect(f.sched.length).toBe(1);
      const x = f.sched[0];
      konkan.act(f.ctx, st, x.by, x.a); // throws on a refused discard
    }
  }
});

/* ------------------------------------------------------------------ */
/* kdab                                                                */
/* ------------------------------------------------------------------ */

test('kdab: a call aimed at an older play is ignored; bots name the play they judged', () => {
  const { ctx, sched } = fakeCtx();
  const s: any = kdab.start(ctx, ['a', 'b', 'c'], { maxPlay: 4 });
  const [x, y, z] = s.order;
  // x holds all four 5s minus one, y claims a 5 that z could not possibly back up
  s.hands[x] = [c('cups', 1), c('cups', 2)];
  s.hands[y] = [c('coins', 6), c('cups', 6)];
  s.hands[z] = [c('coins', 5), c('cups', 5), c('swords', 5), c('clubs', 5), c('clubs', 6)];
  s.turnIdx = 0;
  kdab.act(ctx, s, x, { type: 'play', cards: ['cups-1'], rank: 5 });
  const firstId = s.last.id;
  // z, a bot, judges it: holding four 5s, the claim is impossible → it calls
  sched.length = 0;
  kdab.botPlan!(ctx, s, [z]);
  const call = sched.find((q) => q.by === z && q.a.type === 'call');
  expect(call).toBeDefined();
  expect(call!.a.play).toBe(firstId);
  // ...but y plays before the call lands
  kdab.act(ctx, s, y, { type: 'play', cards: ['coins-6'] });
  expect(s.last.id).not.toBe(firstId);
  const hands = JSON.stringify(s.hands);
  kdab.act(ctx, s, z, call!.a);
  expect(s.called).toBe(false);
  expect(s.reveal).toBeNull();
  expect(JSON.stringify(s.hands)).toBe(hands);
  // a call on the current play still works
  kdab.act(ctx, s, z, { type: 'call', play: s.last.id });
  expect(s.called).toBe(true);
  expect(s.reveal.player).toBe(y);
});

test('kdab: hands are sorted and bots take 1.5–2.5 s per turn', () => {
  const { ctx, sched } = fakeCtx();
  const s: any = kdab.start(ctx, ['a', 'b'], { maxPlay: 4 });
  const v = kdab.view(ctx, s, 'a') as KdabView;
  const key = (x: Card) => ['coins', 'cups', 'swords', 'clubs'].indexOf(x.suit) * 100 + [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].indexOf(x.rank);
  for (let i = 1; i < v.myHand.length; i++) expect(key(v.myHand[i])).toBeGreaterThan(key(v.myHand[i - 1]));
  for (let k = 0; k < 30; k++) {
    sched.length = 0;
    s.moves += 1;
    kdab.botPlan!(ctx, s, s.order);
    const turn = sched.find((q) => q.a.type !== 'call')!;
    expect(turn.delay).toBeGreaterThanOrEqual(1500);
    expect(turn.delay).toBeLessThanOrEqual(2500);
  }
});
