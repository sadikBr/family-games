/** «المراحل العشر»: rules, scoring, skips, bots playing whole games, players leaving. */
import { expect, test } from 'bun:test';

import { PHASE10_DEFAULTS, P10_PHASES, phaseLabel, type P10Card, type P10Color, type Phase10View } from '../src/shared/games/phase10';
import { arrangeGroup, canHit, cardPoints, deficit, fitsExactly, groupOk, makeP10Deck, phaseReqs, solvePhase, sortP10 } from '../src/shared/phase10-rules';
import { HAND_END_MS, botDiscard, botWantsTop, phase10, type State } from './games/phase10';

const n = (num: number, color: P10Color = 'orange', copy = 1): P10Card => ({ id: `${color}-${num}-${copy}`, kind: 'num', n: num, color });
const W = (i = 1): P10Card => ({ id: `wild-${i}`, kind: 'wild' });
const S = (i = 1): P10Card => ({ id: `skip-${i}`, kind: 'skip' });
const ids = (cs: P10Card[]) => cs.map((c) => c.id);

function fakeCtx(isBot: (id: string) => boolean = () => true) {
  const fx: { kind: string; target?: string }[] = [];
  const sched: { by: string; key: string; delay: number; a: any }[] = [];
  const ctx: any = {
    now: 1000,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: () => true,
    isBot,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, key, delay, a }),
  };
  return { ctx, fx, sched };
}

const totalCards = (s: State) =>
  s.stock.length + s.discard.length + Object.values(s.hands).reduce((t, h) => t + h.length, 0) + s.groups.reduce((t, g) => t + g.cards.length, 0);

/** A started game where it's `p`'s turn to play (already drew) with exactly this hand. */
function setup(players: string[], hand: P10Card[], opts: { step?: 'draw' | 'play' } = {}) {
  const f = fakeCtx(() => false);
  const s = phase10.start(f.ctx, players, { ...PHASE10_DEFAULTS });
  const p = s.turn;
  s.hands[p] = hand.slice();
  s.step = opts.step ?? 'play';
  return { ...f, s, p };
}

/* ------------------------------------------------------------------ */
/* cards and groups                                                    */
/* ------------------------------------------------------------------ */

test('deck: 108 cards — 96 numbers (1–12, four colours, twice), 8 wilds, 4 skips', () => {
  const d = makeP10Deck();
  expect(d.length).toBe(108);
  expect(new Set(ids(d)).size).toBe(108);
  expect(d.filter((c) => c.kind === 'wild').length).toBe(8);
  expect(d.filter((c) => c.kind === 'skip').length).toBe(4);
  for (const color of ['orange', 'purple', 'teal', 'pink']) {
    for (let k = 1; k <= 12; k++) expect(d.filter((c) => c.color === color && c.n === k).length).toBe(2);
  }
});

test('penalty points: 1–9 = 5, 10–12 = 10, skip = 15, wild = 25', () => {
  expect(cardPoints(n(1))).toBe(5);
  expect(cardPoints(n(9))).toBe(5);
  expect(cardPoints(n(10))).toBe(10);
  expect(cardPoints(n(12))).toBe(10);
  expect(cardPoints(S())).toBe(15);
  expect(cardPoints(W())).toBe(25);
});

