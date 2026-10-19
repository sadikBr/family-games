/**
 * «قراءة الأحداث بصوت» — the big moments of the card games carry a short call (Said.voice) on the
 * say that reaches the phones (the LAST say of a move), and ordinary card plays carry none.
 */
import { expect, test } from 'bun:test';

import type { Card, Suit } from '../src/shared/cards';
import type { BCard, BRank, BSuit } from '../src/shared/games/baloot';
import { TOUTI_DEFAULTS } from '../src/shared/games/touti';
import { HEZ2_DEFAULTS } from '../src/shared/games/hez2';
import { makeBalootDeck } from '../src/shared/baloot-rules';
import { baloot, playable as balootPlayable, type State as BalootState } from './games/baloot';
import { hez2 } from './games/hez2';
import { ronda } from './games/ronda';
import { touti, type State as ToutiState } from './games/touti';
import { unoflip } from './games/unoflip';
import {
  B_SUIT_VOICE,
  B_SUIT_VOICE_MA,
  SUIT_VOICE,
  VOICE,
  voiceBid,
  voiceHez,
  voiceHokm,
  voiceTrump,
} from './voice-calls';

type Said = { text: string; by?: string; voice?: string };

/** A context that records every say (the last one of a move is what the phones get). */
function fakeCtx() {
  const said: Said[] = [];
  const ctx: any = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
    say: (text: string, by?: string, voice?: string) => said.push({ text, by, ...(voice ? { voice } : {}) }),
    botLevel: () => 'easy',
  };
  return { ctx, said };
}

const last = (said: Said[]) => said[said.length - 1];

/* —— the dictionary ————————————————————————————————————————————————————————————— */

test('voice: every call is Arabic letters with vowel marks, at most 4 words and 30 characters', () => {
  const calls = [
    ...Object.values(VOICE),
    ...Object.values(SUIT_VOICE),
    ...Object.values(B_SUIT_VOICE),
    ...Object.values(B_SUIT_VOICE_MA),
    ...Object.values(SUIT_VOICE).map(voiceTrump),
    ...(['S', 'H', 'D', 'C'] as BSuit[]).map(voiceHokm),
    ...[70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220, 230].map(voiceBid),
    ...[2, 4, 6, 8].map(voiceHez),
  ];
  for (const v of calls) {
    expect(v).toMatch(/^[ء-غف-يً-ْ]+( [ء-غف-يً-ْ]+)*$/);
    expect(v).toMatch(/[ً-ْ]/); // vowelled
    expect(v.length).toBeLessThanOrEqual(30);
    expect(v.split(' ').length).toBeLessThanOrEqual(4);
  }
  expect(voiceBid(70)).toBe('سَبْعِينْ');
  expect(voiceBid(120)).toBe('مْيَة وْعِشْرِينْ');
  expect(voiceBid(200)).toBe('مِيتِينْ');
  expect(voiceHez(4)).toBe('هَزّْ رْبْعَة');
});

/* —— روندا ———————————————————————————————————————————————————————————————————————— */

const rc = (rank: number, suit: Suit = 'cups'): Card => ({ id: `${suit}-${rank}`, suit, rank });

function rondaGame() {
  const f = fakeCtx();
  const s: any = ronda.start(f.ctx, ['a', 'b'], { target: 41 });
  const p: string = s.seats[s.turnIdx];
  const q: string = s.seats.find((x: string) => x !== p);
  s.scores = Object.fromEntries(s.sides.map((x: any) => [x.key, 0]));
  s.lastPlayed = null;
  s.chain = null;
  f.said.length = 0;
  return { ...f, s, p, q };
}

test('voice: روندا — a drop is silent, a دقة is read aloud', () => {
  const { ctx, said, s, p, q } = rondaGame();
  s.table = [rc(7)];
  s.hands[p] = [rc(5), rc(2)];
  s.hands[q] = [rc(5, 'coins'), rc(2, 'coins')];
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-5' });
  expect(last(said).voice).toBeUndefined();
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-5' });
  expect(last(said)).toMatchObject({ by: q, voice: VOICE.daqa });
});

