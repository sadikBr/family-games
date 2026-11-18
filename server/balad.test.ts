/**
 * «البلد الغامض» — the content (six clues each, no name given away), tolerant matching and aliases,
 * clue timing, scoring by clue index, the lock, what a phone sees before the reveal, bots, leaving,
 * settings and the result.
 */
import { expect, test } from 'bun:test';

import { BALAD_CLUES, BALAD_DEFAULTS, BALAD_LOCK_MS, BALAD_POINTS, baladPoints, baladPool, type BaladView } from '../src/shared/games/balad';
import { BALAD_COUNTRIES, baladForms, matchCountry, suggestCountries } from '../src/shared/games/balad-countries';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { BALAD_CLUE_TEXT } from './balad-content';
import { BALAD_BOT_CLUE, planBotRound } from './balad-bots';
import { COUNTRIES } from './flags-content';
import { balad, regionCodes, sanitizeBalad, startBalad, type BaladState } from './games/balad';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';
import { GameError } from './types';

const view = (ctx: TestCtx, s: BaladState, me: string) => balad.view(ctx, s, me) as BaladView;
const guess = (ctx: TestCtx, s: BaladState, by: string, a: Record<string, unknown>) => balad.act(ctx, s, by, { type: 'guess', round: s.round + 1, ...a });
const name = (code: string) => BALAD_COUNTRIES.find((c) => c.code === code)!.name;
/** a country of the same game that is not this round's */
const other = (s: BaladState) => BALAD_COUNTRIES.find((c) => c.code !== s.countries[s.round])!.code;

/** Letters only, hamza / ة / ى folded: to look for a name inside a clue. */
const fold = (t: string) =>
  t
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^ء-ي ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const bare = (w: string) => (w.startsWith('ال') && w.length > 3 ? w.slice(2) : w);

/** The words of a clue, each also without a clinging «و / ب / ل / ف / ك» and «ال». */
function clueWords(clue: string): string[] {
  return fold(clue)
    .split(' ')
    .flatMap((w) => [w, w.slice(1)].filter((x) => x.length >= 2))
    .map(bare);
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 120+ countries, six clues each, unique, the same names and flags as «الأعلام والعواصم»', () => {
  const codes = BALAD_COUNTRIES.map((c) => c.code);
  expect(codes.length).toBeGreaterThanOrEqual(120);
  expect(new Set(codes).size).toBe(codes.length);
  expect(new Set(BALAD_COUNTRIES.map((c) => fold(c.name))).size).toBe(codes.length);
  expect(Object.keys(BALAD_CLUE_TEXT).sort()).toEqual([...codes].sort());
  for (const c of BALAD_COUNTRIES) {
    const clues = BALAD_CLUE_TEXT[c.code];
    expect(clues.length).toBe(BALAD_CLUES);
    for (const clue of clues) {
      expect(clue.trim().length).toBeGreaterThan(15);
      expect(clue.length).toBeLessThan(160);
    }
    expect(new Set(clues).size).toBe(BALAD_CLUES);
    const flag = COUNTRIES.find((f) => f.code === c.code);
    expect(flag, c.code).toBeDefined();
    expect(fold(flag!.name)).toBe(fold(c.name));
    // the reveal shows a flag (Afghanistan's disputed flag is not in the game)
    expect(flag!.noFlag).toBeFalsy();
    expect(!!flag!.arab).toBe(!!c.arab);
  }
  // the family's rules: Palestine in, its capital القدس; Israel out; Morocco borders Mauritania (its Sahara)
  expect(codes).toContain('ps');
  expect(codes).not.toContain('il');
  expect(BALAD_CLUE_TEXT.ps.join(' ')).toContain('القدس');
  expect(BALAD_CLUE_TEXT.ma[4]).toContain('موريتانيا');
  expect(BALAD_CLUE_TEXT.mr[4]).toContain('المغرب');
  for (const clues of Object.values(BALAD_CLUE_TEXT)) for (const t of clues) expect(t).not.toMatch(/إسرائيل|اسرائيل|الصحراء الغربية/);
});

