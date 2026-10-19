/** «الباقي لنا» («سوا» in the Saudi Baloot) — claiming the rest of a hand in البلوط (Saudi and Moroccan rules) and in التريس. */
import { expect, test } from 'bun:test';

import type { BalootView, BCard, BRank, BSuit } from '../src/shared/games/baloot';
import { isBoss } from '../src/shared/baloot-rules';
import type { Card } from '../src/shared/cards';
import { annKey } from '../src/shared/baloot-morocco';
import { projectKey } from '../src/shared/baloot-rules';
import { balootClaim, sideCertain } from './ai/baloot-mind';
import { trisClaim, trisSimOf, trisTeamCertain } from './ai/tris-mind';
import { baloot, CLAIM_REVEAL_MS, decide, turnOf, type State } from './games/baloot';
import { CLAIM_REVEAL_MS as TRIS_REVEAL_MS, tris, type State as TrisState } from './games/tris';
import { VOICE } from './voice-calls';

const P = ['p0', 'p1', 'p2', 'p3'];
const c = (id: string): BCard => ({ id, suit: id.slice(-1) as BSuit, rank: id.slice(0, -1) as BRank });
const cs = (s: string) => (s ? s.split(' ').map(c) : []);

function fakeCtx(bots = true) {
  const said: string[] = [];
  const voices: (string | undefined)[] = [];
  const jobs: { by: string; a: any }[] = [];
  const ctx: any = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => bots,
    playerName: (id: string) => ({ p0: 'سارة', p1: 'يوسف', p2: 'ماما', p3: 'بابا' })[id] ?? id,
    memo: new Map(),
    bot: (by: string, _k: string, _d: number, a: any) => jobs.push({ by, a }),
    say: (t: string, _by?: string, voice?: string) => {
      said.push(t);
      voices.push(voice);
    },
    botLevel: () => 'easy',
  };
  return { ctx, said, voices, jobs };
}

/** A hand in play with the given cards left (p0 bought), `turn` to play, optionally a trick on the table. */
function position(o: { mode?: 'saudi' | 'morocco'; trump: BSuit | null; hands: string[]; turn: string; trick?: [string, string][] }) {
  const f = fakeCtx();
  const s = baloot.start(f.ctx, P, { mode: o.mode ?? 'saudi', target: o.mode === 'morocco' ? 1000 : 152, timer: 0, doubling: false, level: 2 }) as State;
  s.phase = 'play';
  s.bid = null;
  s.faceUp = null;
  s.contract = { mode: o.trump ? 'hokm' : 'sun', trump: o.trump, buyer: 'p0', caller: 'p0', call: o.trump ? 'hokm' : 'sun', mult: 1, gahwa: false };
  s.hands = Object.fromEntries(P.map((id, i) => [id, cs(o.hands[i])]));
  s.trick = (o.trick ?? []).map(([by, id]) => ({ by, card: c(id) }));
  const per = Math.max(...P.map((id) => s.hands[id].length));
  s.trickNo = 9 - per;
  s.turn = o.turn;
  s.pauseUntil = null;
  s.leadBoss = s.trick.length ? isBoss(s.trick[0].card, [...P.flatMap((id) => s.hands[id]), s.trick[0].card], o.trump) : false;
  for (const id of P) {
    s.avail[id] = [];
    s.declared[id] = [];
    s.maAvail[id] = [];
    s.maDeclared[id] = [];
  }
  return { ...f, s };
}

test('detection: a hand of top trumps and masters claims the rest (its holder alone)', () => {
  // حكم ♥: سارة holds J 9 A of trumps, nobody can ruff or overtake
  const hands = ['JH 9H AH', '7C 8C 9C', '7D 8D 9D', '10H KH JC'];
  const g = position({ trump: 'H', hands, turn: 'p0' });
  expect(balootClaim(g.s)).toEqual({ by: 'p0', side: 'A', reveal: ['p0'] });
  // the same cards in صن: بابا's 10♥ and K♥ beat the J♥ and the 9♥
  const sun = position({ trump: null, hands, turn: 'p0' });
  expect(balootClaim(sun.s)).toBeNull();
  // Moroccan rules too
  const ma = position({ mode: 'morocco', trump: 'H', hands, turn: 'p0' });
  expect(balootClaim(ma.s)).toEqual({ by: 'p0', side: 'A', reveal: ['p0'] });
});

