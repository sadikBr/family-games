/** «الطاولة» — move generation, hitting, bearing off, scoring, the match, bots, the view, leaving, settings. */
import { expect, test } from 'bun:test';

import { allSequences, legalSteps, pipCount, tawlaStart, tawlaTargets, winKind, type TawlaPos, type TawlaSide } from '../src/shared/games/tawla';
import { tawla, type State } from './games/tawla';
import { evalExpert, shotLoss, tawlaBotSteps } from './tawla-bot';

/** A fake room: bot actions are queued and run by `drive` (time jumps forward to each one). */
function fakeCtx(bots: string[] = [], level: 'easy' | 'smart' | 'expert' = 'expert') {
  const jobs: { at: number; by: string; key: string; a: any }[] = [];
  const keys = new Set<string>();
  const said: string[] = [];
  const fx: string[] = [];
  const ctx: any = {
    now: 1000,
    fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    say: (t: string) => said.push(t),
    botLevel: () => level,
    bot: (by: string, key: string, d: number, a: any) => {
      if (keys.has(key + by)) return;
      keys.add(key + by);
      jobs.push({ at: ctx.now + d, by, key, a });
    },
  };
  return { ctx, jobs, said, fx, keys };
}

/** Run bots + timers until the match ends (or `limit` steps). */
function drive(f: ReturnType<typeof fakeCtx>, s: State, bots: string[], limit = 20000) {
  for (let i = 0; i < limit && s.phase !== 'final'; i++) {
    tawla.botPlan!(f.ctx, s, bots);
    f.jobs.sort((a, b) => a.at - b.at);
    const due = s.timer ? s.timer.at : Infinity;
    const job = f.jobs[0];
    if (job && job.at <= due) {
      f.jobs.shift();
      f.ctx.now = Math.max(f.ctx.now, job.at);
      tawla.act(f.ctx, s, job.by, job.a);
    } else if (s.timer) {
      f.ctx.now = Math.max(f.ctx.now, s.timer.at);
      tawla.tick!(f.ctx, s);
    } else break;
  }
}

/** Build a position from {point: count} maps in each side's own numbering (25 = bar, 0 = off). */
function posOf(a: Record<number, number>, b: Record<number, number>): TawlaPos {
  const mk = (m: Record<number, number>) => {
    const arr = new Array(26).fill(0);
    let n = 0;
    for (const [k, v] of Object.entries(m)) {
      arr[Number(k)] = v;
      n += v;
    }
    if (!(0 in m)) arr[0] = 15 - n;
    return arr;
  };
  return [mk(a), mk(b)];
}

const steps = (pos: TawlaPos, s: TawlaSide, left: number[]) =>
  legalSteps(pos, s, left)
    .map((x) => `${x.from}>${x.to}:${x.die}`)
    .sort();

test('tawla: the start position, pips, opening moves', () => {
  const p = tawlaStart();
  expect(p[0].reduce((a, b) => a + b, 0)).toBe(15);
  expect(pipCount(p[0])).toBe(167);
  // 6-1 at the start: 24/18, 13/7, 8/2, 6/5 … (24>18 with the 6; 8>7 with the 1 etc.)
  const st = steps(p, 0, [6, 1]);
  expect(st).toContain('24>18:6');
  expect(st).toContain('13>7:6');
  expect(st).toContain('8>7:1');
  // 6 from 6 lands on the opponent's 19 point? no: point 0 is not allowed before all are home
  expect(st.some((x) => x.startsWith('6>0'))).toBe(false);
  // the opponent's 5-point (my 20) holds 0, my 24 → 18 is open; 13 → 7 with a 6 is open; opponent's 6-point is my 19 (5 checkers): 24 → 19 with a 5 is blocked
  expect(steps(p, 0, [5, 5])).not.toContain('24>19:5');
});

