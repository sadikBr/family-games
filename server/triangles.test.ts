/** «المثلثات» — board geometry, bands, triangles, turns, the end, leaving, settings and the bots. */
import { expect, test } from 'bun:test';

import { TRIANGLES_DEFAULTS, triBandEdges, triCounts, triGeometry, type TrianglesSettings } from '../src/shared/games/triangles';
import { exactSearch, sidesOf, trianglesBotBand, type TriLevel } from './ai/triangles-bot';
import { triangles } from './games/triangles';
import { voiceTriangles } from './voice-calls-triangles';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Said = { text: string; by?: string; voice?: string };

const fakeCtx = (level: TriLevel = 'expert') => {
  const fx: string[] = [];
  const said: Said[] = [];
  const bots: { by: string; a: any }[] = [];
  const ctx: any = {
    now: 0,
    fx: (k: string, t?: string) => fx.push(t ? `${k}:${t}` : k),
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => ({ a: 'سارة', b: 'يوسف', c: 'الحسن', d: 'مريم' })[id] ?? id,
    memo: new Map(),
    bot: (by: string, _k: string, _d: number, a: any) => bots.push({ by, a }),
    say: (text: string, by?: string, voice?: string) => said.push({ text, by, voice }),
    botLevel: () => level,
  };
  return { ctx, fx, said, bots };
};

const S = (patch: Partial<TrianglesSettings> = {}): TrianglesSettings => ({ ...TRIANGLES_DEFAULTS, ...patch });

/** The band (its two pegs) that covers exactly this edge. */
const unit = (n: number, e: number) => {
  const [a, b] = triGeometry(n).edges[e];
  return { type: 'band', a, b };
};

test('triangles geometry: pegs, unit edges and unit triangles for both sizes', () => {
  expect(triCounts(3)).toEqual({ pts: 37, edges: 90, tris: 54 });
  expect(triCounts(4)).toEqual({ pts: 61, edges: 156, tris: 96 });
  for (const n of [3, 4]) {
    const g = triGeometry(n);
    const c = triCounts(n);
    expect(g.pts.length).toBe(c.pts);
    expect(g.edges.length).toBe(c.edges);
    expect(g.tris.length).toBe(c.tris);
    // every unit edge joins two neighbouring pegs (distance 1)
    for (const [a, b] of g.edges) expect(Math.hypot(g.pts[a].x - g.pts[b].x, g.pts[a].y - g.pts[b].y)).toBeCloseTo(1, 6);
    // every triangle has three distinct edges that join its three pegs; every edge borders 1 or 2 triangles
    const seen = new Map<number, number>();
    g.tris.forEach((t, i) => {
      expect(new Set(t.edges).size).toBe(3);
      expect(new Set(t.pts).size).toBe(3);
      for (const e of t.edges) {
        expect(t.pts).toContain(g.edges[e][0]);
        expect(t.pts).toContain(g.edges[e][1]);
        expect(g.edgeTris[e]).toContain(i);
        seen.set(e, (seen.get(e) ?? 0) + 1);
      }
    });
    expect(seen.size).toBe(c.edges);
    expect([...seen.values()].every((k) => k === 1 || k === 2)).toBe(true);
    expect([...seen.values()].filter((k) => k === 1).length).toBe(6 * n); // the border of the hexagon
    // the hexagon: |q|, |r|, |q+r| ≤ n, and the six corners are pegs
    for (const p of g.pts) expect(Math.max(Math.abs(p.q), Math.abs(p.r), Math.abs(p.q + p.r))).toBeLessThanOrEqual(n);
    for (const [q, r] of [[n, 0], [0, n], [-n, n], [-n, 0], [0, -n], [n, -n]]) expect(g.at(q, r)).toBeGreaterThanOrEqual(0);
    // bands: straight, of consecutive unit edges, 1 to 3 units, every one inside the board
    for (const s of g.segs) {
      expect(s.edges.length).toBeGreaterThanOrEqual(1);
      expect(s.edges.length).toBeLessThanOrEqual(3);
      expect(triBandEdges(g, s.a, s.b, 3)).toEqual(expect.arrayContaining(s.edges));
    }
    expect(g.segs.filter((s) => s.edges.length === 1).length).toBe(c.edges);
  }
});