test('detection: an opponent who could ruff (or overtake) means no claim', () => {
  // يوسف has no ♠ and holds a trump: he must trump the ace
  // (he then leads 8♦ to بابا's 9♦: here it is the other team that is certain of everything)
  const g = position({ trump: 'H', hands: ['AS AC', '7H 8D', '7S 7C', '8S 9D'], turn: 'p0' });
  expect(balootClaim(g.s)).toEqual({ by: 'p1', side: 'B', reveal: ['p1'] });
  // with ماما holding the 9♦ instead, nobody is certain
  const none = position({ trump: 'H', hands: ['AS AC', '7H 8D', '7S 9D', '8S 7C'], turn: 'p0' });
  expect(balootClaim(none.s)).toBeNull();
  // without that trump, the two aces are certain
  const ok = position({ trump: 'H', hands: ['AS AC', '9D 8D', '7S 7C', '8S 7D'], turn: 'p0' });
  expect(balootClaim(ok.s)?.side).toBe('A');
  // an opponent to lead with a master of his own: no claim for either team
  const lead = position({ trump: null, hands: ['AS AC', 'AD 7C', '7S 8C', '8S 9D'], turn: 'p1' });
  expect(balootClaim(lead.s)).toBeNull();
  // the last trick alone is not worth a claim
  expect(balootClaim(position({ trump: null, hands: ['AS', '7D', '7S', '8S'], turn: 'p0' }).s)).toBeNull();
});

test('detection: when it needs both partners to play well, nothing is offered (the hand is played out)', () => {
  // صن, سارة leads: A♠ first (ماما throws 8♥), then 7♥ to ماما's A♥ — neither hand is enough alone, and
  // nobody can count on the partner playing the right card
  const g = position({ trump: null, hands: ['AS 7H', 'QH 10H', 'AH 8H', 'QS 9H'], turn: 'p0' });
  expect(balootClaim(g.s)).toBeNull();
});

test('detection: a trick on the table counts (a void partner, the opponents still to play)', () => {
  // بابا led 10♣; سارة's A♣ takes it, then her J♠ 9♠ (nobody else has a trump) — certain
  const g = position({ trump: 'S', hands: ['JS 9S AC', '8C 9C 7D', '8D 9D 10D', '7H 8H'], turn: 'p0', trick: [['p3', '10C']] });
  expect(balootClaim(g.s)).toEqual({ by: 'p0', side: 'A', reveal: ['p0'] });
  // a trump left with يوسف: he would ruff a spade? no — but his 7♠ can't beat J♠ / 9♠; give him the A♣ instead
  const h = position({ trump: 'S', hands: ['JS 9S KC', 'AC 9C 7D', '8D 9D 10D', '7H 8H'], turn: 'p0', trick: [['p3', '10C']] });
  expect(balootClaim(h.s)).toBeNull();
});

/** Deep copy of a game (to play the same moment two ways). */
const copy = <T,>(x: T): T => structuredClone(x);

/**
 * Play the hand out: the opponents any way (the old bot), the claiming team along a line that keeps
 * every trick certain (the claim says such a line exists — the server checks it exactly).
 */
function playOut(ctx: any, s: State, side: 'A' | 'B') {
  for (let i = 0; i < 2000 && s.phase === 'play'; i++) {
    const id = turnOf(s)[0];
    if (id && (s.sides[0].members.includes(id) ? 'A' : 'B') === side) {
      const v = baloot.view(ctx, s, id) as BalootView;
      const keep = v.playable.find((card) => {
        const t = copy(s);
        baloot.act(fakeCtx(false).ctx, t, id, { type: 'play', card, declare: (t.avail[id] ?? []).map(projectKey) });
        // the trick just completed must be ours, and the rest still certain
        if (t.pauseUntil !== null && t.trickWinner && (t.sides[0].members.includes(t.trickWinner) ? 'A' : 'B') !== side) return false;
        return t.seats.every((p) => !t.hands[p].length) || sideCertain(t, side);
      });
      expect(keep).toBeDefined();
      baloot.act(ctx, s, id, { type: 'play', card: keep, declare: s.trickNo === 1 ? (s.avail[id] ?? []).map(projectKey) : s.trickNo === 2 ? (s.maAvail[id] ?? []).map(annKey) : [] });
    } else if (id) baloot.act(ctx, s, id, decide(s, id, 2)!);
    else {
      ctx.now += 500;
      baloot.tick!(ctx, s);
    }
  }
}