test('tawla: entering from the bar comes first, blocked points, a closed board', () => {
  // my checker on the bar; the opponent holds its 1 and 2 points (my 24 and 23)
  const p = posOf({ 25: 1, 13: 5, 6: 5, 8: 4 }, { 1: 2, 2: 2, 13: 5, 6: 6 });
  // dice 1 and 2: both entry points blocked → nothing at all
  expect(legalSteps(p, 0, [1, 2])).toEqual([]);
  // dice 1 and 3: enter with the 3 (my 22), then the 1 anywhere
  const st = steps(p, 0, [1, 3]);
  expect(st).toEqual(['25>22:3']);
  // two on the bar with a non-double: both dice enter, nothing else moves
  const two = posOf({ 25: 2, 13: 5, 6: 4, 8: 4 }, { 13: 5, 6: 10 });
  const seqs = allSequences(two, 0, [4, 5]);
  expect(seqs.every((q) => q.steps.every((x) => x.from === 25))).toBe(true);
  // a closed board: no entry
  const closed = posOf({ 25: 1, 13: 14 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 5 });
  for (let d = 1; d <= 6; d++) expect(legalSteps(closed, 0, [d, d, d, d])).toEqual([]);
});

test('tawla: doubles are four moves', () => {
  const p = tawlaStart();
  const seqs = allSequences(p, 0, [3, 3, 3, 3]);
  expect(seqs.length).toBeGreaterThan(5);
  expect(seqs.every((q) => q.steps.length === 4)).toBe(true);
  // one checker can go four times: 24 → 16 with 2-2-2-2
  expect(tawlaTargets(p, 0, [2, 2, 2, 2]).some((t) => t.from === 24 && t.to === 16 && t.dice.length === 4)).toBe(true);
});

test('tawla: both dice must be played when possible, else the larger one', () => {
  // only my checker on 10 can move (everything else is off/home?) — a position where a 6 then 5 works only in one order
  // side 0: one checker on 13, the rest borne off… keep it simple: checkers on 13 and 1 (14 off would be bearing off) → use no-home case
  // must-use-both: a 6 alone is possible from 13 (to 7), but if the 6 is played first, the 5 can't be played (7 → 2 blocked)
  // while 5 first (13 → 8) then 6 (8 → 2 blocked)… build: opponent blocks my 2 and my 1? Then 13: 6→7, 5→8; 7-5=2 blocked, 8-6=2 blocked
  // so the full 11 is impossible with that checker. A second checker on 24 that can only move 5 (24 → 19) — 24-6 = 18 blocked.
  const p = posOf({ 13: 1, 24: 1, 0: 13 }, { 23: 2, 24: 2, 7: 2, 0: 9 }); // opp 23,24 = my 2,1; opp 7 = my 18
  // 13 → 8 with the 5 leaves the 6 unplayable: not allowed; 13 → 7 (6) or 24 → 19 (5) keep both dice playable
  expect(steps(p, 0, [6, 5])).toEqual(['13>7:6', '24>19:5']);
  const seqs = allSequences(p, 0, [6, 5]);
  expect(seqs.length).toBe(2);
  expect(seqs.every((q) => q.steps.length === 2)).toBe(true);
  // only one die can be played, either one: the larger one is a must
  const q = posOf({ 13: 1, 0: 14 }, { 23: 2, 24: 2, 1: 11 }); // 13→7 (6) or 13→8 (5): then 7-5=2 / 8-6=2 blocked
  expect(steps(q, 0, [6, 5])).toEqual(['13>7:6']);
  // the larger one blocked: the smaller one
  const r = posOf({ 13: 1, 0: 14 }, { 23: 2, 24: 2, 18: 2, 1: 9 }); // my 7 blocked too
  expect(steps(r, 0, [6, 5])).toEqual(['13>8:5']);
});

