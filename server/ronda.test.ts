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
  expect(said.at(-1)).toEqual({ text: `ورقة من ${p}: 5 كؤوس`, by: p });
  ronda.act(ctx, s, q, { type: 'play', card: 'coins-5' });
  expect(said.at(-1)!.by).toBe(q);
  expect(said.at(-1)!.text).toContain(`أخذٌ لـ${q}: ورقتان`);
  expect(said.at(-1)!.text).toContain('إسطي');
  const v = ronda.view(ctx, s, p) as RondaView;
  expect(v.lastPlay?.by).toBe(q);
  expect(v.lastPlay?.took.map((c) => c.id)).toEqual(['cups-5']);
});