test('triangles bands: the three directions both ways, lengths, not a line, the same peg', () => {
  const g = triGeometry(3);
  const o = g.at(0, 0);
  for (const [q, r] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]) {
    for (let k = 1; k <= 3; k++) {
      const b = g.at(q * k, r * k);
      const es = triBandEdges(g, o, b, 3);
      expect(Array.isArray(es) && es.length).toBe(k);
      // the same band the other way round covers the same edges
      expect(new Set(triBandEdges(g, b, o, 3) as number[])).toEqual(new Set(es as number[]));
    }
    expect(triBandEdges(g, o, g.at(q * 3, r * 3), 2)).toBe('long');
    expect(triBandEdges(g, o, g.at(q * 2, r * 2), 1)).toBe('long');
  }
  expect(triBandEdges(g, o, g.at(1, 1), 3)).toBe('line'); // across a rhombus: not a lattice line
  expect(triBandEdges(g, o, g.at(2, 1), 3)).toBe('line');
  expect(triBandEdges(g, o, o, 3)).toBe('same');
});

test('triangles: a band must be straight, short enough and cover a new edge; only on your turn', () => {
  const { ctx } = fakeCtx();
  const s = triangles.start(ctx, ['a', 'b'], S({ band: 2 }));
  const g = triGeometry(3);
  const [p, q] = s.seats;
  const o = g.at(0, 0);
  expect(() => triangles.act(ctx, s, q, { type: 'band', a: o, b: g.at(1, 0) })).toThrow('ليس دورك');
  expect(() => triangles.act(ctx, s, p, { type: 'band', a: o, b: g.at(1, 1) })).toThrow(); // not a line
  expect(() => triangles.act(ctx, s, p, { type: 'band', a: o, b: g.at(3, 0) })).toThrow(); // 3 units with band 2
  expect(() => triangles.act(ctx, s, p, { type: 'band', a: o, b: o })).toThrow();
  triangles.act(ctx, s, p, { type: 'band', a: o, b: g.at(2, 0) }); // two units
  expect(s.edges.filter((x) => x >= 0).length).toBe(2);
  expect(s.bands).toEqual([[o, g.at(2, 0), 0]]);
  expect(triangles.turnOf!(s)).toEqual([q]);
  // the same band, or a part of it, covers nothing new: refused
  expect(() => triangles.act(ctx, s, q, { type: 'band', a: g.at(2, 0), b: o })).toThrow('مغطاة');
  expect(() => triangles.act(ctx, s, q, { type: 'band', a: g.at(1, 0), b: o })).toThrow('مغطاة');
  // over a covered edge onto a new one: fine, only the new edge counts
  triangles.act(ctx, s, q, { type: 'band', a: g.at(1, 0), b: g.at(3, 0) });
  expect(s.edges.filter((x) => x >= 0).length).toBe(3);
  expect(s.edges[g.edgeOf(g.at(2, 0), g.at(3, 0))]).toBe(1);
  expect(s.edges[g.edgeOf(g.at(1, 0), g.at(2, 0))]).toBe(0); // still the first band's
  // nonsense is ignored
  triangles.act(ctx, s, p, { type: 'band', a: -1, b: 999 });
  triangles.act(ctx, s, p, { type: 'band', a: 'x', b: 2 });
  expect(s.moves).toBe(2);
});

test('triangles: completing a triangle takes it and gives another turn; otherwise the turn passes', () => {
  const { ctx, said } = fakeCtx();
  const s = triangles.start(ctx, ['a', 'b'], S({ band: 1 }));
  const g = triGeometry(3);
  const [p, q] = s.seats;
  const [e1, e2, e3] = g.tris[10].edges;
  triangles.act(ctx, s, p, unit(3, e1));
  triangles.act(ctx, s, q, unit(3, e2));
  expect(triangles.turnOf!(s)).toEqual([p]);
  triangles.act(ctx, s, p, unit(3, e3));
  expect(s.tris[10]).toBe(0);
  expect(s.points[p]).toBe(1);
  expect(s.lastTris).toEqual([10]);
  expect(triangles.turnOf!(s)).toEqual([p]); // plays again
  expect(said.at(-1)!.text).toContain('ودور إضافي');
  const v = triangles.view(ctx, s, q) as any;
  expect(v.last).toBe(2);
  expect(v.me).toBe(1);
  expect(v.tris[10]).toBe(0);
});