test('tawla: hitting a blot sends it to the bar', () => {
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 1 });
  s.rig = [[6], [1]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  expect(s.turn).toBe(0);
  expect(s.phase).toBe('move');
  // a blot of side 1 on its 18 (my 7): 13 → 7 with the 6 hits it
  s.pos = posOf({ 13: 5, 6: 5, 8: 3, 24: 2 }, { 18: 1, 13: 5, 6: 5, 8: 2, 24: 2 });
  tawla.act(f.ctx, s, s.seats[0], { type: 'move', from: 13, to: 7 });
  expect(s.pos[1][25]).toBe(1);
  expect(s.pos[1][18]).toBe(0);
  expect(s.last!.hits).toEqual([7]);
  expect(f.fx).toContain(`boom:${s.seats[0]}`);
  // undo puts it back
  tawla.act(f.ctx, s, s.seats[0], { type: 'undo' });
  expect(s.pos[1][25]).toBe(0);
  expect(s.pos[1][18]).toBe(1);
  expect(s.left).toEqual([6, 1]);
  // a combined move 13 → 6 (6 then 1, through 7 that hits)
  tawla.act(f.ctx, s, s.seats[0], { type: 'move', from: 13, to: 6 });
  expect(s.pos[1][25]).toBe(1);
  expect(s.left).toEqual([]);
  expect(s.timer?.kind).toBe('confirm');
  // the other side must enter first
  tawla.act(f.ctx, s, s.seats[0], { type: 'done' });
  expect(s.turn).toBe(1);
  s.rig = [[3, 4]];
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  expect(legalSteps(s.pos, 1, s.left).every((x) => x.from === 25)).toBe(true);
  expect(() => tawla.act(f.ctx, s, s.seats[1], { type: 'move', from: 13, to: 9 })).toThrow('أدخل الحجر');
});

test('tawla: bearing off, exact or a higher die from the highest point', () => {
  const p = posOf({ 5: 2, 3: 2, 0: 11 }, { 1: 15 });
  const st = steps(p, 0, [6, 2]);
  expect(st).toContain('5>0:6'); // higher die from the highest point
  expect(st).toContain('3>1:2');
  expect(st).toContain('5>3:2');
  expect(st).not.toContain('3>0:6'); // 3 is not the highest point
  // exact
  expect(steps(posOf({ 4: 1, 2: 1, 0: 13 }, { 20: 15 }), 0, [4, 1])).toEqual(['2>1:1', '4>0:4', '4>3:1']);
  // not all home: no bearing off
  expect(steps(posOf({ 7: 1, 3: 1, 0: 13 }, { 20: 15 }), 0, [3, 1]).some((x) => x.endsWith('>0:3'))).toBe(false);
  // the bot bears everything off
  const q = posOf({ 1: 2, 2: 1 }, { 20: 15 });
  const seq = tawlaBotSteps(q, 0, [6, 6, 6, 6], 'expert');
  expect(seq.filter((x) => x.to === 0).length).toBe(3);
});