test('content: no clue holds the country’s name, an alias, or a word made from it', () => {
  const bad: string[] = [];
  for (const c of BALAD_COUNTRIES) {
    const names = [c.name, ...c.aliases].map(fold);
    // a one-word name's stem: «فرنسا» → «فرنس» (catches «الفرنسية»), «اليابان» → «يابان»
    const stems = [c.name, ...c.aliases]
      .map((n) => fold(n))
      .filter((n) => !n.includes(' '))
      .map((n) => bare(n).replace(/[اهي]+$/, ''))
      .filter((st) => st.length >= 3);
    BALAD_CLUE_TEXT[c.code].forEach((clue, i) => {
      const f = fold(clue);
      const words = clueWords(clue);
      for (const n of names) if (f.includes(n) || f.includes(bare(n))) bad.push(`${c.code}#${i + 1}: «${n}»`);
      for (const st of stems) if (words.some((w) => w.startsWith(st))) bad.push(`${c.code}#${i + 1}: «${st}…»`);
    });
  }
  expect(bad).toEqual([]);
});

test('content: every region has enough countries for the longest game', () => {
  for (const r of ['world', 'arab', 'europe', 'asia', 'americas'] as const) expect(regionCodes(r).length).toBeGreaterThanOrEqual(15);
  expect(regionCodes('arab')).toContain('ma');
  expect(regionCodes('arab')).toContain('ke');
  expect(regionCodes('arab')).toContain('sa');
  expect(regionCodes('asia')).toContain('sa');
  expect(regionCodes('europe')).not.toContain('tr');
  expect(regionCodes('world').length).toBe(BALAD_COUNTRIES.length);
});

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

test('matching: every name and alias finds its own country; «ال», hamza, ة/ه and typos are forgiven', () => {
  for (const c of BALAD_COUNTRIES) for (const n of [c.name, ...c.aliases]) expect(matchCountry(n), n).toBe(c.code);
  // no spelling of a country is shared with another one
  const owner = new Map<string, string>();
  for (const c of BALAD_COUNTRIES)
    for (const f of [c.name, ...c.aliases].flatMap(baladForms)) {
      expect(owner.get(f) ?? c.code, f).toBe(c.code);
      owner.set(f, c.code);
    }
  const cases: [string, string][] = [
    ['امريكا', 'us'],
    ['أميركا', 'us'],
    ['الولايات المتحدة الامريكية', 'us'],
    ['مغرب', 'ma'],
    [' المغرب ', 'ma'],
    ['المغربب', 'ma'],
    ['اسبانيا', 'es'],
    ['إسبانيا', 'es'],
    ['أسبانيا', 'es'],
    ['المانيا', 'de'],
    ['ألمانية', 'de'],
    ['البانيا', 'al'],
    ['ألبانيا', 'al'],
    ['اردن', 'jo'],
    ['الاردن', 'jo'],
    ['السعوديه', 'sa'],
    ['المملكة العربية السعودية', 'sa'],
    ['دولة قطر', 'qa'],
    ['جمهورية مصر العربية', 'eg'],
    ['بريطانيا', 'gb'],
    ['انجلترا', 'gb'],
    ['هولاندا', 'nl'],
    ['فنزولا', 've'],
    ['الأرجنتيين', 'ar'],
    ['كوريا', 'kr'],
    ['كوت ديفوار', 'ci'],
    ['الحبشة', 'et'],
    ['عمان', 'om'],
    ['البوسنه', 'ba'],
    ['البوسنة و الهرسك', 'ba'],
    ['جزر القمر', 'km'],
    ['القمر', 'km'],
    ['النيجر', 'ne'],
    ['نيجيريا', 'ng'],
    ['السويد', 'se'],
    ['سويسرا', 'ch'],
    ['مالي', 'ml'],
    ['مالطا', 'mt'],
    ['النمسا', 'at'],
    ['تايلند', 'th'],
    ['ایران', 'ir'],
  ];
  for (const [t, code] of cases) expect(matchCountry(t), t).toBe(code);
  for (const t of ['', '  ', 'ب', 'سيارة', 'كوريا الشمالية', 'xyz', 'جنوب', '١٢٣']) expect(matchCountry(t), t).toBeNull();
});

test('matching: suggestions while typing come from the region, by the start of the name first', () => {
  const world = regionCodes('world');
  expect(suggestCountries('مغ', world)[0]).toBe('ma');
  expect(suggestCountries('امري', world)).toContain('us');
  expect(suggestCountries('ال', world).length).toBeGreaterThan(0);
  expect(suggestCountries('', world)).toEqual([]);
  const europe = regionCodes('europe');
  expect(suggestCountries('مصر', europe)).not.toContain('eg');
  expect(suggestCountries('فرن', europe)).toEqual(['fr']);
  expect(suggestCountries('كو', world, 3).length).toBeLessThanOrEqual(3);
  // a slip in what was typed still suggests it
  expect(suggestCountries('فنزو', world)).toContain('ve');
});

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

