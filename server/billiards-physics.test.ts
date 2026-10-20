/** «البلياردو» — the physics: determinism, pots, cushions, no overlaps, energy, pockets, racks, the recorded shot. */
import { expect, test } from 'bun:test';

import {
  BREAK_SPOT,
  CORNER_NOSE,
  FOOT_X,
  FOOT_Y,
  HEAD_Y,
  L,
  MAX_SHOT_S,
  POCKETS,
  R,
  SIDE_HALF,
  W,
  aimGuide,
  decodeTrack,
  legalCueSpot,
  nearestCueSpot,
  powerOf,
  rackEight,
  rackNine,
  simulate,
  speedOf,
  spotBall,
  straightDrop,
  trackAt,
  type BallPos,
} from '../src/shared/games/billiards-physics';
import { isSolid, isStripe } from '../src/shared/games/billiards';

function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const breakBalls = (seed: number, nine = false): BallPos[] => [{ id: 0, x: BREAK_SPOT.x, y: BREAK_SPOT.y }, ...(nine ? rackNine(seeded(seed)) : rackEight(seeded(seed)))];
const breakAngle = (balls: BallPos[]) => Math.atan2(FOOT_Y - balls[0].y, FOOT_X - balls[0].x);

test('physics: the same shot on the same balls gives exactly the same result (and record)', () => {
  const balls = breakBalls(7);
  const shot = { angle: breakAngle(balls) + 0.002, power: 1, spin: 0.3 };
  const a = simulate(balls, shot, true);
  const b = simulate(balls, shot, true);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  // and without recording, the outcome is the same
  const c = simulate(balls, shot, false);
  expect(c.balls).toEqual(a.balls);
  expect(c.pocketed).toEqual(a.pocketed);
  expect(c.firstHit).toBe(a.firstHit);
});

test('physics: a straight shot pockets the ball (and draw / follow move the cue ball as they should)', () => {
  const obj = { id: 1, x: 300, y: 300 };
  const dir = Math.atan2(-obj.y, -obj.x);
  const cue = { id: 0, x: obj.x - Math.cos(dir) * 600, y: obj.y - Math.sin(dir) * 600 };
  const stun = simulate([cue, obj], { angle: dir, power: 0.42, spin: 0 });
  expect(stun.pocketed.map((p) => [p.id, p.pocket])).toContainEqual([1, 0]);
  expect(stun.firstHit).toBe(1);
  const draw = simulate([cue, obj], { angle: dir, power: 0.5, spin: -1 });
  const follow = simulate([cue, obj], { angle: dir, power: 0.42, spin: 1 });
  const dist = (r: typeof stun) => {
    const c = r.balls.find((b) => b.id === 0);
    return c ? Math.hypot(c.x - cue.x, c.y - cue.y) : Infinity;
  };
  // draw comes back towards where it started, follow goes on after the object ball
  expect(draw.pocketed.some((p) => p.id === 1)).toBe(true);
  expect(dist(draw)).toBeLessThan(450);
  expect(dist(follow)).toBeGreaterThan(dist(stun));
});

test('physics: a cushion sends the ball back at a sane angle', () => {
  // up and to the right, into the right cushion at 45°
  const r = simulate([{ id: 0, x: 500, y: 1000 }], { angle: -Math.PI / 4, power: 0.3, spin: 0 }, true);
  const tr = decodeTrack(r.record!.tr['0']);
  // the bounce: the keyframe with the largest x
  let k = 0;
  for (let i = 0; i < tr.x.length; i++) if (tr.x[i] > tr.x[k]) k = i;
  expect(tr.x[k]).toBeGreaterThan(W - R - 2);
  expect(tr.x[k]).toBeLessThan(W - R + 2);
  const end = tr.x.length - 1;
  const dx = tr.x[end] - tr.x[k];
  const dy = tr.y[end] - tr.y[k];
  expect(dx).toBeLessThan(0);
  expect(dy).toBeLessThan(0);
  const fromNormal = (Math.atan2(-dy, -dx) * 180) / Math.PI;
  expect(fromNormal).toBeGreaterThan(38);
  expect(fromNormal).toBeLessThan(68);
  // it comes off slower than it arrived
  const vin = Math.hypot(tr.x[k] - tr.x[k - 1], tr.y[k] - tr.y[k - 1]) / (tr.t[k] - tr.t[k - 1]);
  const vout = Math.hypot(tr.x[k + 1] - tr.x[k], tr.y[k + 1] - tr.y[k]) / (tr.t[k + 1] - tr.t[k]);
  expect(vout).toBeLessThan(vin);
});

