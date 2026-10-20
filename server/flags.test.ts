/** «الأعلام والعواصم» — question kinds, what a phone sees before the reveal, scoring, bots, settings. */
import { expect, test } from 'bun:test';

import type { FlagsView } from '../src/shared/games/flags';
import { DEFAULT_SETTINGS } from '../src/shared/protocol';
import { COUNTRIES } from './flags-content';
import { FLAGS_BOT_KNOWS, flags, flagsBotAnswer, makeItem, optionsOf, pickDistractors, promptOf, regionPool, sanitizeFlags, startFlags, tooAlike, type FlagsState } from './games/flags';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';
import { voiceFastestRight } from './voice-calls-knowledge';

const P = ['a', 'b'];
const view = (ctx: TestCtx, s: FlagsState, me: string) => flags.view(ctx, s, me) as FlagsView;
const by = (code: string) => COUNTRIES.find((c) => c.code === code)!;

test('flags: settings — rounds, mode, region and level validated', () => {
  expect(sanitizeFlags(DEFAULT_SETTINGS.flags)).toEqual(DEFAULT_SETTINGS.flags);
  expect(sanitizeFlags({ rounds: 17, mode: 'capitals', region: 'arab', level: 'all' })).toEqual({ rounds: 15, mode: 'capitals', region: 'arab', level: 'all' });
  expect(sanitizeFlags({ mode: 'hack' as never, region: 'mars' as never, level: 'god' as never })).toEqual(DEFAULT_SETTINGS.flags);
  const s = { ...DEFAULT_SETTINGS.flags };
  flags.patchSettings!(s, { region: 'oceania', mode: 'flags' });
  expect(s).toMatchObject({ region: 'oceania', mode: 'flags', rounds: 10, level: 'easy' });
  flags.patchSettings!(s, { region: 'nowhere', rounds: 20 });
  expect(s).toMatchObject({ region: 'world', rounds: 20 });
});

test('flags: each kind shows the right prompt and options, and never the answer in the prompt', () => {
  const rnd = seeded(1);
  const pool = regionPool('world');
  const ma = by('ma');
  const flag = makeItem('flag', ma, pool, rnd);
  expect(promptOf(flag)).toEqual({ flag: 'ma' });
  expect(optionsOf(flag).map((o) => o.text)).toContain('المغرب');
  const capital = makeItem('capital', ma, pool, rnd);
  expect(promptOf(capital)).toEqual({ text: 'المغرب', flag: 'ma' });
  expect(optionsOf(capital).map((o) => o.text)).toContain('الرباط');
  const country = makeItem('country', ma, pool, rnd);
  // a capital → its country: no flag to give it away
  expect(promptOf(country)).toEqual({ text: 'الرباط' });
  const pick = makeItem('pickflag', ma, pool, rnd);
  expect(promptOf(pick)).toEqual({ text: 'المغرب' });
  expect(optionsOf(pick).every((o) => o.flag && !o.text)).toBe(true);
  expect(optionsOf(pick).map((o) => o.flag)).toContain('ma');
  // wrong options from the neighbourhood: Morocco's are North African
  for (let k = 0; k < 20; k++) for (const c of pickDistractors('flag', ma, pool, rnd)) expect(c.sub).toBe('north');
  // a small neighbourhood is filled from the same continent: Canada's options stay in the Americas
  for (let k = 0; k < 20; k++) for (const c of pickDistractors('pickflag', by('ca'), pool, rnd)) expect(c.region).toBe('americas');
  // near-twin capitals are never side by side
  expect(tooAlike('كينغستون', 'كينغستاون')).toBe(true);
  for (let k = 0; k < 30; k++) {
    const it = makeItem('capital', by('jm'), regionPool('americas'), rnd);
    expect(optionsOf(it).map((o) => o.text)).not.toContain('كينغستاون');
  }
});

