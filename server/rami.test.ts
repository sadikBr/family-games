/** «الرامي»: deck, melds, first laydown (71 / ceiling / whole hand), discard rules, jokers, scoring, bots, leaving. */
import { expect, test } from 'bun:test';

import { RAMI_DEFAULTS, ramiVariantInfo, type RCard, type RSuit, type RamiSettings, type RamiView } from '../src/shared/games/rami';
import { addToMeld, arrange, checkLay, findLay, makeRamiDeck, ramiCardName, swapIndex } from '../src/shared/rami-rules';
import { botDiscard, botMove, discardBlock, rami, type State } from './games/rami';

let seq = 0;
const c = (rank: number, suit: RSuit): RCard => ({ id: `t${++seq}-${suit}-${rank}`, suit, rank });
const J = (): RCard => ({ id: `J-t${++seq}`, suit: null, rank: 0 });
const ids = (cs: RCard[]) => cs.map((x) => x.id);
const viewOf = (ctx: any, s: State, me: string) => rami.view(ctx, s, me) as RamiView;

function fakeCtx(isBot: (id: string) => boolean = () => true) {
  const fx: { kind: string; target?: string }[] = [];
  const said: { text: string; by?: string }[] = [];
  const sched: { by: string; key: string; delay: number; a: any }[] = [];
  const ctx: any = {
    now: 1000,
    fx: (kind: string, target?: string) => fx.push({ kind, target }),
    isConnected: () => true,
    isBot,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => sched.push({ by, key, delay, a }),
    say: (text: string, by?: string) => said.push({ text, by }),
  };
  return { ctx, fx, said, sched };
}

const totalCards = (s: State) =>
  s.stock.length + s.discard.length + Object.values(s.hands).reduce((t, h) => t + h.length, 0) + s.melds.reduce((t, m) => t + m.slots.length, 0);

/** A started game where it is the first player's turn in the play step with exactly this hand. */
function setup(hand: RCard[], settings: Partial<RamiSettings> = {}, players = ['p1', 'p2', 'p3']) {
  const f = fakeCtx(() => false);
  const s = rami.start(f.ctx, players, { ...RAMI_DEFAULTS, ...settings });
  const p = s.turn;
  s.hands[p] = hand.slice();
  s.step = 'play';
  return { ...f, s, p };
}

/* ------------------------------------------------------------------ */
/* cards and melds                                                     */
/* ------------------------------------------------------------------ */

test('deck: 108 cards — two French decks and 4 jokers', () => {
  const d = makeRamiDeck();
  expect(d.length).toBe(108);
  expect(new Set(ids(d)).size).toBe(108);
  expect(d.filter((x) => x.rank === 0).length).toBe(4);
  for (const s of ['S', 'H', 'D', 'C']) for (let r = 1; r <= 13; r++) expect(d.filter((x) => x.suit === s && x.rank === r).length).toBe(2);
  expect(ramiCardName(c(7, 'H'))).toBe('7 كور');
  expect(ramiCardName(c(12, 'S'))).toBe('ملكة بيك');
  expect(ramiCardName(J())).toBe('جوكر');
});

