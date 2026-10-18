/** «التريس» — plays and tricks are announced; a full trick stays on the table long enough to read. */
import { expect, test } from 'bun:test';

import { TRICK_PAUSE_MS, tris } from './games/tris';

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

test('tris: each card and the trick winner are announced; the trick waits before it is collected', () => {
  const { ctx, said } = sayCtx();
  const s: any = tris.start(ctx, ['a', 'b', 'c', 'd'], { target: 31 });
  for (let k = 0; k < 4; k++) {
    const p = s.seats[s.turnIdx];
    const card = (tris.view(ctx, s, p) as any).playable[0];
    tris.act(ctx, s, p, { type: 'play', card });
    expect(said.at(-1)!.text.startsWith(`ورقة من ${p}:`)).toBe(true);
  }
  expect(s.phase).toBe('trickEnd');
  expect(said.at(-1)!.text).toContain(`اللمّة لـ${s.trickWinner}`);
  expect(tris.turnOf!(s)).toEqual([]);
  expect(TRICK_PAUSE_MS).toBeGreaterThanOrEqual(2200);
  ctx.now += TRICK_PAUSE_MS - 100;
  expect(tris.tick!(ctx, s)).toBe(false);
  ctx.now += 200;
  expect(tris.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('play');
});