test('flags: before the reveal a phone gets no right option and no answer card', () => {
  const ctx = fakeCtx();
  const s = startFlags(ctx, P, { rounds: 20, mode: 'mixed', region: 'world', level: 'all' }, seeded(3));
  for (let r = 0; r < 20; r++) {
    const it = s.items[s.round];
    const v = view(ctx, s, 'a');
    expect(v.correct).toBeNull();
    expect(v.answer).toBeNull();
    expect(v.results).toBeNull();
    if (it.kind === 'country' || it.kind === 'pickflag') expect(v.prompt.flag).toBeUndefined();
    if (it.kind === 'flag') expect(v.prompt.text).toBeUndefined();
    if (it.kind !== 'pickflag' && it.kind !== 'flag') expect(JSON.stringify(v.prompt).includes(it.kind === 'capital' ? it.country.capital : it.country.name)).toBe(false);
    flags.act(ctx, s, 'a', { type: 'answer', round: s.round + 1, choice: it.correct });
    flags.act(ctx, s, 'b', { type: 'answer', round: s.round + 1, choice: (it.correct + 1) % 4 });
    expect(s.phase).toBe('reveal');
    const rv = view(ctx, s, 'b');
    expect(rv.correct).toBe(it.correct);
    expect(rv.answer?.name).toBe(it.country.name);
    ctx.now = s.endsAt!;
    flags.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(s.rights).toEqual({ a: 20 });
  expect(flags.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(ctx.said.some((x) => x.voice === voiceFastestRight('a'))).toBe(true);
});

test('flags: answers — one per player, a valid option only, faster scores more', () => {
  const ctx = fakeCtx();
  const s = startFlags(ctx, ['a', 'b', 'c'], { rounds: 10, mode: 'flags', region: 'europe', level: 'easy' }, seeded(8));
  const it = s.items[0];
  const t0 = ctx.now;
  flags.act(ctx, s, 'a', { type: 'answer', choice: 4 });
  flags.act(ctx, s, 'a', { type: 'answer', choice: -1 });
  expect(s.answers.a).toBeUndefined();
  ctx.now = t0 + 1500;
  flags.act(ctx, s, 'a', { type: 'answer', choice: it.correct });
  ctx.now = t0 + 7500;
  flags.act(ctx, s, 'b', { type: 'answer', choice: it.correct });
  flags.act(ctx, s, 'b', { type: 'answer', choice: 0 });
  flags.act(ctx, s, 'c', { type: 'answer', choice: (it.correct + 2) % 4 });
  const r = Object.fromEntries(s.results!.map((x) => [x.id, x]));
  expect(r.a.points).toBe(950);
  expect(r.b.points).toBe(750);
  expect(r.c.points).toBe(0);
  for (const item of s.items) expect(['flag', 'pickflag']).toContain(item.kind);
});

test('flags: capitals mode asks only capitals; the Arab world only Arab League countries', () => {
  const ctx = fakeCtx();
  const s = startFlags(ctx, P, { rounds: 20, mode: 'capitals', region: 'arab', level: 'all' }, seeded(5));
  for (const it of s.items) {
    expect(['capital', 'country']).toContain(it.kind);
    expect(it.country.arab).toBe(true);
    expect(it.country.noCapital).toBeUndefined();
    for (const o of it.options) expect(o.arab).toBe(true);
  }
});

test('flags: bots know well-known countries better, and know more at each level', () => {
  const rnd = seeded(6);
  const rate = (level: 'easy' | 'smart' | 'expert') => {
    const ctx = fakeCtx();
    const s = startFlags(ctx, ['x'], { rounds: 20, mode: 'mixed', region: 'world', level: 'all' }, rnd);
    let right = 0;
    for (let k = 0; k < 400; k++) {
      s.round = k % s.items.length;
      const { choice, delay } = flagsBotAnswer(level, s);
      expect(delay).toBeGreaterThan(500);
      expect(delay).toBeLessThan(15000);
      if (choice === s.items[s.round].correct) right++;
    }
    return right / 400;
  };
  const r = { easy: rate('easy'), smart: rate('smart'), expert: rate('expert') };
  expect(r.expert).toBeGreaterThan(r.smart);
  expect(r.smart).toBeGreaterThan(r.easy);
  expect(r.expert).toBeLessThan(0.97);
  for (const lv of ['easy', 'smart', 'expert'] as const) expect(FLAGS_BOT_KNOWS[lv][0]).toBeGreaterThan(FLAGS_BOT_KNOWS[lv][1]);
});

test('flags: bots at every level play whole games in every region', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (const region of ['world', 'oceania', 'arab'] as const) {
      const bots = ['b1', 'b2', 'b3'];
      const ctx = fakeCtx(bots, level);
      const s = startFlags(ctx, bots, { rounds: 20, mode: 'mixed', region, level: 'easy' }, seeded(7));
      playOut(flags as never, ctx, s, bots, (st) => {
        if (st.phase === 'ask') expect(view(ctx, st, 'b2').correct).toBeNull();
      });
      expect(s.phase).toBe('final');
      expect(s.items.length).toBe(20);
      expect(flags.result!(s)?.places.flat().sort()).toEqual(bots);
    }
  }
});