test('settings: rounds, interval and region validated and patched', () => {
  expect(sanitizeBalad(DEFAULT_SETTINGS.balad)).toEqual(BALAD_DEFAULTS);
  expect(sanitizeBalad({ rounds: 9, interval: 7, region: 'asia' })).toEqual({ rounds: 8, interval: 6, region: 'asia' });
  expect(sanitizeBalad({ rounds: 'x' as never, interval: null as never, region: 'mars' as never })).toEqual(BALAD_DEFAULTS);
  const st = { ...BALAD_DEFAULTS };
  balad.patchSettings!(st, { region: 'europe', interval: 10 });
  expect(st).toEqual({ rounds: 8, interval: 10, region: 'europe' });
  balad.patchSettings!(st, { rounds: 100, region: 'nowhere' });
  expect(st).toEqual({ rounds: 10, interval: 10, region: 'world' });
  // a game is dealt from its region, never twice the same country
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a'], { rounds: 10, interval: 6, region: 'americas' }, seeded(2));
  expect(s.countries.length).toBe(10);
  expect(new Set(s.countries).size).toBe(10);
  for (const c of s.countries) expect(baladPool('americas').some((x) => x.code === c)).toBe(true);
});

test('clue timing: one clue at the start, one more each interval, the reveal after the last one', () => {
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a', 'b'], { rounds: 5, interval: 8, region: 'world' }, seeded(5));
  const clues = BALAD_CLUE_TEXT[s.countries[0]];
  const t0 = ctx.now;
  for (let k = 0; k < BALAD_CLUES; k++) {
    ctx.now = t0 + k * 8000 + 10;
    balad.tick!(ctx, s);
    const v = view(ctx, s, 'a');
    expect(v.phase).toBe('clues');
    expect(v.clues).toEqual(clues.slice(0, k + 1));
    expect(v.clueAt).toBe(t0 + k * 8000);
    expect(v.nextAt).toBe(t0 + (k + 1) * 8000);
    ctx.now = t0 + (k + 1) * 8000 - 1;
    balad.tick!(ctx, s);
    expect(view(ctx, s, 'a').clues.length).toBe(k + 1);
  }
  ctx.now = t0 + 6 * 8000;
  expect(balad.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('reveal');
  const v = view(ctx, s, 'a');
  expect(v.clues).toEqual([...clues]);
  expect(v.answer?.code).toBe(s.countries[0]);
  expect(v.results?.every((r) => r.clue === null && r.points === 0)).toBe(true);
  // the reveal moves on by itself, or by the host
  ctx.now = s.endsAt!;
  balad.tick!(ctx, s);
  expect(s.round).toBe(1);
  expect(s.phase).toBe('clues');
  expect(view(ctx, s, 'a').clues.length).toBe(1);
});

test('scoring: by the newest clue (60…10) plus 1…5 for speed after it appeared', () => {
  expect(baladPoints(0, 8000, 8000)).toBe(65);
  expect(baladPoints(0, 1, 8000)).toBe(61);
  expect(baladPoints(2, 4000, 8000)).toBe(43);
  expect(baladPoints(5, 0, 8000)).toBe(11);
  for (let k = 0; k < BALAD_CLUES; k++) {
    const ctx = fakeCtx();
    const s = startBalad(ctx, ['a', 'b'], { rounds: 5, interval: 6, region: 'world' }, seeded(k + 10));
    const t0 = ctx.now;
    ctx.now = t0 + k * 6000 + 3000;
    balad.tick!(ctx, s);
    guess(ctx, s, 'a', { code: s.countries[0] });
    expect(s.hits.a).toEqual({ clue: k, points: BALAD_POINTS[k] + 3, at: ctx.now });
    expect(view(ctx, s, 'a').mine).toEqual({ name: name(s.countries[0]), clue: k + 1, points: BALAD_POINTS[k] + 3 });
    expect(view(ctx, s, 'b').found).toEqual([{ id: 'a', clue: k + 1 }]);
    expect(ctx.said.some((x) => x.text.includes('إجابة صحيحة من a'))).toBe(true);
    // a second guess of the finder is ignored
    guess(ctx, s, 'a', { code: other(s) });
    expect(s.guesses.a.length).toBe(1);
  }
  // typed names count too, with their tolerance
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a'], { rounds: 5, interval: 6, region: 'world' }, seeded(1));
  s.countries[0] = 'us';
  guess(ctx, s, 'a', { text: 'امريكا' });
  expect(s.hits.a?.clue).toBe(0);
  // everyone found it: the round ends at once, scores added
  expect(s.phase).toBe('reveal');
  expect(s.scores.a).toBe(65);
  expect(s.rights.a).toBe(1);
});

test('the lock: a wrong guess costs nothing but blocks guessing for 3 s; unknown names are refused without a lock', () => {
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a', 'b'], { rounds: 5, interval: 8, region: 'world' }, seeded(7));
  const wrong = other(s);
  guess(ctx, s, 'a', { code: wrong });
  expect(s.locks.a).toBe(ctx.now + BALAD_LOCK_MS);
  expect(s.scores.a).toBe(0);
  const v = view(ctx, s, 'a');
  expect(v.lockedUntil).toBe(ctx.now + BALAD_LOCK_MS);
  expect(v.wrong).toEqual([name(wrong)]);
  // the others don't see my wrong guess
  expect(view(ctx, s, 'b').wrong).toEqual([]);
  expect(view(ctx, s, 'b').lockedUntil).toBeNull();
  expect(() => guess(ctx, s, 'a', { code: s.countries[0] })).toThrow(GameError);
  ctx.now += BALAD_LOCK_MS - 1;
  expect(() => guess(ctx, s, 'a', { code: s.countries[0] })).toThrow(GameError);
  ctx.now += 1;
  expect(view(ctx, s, 'a').lockedUntil).toBeNull();
  // the same wrong country twice is refused (no second lock)
  expect(() => guess(ctx, s, 'a', { code: wrong })).toThrow(GameError);
  expect(() => guess(ctx, s, 'a', { text: 'سيارة' })).toThrow(GameError);
  expect(s.locks.a).toBeLessThanOrEqual(ctx.now);
  guess(ctx, s, 'a', { code: s.countries[0] });
  expect(s.hits.a).toBeDefined();
  // a guess for an old round, or after the round, is ignored
  guess(ctx, s, 'b', { code: s.countries[0], round: 9 });
  expect(s.hits.b).toBeUndefined();
  const r = view(ctx, s, 'a');
  expect(r.phase).toBe('clues');
});

test('no leak: before the reveal a phone gets neither the country nor a clue before its time', () => {
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a', 'b', 'c'], { rounds: 10, interval: 6, region: 'world' }, seeded(3));
  for (let r = 0; r < 10; r++) {
    const code = s.countries[s.round];
    const clues = BALAD_CLUE_TEXT[code];
    const t0 = s.startedAt;
    for (let k = 0; k < BALAD_CLUES; k++) {
      ctx.now = t0 + k * 6000 + 100;
      balad.tick!(ctx, s);
      if (k === 2) guess(ctx, s, 'a', { code });
      for (const me of ['b', 'c', 'spectator']) {
        const v = view(ctx, s, me);
        const json = JSON.stringify(v);
        expect(v.answer).toBeNull();
        expect(v.results).toBeNull();
        expect(v.mine).toBeNull();
        expect(json.includes(name(code))).toBe(false);
        expect(json.includes(`"${code}"`)).toBe(false);
        for (const later of clues.slice(k + 1)) expect(json.includes(later)).toBe(false);
      }
      // the finder sees only their own right guess
      if (k >= 2) expect(view(ctx, s, 'a').mine?.name).toBe(name(code));
    }
    ctx.now = s.endsAt!;
    balad.tick!(ctx, s);
    expect(s.phase).toBe('reveal');
    const rv = view(ctx, s, 'b');
    expect(rv.answer?.name).toBe(name(code));
    expect(rv.answer?.flag).toBe(code);
    expect(rv.results?.find((x) => x.id === 'a')?.clue).toBe(3);
    ctx.now = s.endsAt!;
    balad.tick!(ctx, s);
  }
  expect(s.phase).toBe('final');
  expect(balad.result!(s)).toEqual({ places: [['a'], ['b', 'c']] });
  // Palestine's reveal names القدس
  const pctx = fakeCtx();
  const p = startBalad(pctx, ['a'], { rounds: 5, interval: 6, region: 'world' }, seeded(1));
  p.countries[0] = 'ps';
  guess(pctx, p, 'a', { code: 'ps' });
  expect(view(pctx, p, 'a').answer?.capital).toBe('القدس');
});

test('the host skips the reveal; «next» from anyone else in another phase is ignored', () => {
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a'], { rounds: 5, interval: 6, region: 'world' }, seeded(4));
  balad.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('clues');
  guess(ctx, s, 'a', { code: s.countries[0] });
  expect(s.phase).toBe('reveal');
  balad.act(ctx, s, 'a', { type: 'next' });
  expect(s.round).toBe(1);
  expect(balad.hostOnly).toContain('next');
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: plans by level — the expert early, the easy bot late, wrong guesses a lock apart', () => {
  const avg = (level: BotLevel) => {
    let sum = 0;
    let n = 0;
    const rnd = seeded(level.length);
    for (let i = 0; i < 400; i++) {
      const plan = planBotRound(level, 'fr', 8000, rnd);
      const right = plan.find((g) => g.code === 'fr');
      if (right) {
        sum += Math.floor(right.at / 8000);
        n++;
      }
      for (let k = 1; k < plan.length; k++) expect(plan[k].at - plan[k - 1].at).toBeGreaterThan(BALAD_LOCK_MS);
      for (const g of plan) {
        expect(g.at).toBeGreaterThan(1500);
        expect(g.at).toBeLessThan(6 * 8000);
      }
      // the right guess comes a reading moment after its clue, before the next one
      if (right) expect(right.at % 8000).toBeGreaterThanOrEqual(2000);
      expect(plan.filter((g) => g.code === 'fr').length).toBeLessThanOrEqual(1);
    }
    return { clue: sum / n, found: n / 400 };
  };
  const e = avg('expert');
  const m = avg('smart');
  const z = avg('easy');
  expect(e.clue).toBeLessThan(m.clue);
  expect(m.clue).toBeLessThan(z.clue);
  expect(e.found).toBeGreaterThan(z.found);
  for (const ws of Object.values(BALAD_BOT_CLUE)) expect(ws.length).toBe(BALAD_CLUES);
});

test('bots: play whole games through ordinary guesses; the expert outscores the easy bot', () => {
  let expert = 0;
  let easy = 0;
  for (let seed = 1; seed <= 6; seed++) {
    for (const level of ['expert', 'easy'] as const) {
      const ctx = fakeCtx(['b1', 'b2'], level);
      const s = startBalad(ctx, ['b1', 'b2'], { rounds: 10, interval: 6, region: 'world' }, seeded(seed));
      playOut(balad as never, ctx, s, ['b1', 'b2'], (st) => {
        for (const b of ['b1', 'b2']) if (st.phase === 'clues') expect(view(ctx, st, b).answer).toBeNull();
      });
      expect(s.phase).toBe('final');
      const total = s.scores.b1 + s.scores.b2;
      if (level === 'expert') expert += total;
      else easy += total;
      // some wrong guesses happen, and none was refused (playOut would have thrown)
      expect(ctx.jobs.length).toBeGreaterThan(10);
      expect(balad.result!(s)?.places.flat().sort()).toEqual(['b1', 'b2']);
    }
  }
  expect(expert).toBeGreaterThan(easy);
});

test('bots: a human-and-bots game ends once the bots found it and the human did too', () => {
  const ctx = fakeCtx(['bot1']);
  const s = startBalad(ctx, ['me', 'bot1'], { rounds: 5, interval: 6, region: 'europe' }, seeded(9));
  guess(ctx, s, 'me', { code: s.countries[0] });
  expect(s.phase).toBe('clues');
  playOut(balad as never, ctx, s, ['bot1'], (st) => {
    if (st.phase === 'clues' && !st.hits.me && st.round > 0) guess(ctx, st, 'me', { code: st.countries[st.round] });
  });
  expect(s.phase).toBe('final');
  expect(s.rights.me).toBeGreaterThanOrEqual(4);
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('leaving: the round ends when the ones left have all found it; the game ends cleanly when nobody is left', () => {
  const ctx = fakeCtx();
  const s = startBalad(ctx, ['a', 'b', 'c'], { rounds: 5, interval: 6, region: 'world' }, seeded(6));
  guess(ctx, s, 'a', { code: s.countries[0] });
  guess(ctx, s, 'b', { code: other(s) });
  balad.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('clues');
  ctx.offline.add('c');
  balad.onLeave!(ctx, s, 'nobody');
  balad.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.participants).toEqual(['a']);
  expect(s.results?.map((r) => r.id)).toEqual(['a']);
  expect(Object.keys(s.scores)).toEqual(['a']);
  balad.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
  expect(balad.result!(s)).toBeNull();
  // a player away doesn't hold the round: the others found it, the round ends
  const ctx2 = fakeCtx();
  const t = startBalad(ctx2, ['a', 'b'], { rounds: 5, interval: 6, region: 'world' }, seeded(8));
  ctx2.offline.add('b');
  guess(ctx2, t, 'a', { code: t.countries[0] });
  expect(t.phase).toBe('reveal');
});