test('tawla: single game, gammon and backgammon scores', () => {
  expect(winKind(posOf({ 0: 15 }, { 0: 3, 4: 12 }), 0)).toBe(1);
  expect(winKind(posOf({ 0: 15 }, { 8: 15 }), 0)).toBe(2);
  expect(winKind(posOf({ 0: 15 }, { 8: 14, 20: 1 }), 0)).toBe(3);
  expect(winKind(posOf({ 0: 15 }, { 8: 14, 25: 1 }), 0)).toBe(3);
  // through the module: a gammon in a match to 3, then the match ends
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 3 });
  s.rig = [[5], [2]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  const w = s.seats[0];
  s.pos = posOf({ 1: 1, 2: 1, 0: 13 }, { 10: 15 });
  tawla.act(f.ctx, s, w, { type: 'move', from: 2, to: 0, die: 5 });
  tawla.act(f.ctx, s, w, { type: 'move', from: 1, to: 0 });
  expect(s.phase).toBe('between');
  expect(s.points[w]).toBe(2);
  expect(s.gameResult).toEqual({ winner: 0, kind: 2 });
  expect(f.said.some((x) => x.includes('مارس'))).toBe(true);
  expect(tawla.result!(s)).toBeNull();
  // both ready → the next game, with a new opening roll
  tawla.act(f.ctx, s, s.seats[0], { type: 'next' });
  expect(s.phase).toBe('between');
  tawla.act(f.ctx, s, s.seats[1], { type: 'next' });
  expect(s.phase).toBe('opening');
  expect(s.gameNo).toBe(2);
  expect(pipCount(s.pos[0])).toBe(167);
  s.rig = [[2], [6]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  expect(s.turn).toBe(1);
  expect(s.dice).toEqual([6, 2]);
  s.pos = posOf({ 8: 15 }, { 1: 1, 0: 14 });
  tawla.act(f.ctx, s, s.seats[1], { type: 'move', from: 1, to: 0 });
  expect(s.last!.path).toEqual([1, 0]);
  expect(s.points[s.seats[1]]).toBe(2);
  expect(s.phase).toBe('between');
  // a single game for side 0 (the opponent has borne off) reaches 3
  s.timer!.at = f.ctx.now;
  tawla.tick!(f.ctx, s);
  expect(s.phase).toBe('opening');
  s.rig = [[4], [1]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  s.pos = posOf({ 3: 1, 0: 14 }, { 0: 1, 6: 14 });
  tawla.act(f.ctx, s, w, { type: 'move', from: 3, to: 0 });
  expect(s.phase).toBe('final');
  expect(s.points[w]).toBe(3);
  expect(s.winner).toBe(0);
  expect(s.score[w]).toBe(1);
  expect(tawla.result!(s)).toEqual({ places: [[w], [s.seats[1]]] });
});

test('tawla: the opening roll — a tie rolls again, the higher die starts with both values', () => {
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 1 });
  expect(tawla.turnOf!(s).sort()).toEqual(['aaaa', 'bbbb']);
  s.rig = [[3], [3], [2], [5]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  expect(tawla.turnOf!(s)).toEqual([s.seats[1]]);
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  expect(s.phase).toBe('opening');
  expect(s.openTie).toBe(3);
  expect(s.opening).toEqual([null, null]);
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' }); // twice: ignored
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  expect(s.phase).toBe('move');
  expect(s.turn).toBe(1);
  expect(s.dice).toEqual([5, 2]);
  expect(s.left).toEqual([5, 2]);
  expect(() => tawla.act(f.ctx, s, s.seats[0], { type: 'move', from: 13, to: 8 })).toThrow('ليس دورك');
  // «تمّ» refused while a move remains
  expect(() => tawla.act(f.ctx, s, s.seats[1], { type: 'done' })).toThrow();
});

test('tawla: no legal move — a short line and the turn passes', () => {
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 1 });
  s.rig = [[6], [1]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[0], { type: 'move', from: 13, to: 7 });
  tawla.act(f.ctx, s, s.seats[0], { type: 'move', from: 8, to: 7 });
  tawla.act(f.ctx, s, s.seats[0], { type: 'done' });
  expect(s.phase).toBe('roll');
  // side 1 on the bar against a closed board
  s.pos = posOf({ 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 5 }, { 25: 1, 13: 14 });
  s.rig = [[4, 2]];
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  expect(s.timer?.kind).toBe('pass');
  expect(f.said.some((x) => x.startsWith('لا حركة ممكنة'))).toBe(true);
  const v = tawla.view(f.ctx, s, s.seats[1]) as any;
  expect(v.stuck).toBe(true);
  expect(v.targets).toEqual([]);
  f.ctx.now = s.timer!.at;
  tawla.tick!(f.ctx, s);
  expect(s.turn).toBe(0);
  expect(s.phase).toBe('roll');
});