test('scoring after a claim equals playing the hand out (both rules, many hands)', () => {
  const real = Math.random;
  let seed = 7;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  try {
    let compared = 0;
    for (const mode of ['saudi', 'morocco'] as const) {
      for (let k = 0; k < 40 && compared < (mode === 'saudi' ? 12 : 24); k++) {
        const f = fakeCtx(false);
        const s = baloot.start(f.ctx, P, { mode, target: 5000, timer: 0, doubling: true, level: 2 }) as State;
        for (let i = 0; i < 3000 && s.phase !== 'handEnd'; i++) {
          if (s.claim && s.phase === 'play') {
            // A: claim · B: play it out (any legal play): the same hand result
            const a = copy(s);
            const b = copy(s);
            const fa = fakeCtx(false);
            const fb = fakeCtx(false);
            fa.ctx.now = fb.ctx.now = f.ctx.now;
            baloot.act(fa.ctx, a, a.claim!.by, { type: 'claim' });
            expect(a.claimed?.side).toBe(s.claim.side);
            fa.ctx.now += CLAIM_REVEAL_MS + 10;
            baloot.tick!(fa.ctx, a);
            playOut(fb.ctx, b, s.claim.side);
            expect(a.phase).toBe('handEnd');
            expect(b.phase).toBe('handEnd');
            const { claimed, ...ra } = a.result!;
            expect(claimed).toBe(s.claim.side);
            expect(ra).toEqual(b.result!);
            expect(a.scores).toEqual(b.scores);
            compared++;
            break;
          }
          const id = turnOf(s)[0];
          if (id) baloot.act(f.ctx, s, id, decide(s, id, 2)!);
          else {
            f.ctx.now += 500;
            baloot.tick!(f.ctx, s);
          }
        }
      }
    }
    expect(compared).toBeGreaterThanOrEqual(20);
  } finally {
    Math.random = real;
  }
}, 60_000);

test('the claim itself: hands shown to everyone, the hand ends, the announcement is noun-first', () => {
  // صن: سارة's A♠ and A♥ take both tricks whatever the three others play
  const g = position({ trump: null, hands: ['AS AH', 'QH 10H', '7H 8H', 'QS 9H'], turn: 'p0' });
  g.s.claim = balootClaim(g.s);
  expect((baloot.view(g.ctx, g.s, 'p0') as BalootView).canClaim).toBe(true);
  for (const id of ['p1', 'p2', 'p3']) expect((baloot.view(g.ctx, g.s, id) as BalootView).canClaim).toBe(false);
  // only the player it is offered to may claim
  expect(() => baloot.act(g.ctx, g.s, 'p1', { type: 'claim' })).toThrow();
  expect(g.s.claimed).toBeNull();
  baloot.act(g.ctx, g.s, 'p0', { type: 'claim' });
  const v = baloot.view(g.ctx, g.s, 'p3') as BalootView;
  expect(v.claimed?.reveal.map((r) => r.by)).toEqual(['p0']);
  expect(v.claimed?.reveal[0].cards.map((x) => x.id).sort()).toEqual(['AH', 'AS']);
  expect(v.myHand.map((x) => x.id).sort()).toEqual(['9H', 'QS']);
  expect(turnOf(g.s)).toEqual([]);
  // the Saudi call is «سوا» (the Moroccan rules keep «الباقي لنا»)
  expect(g.said.at(-1)).toBe('سوا لفريق سارة وماما — أُنهيت اليد');
  // nobody can play during the reveal; then the hand ends with the usual sheet
  baloot.act(g.ctx, g.s, 'p0', { type: 'play', card: 'AS' });
  expect(g.s.hands.p0.some((x) => x.id === 'AS')).toBe(true);
  g.ctx.now += CLAIM_REVEAL_MS - 100;
  expect(baloot.tick!(g.ctx, g.s)).toBe(false);
  g.ctx.now += 200;
  expect(baloot.tick!(g.ctx, g.s)).toBe(true);
  expect(g.s.phase).toBe('handEnd');
  expect(g.s.result!.claimed).toBe('A');
  // the 2 tricks left, their cards (A♠ 11, Q♥ 3, 10♥ 10, A♥ 11, Q♠ 3) and the last trick's 10
  expect(g.s.result!.tricks).toEqual({ A: 2, B: 0 });
  expect(g.s.result!.abnat).toEqual({ A: 48, B: 0 });
  expect(g.s.result!.ground).toBe('A');
});