test('groups: sets, runs and colours, with wilds but never all wilds or skips', () => {
  expect(groupOk('set', [n(7), n(7, 'teal'), n(7, 'pink')], 3)).toBe(true);
  expect(groupOk('set', [n(7), W(), W(2)], 3)).toBe(true);
  expect(groupOk('set', [W(), W(2), W(3)], 3)).toBe(false);
  expect(groupOk('set', [n(7), n(8), W()], 3)).toBe(false);
  expect(groupOk('set', [n(7), n(7, 'teal')], 3)).toBe(false); // too short
  expect(groupOk('set', [n(7), n(7, 'teal'), S()], 3)).toBe(false);
  // runs: any colours, consecutive, wilds fill gaps
  expect(groupOk('run', [n(3), n(4, 'teal'), n(5, 'pink'), n(6)], 4)).toBe(true);
  expect(groupOk('run', [n(3), W(), n(5, 'pink'), n(6)], 4)).toBe(true);
  expect(groupOk('run', [n(3), n(5), n(6), n(8)], 4)).toBe(false);
  expect(groupOk('run', [n(3), n(3, 'teal'), n(4), n(5)], 4)).toBe(false);
  expect(groupOk('run', [n(11), n(12), W(), W(2)], 4)).toBe(true); // 9 10 11 12
  const twelve = Array.from({ length: 12 }, (_, i) => n(i + 1));
  expect(groupOk('run', twelve, 9)).toBe(true);
  expect(groupOk('run', [...twelve, W()], 9)).toBe(false); // longer than 1–12
  // colour
  expect(groupOk('color', [n(1), n(4), n(4, 'orange', 2), n(9), n(12), W(), W(2)], 7)).toBe(true);
  expect(groupOk('color', [n(1), n(4), n(4, 'teal'), n(9), n(12), W(), W(2)], 7)).toBe(false);
  // hitting
  expect(canHit('run', [n(3), n(4), n(5), n(6)], [n(7, 'teal')])).toBe(true);
  expect(canHit('run', [n(3), n(4), n(5), n(6)], [n(9)])).toBe(false);
  expect(canHit('set', [n(5), n(5, 'teal'), n(5, 'pink')], [W()])).toBe(true);
  expect(canHit('set', [n(5), n(5, 'teal'), n(5, 'pink')], [S()])).toBe(false);
});

test('a run shows each wild where it counts', () => {
  const a = arrangeGroup('run', [n(6), W(), n(3), n(4)]);
  expect(a.map((x) => x.card.id)).toEqual(['orange-3-1', 'orange-4-1', 'wild-1', 'orange-6-1']);
  expect(a[2].value).toBe(5);
  const top = arrangeGroup('run', [n(12), W(), W(2), n(10)]);
  expect(top.map((x) => x.value ?? x.card.n)).toEqual([9, 10, 11, 12]);
});

test('the ten phases and their labels', () => {
  expect(P10_PHASES.length).toBe(10);
  expect(phaseLabel(1)).toBe('مجموعتان من 3');
  expect(phaseLabel(2)).toBe('مجموعة من 3 + متتالية من 4');
  expect(phaseLabel(8)).toBe('7 أوراق من لون واحد');
  expect(phaseLabel(10)).toBe('مجموعة من 5 + مجموعة من 3');
});

test('fitsExactly splits the selected cards into the phase groups', () => {
  const sel = [n(4), n(9), n(3, 'teal'), n(5), n(6), W(), n(9, 'pink'), n(9, 'teal')];
  const fit = fitsExactly(phaseReqs(2), sel);
  expect(fit).not.toBeNull();
  expect(groupOk('set', fit![0], 3) && groupOk('run', fit![1], 4)).toBe(true);
  expect(fitsExactly(phaseReqs(2), sel.slice(0, 6))).toBeNull();
  expect(fitsExactly(phaseReqs(4), [n(1), n(2), n(3), W(), n(5), n(6), n(7)])).not.toBeNull();
});

test('solvePhase finds the phase in a hand (fewest wilds) and deficit counts what is missing', () => {
  const hand = [n(7), n(7, 'teal'), n(7, 'pink'), n(2), n(2, 'teal'), W(), n(11), n(12), S(), n(5), n(9)];
  const sol = solvePhase(phaseReqs(1), hand)!;
  expect(sol.length).toBe(2);
  expect(sol.every((g) => groupOk('set', g, 3))).toBe(true);
  expect(sol.flat().filter((c) => c.kind === 'wild').length).toBe(1);
  expect(deficit(phaseReqs(1), hand)).toBe(0);
  expect(deficit(phaseReqs(1), hand.filter((c) => c.kind !== 'wild'))).toBe(1);
  expect(solvePhase(phaseReqs(4), hand)).toBeNull();
  expect(deficit(phaseReqs(4), [n(1), n(2), n(3), n(4), n(5), n(12), n(12, 'teal')])).toBe(2);
  // two sets of the same number are fine
  const sevens = [n(7), n(7, 'teal'), n(7, 'pink'), n(7, 'purple'), n(7, 'orange', 2), n(7, 'teal', 2)];
  expect(solvePhase(phaseReqs(1), sevens)).not.toBeNull();
  // phase 8: seven of one colour
  const purple = [1, 3, 5, 6, 8, 10].map((k) => n(k, 'purple'));
  expect(solvePhase(phaseReqs(8), [...purple, n(2, 'teal')])).toBeNull();
  expect(solvePhase(phaseReqs(8), [...purple, W()])).not.toBeNull();
});

