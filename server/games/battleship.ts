/** «معركة السفن» — each phone hides its own fleet; take turns firing. A hit lets you fire again. Who shoots first alternates. */
import { BN, botShot, randomFleet } from '../../src/shared/battleship';
import type { BattleshipSettings, BattleshipView, ShotResult } from '../../src/shared/protocol';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum } from '../util';

interface State {
  settings: BattleshipSettings;
  players: [string, string];
  fleets: Record<string, number[][]>;
  shots: Record<string, Record<number, ShotResult>>; // shooter → shots on the other grid
  ready: string[];
  turnIdx: number;
  phase: BattleshipView['phase'];
  last: BattleshipView['last'];
  lastN: number;
  winner: string | null;
  moves: number;
  botAt: number;
  score: Record<string, number>;
  resigned: boolean; // the game ended by resigning or leaving, not by sinking the fleet
}

const enemyOf = (s: State, id: string) => (s.players[0] === id ? s.players[1] : s.players[0]);
const sunkShips = (fleet: number[][], shots: Record<number, ShotResult>) => fleet.filter((ship) => ship.every((c) => shots[c] === 'hit'));

function win(ctx: GameCtx, s: State, winner: string) {
  s.phase = 'final';
  s.winner = winner;
  duelWin(ctx, s.score, winner);
}

export const battleship: GameModule<State, BattleshipSettings> = {
  turnOf: (s) => s.phase === 'setup' ? s.players.filter((id) => !s.ready.includes(id)) : s.phase === 'play' ? [s.players[s.turnIdx]] : [],
  id: 'battleship',

  start(ctx, participants, settings) {
    const { first, second, score } = startDuel(ctx, 'battleship', participants);
    const players: [string, string] = [first, second]; // players[0] shoots first
    ctx.fx('start');
    return {
      settings,
      players,
      fleets: Object.fromEntries(players.map((p) => [p, randomFleet()])),
      shots: Object.fromEntries(players.map((p) => [p, {}])),
      ready: [],
      turnIdx: 0,
      phase: 'setup',
      last: null,
      lastN: 0,
      winner: null,
      moves: 0,
      botAt: -1,
      score,
      resigned: false,
    };
  },

  act(ctx, s, by, a) {
    if (!s.players.includes(by) || s.phase === 'final') return;
    if (a.type === 'resign') {
      ctx.say?.(`انسحاب من ${ctx.playerName(by)}`, by);
      s.resigned = true;
      return win(ctx, s, enemyOf(s, by));
    }
    if (s.phase === 'setup') {
      if (s.ready.includes(by)) return;
      if (a.type === 'shuffle') s.fleets[by] = randomFleet();
      if (a.type === 'ready') {
        s.ready.push(by);
        ctx.say?.(`أسطول ${ctx.playerName(by)} جاهز`, by);
        if (s.ready.length === 2) {
          s.phase = 'play';
          ctx.fx('start');
        }
      }
      return;
    }
    if (a.type !== 'fire') return;
    if (s.players[s.turnIdx] !== by) throw new GameError('ليس دورك');
    if (!isNum(a.cell) || a.cell < 0 || a.cell >= BN * BN || s.shots[by][a.cell]) return;
    const enemy = enemyOf(s, by);
    const hit = s.fleets[enemy].some((ship) => ship.includes(a.cell as number));
    s.shots[by][a.cell] = hit ? 'hit' : 'miss';
    s.moves += 1;
    const ship = s.fleets[enemy].find((sh) => sh.includes(a.cell as number));
    const sunk = !!ship && ship.every((c) => s.shots[by][c] === 'hit');
    s.last = { by, cell: a.cell, result: sunk ? 'sunk' : hit ? 'hit' : 'miss', id: ++s.lastN };
    ctx.fx(sunk ? 'boom' : hit ? 'throw' : 'skip', by);
    ctx.say?.(`طلقة من ${ctx.playerName(by)}: ${sunk ? 'سفينة غرقت!' : hit ? 'إصابة! وطلقة أخرى' : 'في الماء'}`, by);
    if (sunkShips(s.fleets[enemy], s.shots[by]).length === s.fleets[enemy].length) {
      win(ctx, s, by);
      return;
    }
    if (!hit) s.turnIdx = 1 - s.turnIdx;
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'setup') {
      for (const b of bots) if (s.players.includes(b) && !s.ready.includes(b)) ctx.bot(b, 'ready', randDelay(800, 1500), { type: 'ready' });
      return;
    }
    if (s.phase !== 'play') return;
    const id = s.players[s.turnIdx];
    if (!bots.includes(id) || s.botAt === s.moves) return;
    s.botAt = s.moves;
    const enemy = enemyOf(s, id);
    const cell = botShot(s.shots[id], sunkShips(s.fleets[enemy], s.shots[id]), s.settings.level);
    ctx.bot(id, `f:${s.moves}`, randDelay(900, 1500), { type: 'fire', cell });
  },

  view(ctx, s, me): BattleshipView {
    const mine = s.players.includes(me) ? me : s.players[0];
    const enemy = enemyOf(s, mine);
    const incoming = s.shots[enemy];
    return {
      game: 'battleship',
      phase: s.phase,
      players: s.players,
      ready: s.ready,
      turn: s.players[s.turnIdx],
      myFleet: s.fleets[mine].map((cells) => ({ cells, sunk: cells.every((c) => incoming[c] === 'hit') })),
      myShots: s.shots[mine],
      enemyShots: incoming,
      enemySunk: sunkShips(s.fleets[enemy], s.shots[mine]),
      enemyFleetLeft: s.fleets[enemy].length - sunkShips(s.fleets[enemy], s.shots[mine]).length,
      last: s.last,
      winner: s.winner,
      enemyFleet: s.phase === 'final' ? s.fleets[enemy] : null,
      score: s.score,
      resigned: s.phase === 'final' && s.resigned,
    };
  },

  onLeave(ctx, s, id) {
    if (!s.players.includes(id) || s.phase === 'final') return;
    s.resigned = true;
    win(ctx, s, enemyOf(s, id));
  },
};