test('triangles: one band can complete several triangles at once (both sides of an edge, or along its line)', () => {
  const { ctx, said } = fakeCtx();
  const s = triangles.start(ctx, ['a', 'b'], S({ band: 2 }));
  const g = triGeometry(3);
  const [p] = s.seats;
  // an inner edge: cover the other four sides of its two triangles, then the edge closes both
  const e = g.edgeTris.findIndex((ts) => ts.length === 2);
  const others = g.edgeTris[e].flatMap((t) => g.tris[t].edges).filter((x) => x !== e);
  for (const x of others) s.edges[x] = 1;
  triangles.act(ctx, s, p, unit(3, e));
  expect(s.points[p]).toBe(2);
  expect(s.lastTris.slice().sort()).toEqual(g.edgeTris[e].slice().sort());
  expect(said.at(-1)!.voice).toContain('مُثَلَّثَانِ');
  // a two-unit band whose two edges each finish a triangle somewhere else
  const s2 = triangles.start(ctx, ['a', 'b'], S({ band: 2 }));
  const who = triangles.turnOf!(s2)[0];
  const seg = g.segs.find((x) => x.edges.length === 2 && x.edges.every((y) => g.edgeTris[y].length === 2))!;
  const target = seg.edges.map((y) => g.edgeTris[y][0]);
  for (const t of target) for (const x of g.tris[t].edges) if (!seg.edges.includes(x)) s2.edges[x] = 1;
  triangles.act(ctx, s2, who, { type: 'band', a: seg.a, b: seg.b });
  expect(s2.points[who]).toBe(2);
  expect(s2.lastTris.slice().sort()).toEqual(target.slice().sort());
  expect(triangles.turnOf!(s2)).toEqual([who]);
});

test('triangles: without «دور إضافي عند الإكمال» the turn passes even after a triangle', () => {
  const { ctx, said } = fakeCtx();
  const s = triangles.start(ctx, ['a', 'b'], S({ band: 1, bonus: false }));
  const g = triGeometry(3);
  const [p, q] = s.seats;
  const [e1, e2, e3] = g.tris[0].edges;
  s.edges[e1] = 1;
  s.edges[e2] = 1;
  triangles.act(ctx, s, p, unit(3, e3));
  expect(s.points[p]).toBe(1);
  expect(triangles.turnOf!(s)).toEqual([q]);
  expect(said.at(-1)!.text).not.toContain('دور إضافي');
});

