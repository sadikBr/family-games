/** «الكانزة» — every play is announced to the whole room (ctx.say). */
import { expect, test } from 'bun:test';

import { kanza } from './games/kanza';

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

test('kanza: a drop and a 15 are announced with who played', () => {
  const { ctx, said } = sayCtx();
  const s: any = kanza.start(ctx, ['a', 'b'], { hands: 3 });
  const p = s.seats[s.turnIdx];
  const q = s.seats.find((x: string) => x !== p);
  s.table = [{ id: 'cups-10', suit: 'cups', rank: 10 }];
  s.hands[p] = [{ id: 'cups-3', suit: 'cups', rank: 3 }, { id: 'cups-4', suit: 'cups', rank: 4 }];
  s.hands[q] = [{ id: 'coins-5', suit: 'coins', rank: 5 }, { id: 'coins-6', suit: 'coins', rank: 6 }];
  kanza.act(ctx, s, p, { type: 'play', card: 'cups-3', take: [] });
  expect(said.at(-1)).toEqual({ text: `ورقة من ${p}: 3 كوباص`, by: p });
  kanza.act(ctx, s, q, { type: 'play', card: 'coins-5', take: ['cups-10'] });
  expect(said.at(-1)!.by).toBe(q);
  expect(said.at(-1)!.text).toContain(`أخذٌ لـ${q}: ورقتان`);
});
