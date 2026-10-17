/** `turnOf` (drives the "your turn" alert): at the start of each turn-based game, someone at the table is up. */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { battleship } from './games/battleship';
import { chess } from './games/chess';
import { connect4 } from './games/connect4';
import { dama } from './games/dama';
import { estate } from './games/estate';
import { hajj } from './games/hajj';
import { kanza } from './games/kanza';
import { kdab } from './games/kdab';
import { kharbga } from './games/kharbga';
import { konkan } from './games/konkan';
import { ladders } from './games/ladders';
import { ludo } from './games/ludo';
import { memory } from './games/memory';
import { ronda } from './games/ronda';
import { tris } from './games/tris';
import { unoflip } from './games/unoflip';
import { xo } from './games/xo';
import type { GameModule } from './types';

const ctx: any = {
  now: 0,
  fx: () => {},
  isConnected: () => true,
  isBot: () => false,
  playerName: (id: string) => id,
  memo: new Map(),
  bot: () => {},
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: [string, GameModule<any, any>, string[]][] = [
  ['ronda', ronda, ['a', 'b']],
  ['kanza', kanza, ['a', 'b']],
  ['tris', tris, ['a', 'b', 'c', 'd']],
  ['konkan', konkan, ['a', 'b']],
  ['kdab', kdab, ['a', 'b', 'c']],
  ['unoflip', unoflip, ['a', 'b']],
  ['ludo', ludo, ['a', 'b']],
  ['dama', dama, ['a', 'b']],
  ['chess', chess, ['a', 'b']],
  ['connect4', connect4, ['a', 'b']],
  ['kharbga', kharbga, ['a', 'b']],
  ['battleship', battleship, ['a', 'b']],
  ['xo', xo, ['a', 'b']],
  ['memory', memory, ['a', 'b']],
  ['estate', estate, ['a', 'b']],
  ['hajj', hajj, ['a', 'b']],
  ['ladders', ladders, ['a', 'b']],
];

for (const [id, mod, players] of cases) {
  test(`${id}: turnOf names a player at the start`, () => {
    const s = mod.start(ctx, players, (DEFAULT_SETTINGS as Record<string, unknown>)[id]);
    const up = mod.turnOf!(s);
    expect(up.length).toBeGreaterThan(0);
    for (const p of up) expect(players).toContain(p);
  });
}