test('tawla: the view — each player sees the board from their side', () => {
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 5 });
  s.pos = posOf({ 24: 2, 13: 5, 8: 3, 6: 4, 25: 1 }, { 24: 1, 13: 5, 8: 3, 6: 5, 2: 1 });
  const v0 = tawla.view(f.ctx, s, s.seats[0]) as any;
  const v1 = tawla.view(f.ctx, s, s.seats[1]) as any;
  expect(v0.near).toBe(0);
  expect(v1.near).toBe(1);
  // my 6-point holds my 4 (side 0) / my 5 (side 1)
  expect(v0.points[5]).toBe(4);
  expect(v1.points[5]).toBe(5);
  // the other side's 24-point is my 1-point: negative
  expect(v0.points[0]).toBe(-1);
  // side 1's lone checker on its 2-point is on side 0's 23-point
  expect(v1.points[1]).toBe(1);
  expect(v0.points[22]).toBe(-1);
  expect(v0.bar).toEqual([1, 0]);
  expect(v1.bar).toEqual([0, 1]);
  expect(v0.pips[0]).toBe(v1.pips[1]);
  // the sum of what each sees is the same board turned around
  const flip = v1.points.slice().reverse().map((n: number) => 0 - n || 0);
  expect(flip).toEqual(v0.points);
  expect(v0.match).toBe(5);
  // a watcher sees side 0's side and no targets
  const w = tawla.view(f.ctx, s, 'zzzz') as any;
  expect(w.mySide).toBeNull();
  expect(w.near).toBe(0);
  expect(w.targets).toEqual([]);
  // the last move is turned for each phone
  s.rig = [[6], [1]];
  s.pos = tawlaStart();
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[0], { type: 'move', from: 13, to: 7 });
  expect((tawla.view(f.ctx, s, s.seats[0]) as any).last.path).toEqual([13, 7]);
  expect((tawla.view(f.ctx, s, s.seats[1]) as any).last.path).toEqual([12, 18]);
  // only the player on turn gets targets
  expect((tawla.view(f.ctx, s, s.seats[0]) as any).targets.length).toBeGreaterThan(0);
  expect((tawla.view(f.ctx, s, s.seats[1]) as any).targets).toEqual([]);
});

test('tawla: leaving or resigning ends the match for the other player', () => {
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 3 });
  tawla.onLeave!(f.ctx, s, 'zzzz');
  expect(s.phase).toBe('opening');
  tawla.onLeave!(f.ctx, s, s.seats[1]);
  expect(s.phase).toBe('final');
  expect(s.reason).toBe('forfeit');
  expect(tawla.result!(s)).toEqual({ places: [[s.seats[0]], [s.seats[1]]] });
  const g = fakeCtx();
  const t = tawla.start(g.ctx, ['aaaa', 'bbbb'], { match: 3 });
  tawla.act(g.ctx, t, t.seats[0], { type: 'resign' });
  expect(t.winner).toBe(1);
  expect(g.said[g.said.length - 1]).toContain('انسحاب من');
});

test('tawla: settings are checked and sanitised', () => {
  const st = { match: 3 };
  tawla.patchSettings!(st, { match: 7 });
  expect(st.match).toBe(7);
  tawla.patchSettings!(st, { match: 4 });
  expect(st.match).toBe(7);
  tawla.patchSettings!(st, { match: 'x' });
  expect(st.match).toBe(7);
  const f = fakeCtx();
  expect(tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 99 } as any).settings.match).toBe(3);
  expect(tawla.start(f.ctx, ['aaaa', 'bbbb'], undefined as any).settings.match).toBe(3);
  expect(() => tawla.start(f.ctx, ['aaaa'], { match: 1 })).toThrow();
});

test('tawla: shots are counted out of 36', () => {
  // my blot on my 7, the opponent 6 pips away (its 24 = my 1? no: opponent checker on its 12 = my 13)
  const me = posOf({ 7: 1, 6: 14 }, { 24: 1, 1: 14 }); // the opponent's back checker (its 24 = my 1) is 6 behind my 7 (its 18)
  const { shots } = shotLoss(me[0], me[1]);
  // direct 6: 11 rolls with a 6 + 5-1, 4-2 (4 rolls) + 3-3, 2-2 (doubles reaching 6) = 17
  expect(shots).toBe(17);
  expect(shotLoss(posOf({ 6: 15 }, { 12: 15 })[0], posOf({ 6: 15 }, { 12: 15 })[1]).shots).toBe(0);
  expect(evalExpert(tawlaStart(), 0)).toBeGreaterThan(-100);
});

