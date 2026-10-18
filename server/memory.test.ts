/** «الذاكرة» — pairs and misses are announced; a found pair stays marked until the next flip. */
import { expect, test } from 'bun:test';

import type { MemoryView } from '../src/shared/protocol';
import { PEEK_MS, memory } from './games/memory';

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

test('memory: a pair and a miss are announced; the pair stays shown, the miss long enough to see', () => {
  const { ctx, said } = sayCtx();
  const s: any = memory.start(ctx, ['a', 'b'], { pairs: 8 });
  const p = s.order[0];
  const j = s.deck.indexOf(s.deck[0], 1);
  memory.act(ctx, s, p, { type: 'flip', card: 0 });
  memory.act(ctx, s, p, { type: 'flip', card: j });
  expect(said.at(-1)!.by).toBe(p);
  expect(said.at(-1)!.text).toContain(`زوج لـ${p}`);
  let v = memory.view(ctx, s, 'a') as MemoryView;
  expect(v.flipped).toEqual([0, j]);
  expect(v.peek).toBe(false);
  expect(memory.turnOf!(s)).toEqual([p]);
  // a miss: the found pair is released, the two new cards stay up
  const k = s.deck.findIndex((_: string, x: number) => !s.owners[x]);
  const miss = s.deck.findIndex((f: string, x: number) => !s.owners[x] && f !== s.deck[k]);
  memory.act(ctx, s, p, { type: 'flip', card: k });
  v = memory.view(ctx, s, 'a') as MemoryView;
  expect(v.flipped).toEqual([k]);
  memory.act(ctx, s, p, { type: 'flip', card: miss });
  expect(said.at(-1)!.text).toContain('غير متطابقتين');
  expect(PEEK_MS).toBeGreaterThanOrEqual(2200);
  ctx.now += PEEK_MS - 100;
  expect(memory.tick!(ctx, s)).toBe(false);
  ctx.now += 200;
  expect(memory.tick!(ctx, s)).toBe(true);
  expect(memory.turnOf!(s)).not.toEqual([p]);
});