test('sorting by number or by colour; wilds then skips last', () => {
  const h = [S(), n(5, 'teal'), W(), n(2, 'pink'), n(5, 'orange')];
  expect(ids(sortP10(h, 'number'))).toEqual(['pink-2-1', 'orange-5-1', 'teal-5-1', 'wild-1', 'skip-1']);
  expect(ids(sortP10(h, 'color'))).toEqual(['orange-5-1', 'teal-5-1', 'pink-2-1', 'wild-1', 'skip-1']);
});

/* ------------------------------------------------------------------ */
/* turns                                                               */
/* ------------------------------------------------------------------ */

test('start: 10 cards each, one face up, nobody laid; turnOf names the player up', () => {
  const { ctx } = fakeCtx();
  const s = phase10.start(ctx, ['a', 'b', 'c'], { short: false });
  for (const id of ['a', 'b', 'c']) expect(s.hands[id].length).toBe(10);
  expect(s.discard.length).toBe(1);
  expect(totalCards(s)).toBe(108);
  expect(s.phases).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(phase10.turnOf!(s)).toEqual([s.turn]);
  const v = phase10.view(ctx, s, 'a') as Phase10View;
  expect(v.myHand.length).toBe(10);
  expect(v.counts.b).toBe(10);
  const short = phase10.start(ctx, ['a', 'b'], { short: true });
  expect(short.phases).toEqual([2, 4, 6, 8, 10]);
});

test('patchSettings only accepts a boolean «short»', () => {
  const st = { ...PHASE10_DEFAULTS };
  phase10.patchSettings!(st, { short: 'yes', rounds: 4 });
  expect(st).toEqual({ short: false });
  phase10.patchSettings!(st, { short: true });
  expect(st.short).toBe(true);
});

test('draw: deck or face-up card, but never a skip from the discard pile; not out of turn', () => {
  const { ctx, s, p } = setup(['a', 'b'], [n(1), n(2)], { step: 'draw' });
  const other = s.seats.find((x) => x !== p)!;
  expect(() => phase10.act(ctx, s, other, { type: 'drawDeck' })).toThrow();
  s.discard.push(S());
  expect(() => phase10.act(ctx, s, p, { type: 'drawDiscard' })).toThrow();
  s.discard.push(n(9, 'teal'));
  phase10.act(ctx, s, p, { type: 'drawDiscard' });
  expect(s.hands[p].map((c) => c.id)).toContain('teal-9-1');
  expect(s.step).toBe('play');
  // a second draw does nothing
  phase10.act(ctx, s, p, { type: 'drawDeck' });
  expect(s.hands[p].length).toBe(3);
});

test('lay a phase, then hit; hitting before laying is refused', () => {
  const hand = [n(4), n(4, 'teal'), n(4, 'pink'), n(8), n(8, 'teal'), W(), n(3, 'purple'), n(9), n(10), n(12, 'teal'), n(2)];
  const { ctx, s, p, fx } = setup(['a', 'b'], hand);
  expect(() => phase10.act(ctx, s, p, { type: 'hit', group: 1, cards: ['orange-9-1'] })).toThrow();
  // wrong cards for phase 1
  expect(() => phase10.act(ctx, s, p, { type: 'lay', groups: [['orange-4-1', 'teal-4-1', 'orange-9-1'], ['orange-8-1', 'teal-8-1', 'wild-1']] })).toThrow();
  // cards not in hand / used twice
  expect(() => phase10.act(ctx, s, p, { type: 'lay', groups: [['orange-4-1', 'teal-4-1', 'pink-4-1'], ['orange-4-1', 'teal-8-1', 'wild-1']] })).toThrow();
  phase10.act(ctx, s, p, { type: 'lay', groups: [['orange-4-1', 'teal-4-1', 'pink-4-1'], ['orange-8-1', 'teal-8-1', 'wild-1']] });
  expect(s.laid).toEqual([p]);
  expect(s.groups.length).toBe(2);
  expect(s.groups.every((g) => g.kind === 'set')).toBe(true);
  expect(s.hands[p].length).toBe(5);
  expect(fx.at(-1)).toEqual({ kind: 'correct', target: p });
  expect(() => phase10.act(ctx, s, p, { type: 'lay', groups: [] })).toThrow(); // only once per hand
  expect(() => phase10.act(ctx, s, p, { type: 'hit', group: s.groups[0].id, cards: ['orange-9-1'] })).toThrow();
  // a group on the table belongs to everyone: add a 4 to the set of 4s
  s.hands[p].push(n(4, 'purple'));
  phase10.act(ctx, s, p, { type: 'hit', group: s.groups[0].id, cards: ['purple-4-1'] });
  expect(s.groups[0].cards.length).toBe(4);
});

