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

test('unoflip: the view names the id of the card on top of the pile (the played card keeps its hand id)', () => {
  const { ctx } = sayCtx();
  const s: any = unoflip.start(ctx, ['a', 'b'], { target: 500 });
  expect((unoflip.view(ctx, s, 'a') as any).topId).toBe(s.discard.at(-1).id);
  for (let k = 0; k < 40 && s.phase === 'play'; k++) {
    if (s.choosing) {
      unoflip.act(ctx, s, s.choosing.by, { type: 'color', color: s.side === 'light' ? 'red' : 'pink' });
      continue;
    }
    const p = s.seats[s.turnIdx];
    const v: any = unoflip.view(ctx, s, p);
    if (!v.playable.length) {
      unoflip.act(ctx, s, p, { type: v.canPass ? 'pass' : 'draw' });
      continue;
    }
    const card = v.playable[0];
    unoflip.act(ctx, s, p, { type: 'play', card });
    for (const id of ['a', 'b']) expect((unoflip.view(ctx, s, id) as any).topId).toBe(card);
    return;
  }
});