test('triangles: the game ends when every edge is covered; most triangles wins, ties are allowed', () => {
  const g = triGeometry(3);
  {
    const { ctx, fx, said } = fakeCtx();
    const s = triangles.start(ctx, ['a', 'b'], S({ band: 1 }));
    const [p] = s.seats;
    // everything covered but one edge of the last triangle; p owns all the others
    const lastE = g.tris[53].edges.find((e) => g.edgeTris[e].length === 1)!;
    s.edges = s.edges.map((_, e) => (e === lastE ? -1 : 0));
    s.tris = s.tris.map((_, t) => (t === 53 ? -1 : 0));
    s.points[p] = 53;
    triangles.act(ctx, s, p, unit(3, lastE));
    expect(s.phase).toBe('final');
    expect(s.reason).toBe('full');
    expect(s.winners).toEqual([p]);
    expect(s.score[p]).toBe(1);
    expect(fx).toContain(`win:${p}`);
    expect(triangles.turnOf!(s)).toEqual([]);
    expect(triangles.result!(s)).toEqual({ places: [[p], [s.seats[1]]] });
    expect(said.at(-1)!.voice).toContain('الفَوْزُ');
    expect(said.at(-1)!.text).not.toContain('دور إضافي');
  }
  {
    // a tie: 27–27
    const { ctx, said } = fakeCtx();
    const s = triangles.start(ctx, ['a', 'b'], S({ band: 1 }));
    const [p, q] = s.seats;
    const lastE = g.tris[53].edges.find((e) => g.edgeTris[e].length === 1)!;
    s.edges = s.edges.map((_, e) => (e === lastE ? -1 : 0));
    s.tris = s.tris.map((_, t) => (t === 53 ? -1 : t < 27 ? 0 : 1));
    s.points[p] = 26;
    s.points[q] = 27;
    triangles.act(ctx, s, p, unit(3, lastE));
    expect(s.phase).toBe('final');
    expect(s.winners!.slice().sort()).toEqual([p, q].sort());
    expect(s.score[p]).toBe(0);
    expect(s.score[q]).toBe(0);
    expect(triangles.result!(s)!.places[0].length).toBe(2);
    expect(said.at(-1)!.voice).toContain('تَعَادُلْ');
  }
});

test('triangles: the first move alternates; 3–4 players keep their seats and pass the first move along', () => {
  const { ctx } = fakeCtx();
  const a = triangles.start(ctx, ['a', 'b'], S()).seats[0];
  const b = triangles.start(ctx, ['a', 'b'], S()).seats[0];
  expect(b).not.toBe(a);
  const g1 = triangles.start(ctx, ['a', 'b', 'c'], S()).seats;
  const g2 = triangles.start(ctx, ['a', 'b', 'c'], S()).seats;
  expect(g2[0]).toBe(g1[1]);
});

test('triangles: leaving or resigning — the others carry on, the last one standing wins', () => {
  const { ctx } = fakeCtx();
  const s = triangles.start(ctx, ['a', 'b', 'c'], S());
  const [p, q, r] = s.seats;
  triangles.onLeave!(ctx, s, p); // it was p's turn
  expect(triangles.turnOf!(s)).toEqual([q]);
  triangles.act(ctx, s, q, unit(3, 0));
  expect(triangles.turnOf!(s)).toEqual([r]);
  triangles.act(ctx, s, r, { type: 'resign' });
  expect(s.phase).toBe('final');
  expect(s.winners).toEqual([q]);
  expect(s.reason).toBe('forfeit');
  expect(triangles.result!(s)!.places.at(-1)!.slice().sort()).toEqual([p, r].sort());
  const two = triangles.start(ctx, ['a', 'b'], S());
  triangles.act(ctx, two, two.seats[1], { type: 'resign' });
  expect(two.winners).toEqual([two.seats[0]]);
});

test('triangles settings: size 3/4, band 1–3, the extra turn; anything else is ignored', () => {
  const s = S();
  expect(s).toEqual({ size: 3, band: 2, bonus: true });
  triangles.patchSettings!(s, { size: 4, band: 3, bonus: false });
  expect(s).toEqual({ size: 4, band: 3, bonus: false });
  triangles.patchSettings!(s, { size: 7, band: 0, bonus: 'yes' });
  expect(s).toEqual({ size: 4, band: 3, bonus: false });
  triangles.patchSettings!(s, { size: 3, band: 1 });
  expect(s).toEqual({ size: 3, band: 1, bonus: false });
  // the big board starts with 156 free edges and 96 open triangles
  const { ctx } = fakeCtx();
  const big = triangles.start(ctx, ['a', 'b'], { size: 4, band: 2, bonus: true });
  expect(big.edges.length).toBe(156);
  expect(big.tris.length).toBe(96);
});

test('triangles voice: several triangles at once and nothing for one; Arabic letters and marks only', () => {
  expect(voiceTriangles(1)).toBe(false);
  for (const k of [2, 3, 4, 7]) expect(voiceTriangles(k)).toMatch(/^[ء-يً-ْ ]+$/);
});

/* —— bots ————————————————————————————————————————————————————————————————————————————— */