test('physics: after any shot, no two balls overlap and every ball is on the cloth', () => {
  const rnd = seeded(3);
  for (let n = 0; n < 40; n++) {
    const balls = breakBalls(n, n % 2 === 1);
    balls[0].x = R + 10 + rnd() * (W - 2 * R - 20);
    const r = simulate(balls, { angle: breakAngle(balls) + (rnd() - 0.5) * 0.6, power: 0.3 + rnd() * 0.7, spin: rnd() * 2 - 1 });
    for (let i = 0; i < r.balls.length; i++) {
      const a = r.balls[i];
      // on the cloth; closer than a radius to a cushion line only in a pocket's mouth (a ball hanging in the jaws)
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x).toBeLessThanOrEqual(W);
      expect(a.y).toBeGreaterThanOrEqual(0);
      expect(a.y).toBeLessThanOrEqual(L);
      if (a.x < R - 0.01 || a.x > W - R + 0.01) expect(a.y < CORNER_NOSE || a.y > L - CORNER_NOSE || Math.abs(a.y - L / 2) < SIDE_HALF).toBe(true);
      if (a.y < R - 0.01 || a.y > L - R + 0.01) expect(a.x < CORNER_NOSE || a.x > W - CORNER_NOSE).toBe(true);
      for (let j = i + 1; j < r.balls.length; j++) {
        const b = r.balls[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * R - 0.05);
      }
    }
    // a ball is either still on the table or in exactly one pocket
    const ids = [...r.balls.map((b) => b.id), ...r.pocketed.map((p) => p.id)].sort((a, b) => a - b);
    expect(ids).toEqual(balls.map((b) => b.id).sort((a, b) => a - b));
  }
});

test('physics: the energy only goes down, and everything stops', () => {
  for (const seed of [1, 2, 3]) {
    const balls = breakBalls(seed);
    let prev = Infinity;
    let first = 0;
    let last = 0;
    let rises = 0;
    simulate(balls, { angle: breakAngle(balls), power: 1, spin: 0.5 }, false, (t, e) => {
      if (!first) first = e;
      if (e > prev * (1 + 1e-9) + 1e-6) rises++;
      prev = e;
      last = e;
    });
    expect(rises).toBe(0);
    expect(first).toBeGreaterThan(0);
    expect(last).toBe(0);
  }
});

test('physics: pockets — a ball rolled into a side pocket drops, one coming in too flat rattles off the jaw', () => {
  const straight = simulate([{ id: 0, x: 400, y: L / 2 }], { angle: Math.PI, power: 0.25, spin: 0 });
  expect(straight.pocketed).toEqual([expect.objectContaining({ id: 0, pocket: 2 })]);
  // along the cushion, nearly parallel to it: hits the nose of the side pocket
  const flat = simulate([{ id: 0, x: R + 4, y: L / 2 + 400 }], { angle: -Math.PI / 2 - 0.02, power: 0.3, spin: 0 });
  expect(flat.pocketed.some((p) => p.pocket === 2)).toBe(false);
  // into a corner along the diagonal
  const corner = simulate([{ id: 0, x: 400, y: L - 400 }], { angle: Math.atan2(400, -400), power: 0.35, spin: 0 });
  expect(corner.pocketed.map((p) => p.pocket)).toEqual([4]);
  // straightDrop agrees with the simulation for a lone ball
  expect(straightDrop(400, L / 2, -1, 0)).toBe(2);
  expect(straightDrop(R + 4, L / 2 + 400, Math.cos(-Math.PI / 2 - 0.02), Math.sin(-Math.PI / 2 - 0.02))).toBe(-1);
  expect(POCKETS).toHaveLength(6);
});

