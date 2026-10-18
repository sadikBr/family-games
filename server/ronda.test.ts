/** «روندا» — every play is announced to the whole room (ctx.say), and the view keeps the last play. */
import { expect, test } from 'bun:test';

import type { RondaView } from '../src/shared/protocol';
import { ronda } from './games/ronda';

function sayCtx() {
  const said: { text: string; by?: string }[] = [];
  const ctx: any = {
    now: 0,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
    say: (text: string, by?: string) => said.push({ text, by }),
  };
  return { ctx, said };
}

test('ronda: a drop and a capture are announced with the card and who played it', () => {
  const { ctx, said } = sayCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 41 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  s.table = [];
  s.hands[p] = [{ id: 'cups-5', suit: 'cups', rank: 5 }, { id: 'cups-2', suit: 'cups', rank: 2 }];
  s.hands[q] = [{ id: 'coins-5', suit: 'coins', rank: 5 }, { id: 'coins-2', suit: 'coins', rank: 2 }];
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-5' });
  expect(said.at(-1)).toEqual({ text: `ورقة من ${p}: 5 كوباص`, by: p });
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-5' });
  expect(said.at(-1)!.by).toBe(q);
  expect(said.at(-1)!.text).toContain(`أخذٌ لـ${q}: ورقتان`);
  expect(said.at(-1)!.text).toContain('دقة');
  const v = ronda.view(ctx, s, p) as RondaView;
  expect(v.lastPlay?.by).toBe(q);
  expect(v.lastPlay?.took.map((c) => c.id)).toEqual(['cups-5']);
});

test('ronda: after a capture of the card just played, the third card of the rank takes 3 (+5) and the fourth takes all 4 (+10)', () => {
  const { ctx } = sayCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 99 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  const sideOfId = (id: string) => s.sides.find((x: any) => x.members.includes(id)).key;
  s.table = [{ id: 'cups-7', suit: 'cups', rank: 7 }];
  s.hands[p] = [{ id: 'cups-1', suit: 'cups', rank: 1 }, { id: 'swords-1', suit: 'swords', rank: 1 }, { id: 'cups-3', suit: 'cups', rank: 3 }];
  s.hands[q] = [{ id: 'coins-1', suit: 'coins', rank: 1 }, { id: 'clubs-1', suit: 'clubs', rank: 1 }, { id: 'coins-3', suit: 'coins', rank: 3 }];
  s.scores = Object.fromEntries(s.sides.map((x: any) => [x.key, 0]));
  const sp = sideOfId(p), sq = sideOfId(q);
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-1' }); // dropped
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-1' }); // takes it: +1
  expect(s.scores[sq]).toBe(1);
  ronda.act(ctx, s, p, { type: 'play', card: 'swords-1' }); // the third 1: takes the three, +5
  expect(s.scores[sp]).toBe(5);
  expect(s.announce.text).toBe('ف جوج! +5');
  expect(s.captured[sp].map((c: any) => c.id).sort()).toEqual(['coins-1', 'cups-1', 'swords-1']);
  expect(s.captured[sq].length).toBe(0);
  expect(s.table.map((c: any) => c.id)).toEqual(['cups-7']); // the table is untouched
  ronda.act(ctx, s, q, { type: 'play', card: 'clubs-1' }); // the last 1: takes all four, +10
  expect(s.scores[sq]).toBe(11);
  expect(s.announce.text).toBe('ف ثلاثة! +10');
  expect(s.captured[sq].length).toBe(4);
  expect(s.captured[sp].length).toBe(0);
  expect(s.chain).toBeNull();
});

test('ronda: the chain only continues right away — another card in between ends it', () => {
  const { ctx } = sayCtx();
  const s: any = ronda.start(ctx, ['a', 'b'], { target: 99 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  s.table = [];
  s.hands[p] = [{ id: 'cups-1', suit: 'cups', rank: 1 }, { id: 'cups-4', suit: 'cups', rank: 4 }, { id: 'swords-1', suit: 'swords', rank: 1 }];
  s.hands[q] = [{ id: 'coins-1', suit: 'coins', rank: 1 }, { id: 'coins-6', suit: 'coins', rank: 6 }, { id: 'coins-3', suit: 'coins', rank: 3 }];
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-1' });
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-1' });
  ronda.act(ctx, s, p, { type: 'play', card: 'cups-4' }); // not a 1: the chain is over
  expect(s.chain).toBeNull();
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-6' });
  const before = { ...s.scores };
  ronda.act(ctx, s, p, { type: 'play', card: 'swords-1' }); // too late: just dropped
  expect(s.table.some((c: any) => c.id === 'swords-1')).toBe(true);
  expect(s.scores).toEqual(before);
});