test('sets (تيرسي): 3–4 of a rank in different suits, at most one joker', () => {
  expect(arrange([c(7, 'S'), c(7, 'H'), c(7, 'D')])?.kind).toBe('set');
  expect(arrange([c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C')])?.value).toBe(28);
  expect(arrange([c(7, 'S'), c(7, 'S'), c(7, 'D')])).toBeNull(); // same suit twice (two decks)
  expect(arrange([c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C'), c(7, 'C')])).toBeNull();
  const withJoker = arrange([c(7, 'S'), c(7, 'H'), J()])!;
  expect(withJoker.kind).toBe('set');
  expect(withJoker.frank).toBe(false);
  expect(withJoker.value).toBe(0);
  expect(arrange([c(7, 'S'), J(), J()])).toBeNull(); // one joker per meld
  expect(arrange([c(12, 'S'), c(12, 'H'), c(12, 'D')])?.value).toBe(30);
  expect(arrange([c(1, 'S'), c(1, 'H'), c(1, 'D')])?.value).toBe(30); // aces in a set: 10 each
});

test('runs (سويفي): 3+ in a row of one suit, ace low or high but never both', () => {
  expect(arrange([c(5, 'H'), c(6, 'H'), c(7, 'H')])?.value).toBe(18);
  expect(arrange([c(1, 'H'), c(2, 'H'), c(3, 'H')])?.value).toBe(6); // low ace = 1
  expect(arrange([c(12, 'H'), c(13, 'H'), c(1, 'H')])?.value).toBe(30); // high ace = 10
  expect(arrange([c(13, 'H'), c(1, 'H'), c(2, 'H')])).toBeNull(); // K-A-2
  expect(arrange([c(5, 'H'), c(6, 'S'), c(7, 'H')])).toBeNull();
  expect(arrange([c(5, 'H'), c(7, 'H'), c(8, 'H')])).toBeNull();
  const gap = arrange([c(5, 'H'), J(), c(7, 'H')])!;
  expect(gap.slots.map((x) => x.rank)).toEqual([5, 6, 7]);
  const end = arrange([c(5, 'H'), c(6, 'H'), J()])!;
  expect(end.slots.map((x) => x.rank)).toEqual([5, 6, 7]); // a joker with no gap goes on top
  const top = arrange([c(13, 'H'), c(1, 'H'), J()])!;
  expect(top.slots.map((x) => x.rank)).toEqual([12, 13, 14]); // …or below when the top is the ace
});

test('adding to melds and swapping a joker back', () => {
  const run = { kind: 'run' as const, slots: arrange([c(5, 'H'), J(), c(7, 'H')])!.slots };
  expect(addToMeld(run, [c(8, 'H')])?.map((x) => x.rank)).toEqual([5, 6, 7, 8]);
  expect(addToMeld(run, [c(4, 'H'), c(3, 'H')])?.map((x) => x.rank)).toEqual([3, 4, 5, 6, 7]);
  expect(addToMeld(run, [c(9, 'H')])).toBeNull(); // would leave a hole
  expect(addToMeld(run, [J()])).toBeNull(); // already has its joker
  expect(swapIndex(run, c(6, 'H'))).toBe(1);
  expect(swapIndex(run, c(6, 'S'))).toBe(-1);
  const set3 = { kind: 'set' as const, slots: arrange([c(9, 'S'), c(9, 'H'), J()])!.slots };
  expect(swapIndex(set3, c(9, 'D'))).toBe(2);
  expect(swapIndex(set3, c(9, 'C'))).toBe(2);
  expect(swapIndex(set3, c(9, 'S'))).toBe(-1);
  const set4 = addToMeld(set3, [c(9, 'D')])!;
  expect(set4[3].suit).toBe('C'); // the joker now stands for the one missing suit
  expect(swapIndex({ kind: 'set', slots: set4 }, c(9, 'C'))).toBe(3);
  expect(addToMeld({ kind: 'set', slots: set4 }, [c(9, 'C')])).toBeNull(); // five is too many
});

test('laydown check: frank value, frank set and frank run', () => {
  const chk = checkLay([[c(10, 'S'), c(10, 'H'), c(10, 'D')], [c(11, 'C'), c(12, 'C'), c(13, 'C')], [c(4, 'D'), c(5, 'D'), J()]])!;
  expect(chk.value).toBe(60);
  expect(chk.frankSet && chk.frankRun).toBe(true);
});

test('solver: finds a 71 laydown with a frank set and a frank run, or going out', () => {
  const hand = [c(10, 'S'), c(10, 'H'), c(10, 'D'), c(11, 'C'), c(12, 'C'), c(13, 'C'), c(8, 'H'), c(9, 'H'), c(10, 'H'), c(2, 'S'), c(4, 'D'), c(6, 'C'), c(8, 'S'), c(3, 'H')];
  const lay = findLay(hand, { opened: false, need: 71 })!;
  expect(lay).not.toBeNull();
  const chk = checkLay(lay)!;
  expect(chk.value).toBeGreaterThanOrEqual(71);
  expect(chk.frankSet && chk.frankRun).toBe(true);
  expect(findLay(hand, { opened: false, need: 90 })).toBeNull();
  // no frank run: no first laydown however many points
  const noRun = [c(10, 'S'), c(10, 'H'), c(10, 'D'), c(13, 'S'), c(13, 'H'), c(13, 'D'), c(12, 'S'), c(12, 'H'), c(12, 'D'), c(2, 'C')];
  expect(findLay(noRun, { opened: false, need: 71 })).toBeNull();
  // the card that must go down is in the laydown
  const must = hand[6];
  const withMust = findLay(hand, { opened: false, need: 71, mustInclude: must.id })!;
  expect(withMust.flat().some((x) => x.id === must.id)).toBe(true);
  // سامبل: only going out counts
  const out = [c(3, 'S'), c(3, 'H'), c(3, 'D'), c(5, 'C'), c(6, 'C'), c(7, 'C'), c(9, 'H'), c(10, 'H'), J(), c(12, 'S'), c(12, 'D'), c(12, 'C'), c(8, 'C'), c(2, 'D')];
  const sample = findLay(out, { opened: false, need: Infinity })!;
  expect(sample.flat().length).toBeGreaterThanOrEqual(13);
});

/* ------------------------------------------------------------------ */
/* the game                                                            */
/* ------------------------------------------------------------------ */

test('deal: 14 each and 15 for the first player (سامبل 13 / 14); the first player starts without drawing', () => {
  const f = fakeCtx(() => false);
  const s = rami.start(f.ctx, ['a', 'b', 'c', 'd'], { ...RAMI_DEFAULTS });
  expect(s.hands[s.turn].length).toBe(15);
  for (const id of ['a', 'b', 'c', 'd'].filter((x) => x !== s.turn)) expect(s.hands[id].length).toBe(14);
  expect(s.step).toBe('play');
  expect(s.discard.length).toBe(0);
  expect(totalCards(s)).toBe(108);
  const s2 = rami.start(f.ctx, ['a', 'b'], { ...RAMI_DEFAULTS, variant: 'sample' });
  expect(s2.hands[s2.turn].length).toBe(14);
  expect(Object.values(s2.hands).reduce((t, h) => t + h.length, 0)).toBe(27);
  expect(f.said[0].text).toContain('الجولة 1');
});

test('the discard pile: not in the table\'s first round, not with one card, and (التلّاج) only if it can go down', () => {
  const { ctx, s, p } = setup([c(2, 'S'), c(9, 'D'), c(4, 'C')]);
  rami.act(ctx, s, p, { type: 'discard', card: s.hands[p][0].id });
  const p2 = s.turn;
  expect(discardBlock(s, p2)).toBe('لا تُؤخذ المرمية في الدورة الأولى');
  expect(() => rami.act(ctx, s, p2, { type: 'drawDiscard' })).toThrow();
  // after everyone has played once
  s.turnsDone = 3;
  s.hands[p2] = [c(5, 'H'), c(7, 'H')];
  s.openings[p2] = 71;
  s.discard = [c(6, 'H')];
  s.throwers = [p];
  expect(discardBlock(s, p2)).toBeNull(); // 5-6-7 can go down
  s.hands[p2] = [c(5, 'H')];
  expect(discardBlock(s, p2)).toContain('ورقة واحدة');
  s.hands[p2] = [c(5, 'H'), c(9, 'C')];
  expect(discardBlock(s, p2)).toContain('لا يمكنك تنزيل');
  // سامبل: no need to lay it down
  s.settings.variant = 'sample';
  expect(discardBlock(s, p2)).toBeNull();
});

test('a card taken from the discard (التلّاج) must go down before discarding; else the round is lost', () => {
  const { ctx, s, p, said } = setup([c(2, 'S')]);
  s.turnsDone = 3;
  s.step = 'draw';
  s.openings[p] = 71;
  s.hands[p] = [c(5, 'H'), c(7, 'H'), c(2, 'C'), c(9, 'S')];
  const six = c(6, 'H');
  s.discard = [six];
  s.throwers = ['p2'];
  rami.act(ctx, s, p, { type: 'drawDiscard' });
  expect(viewOf(ctx, s, p).mustUse).toBe(true);
  expect(() => rami.act(ctx, s, p, { type: 'discard', card: s.hands[p].find((x) => x.rank === 2)!.id })).toThrow();
  rami.act(ctx, s, p, { type: 'forfeit' });
  expect(s.phase).toBe('roundEnd');
  expect(s.forfeit).toBe(p);
  expect(s.scores[p]).toBe(100);
  for (const id of s.active.filter((x) => x !== p)) expect(s.scores[id]).toBe(0);
  expect(said.at(-1)!.text).toContain('خسارة الجولة');
});

test('first laydown: 71 from frank melds, frank set + frank run; the ceiling rises', () => {
  const set = [c(10, 'S'), c(10, 'H'), c(10, 'D')];
  const run = [c(11, 'C'), c(12, 'C'), c(13, 'C')];
  const run2 = [c(7, 'H'), c(8, 'H'), c(9, 'H')];
  const jokerRun = [c(4, 'D'), c(5, 'D'), J()];
  const rest = [c(2, 'S'), c(4, 'C'), c(6, 'S')];
  const { ctx, s, p } = setup([...set, ...run, ...run2, ...jokerRun, ...rest]);
  // 30 + 30 = 60 (the joker run counts nothing): too low
  expect(() => rami.act(ctx, s, p, { type: 'lay', groups: [ids(set), ids(run), ids(jokerRun)] })).toThrow(/71/);
  // no frank run
  expect(() => rami.act(ctx, s, p, { type: 'lay', groups: [ids(set), ids(jokerRun)] })).toThrow(/فرانك/);
  rami.act(ctx, s, p, { type: 'lay', groups: [ids(set), ids(run), ids(run2), ids(jokerRun)] });
  expect(s.openings[p]).toBe(84);
  expect(s.melds.length).toBe(4);
  expect(s.hands[p].length).toBe(3);
  // the next first laydown must beat 84
  const p2 = 'p2' === p ? 'p3' : 'p2';
  expect(viewOf(ctx, s, p2).need).toBe(85);
  s.settings.ceiling = false;
  expect(viewOf(ctx, s, p2).need).toBe(71);
  s.settings.ceiling = true;
  s.settings.open = 51;
  expect(viewOf(ctx, s, p2).need).toBe(85);
});

test('the whole hand at once needs no 71 — and it is a «رامي سيك»: 200 for those not down, double for those down', () => {
  const hand = [c(2, 'S'), c(2, 'H'), c(2, 'D'), c(3, 'C'), c(4, 'C'), c(5, 'C'), c(6, 'H'), c(7, 'H'), c(8, 'H'), c(9, 'D'), c(9, 'S'), c(9, 'C'), J(), c(13, 'S'), c(13, 'H')];
  const { ctx, s, p, fx } = setup(hand, {}, ['p1', 'p2', 'p3']);
  const [a, b] = ['p1', 'p2', 'p3'].filter((x) => x !== p);
  s.openings[a] = 75;
  s.hands[a] = [c(5, 'S'), J()];
  s.hands[b] = [c(5, 'S'), c(6, 'S'), c(7, 'D')];
  const groups = [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9), hand.slice(9, 12), [hand[12], hand[13], hand[14]]];
  rami.act(ctx, s, p, { type: 'lay', groups: groups.map(ids) });
  expect(s.phase).toBe('roundEnd');
  expect(s.roundWinner).toBe(p);
  expect(s.sec).toBe(true);
  expect(s.scores[a]).toBe(60); // (10 + 20) × 2
  expect(s.scores[b]).toBe(200);
  expect(s.scores[p]).toBe(0);
  expect(fx.some((x) => x.kind === 'reveal')).toBe(true);
});

test('normal «رامي»: 10 a card, 20 a joker, 100 for those not down; going out by discarding the last card', () => {
  const { ctx, s, p } = setup([c(9, 'S')]);
  const [a, b] = ['p1', 'p2', 'p3'].filter((x) => x !== p);
  s.openings[p] = 71;
  s.openedTurn[p] = 0;
  s.openings[a] = 80;
  s.hands[a] = [c(5, 'S'), J(), c(8, 'D')];
  s.hands[b] = [c(5, 'S')];
  rami.act(ctx, s, p, { type: 'discard', card: s.hands[p][0].id });
  expect(s.roundWinner).toBe(p);
  expect(s.sec).toBe(false);
  expect(s.scores[a]).toBe(40);
  expect(s.scores[b]).toBe(100);
  expect(s.history.length).toBe(1);
});

test('adding to any meld and swapping a joker only once down', () => {
  const { ctx, s, p } = setup([c(6, 'H'), c(8, 'H'), c(2, 'C'), c(3, 'D')]);
  s.melds = [{ id: 1, owner: 'p9', kind: 'run', slots: arrange([c(5, 'H'), J(), c(7, 'H')])!.slots }];
  s.meldSeq = 1;
  const six = s.hands[p][0];
  expect(() => rami.act(ctx, s, p, { type: 'swap', meld: 1, card: six.id })).toThrow(/انزل/);
  s.openings[p] = 71;
  rami.act(ctx, s, p, { type: 'swap', meld: 1, card: six.id });
  expect(s.hands[p].some((x) => x.rank === 0)).toBe(true);
  expect(s.melds[0].slots.every((x) => x.card.rank !== 0)).toBe(true);
  rami.act(ctx, s, p, { type: 'add', meld: 1, cards: [s.hands[p].find((x) => x.rank === 8)!.id] });
  expect(s.melds[0].slots.map((x) => x.rank)).toEqual([5, 6, 7, 8]);
  expect(s.lastMelds?.ids).toEqual([1]);
});

test('سامبل: no laydown unless it empties the hand (one card may be left to throw); losers pay 100', () => {
  const hand = [c(3, 'S'), c(3, 'H'), c(3, 'D'), c(5, 'C'), c(6, 'C'), c(7, 'C'), c(9, 'H'), c(10, 'H'), c(11, 'H'), c(12, 'S'), c(12, 'D'), c(12, 'C'), c(1, 'H'), c(2, 'D')];
  const { ctx, s, p } = setup(hand, { variant: 'sample' });
  expect(() => rami.act(ctx, s, p, { type: 'lay', groups: [ids(hand.slice(0, 3)), ids(hand.slice(3, 6))] })).toThrow(/سامبل/);
  const groups = [hand.slice(0, 3), hand.slice(3, 6), hand.slice(6, 9), hand.slice(9, 12)].map(ids);
  // 12 down, two left: not yet
  expect(() => rami.act(ctx, s, p, { type: 'lay', groups })).toThrow();
  s.hands[p] = hand.slice(0, 13);
  rami.act(ctx, s, p, { type: 'lay', groups });
  expect(s.phase).toBe('play');
  rami.act(ctx, s, p, { type: 'discard', card: hand[12].id });
  expect(s.phase).toBe('roundEnd');
  for (const id of s.active.filter((x) => x !== p)) expect(s.scores[id]).toBe(100);
});

test('the game ends when someone reaches the limit; the lowest total wins', () => {
  const { ctx, s, p, fx } = setup([c(9, 'S')]);
  const [a, b] = ['p1', 'p2', 'p3'].filter((x) => x !== p);
  s.scores[a] = 950;
  s.scores[b] = 250;
  s.scores[p] = 400;
  s.openings[p] = 71;
  rami.act(ctx, s, p, { type: 'discard', card: s.hands[p][0].id });
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(b);
  expect(fx.at(-1)).toEqual({ kind: 'win', target: b });
  expect(rami.result!(s)!.places).toEqual([[b], [p], [a]]);
});

test('the round ends when the stock runs out for the third time', () => {
  const { ctx, s, p } = setup([c(9, 'S'), c(3, 'D')]);
  s.step = 'draw';
  s.stock = [];
  s.reshuffles = 2;
  s.discard = [c(4, 'C'), c(5, 'C')];
  rami.act(ctx, s, p, { type: 'drawStock' });
  expect(s.phase).toBe('roundEnd');
  expect(s.roundWinner).toBeNull();
});

test('the turn timer plays the turn: draws and throws a card', () => {
  const f = fakeCtx(() => false);
  const s = rami.start(f.ctx, ['a', 'b'], { ...RAMI_DEFAULTS, timer: 60 });
  const first = s.turn;
  expect(s.deadline).toBe(1000 + 60_000);
  f.ctx.now = 1000 + 60_001;
  expect(rami.tick!(f.ctx, s)).toBe(true);
  expect(s.turn).not.toBe(first);
  expect(s.hands[first].length).toBe(14);
  f.ctx.now += 60_001;
  rami.tick!(f.ctx, s);
  expect(s.turn).toBe(first);
  expect(totalCards(s)).toBe(108);
});

test('bots: never throw a joker, take the taken card down, and settings are validated', () => {
  const { s, p } = setup([J(), c(2, 'S'), c(13, 'D'), c(13, 'S')]);
  expect(botDiscard(s, p).rank).not.toBe(0);
  expect(botDiscard(s, p).rank).toBe(2);
  s.openings[p] = 71;
  s.taken = s.hands[p][1].id;
  s.melds = [{ id: 3, owner: p, kind: 'run', slots: arrange([c(3, 'S'), c(4, 'S'), c(5, 'S')])!.slots }];
  s.hands[p][1] = { id: s.taken, suit: 'S', rank: 6 };
  expect(botMove(s, p)).toEqual({ type: 'add', meld: 3, cards: [s.taken] });
  const set: RamiSettings = { ...RAMI_DEFAULTS };
  rami.patchSettings!(set, { variant: 'sample', open: 51, ceiling: false, limit: 500, timer: 90 });
  expect(set).toEqual({ variant: 'sample', open: 51, ceiling: false, limit: 500, timer: 90 });
  rami.patchSettings!(set, { variant: 'x', open: 60, limit: 2, timer: 7, ceiling: 'yes' });
  expect(set).toEqual({ variant: 'sample', open: 51, ceiling: false, limit: 500, timer: 90 });
  expect(ramiVariantInfo(RAMI_DEFAULTS)).toBeNull();
  expect(ramiVariantInfo({ ...RAMI_DEFAULTS, open: 51 })!.howTo.join(' ')).toContain('51');
  expect(ramiVariantInfo({ ...RAMI_DEFAULTS, variant: 'sample' })!.howTo.join(' ')).toContain('سامبل');
});

/** Bot-only game, fake clock: every scheduled move is played in order until the end. */
function playOut(players: string[], settings: Partial<RamiSettings>, maxSteps = 40000) {
  const f = fakeCtx(() => true);
  const s = rami.start(f.ctx, players, { ...RAMI_DEFAULTS, ...settings });
  let rounds = 0;
  for (let i = 0; i < maxSteps && s.phase !== 'final'; i++) {
    expect(totalCards(s)).toBe(108);
    if (s.phase === 'roundEnd') {
      rounds += 1;
      rami.act(f.ctx, s, players[0], { type: 'next' });
      continue;
    }
    f.sched.length = 0;
    rami.botPlan!(f.ctx, s, players);
    const job = f.sched[0];
    expect(job).toBeDefined();
    f.ctx.now += job.delay;
    rami.act(f.ctx, s, job.by, job.a);
  }
  return { s, rounds, said: f.said };
}

test('bots play whole games of التلّاج (2 and 4 players) to the end', () => {
  for (const players of [['b1', 'b2'], ['b1', 'b2', 'b3', 'b4']]) {
    const { s, rounds } = playOut(players, { limit: 500 });
    expect(s.phase).toBe('final');
    expect(s.winner).not.toBeNull();
    expect(rounds).toBeGreaterThan(0);
    expect(rami.result!(s)!.places.flat().sort()).toEqual(players.slice().sort());
  }
});

test('bots play a whole game of سامبل (3 players), and of التلّاج with 6 players at 51 without the ceiling', () => {
  const a = playOut(['b1', 'b2', 'b3'], { variant: 'sample', limit: 500 });
  expect(a.s.phase).toBe('final');
  const b = playOut(['b1', 'b2', 'b3', 'b4', 'b5', 'b6'], { open: 51, ceiling: false, limit: 500 });
  expect(b.s.phase).toBe('final');
});

test('announcements are noun-first and never conjugate a verb for a player', () => {
  const { said } = playOut(['b1', 'b2'], { limit: 500 });
  expect(said.length).toBeGreaterThan(20);
  const verbs = /(^|\s)(سحبت|رمت|أخذت|نزّلت|أضافت|خرجت|ربحت|سحب|رمى|أخذ|نزّل|أضاف|خرج|ربح) [^:]*b\d/;
  for (const x of said) {
    expect(x.text.length).toBeLessThan(70);
    expect(verbs.test(x.text)).toBe(false);
  }
});

test('a player leaving: their turn passes on; the last one left wins', () => {
  const f = fakeCtx(() => false);
  const s = rami.start(f.ctx, ['a', 'b', 'c'], { ...RAMI_DEFAULTS });
  const first = s.turn;
  rami.onLeave!(f.ctx, s, first);
  expect(s.active).not.toContain(first);
  expect(s.turn).not.toBe(first);
  expect(s.step).toBe('draw');
  const next = s.turn;
  rami.onLeave!(f.ctx, s, next);
  expect(s.phase).toBe('final');
  expect(s.winner).toBe(s.active[0]);
  expect(rami.result!(s)!.places).toEqual([[s.active[0]]]);
});