test('the groups of a two-group phase may be sent in either order', () => {
  const hand = [n(6), n(6, 'teal'), n(6, 'pink'), n(1), n(2), n(3), n(4), n(11)];
  const { ctx, s, p } = setup(['a', 'b'], hand);
  s.progress[p] = 1; // phase 2: set of 3 + run of 4
  phase10.act(ctx, s, p, { type: 'lay', groups: [['orange-1-1', 'orange-2-1', 'orange-3-1', 'orange-4-1'], ['orange-6-1', 'teal-6-1', 'pink-6-1']] });
  expect(s.groups.map((g) => g.kind)).toEqual(['set', 'run']);
});

test('a skip makes the chosen player lose their next turn', () => {
  const { ctx, s, p, fx } = setup(['a', 'b', 'c'], [S(), n(5), n(6)]);
  const order = [p, ...[1, 2].map((k) => s.seats[(s.seats.indexOf(p) + k) % 3])];
  const [, second, third] = order;
  phase10.act(ctx, s, p, { type: 'discard', card: 'skip-1', target: second });
  expect(fx.at(-1)).toEqual({ kind: 'skip', target: second });
  expect(s.turn).toBe(third);
  expect(s.skipped).toEqual([]);
  expect(s.skipEvent).toEqual({ id: 1, by: p, target: second });
  // with two players, skipping the other gives you another turn
  const two = setup(['a', 'b'], [S(), n(5)]);
  phase10.act(two.ctx, two.s, two.p, { type: 'discard', card: 'skip-1' });
  expect(two.s.turn).toBe(two.p);
  expect(two.s.step).toBe('draw');
});