test('voice: روندا — «ف جوج» after a دقة', () => {
  const { ctx, said, s, p, q } = rondaGame();
  s.table = [rc(7)];
  s.hands[p] = [rc(1), rc(1, 'swords'), rc(3)];
  s.hands[q] = [rc(1, 'coins'), rc(1, 'clubs'), rc(3, 'coins')];
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-1' });
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-1' });
  ronda.act(ctx, s, p, { type: 'play', card: 'swords-1' });
  expect(last(said)).toMatchObject({ by: p, voice: VOICE.fJouj });
});

test('voice: روندا — «ميسا» when the table is cleared', () => {
  const { ctx, said, s, p, q } = rondaGame();
  s.table = [rc(4)];
  s.hands[p] = [rc(4, 'coins'), rc(2)];
  s.hands[q] = [rc(6), rc(7)];
  ronda.act(ctx, s, p, { type: 'play', card: 'coins-4' });
  expect(last(said)).toMatchObject({ by: p, voice: VOICE.missa });
});

test('voice: روندا — a روندا at a deal is the last say of the move, with its call', () => {
  const { ctx, said, s, p, q } = rondaGame();
  s.table = [];
  s.hands[p] = [rc(12)];
  s.hands[q] = [];
  // the next deal: a pair of 5s for one player, nothing for the other
  s.deck = [rc(5), rc(5, 'coins'), rc(1, 'swords'), rc(2, 'swords'), rc(3, 'clubs'), rc(4, 'clubs'), rc(6, 'clubs'), rc(7, 'clubs')];
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-12' });
  expect(said.length).toBe(2);
  expect(said[0].voice).toBeUndefined(); // the drop
  expect(last(said).text).toContain('روندا');
  expect(last(said).voice).toBe(VOICE.ronda);
});

/* —— البلوط ——————————————————————————————————————————————————————————————————————— */

const P = ['p0', 'p1', 'p2', 'p3'];
const bc = (id: string): BCard => ({ id, suit: id.slice(-1) as BSuit, rank: id.slice(0, -1) as BRank });
const HANDS = ['AS KS QS 7H 8H', 'AH 10H 9C 8C 7C', 'JD 9D AD 10D KD', 'QH JH 9H AC 10C'];

function balootGame(mode: 'saudi' | 'morocco') {
  const f = fakeCtx();
  const s: BalootState = baloot.start(f.ctx, P, {
    mode,
    target: mode === 'morocco' ? 1000 : 152,
    timer: 0,
    doubling: false,
    level: 2,
  } as BalootState['settings']);
  // the deal: dealer seat 3 (p0 speaks first), a face-up 7 of spades
  s.dealer = 3;
  const used = new Set([...HANDS.flatMap((h) => h.split(' ')), '7S']);
  s.hands = Object.fromEntries(P.map((id, i) => [id, HANDS[i].split(' ').map(bc)]));
  s.faceUp = bc('7S');
  s.stock = makeBalootDeck().filter((x) => !used.has(x.id));
  s.bid = { round: 1, stage: 'main', order: P.slice(), queue: P.slice(), calls: {}, best: null };
  f.said.length = 0;
  return { ...f, s };
}

test('voice: البلوط — «بس» and «صن» are read aloud; an ordinary card is silent', () => {
  const { ctx, said, s } = balootGame('saudi');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(last(said)).toMatchObject({ by: 'p0', voice: VOICE.bs });
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'sun' });
  expect(last(said)).toMatchObject({ by: 'p1', voice: VOICE.sun });
  expect(s.phase).toBe('play');
  const turn = s.turn!;
  baloot.act(ctx, s, turn, { type: 'play', card: balootPlayable(s, turn)[0].id, declare: [] });
  expect(last(said).text).toContain('ورقة من');
  expect(last(said).voice).toBeUndefined();
});

test('voice: البلوط المغربي — «باص» and «شاري»', () => {
  const { ctx, said, s } = balootGame('morocco');
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'pass' });
  expect(last(said)).toMatchObject({ by: 'p0', voice: VOICE.pass });
  baloot.act(ctx, s, 'p1', { type: 'bid', call: 'hokm' });
  expect(last(said)).toMatchObject({ by: 'p1', voice: VOICE.shari });
});

