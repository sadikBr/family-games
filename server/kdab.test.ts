/** «الكذّاب» — plays and challenges are announced; a reveal stays visible a moment after the next play. */
import { expect, test } from 'bun:test';

import { REVEAL_MS, kdab } from './games/kdab';

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

test('kdab: a play, a «كذّاب!» and a pass are announced; the reveal outlives the next play', () => {
  const { ctx, said } = sayCtx();
  const s: any = kdab.start(ctx, ['a', 'b', 'c'], { maxPlay: 4 });
  const a = s.order[0];
  const card = s.hands[a][0];
  const lie = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12].find((r) => r !== card.rank)!;
  kdab.act(ctx, s, a, { type: 'play', cards: [card.id], rank: lie });
  expect(said.at(-1)!.by).toBe(a);
  expect(said.at(-1)!.text).toContain(`ورقة من ${a}`);
  const b = s.order[1];
  kdab.act(ctx, s, b, { type: 'call' });
  expect(said.at(-1)).toMatchObject({ by: b });
  expect(said.at(-1)!.text).toContain('في محلّه');
  // the next play does not hide the cards that were just shown
  const t = s.order[s.turnIdx];
  kdab.act(ctx, s, t, { type: 'play', cards: [s.hands[t][0].id], rank: s.hands[t][0].rank });
  expect(s.reveal).not.toBeNull();
  ctx.now += REVEAL_MS + 10;
  expect(kdab.tick!(ctx, s)).toBe(true);
  expect(s.reveal).toBeNull();
  const u = s.order[s.turnIdx];
  kdab.act(ctx, s, u, { type: 'pass' });
  expect(said.at(-1)).toEqual({ text: `تمرير: ${u}`, by: u });
});