test('a skip on someone further round the table waits for their turn', () => {
  const { ctx, s, p } = setup(['a', 'b', 'c'], [S(), n(5), n(6)]);
  const second = s.seats[(s.seats.indexOf(p) + 1) % 3];
  const third = s.seats[(s.seats.indexOf(p) + 2) % 3];
  phase10.act(ctx, s, p, { type: 'discard', card: 'skip-1', target: third });
  expect(s.turn).toBe(second);
  expect(s.skipped).toEqual([third]);
  s.step = 'play';
  s.hands[second] = [n(1), n(2)];
  phase10.act(ctx, s, second, { type: 'discard', card: 'orange-1-1' });
  expect(s.turn).toBe(p); // third lost their turn
  expect(s.skipped).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* end of hand / game                                                  */
/* ------------------------------------------------------------------ */

test('hand end: whoever laid moves on, penalty points for cards left, next hand after the pause', () => {
  const { ctx, s, p, fx } = setup(['a', 'b', 'c'], [n(9)]);
  const [q, r] = s.seats.filter((x) => x !== p);
  s.laid = [p, q];
  s.hands[q] = [n(12), W()]; // 10 + 25
  s.hands[r] = [n(1), n(2), S()]; // 5 + 5 + 15
  phase10.act(ctx, s, p, { type: 'discard', card: 'orange-9-1' });
  expect(s.phase).toBe('handEnd');
  expect(s.handWinner).toBe(p);
  expect(s.scores).toEqual({ [p]: 0, [q]: 35, [r]: 25 });
  expect(s.progress).toEqual({ [p]: 1, [q]: 1, [r]: 0 });
  expect(fx.at(-1)!.kind).toBe('reveal');
  expect(phase10.turnOf!(s)).toEqual([]);
  const row = s.handSummary!.find((x) => x.id === r)!;
  expect(row).toMatchObject({ points: 25, phase: 1, done: false });
  // the pause: nothing until nextAt, then a fresh hand
  expect(phase10.tick!(ctx, s)).toBe(false);
  ctx.now += HAND_END_MS;
  expect(phase10.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('play');
  expect(s.hand).toBe(2);
  expect(s.laid).toEqual([]);
  expect(totalCards(s)).toBe(108);
  // the host can deal sooner
  s.phase = 'handEnd';
  phase10.act(ctx, s, 'a', { type: 'next' });
  expect(s.hand).toBe(3);
});

test('going out by hitting the last card ends the hand', () => {
  const { ctx, s, p } = setup(['a', 'b'], [n(7, 'teal')]);
  s.laid = [p];
  s.groups = [{ id: 1, owner: p, kind: 'set', cards: [n(7), n(7, 'pink'), W()] }];
  phase10.act(ctx, s, p, { type: 'hit', group: 1, cards: ['teal-7-1'] });
  expect(s.phase).toBe('handEnd');
  expect(s.handWinner).toBe(p);
});

test('final: the first to complete the last phase wins; same hand → fewest points', () => {
  const { ctx, s, p, fx } = setup(['a', 'b', 'c'], [n(3)]);
  const [q, r] = s.seats.filter((x) => x !== p);
  s.progress = { [p]: 9, [q]: 9, [r]: 4 };
  s.scores = { [p]: 80, [q]: 40, [r]: 0 };
  s.laid = [p, q];
  s.hands[q] = [n(2)]; // +5 → 45, still fewer than 80
  phase10.act(ctx, s, p, { type: 'discard', card: 'orange-3-1' });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(q);
  expect(fx.at(-1)).toEqual({ kind: 'win', target: q });
  expect(phase10.turnOf!(s)).toEqual([]);
});

test('short game: finishing phase 10 (the fifth phase) wins', () => {
  const f = fakeCtx(() => false);
  const s = phase10.start(f.ctx, ['a', 'b'], { short: true });
  const p = s.turn;
  s.step = 'play';
  s.progress[p] = 4;
  s.hands[p] = [n(5), n(5, 'teal'), n(5, 'pink'), n(5, 'purple'), W(), n(9), n(9, 'teal'), W(2), n(1)];
  phase10.act(f.ctx, s, p, { type: 'lay', groups: [['orange-5-1', 'teal-5-1', 'pink-5-1', 'purple-5-1', 'wild-1'], ['orange-9-1', 'teal-9-1', 'wild-2']] });
  phase10.act(f.ctx, s, p, { type: 'discard', card: 'orange-1-1' });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(p);
});

/* ------------------------------------------------------------------ */
/* bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: keep wilds, throw skips first, take a face-up card that helps', () => {
  const { s, p } = setup(['a', 'b'], [n(4), n(4, 'teal'), n(8), n(8, 'teal'), W(), n(1), n(12), n(10), n(6), n(2), n(11)]);
  const pick = botDiscard(s, p);
  expect(pick.kind).toBe('num');
  expect(['orange-4-1', 'teal-4-1', 'orange-8-1', 'teal-8-1']).not.toContain(pick.id);
  s.hands[p].push(S());
  expect(botDiscard(s, p).kind).toBe('skip');
  s.discard.push(n(4, 'pink'));
  expect(botWantsTop(s, p)).toBe(true);
  s.discard.push(n(3, 'pink'));
  expect(botWantsTop(s, p)).toBe(false);
  s.discard.push(W(3));
  expect(botWantsTop(s, p)).toBe(true);
  s.discard.push(S(2));
  expect(botWantsTop(s, p)).toBe(false);
});

test('bots: lay down when they can, then hit, and skip the leader', () => {
  const { ctx, s, p, sched } = setup(['a', 'b', 'c'], [n(4), n(4, 'teal'), n(4, 'pink'), n(8), n(8, 'teal'), n(8, 'pink'), n(8, 'purple'), S()]);
  ctx.isBot = () => true;
  phase10.botPlan!(ctx, s, s.seats);
  expect(sched.at(-1)!.a.type).toBe('lay');
  expect(sched.at(-1)!.delay).toBeGreaterThanOrEqual(1000);
  expect(sched.at(-1)!.delay).toBeLessThanOrEqual(2500);
  phase10.act(ctx, s, p, sched.at(-1)!.a);
  phase10.botPlan!(ctx, s, s.seats);
  expect(sched.at(-1)!.a.type).toBe('hit'); // the spare 8
  phase10.act(ctx, s, p, sched.at(-1)!.a);
  const [q, r] = s.seats.filter((x) => x !== p);
  s.progress[r] = 3;
  phase10.botPlan!(ctx, s, s.seats);
  expect(sched.at(-1)!.a).toEqual({ type: 'discard', card: 'skip-1', target: r });
  expect(q).toBeTruthy();
});

function playOut(players: number, short: boolean) {
  const { ctx, sched } = fakeCtx();
  const seats = Array.from({ length: players }, (_, i) => `p${i}`);
  const s = phase10.start(ctx, seats, { short });
  let steps = 0;
  let hands = 0;
  while (s.phase !== 'final' && steps < 60_000) {
    steps++;
    if (s.phase === 'handEnd') {
      hands++;
      ctx.now += HAND_END_MS;
      expect(phase10.tick!(ctx, s)).toBe(true);
      continue;
    }
    sched.length = 0;
    phase10.botPlan!(ctx, s, seats);
    expect(sched.length).toBe(1);
    const job = sched[0];
    expect(job.by).toBe(s.turn);
    ctx.now += job.delay;
    phase10.act(ctx, s, job.by, job.a);
    if (s.phase === 'play') expect(totalCards(s)).toBe(108);
    for (const g of s.groups) expect(groupOk(g.kind, g.cards, 1)).toBe(true);
  }
  return { s, steps, hands };
}

test('bots play whole games to the end, 2 to 6 players', () => {
  for (const players of [2, 3, 4, 5, 6]) {
    const { s } = playOut(players, players % 2 === 1);
    expect(s.phase).toBe('final');
    expect(s.winner).not.toBeNull();
    expect(s.progress[s.winner!]).toBe(s.phases.length);
  }
}, 120_000);

/* ------------------------------------------------------------------ */
/* leaving                                                             */
/* ------------------------------------------------------------------ */

test('onLeave: the leaver’s hand goes, their turn passes on; one player left ends the game', () => {
  const { ctx, fx } = fakeCtx(() => false);
  const s = phase10.start(ctx, ['a', 'b', 'c'], { short: false });
  const p = s.turn;
  const next = s.seats[(s.seats.indexOf(p) + 1) % 3];
  s.skipped = [p];
  phase10.onLeave!(ctx, s, p);
  expect(s.active).not.toContain(p);
  expect(s.hands[p]).toEqual([]);
  expect(s.skipped).toEqual([]);
  expect(s.turn).toBe(next);
  expect(s.step).toBe('draw');
  expect(s.phase).toBe('play');
  const v = phase10.view(ctx, s, next) as Phase10View;
  expect(v.active.length).toBe(2);
  // someone else leaves: only one remains → they win
  const other = s.active.find((x) => x !== next)!;
  phase10.onLeave!(ctx, s, other);
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(next);
  expect(fx.at(-1)).toEqual({ kind: 'win', target: next });
});

test('onLeave during the pause between hands keeps the game going', () => {
  const { ctx, s, p } = setup(['a', 'b', 'c'], [n(9)]);
  phase10.act(ctx, s, p, { type: 'discard', card: 'orange-9-1' });
  expect(s.phase).toBe('handEnd');
  const q = s.seats.find((x) => x !== p)!;
  phase10.onLeave!(ctx, s, q);
  ctx.now += HAND_END_MS;
  phase10.tick!(ctx, s);
  expect(s.phase).toBe('play');
  expect(s.hands[q]).toEqual([]);
  expect(s.active.includes(s.turn)).toBe(true);
  expect(totalCards(s)).toBe(108); // the new hand is dealt to the two who stayed
});
