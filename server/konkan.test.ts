/** «الكونكان» — moves are announced; the view says who threw the face-up card and which group changed last. */
import { expect, test } from 'bun:test';

import type { KonkanViewPlus } from '../src/shared/games/konkan';
import { konkan } from './games/konkan';

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

test('konkan: draw, meld and discard are announced; the thrower and the last group are in the view', () => {
  const { ctx, said } = sayCtx();
  const s: any = konkan.start(ctx, ['a', 'b'], { limit: 101 });
  const p = s.turn;
  expect((konkan.view(ctx, s, p) as KonkanViewPlus).discardBy).toBeNull();
  konkan.act(ctx, s, p, { type: 'drawStock' });
  expect(said.at(-1)).toEqual({ text: `سحب من الكومة: ${p}`, by: p });
  s.hands[p] = [
    { id: 'cups-5', suit: 'cups', rank: 5 },
    { id: 'coins-5', suit: 'coins', rank: 5 },
    { id: 'clubs-5', suit: 'clubs', rank: 5 },
    { id: 'swords-1', suit: 'swords', rank: 1 },
    { id: 'swords-12', suit: 'swords', rank: 12 },
  ];
  konkan.act(ctx, s, p, { type: 'meld', cards: ['cups-5', 'coins-5', 'clubs-5'] });
  expect(said.at(-1)!.text).toContain('مجموعة جديدة');
  konkan.act(ctx, s, p, { type: 'discard', card: 'swords-12' });
  expect(said.at(-1)!.text).toContain('ورقة مرمية');
  const v = konkan.view(ctx, s, p) as KonkanViewPlus;
  expect(v.discardBy).toBe(p);
  expect(v.lastMeld).toEqual({ id: s.melds[0].id, by: p });
  // the next player takes it: the card below turned up at the deal
  const q = s.turn;
  konkan.act(ctx, s, q, { type: 'drawDiscard' });
  expect((konkan.view(ctx, s, q) as KonkanViewPlus).discardBy).toBeNull();
  const throwable = s.hands[q].find((c: any) => c.id !== s.takenDiscard);
  konkan.act(ctx, s, q, { type: 'discard', card: throwable.id });
  const w = konkan.view(ctx, s, q) as KonkanViewPlus;
  expect(w.discardBy).toBe(q);
  expect(w.lastMeld).toBeNull(); // the next player's turn is over
});