test('triangles bots: expert takes a free triangle and never gives one away while a safe band exists', () => {
  const g = triGeometry(3);
  // one triangle with two sides covered somewhere: take it
  const cov = Array(g.edges.length).fill(0);
  const [e1, e2, e3] = g.tris[20].edges;
  cov[e1] = cov[e2] = 1;
  for (const level of ['easy', 'smart', 'expert'] as TriLevel[]) {
    const m = trianglesBotBand(3, 2, true, cov, level, 60);
    const es = triBandEdges(g, m.a, m.b, 2) as number[];
    expect(es).toContain(e3);
  }
  // random positions with safe bands left: smart and expert never give a triangle its second side
  for (let trial = 0; trial < 25; trial++) {
    const c = Array(g.edges.length).fill(0);
    // cover random edges as long as every triangle keeps at most one covered side
    const order = g.edges.map((_, e) => e).sort(() => Math.random() - 0.5);
    for (const e of order.slice(0, 8 + (trial % 12))) {
      const sides = sidesOf(g, c);
      if (g.edgeTris[e].every((t) => sides[t] === 0)) c[e] = 1;
    }
    const sides = sidesOf(g, c);
    const safeLeft = c.some((x, e) => !x && g.edgeTris[e].every((t) => sides[t] === 0));
    if (!safeLeft) continue;
    for (const level of ['smart', 'expert'] as TriLevel[]) {
      const m = trianglesBotBand(3, 2, true, c, level, 60);
      const news = (triBandEdges(g, m.a, m.b, 2) as number[]).filter((e) => !c[e]);
      expect(news.length).toBeGreaterThan(0);
      for (const e of news) for (const t of g.edgeTris[e]) expect(sides[t]).toBe(0);
    }
  }
});

test('triangles bots: expert keeps control with a double-cross (one-unit bands)', () => {
  // two chains of 7 triangles (the top and bottom strips of the small board, slanted edges free, ends
  // at the border); everything else is covered. One chain is opened at its end: taking everything and
  // opening the other chain nets 0, taking 5 and declining the last 2 nets +10.
  const g = triGeometry(3);
  const { ctx } = fakeCtx('expert');
  const s = triangles.start(ctx, ['a', 'b'], S({ band: 1 }));
  const [p, q] = s.seats;
  const inStrip = (t: number, r0: number) => g.tris[t].pts.every((i) => g.pts[i].r === r0 || g.pts[i].r === r0 + 1);
  const chain = (r0: number) => g.tris.map((_, t) => t).filter((t) => inStrip(t, r0));
  const A = chain(2), B = chain(-3);
  expect(A.length).toBe(7);
  expect(B.length).toBe(7);
  const slanted = (e: number) => g.pts[g.edges[e][0]].r !== g.pts[g.edges[e][1]].r;
  const free = new Set([...A, ...B].flatMap((t) => g.tris[t].edges.filter(slanted)));
  s.edges = s.edges.map((_, e) => (free.has(e) ? -1 : 0));
  s.tris = s.tris.map((_, t) => (A.includes(t) || B.includes(t) ? -1 : 0));
  // p opens chain A at its border end
  const end = [...free].find((e) => g.edgeTris[e].length === 1 && A.includes(g.edgeTris[e][0]))!;
  triangles.act(ctx, s, p, unit(3, end));
  expect(triangles.turnOf!(s)).toEqual([q]);
  for (let guard = 0; guard < 60 && s.phase === 'play'; guard++) {
    const who = triangles.turnOf!(s)[0];
    const m = trianglesBotBand(3, 1, true, s.edges.map((x) => x >= 0), 'expert', 3000);
    triangles.act(ctx, s, who, { type: 'band', ...m });
  }
  expect(s.phase).toBe('final');
  expect(s.points[q]).toBe(12);
  expect(s.points[p]).toBe(2);
});