test('the call: «سوا» in the Saudi game (heard «سْوَا»), «الباقي لنا» in the Moroccan one', () => {
  const hands = ['JH 9H AH', '7C 8C 9C', '7D 8D 9D', '10H KH JC'];
  const sa = position({ trump: 'H', hands, turn: 'p0' });
  sa.s.claim = balootClaim(sa.s);
  baloot.act(sa.ctx, sa.s, 'p0', { type: 'claim' });
  expect(sa.said.at(-1)).toBe('سوا لفريق سارة وماما — أُنهيت اليد');
  expect(sa.voices.at(-1)).toBe(VOICE.siwa);
  expect(VOICE.siwa).toBe('سْوَا');
  const ma = position({ mode: 'morocco', trump: 'H', hands, turn: 'p0' });
  ma.s.claim = balootClaim(ma.s);
  baloot.act(ma.ctx, ma.s, 'p0', { type: 'claim' });
  expect(ma.said.at(-1)).toBe('الباقي لفريق سارة وماما — أُنهيت اليد');
  expect(ma.voices.at(-1)).toBe(VOICE.claim);
});

test('bots claim at once; a human may keep playing (an old app without the button works)', () => {
  // all bots: a claim is planned as soon as it is certain
  let claims = 0;
  for (let k = 0; k < 6; k++) {
    const g = fakeCtx(true);
    const s = baloot.start(g.ctx, P, { target: 152, timer: 0, doubling: true, level: 2 }) as State;
    for (let i = 0; i < 4000 && s.phase !== 'handEnd'; i++) {
      baloot.botPlan!(g.ctx, s, P);
      const job = g.jobs.shift();
      g.jobs.length = 0;
      if (job) {
        if (s.claim) {
          expect(job).toMatchObject({ by: s.claim.by, a: { type: 'claim' } });
          claims++;
        }
        baloot.act(g.ctx, s, job.by, job.a);
        continue;
      }
      g.ctx.now += 500;
      baloot.tick!(g.ctx, s);
    }
    expect(s.phase).toBe('handEnd');
  }
  expect(claims).toBeGreaterThan(0);
  // humans who never claim: the hands are played to the end as before
  for (let k = 0; k < 6; k++) {
    const g = fakeCtx(false);
    const s = baloot.start(g.ctx, P, { target: 152, timer: 0, doubling: false, level: 2 }) as State;
    playOutAll(g.ctx, s);
    expect(s.phase).toBe('handEnd');
    expect(s.result!.claimed).toBeUndefined();
    expect(s.result!.tricks.A + s.result!.tricks.B).toBe(8);
  }
}, 60_000);

function playOutAll(ctx: any, s: State) {
  for (let i = 0; i < 4000 && s.phase !== 'handEnd' && s.phase !== 'final'; i++) {
    const id = turnOf(s)[0];
    if (id) baloot.act(ctx, s, id, decide(s, id, 2)!);
    else {
      ctx.now += 500;
      baloot.tick!(ctx, s);
    }
  }
}

test('the check is quick: capped at a few ms per move', () => {
  const times: number[] = [];
  for (const mode of ['saudi', 'morocco'] as const) {
    for (let k = 0; k < 8; k++) {
      const g = fakeCtx(false);
      const s = baloot.start(g.ctx, P, { mode, target: 5000, timer: 0, doubling: false, level: 2 }) as State;
      for (let i = 0; i < 4000 && s.phase !== 'handEnd'; i++) {
        const id = turnOf(s)[0];
        if (!id) {
          g.ctx.now += 500;
          baloot.tick!(g.ctx, s);
          continue;
        }
        const move = decide(s, id, 2)!;
        const t0 = performance.now();
        baloot.act(g.ctx, s, id, move); // the claim is worked out after every move
        times.push(performance.now() - t0);
      }
    }
  }
  times.sort((a, b) => a - b);
  // the searches are capped in nodes (the same work on every machine); generous margins for a busy test machine
  expect(times[Math.floor(times.length * 0.95)]).toBeLessThan(60);
  expect(times.reduce((a, b) => a + b, 0) / times.length).toBeLessThan(25);
}, 60_000);

/* ------------------------------------------------------------------ */
/* التريس                                                              */
/* ------------------------------------------------------------------ */

const tc = (id: string): Card => {
  const [suit, rank] = id.split('-');
  return { id, suit: suit as Card['suit'], rank: Number(rank) };
};
const tcs = (s: string) => s.split(' ').map(tc);

