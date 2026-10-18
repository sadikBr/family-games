/** «أونو فليب» — plays, draws and colour choices are announced to the whole room. */
import { expect, test } from 'bun:test';

import { unoflip } from './games/unoflip';

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

test('unoflip: plays, draws and passes are announced with who made them', () => {
  const { ctx, said } = sayCtx();
  const s: any = unoflip.start(ctx, ['a', 'b', 'c'], { target: 500 });
  for (let k = 0; k < 30 && s.phase === 'play'; k++) {
    if (s.choosing) {
      unoflip.act(ctx, s, s.choosing.by, { type: 'color', color: s.side === 'light' ? 'red' : 'pink' });
      expect(said.at(-1)!.text).toContain('اللون من اختيار');
      continue;
    }
    const p = s.seats[s.turnIdx];
    const v: any = unoflip.view(ctx, s, p);
    if (v.playable.length) {
      unoflip.act(ctx, s, p, { type: 'play', card: v.playable[0] });
      expect(said.some((x) => x.by === p && x.text.startsWith(`ورقة من ${p}:`))).toBe(true);
    } else if (v.canPass) {
      unoflip.act(ctx, s, p, { type: 'pass' });
      expect(said.at(-1)).toEqual({ text: `تمرير: ${p}`, by: p });
    } else {
      unoflip.act(ctx, s, p, { type: 'draw' });
      expect(said.at(-1)!.text.startsWith('سحب ورقة')).toBe(true);
    }
  }
  expect(said.length).toBeGreaterThan(5);
});