test('triangles bots: the exact search agrees with the chain endgame on random chain positions', () => {
  const g = triGeometry(3);
  const b = { g, segs: g.segs.filter((x) => x.edges.length === 1), bonus: true };
  let checked = 0;
  for (let trial = 0; trial < 40 && checked < 3; trial++) {
    const cov = new Uint8Array(g.edges.length);
    for (;;) {
      const sides = sidesOf(g, cov);
      const safe = [...cov.keys()].filter((e) => !cov[e] && g.edgeTris[e].every((t) => sides[t] === 0));
      if (!safe.length) break;
      cov[safe[Math.floor(Math.random() * safe.length)]] = 1;
    }
    let free = 0;
    for (const x of cov) if (!x) free++;
    if (free > 24) continue;
    const r = exactSearch(b as any, cov, performance.now() + 3000);
    if (!r) continue;
    checked++;
    // the side that must open a chain can't win everything that is left: the value stays inside its bounds
    let open = 0;
    const sides = sidesOf(g, cov);
    for (const x of sides) if (x < 3) open++;
    expect(Math.abs(r.v)).toBeLessThanOrEqual(open);
    expect(r.v).toBeLessThanOrEqual(open - 2);
  }
});

/** A whole game between bots, straight through the module (no timers). Returns the points by level. */
function botGame(levels: TriLevel[], settings: TrianglesSettings) {
  const { ctx } = fakeCtx();
  const ids = levels.map((_, i) => 'abcd'[i]);
  const s = triangles.start(ctx, ids, settings);
  let worst = 0;
  for (let guard = 0; guard < 400 && s.phase === 'play'; guard++) {
    const who = triangles.turnOf!(s)[0];
    const level = levels[ids.indexOf(who)];
    const t0 = performance.now();
    const m = trianglesBotBand(s.size, s.band, s.bonus, s.edges.map((x) => x >= 0), level);
    worst = Math.max(worst, performance.now() - t0);
    triangles.act(ctx, s, who, { type: 'band', ...m });
  }
  return { s, ids, worst };
}

test('triangles bots: every level finishes games on both boards, every band length, 2–4 players', () => {
  const runs: [TriLevel[], TrianglesSettings][] = [
    [['easy', 'smart'], { size: 3, band: 1, bonus: true }],
    [['smart', 'easy', 'easy'], { size: 3, band: 3, bonus: true }],
    [['easy', 'smart', 'easy', 'smart'], { size: 4, band: 2, bonus: false }],
    [['expert', 'easy'], { size: 4, band: 2, bonus: true }],
    [['expert', 'smart'], { size: 3, band: 3, bonus: false }],
  ];
  for (const [levels, settings] of runs) {
    const { s } = botGame(levels, settings);
    expect(s.phase).toBe('final');
    expect(s.edges.every((x) => x >= 0)).toBe(true);
    expect(s.tris.every((x) => x >= 0)).toBe(true);
    expect(Object.values(s.points).reduce((a, b) => a + b, 0)).toBe(triCounts(settings.size).tris);
  }
}, 120000);

test('triangles bots: expert beats easy almost always (default rules)', () => {
  let wins = 0;
  const games = 6;
  for (let i = 0; i < games; i++) {
    const levels: TriLevel[] = i % 2 ? ['easy', 'expert'] : ['expert', 'easy'];
    const { s, ids } = botGame(levels, S());
    const exp = ids[levels.indexOf('expert')];
    if (s.winners?.length === 1 && s.winners[0] === exp) wins++;
  }
  expect(wins).toBeGreaterThanOrEqual(5);
}, 120000);

test('triangles bots: the room bot plays through botPlan with a human delay', () => {
  const { ctx, bots } = fakeCtx('smart');
  const s = triangles.start(ctx, ['a', 'b'], S());
  const who = triangles.turnOf!(s)[0];
  triangles.botPlan!(ctx, s, [who]);
  expect(bots.length).toBe(1);
  expect(bots[0].by).toBe(who);
  expect(bots[0].a.type).toBe('band');
  triangles.act(ctx, s, who, bots[0].a);
  expect(s.moves).toBe(1);
  // not its turn any more: nothing scheduled for it
  triangles.botPlan!(ctx, s, [who]);
  expect(bots.length).toBe(1);
});