test('voice: البلوط المغربي — the suit named in the second round', () => {
  const { ctx, said, s } = balootGame('morocco');
  for (const id of P) baloot.act(ctx, s, id, { type: 'bid', call: 'pass' });
  expect(last(said).voice).toBe(VOICE.pass);
  baloot.act(ctx, s, 'p0', { type: 'bid', call: 'hokm2', suit: 'H' });
  expect(last(said)).toMatchObject({ by: 'p0', voice: voiceTrump(SUIT_VOICE.cups) });
});

/* —— التوتي ———————————————————————————————————————————————————————————————————————— */

test('voice: التوتي — a bid is read as a number, «باص» as itself', () => {
  const f = fakeCtx();
  const s: ToutiState = touti.start(f.ctx, P, { ...TOUTI_DEFAULTS, timer: 0 });
  s.dealer = 3;
  s.bid = { order: P.slice(), active: P.slice(), turn: 'p0', calls: {}, high: null, highBy: null };
  touti.act(f.ctx, s, 'p0', { type: 'bid', bid: 70 });
  expect(last(f.said)).toMatchObject({ by: 'p0', voice: 'سَبْعِينْ' });
  touti.act(f.ctx, s, 'p1', { type: 'bid', bid: 'pass' });
  expect(last(f.said)).toMatchObject({ by: 'p1', voice: VOICE.pass });
  touti.act(f.ctx, s, 'p2', { type: 'bid', bid: 120 });
  expect(last(f.said).voice).toBe(voiceBid(120));
});

/* —— أونو فليب ————————————————————————————————————————————————————————————————————— */

test('voice: أونو فليب — «أونو»', () => {
  const f = fakeCtx();
  const s: any = unoflip.start(f.ctx, ['a', 'b', 'c'], { target: 500 });
  const p = s.seats[s.turnIdx];
  s.hands[p] = s.hands[p].slice(0, 2);
  unoflip.act(f.ctx, s, p, { type: 'uno' });
  expect(last(f.said)).toMatchObject({ by: p, voice: VOICE.uno });
});

/* —— هزّ 2 ———————————————————————————————————————————————————————————————————————— */

function hezGame(hands: Record<string, Card[]>, top: Card) {
  const f = fakeCtx();
  const seats = Object.keys(hands);
  const s: any = hez2.start(f.ctx, seats, { ...HEZ2_DEFAULTS });
  const used = new Set([top.id, ...Object.values(hands).flat().map((x) => x.id)]);
  const all = [...s.deck, ...s.discard, ...Object.values(s.hands as Record<string, Card[]>).flat()];
  s.deck = all.filter((x: Card) => !used.has(x.id));
  s.discard = [top];
  s.hands = Object.fromEntries(seats.map((id) => [id, hands[id].slice()]));
  s.suit = top.suit;
  s.topBy = null;
  s.turnIdx = 0;
  f.said.length = 0;
  return { ...f, s };
}

test('voice: هزّ 2 — a 2 is «هزّ 2», answering it is «هزّ 4»; an ordinary card is silent', () => {
  const { ctx, said, s } = hezGame({ a: [rc(2, 'coins'), rc(5, 'cups'), rc(6, 'cups')], b: [rc(2, 'swords'), rc(3, 'swords'), rc(4, 'swords')] }, rc(4, 'coins'));
  hez2.act(ctx, s, 'a', { type: 'play', card: 'coins-2' });
  expect(last(said)).toMatchObject({ by: 'a', voice: voiceHez(2) });
  expect(last(said).voice).toBe('هَزّْ جُوجْ');
  hez2.act(ctx, s, 'b', { type: 'play', card: 'swords-2' });
  expect(last(said)).toMatchObject({ by: 'b', voice: 'هَزّْ رْبْعَة' });

  const g = hezGame({ a: [rc(5, 'coins'), rc(6, 'cups')], b: [rc(3, 'swords'), rc(4, 'swords')] }, rc(4, 'coins'));
  hez2.act(g.ctx, g.s, 'a', { type: 'play', card: 'coins-5' });
  expect(last(g.said).text).toContain('ورقة من a');
  expect(last(g.said).voice).toBeUndefined();
});