test('physics: the racks — 8-ball triangle and 9-ball diamond', () => {
  for (let s = 0; s < 20; s++) {
    const e = rackEight(seeded(s));
    expect(e.map((b) => b.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    // the apex on the foot spot, the 8 in the middle of the third row
    const apex = e.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.abs(apex.x - FOOT_X)).toBeLessThan(1);
    expect(Math.abs(apex.y - FOOT_Y)).toBeLessThan(1);
    const eight = e.find((b) => b.id === 8)!;
    expect(Math.abs(eight.x - FOOT_X)).toBeLessThan(2);
    // back corners: one solid and one stripe
    const back = e.filter((b) => b.y < FOOT_Y - 4 * 2 * R * 0.85);
    const corners = [back.reduce((a, b) => (b.x < a.x ? b : a)), back.reduce((a, b) => (b.x > a.x ? b : a))];
    expect(corners.filter((b) => isSolid(b.id))).toHaveLength(1);
    expect(corners.filter((b) => isStripe(b.id))).toHaveLength(1);
    const n = rackNine(seeded(s));
    expect(n.map((b) => b.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const one = n.find((b) => b.id === 1)!;
    expect(Math.abs(one.y - FOOT_Y)).toBeLessThan(1);
    const nine = n.find((b) => b.id === 9)!;
    const cy = n.reduce((a, b) => a + b.y, 0) / 9;
    expect(Math.abs(nine.x - FOOT_X)).toBeLessThan(2);
    expect(Math.abs(nine.y - cy)).toBeLessThan(2);
    for (const rack of [e, n])
      for (let i = 0; i < rack.length; i++) for (let j = i + 1; j < rack.length; j++) expect(Math.hypot(rack[i].x - rack[j].x, rack[i].y - rack[j].y)).toBeGreaterThan(2 * R);
  }
});

test('physics: the recorded shot is small, capped, and plays back to the final positions', () => {
  for (const seed of [11, 12, 13]) {
    const balls = breakBalls(seed);
    const r = simulate(balls, { angle: breakAngle(balls), power: 1, spin: 0 }, true);
    const rec = r.record!;
    expect(rec.dur).toBeLessThanOrEqual(MAX_SHOT_S * 1000);
    expect(JSON.stringify(rec).length).toBeLessThan(12000);
    for (const b of r.balls) {
      const enc = rec.tr[String(b.id)];
      if (!enc) {
        // a ball that never moved
        const s = balls.find((x) => x.id === b.id)!;
        expect(Math.hypot(s.x - b.x, s.y - b.y)).toBeLessThan(0.01);
        continue;
      }
      const end = trackAt(decodeTrack(enc), rec.dur + 1000);
      expect(Math.hypot(end.x - b.x, end.y - b.y)).toBeLessThan(1.5);
    }
    for (const [id, pocket] of rec.pk) {
      const end = trackAt(decodeTrack(rec.tr[String(id)]), rec.dur);
      const p = POCKETS[pocket];
      expect(Math.hypot(end.x - p.x, end.y - p.y)).toBeLessThan(140);
    }
  }
});

test('physics: placing the cue ball — behind the head string for the break, never on another ball', () => {
  const balls = [{ id: 3, x: 500, y: 1600 }];
  expect(legalCueSpot(balls, 500, 1600, false)).toBe(false);
  expect(legalCueSpot(balls, 500, 1600 + 2 * R + 1, false)).toBe(true);
  expect(legalCueSpot(balls, 300, HEAD_Y - 10, true)).toBe(false);
  expect(legalCueSpot(balls, 300, HEAD_Y - 10, false)).toBe(true);
  expect(legalCueSpot(balls, R - 1, 900, false)).toBe(false);
  const p = nearestCueSpot(balls, 500, 1600, true);
  expect(legalCueSpot(balls, p.x, p.y, true)).toBe(true);
  expect(Math.hypot(p.x - 500, p.y - 1600)).toBeLessThan(2 * R + 10);
  // a re-spotted ball goes on the foot spot, or behind it when the spot is taken
  expect(spotBall([], 8)).toEqual({ id: 8, x: FOOT_X, y: FOOT_Y });
  const taken = spotBall([{ id: 2, x: FOOT_X, y: FOOT_Y }], 8);
  expect(taken.y).toBeLessThan(FOOT_Y - 2 * R + 0.1);
});

test('physics: the aim guide finds the first ball and the cut directions', () => {
  const g = aimGuide([{ id: 0, x: 500, y: 1500 }, { id: 5, x: 500, y: 800 }], 500, 1500, -Math.PI / 2);
  expect(g.ball).toBe(5);
  expect(g.hit.y).toBeCloseTo(800 + 2 * R, 3);
  expect(g.obj!.y).toBeCloseTo(-1, 5);
  expect(g.cue).toBeNull();
  const cut = aimGuide([{ id: 5, x: 520, y: 800 }], 500, 1500, -Math.PI / 2);
  expect(cut.obj!.x).toBeGreaterThan(0);
  expect(cut.cue!.x).toBeLessThan(0);
  const miss = aimGuide([{ id: 5, x: 900, y: 300 }], 500, 1500, -Math.PI / 2);
  expect(miss.ball).toBeNull();
  expect(miss.bounce!.y).toBeGreaterThan(0);
  expect(powerOf(speedOf(0.37))).toBeCloseTo(0.37, 6);
});