test('tris detection: masters claim the rest; a stronger card with an opponent stops it', () => {
  const hands = (h: string[]) => Object.fromEntries(P.map((id, i) => [id, tcs(h[i])]));
  // سارة holds the 3 and the 2 of coins and the 3 of cups; nobody else has a stronger card of a suit led
  const h1 = hands(['coins-3 coins-2 cups-3', 'coins-4 coins-5 swords-4', 'cups-4 cups-5 swords-5', 'clubs-4 clubs-5 clubs-6']);
  expect(trisClaim(trisSimOf(P, h1, [], 'p0'), P)).toEqual({ by: 'p0', side: 'A', reveal: ['p0'] });
  // يوسف to lead with a master of his own (the 3 of swords)
  const h2 = hands(['coins-3 coins-2 cups-3', 'coins-4 coins-5 swords-3', 'cups-4 cups-5 swords-5', 'clubs-4 clubs-5 clubs-6']);
  expect(trisClaim(trisSimOf(P, h2, [], 'p1'), P)).toBeNull();
});

test('tris: the claim scores like playing it out; bots claim; the hand sheet follows', () => {
  let compared = 0;
  for (let k = 0; k < 30 && compared < 8; k++) {
    const g = fakeCtx(false);
    const s = tris.start(g.ctx, P, { target: 500 } as any) as TrisState;
    for (let i = 0; i < 3000 && s.phase !== 'handEnd'; i++) {
      if (s.claim && s.phase === 'play') {
        const a = copy(s);
        const b = copy(s);
        const fa = fakeCtx(false);
        const fb = fakeCtx(false);
        tris.act(fa.ctx, a, a.claim!.by, { type: 'claim' });
        expect((tris.view(fa.ctx, a, 'p0') as any).claimed.side).toBe(s.claim.side);
        fa.ctx.now += TRIS_REVEAL_MS + 10;
        tris.tick!(fa.ctx, a);
        const team = s.claim.side === 'A' ? 0 : 1;
        for (let j = 0; j < 500 && b.phase !== 'handEnd'; j++) {
          if (b.phase === 'play') {
            const id = b.seats[b.turnIdx];
            const v = tris.view(fb.ctx, b, id) as any;
            // the claiming team keeps to a line where every trick stays certain; the others play anything
            let card = v.playable[0];
            if ((b.seats.indexOf(id) & 1) === team) {
              card = v.playable.find((cid: string) => {
                const t = copy(b);
                tris.act(fakeCtx(false).ctx, t, id, { type: 'play', card: cid });
                if (t.phase === 'trickEnd' && (t.seats.indexOf(t.trickWinner!) & 1) !== team) return false;
                const next = t.phase === 'trickEnd' ? trisSimOf(t.seats, t.hands, [], t.trickWinner!) : trisSimOf(t.seats, t.hands, t.trick, t.seats[t.turnIdx]);
                return next.left === 0 || trisTeamCertain(next, team);
              });
              expect(card).toBeDefined();
            }
            tris.act(fb.ctx, b, id, { type: 'play', card });
          } else {
            fb.ctx.now += 3000;
            tris.tick!(fb.ctx, b);
          }
        }
        expect(a.phase).toBe('handEnd');
        expect(a.handThirds).toEqual(b.handThirds);
        expect(a.tricksWon).toEqual(b.tricksWon);
        expect(a.scores).toEqual(b.scores);
        compared++;
        break;
      }
      if (s.phase === 'play') {
        const id = s.seats[s.turnIdx];
        const v = tris.view(g.ctx, s, id) as any;
        tris.act(g.ctx, s, id, { type: 'play', card: v.playable[v.playable.length - 1] });
      } else {
        g.ctx.now += 3000;
        tris.tick!(g.ctx, s);
      }
    }
  }
  expect(compared).toBeGreaterThanOrEqual(5);
  // bots claim at once
  const g = fakeCtx(true);
  const s = tris.start(g.ctx, P, { target: 500 } as any) as TrisState;
  let claimed = false;
  for (let i = 0; i < 3000 && s.phase !== 'handEnd'; i++) {
    tris.botPlan!(g.ctx, s, P);
    const job = g.jobs.shift();
    g.jobs.length = 0;
    if (job) {
      if (job.a.type === 'claim') claimed = true;
      tris.act(g.ctx, s, job.by, job.a);
      continue;
    }
    g.ctx.now += 500;
    tris.tick!(g.ctx, s);
  }
  expect(s.phase).toBe('handEnd');
  if (claimed) {
    expect(s.claimed).not.toBeNull();
    expect(g.said.some((t) => t.startsWith('الباقي لفريق '))).toBe(true);
  }
}, 60_000);