test('tawla: bots of every level finish a match on their own', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const bots = ['bot1', 'bot2'];
    const f = fakeCtx(bots, level);
    const s = tawla.start(f.ctx, bots, { match: 3 });
    drive(f, s, bots);
    expect(s.phase).toBe('final');
    expect(Math.max(...Object.values(s.points))).toBeGreaterThanOrEqual(3);
    expect(tawla.result!(s)!.places.flat().sort()).toEqual(bots);
  }
}, 60000);

test('tawla: the expert bot beats the easy bot most of the time', () => {
  let wins = 0;
  const N = 16;
  for (let g = 0; g < N; g++) {
    const pos = tawlaStart();
    let side: TawlaSide = g % 2 ? 1 : 0; // the expert is side 0
    for (let turn = 0; turn < 600; turn++) {
      const d = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
      const left = d[0] === d[1] ? [d[0], d[0], d[0], d[0]] : d;
      const st = tawlaBotSteps(pos, side, left, side === 0 ? 'expert' : 'easy');
      for (const x of st) {
        pos[side][x.from]--;
        if (x.to === 0) pos[side][0]++;
        else {
          pos[side][x.to]++;
          const o = pos[side === 0 ? 1 : 0];
          if (o[25 - x.to] === 1) {
            o[25 - x.to] = 0;
            o[25]++;
          }
        }
      }
      if (pos[side][0] === 15) break;
      side = side === 0 ? 1 : 0;
    }
    if (pos[0][0] === 15) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(12);
}, 60000);

test('tawla: undo while the turn is open, and the turn confirms itself after a pause', () => {
  const f = fakeCtx();
  const s = tawla.start(f.ctx, ['aaaa', 'bbbb'], { match: 1 });
  s.rig = [[3], [1]];
  tawla.act(f.ctx, s, s.seats[0], { type: 'roll' });
  tawla.act(f.ctx, s, s.seats[1], { type: 'roll' });
  const p0 = s.seats[0];
  let v = tawla.view(f.ctx, s, p0) as any;
  expect(v.canUndo).toBe(false);
  expect(v.targets.some((t: any) => t.from === 8 && t.to === 5)).toBe(true);
  tawla.act(f.ctx, s, p0, { type: 'move', from: 8, to: 5 });
  tawla.act(f.ctx, s, p0, { type: 'move', from: 6, to: 5 });
  v = tawla.view(f.ctx, s, p0) as any;
  expect(v.canUndo).toBe(true);
  expect(v.canDone).toBe(true);
  expect(v.timerAt).toBe(s.timer!.at);
  // undo both, the turn stays open
  tawla.act(f.ctx, s, p0, { type: 'undo' });
  tawla.act(f.ctx, s, p0, { type: 'undo' });
  expect(s.timer).toBeNull();
  expect(s.pos[0][8]).toBe(3);
  expect(s.left).toEqual([3, 1]);
  // the other player can't undo or confirm for me
  expect(() => tawla.act(f.ctx, s, s.seats[1], { type: 'undo' })).toThrow();
  expect(s.left).toEqual([3, 1]);
  tawla.act(f.ctx, s, p0, { type: 'move', from: 8, to: 4 }); // 3 + 1 with one checker
  expect(s.left).toEqual([]);
  f.ctx.now = s.timer!.at - 1;
  expect(tawla.tick!(f.ctx, s)).toBe(false);
  f.ctx.now = s.timer!.at;
  expect(tawla.tick!(f.ctx, s)).toBe(true);
  expect(s.turn).toBe(1);
  expect(s.phase).toBe('roll');
});
