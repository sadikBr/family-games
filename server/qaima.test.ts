/**
 * «املأ القائمة» — the lists (counts, the family's geography rules, every spelling finds its item), the
 * tolerant matching, settings, a round's flow and scoring, what a phone sees before the reveal (never a
 * list item, never the others' answers), «انتهيت», the reveal, bots, leaving and the result.
 */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { QAIMA_DEFAULTS, QAIMA_TOPICS, type QaimaTopic, type QaimaView } from '../src/shared/games/qaima';
import { DEFAULT_SETTINGS, type BotLevel } from '../src/shared/protocol';
import { COUNTRIES } from './flags-content';
import { QAIMA_BOT_LEVELS, planBotRound } from './qaima-bots';
import { QAIMA_BY_ID, QAIMA_LISTS, SURAH_NAMES } from './qaima-lists';
import { qaimaIndex, qaimaKey, qaimaMatch, type QaimaListDef } from './qaima-match';
import { QAIMA_MAX_TRIES, qaima, sanitizeQaima, spreadTopics, startQaima, type QaimaState } from './games/qaima';
import { fakeCtx, playOut, seeded, type TestCtx } from './knowledge-test-kit';

const view = (ctx: TestCtx, s: QaimaState, me: string) => qaima.view(ctx, s, me) as QaimaView;
const add = (ctx: TestCtx, s: QaimaState, by: string, text: string) => qaima.act(ctx, s, by, { type: 'add', round: s.round + 1, text });
const cur = (s: QaimaState) => QAIMA_BY_ID[s.lists[s.round]];
/** a game whose first round is the list `id` */
function gameOn(id: string, players = ['a', 'b', 'c'], bots: string[] = [], level: BotLevel = 'expert') {
  const ctx = fakeCtx(bots, level);
  const s = startQaima(ctx, players, { rounds: 3, seconds: 90 }, seeded(7));
  s.lists[0] = id;
  return { ctx, s };
}
const ok = (def: QaimaListDef, typed: string, name: string, mine: number[] = []) => {
  const m = qaimaMatch(def, typed, new Set(mine));
  expect(m.kind === 'miss' ? `miss: ${typed}` : def.items[m.item].name).toBe(name);
};
const miss = (def: QaimaListDef, typed: string) => expect(qaimaMatch(def, typed).kind, typed).toBe('miss');

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 45+ lists over the eight topics, each item named once, fame 1…3, every spelling finds its item', () => {
  expect(QAIMA_LISTS.length).toBeGreaterThanOrEqual(45);
  expect(new Set(QAIMA_LISTS.map((l) => l.id)).size).toBe(QAIMA_LISTS.length);
  const byTopic: Record<string, number> = {};
  for (const l of QAIMA_LISTS) byTopic[l.topic] = (byTopic[l.topic] ?? 0) + 1;
  for (const t of Object.keys(QAIMA_TOPICS) as QaimaTopic[]) expect(byTopic[t] ?? 0, t).toBeGreaterThanOrEqual(5);
  // a few names are shared on purpose: «زينب» for both, «أنت» for أنتَ and أنتِ, «الكونغو», «الزريعة»
  const SHARED = new Set(['africa:كونغو', 'mothers:زينب', 'pronouns:انت', 'nuts:زريعه']);
  for (const l of QAIMA_LISTS) {
    expect(l.items.length, l.id).toBeGreaterThanOrEqual(7);
    expect(l.title.length).toBeLessThan(48);
    const idx = qaimaIndex(l);
    for (const [key, items] of idx.exact) if (items.length > 1) expect(SHARED.has(`${l.id}:${key}`), `${l.id}: «${key}» → ${items.map((i) => l.items[i].name)}`).toBe(true);
    expect(new Set(l.items.map((i) => i.name)).size, l.id).toBe(l.items.length);
    l.items.forEach((it, i) => {
      expect(it.fame >= 1 && it.fame <= 3, `${l.id}: ${it.name}`).toBe(true);
      for (const n of [it.name, ...it.aliases]) {
        const m = qaimaMatch(l, n);
        expect(m.kind, `${l.id}: ${n}`).toBe('ok');
        if (m.kind === 'ok') expect(idx.exact.get(qaimaKey(n, idx.drop))?.includes(i), `${l.id}: ${n}`).toBe(true);
      }
    });
    // the bots' wrong answers are really wrong
    for (const d of l.decoys ?? []) expect(qaimaMatch(l, d).kind, `${l.id}: ${d}`).toBe('miss');
  }
});

test('content: the counts of the closed lists', () => {
  const counts: Record<string, number> = {
    africa: 54, asia: 46, europe: 45, americas: 35, samerica: 12, arab: 22, arabcaps: 22, africacaps: 54, eucaps: 45, eu: 27, med: 21, continents: 7,
    prophets: 25, juzamma: 37, surahs: 114, muqattaat: 29, asma: 99, hijri: 12, ten: 10, mothers: 11, ghazawat: 27,
    planets: 8, rainbow: 7, elements: 118, maregions: 12, maholidays: 15, wcwinners: 8, wchosts: 19, ucl: 24, ma2022: 26,
    gmonths: 12, preps: 20, kana: 13, pronouns: 12, shamsi: 14, qamari: 14,
  };
  for (const [id, n] of Object.entries(counts)) expect(QAIMA_BY_ID[id].items.length, id).toBe(n);
  // Africa: every African country of «الأعلام والعواصم» (the 54 UN members), Morocco among them
  expect(QAIMA_BY_ID.africa.items.map((i) => i.name).sort()).toEqual(COUNTRIES.filter((c) => c.region === 'africa').map((c) => c.name).sort());
  // the surahs are those of the mushaf, in its order (quran-data.json spells a few without hamza)
  const data = JSON.parse(readFileSync(new URL('./quran-data.json', import.meta.url), 'utf8')) as { surahs: { name: string }[] };
  expect(SURAH_NAMES.map((n) => qaimaKey(n))).toEqual(data.surahs.map((x) => qaimaKey(x.name.replace('سبإ', 'سبأ').replace('النبإ', 'النبأ'))));
  expect(QAIMA_BY_ID.juzamma.items[0].name).toBe('النبأ');
  expect(QAIMA_BY_ID.juzamma.items[36].name).toBe('الناس');
});

test('content: the family’s geography — Morocco whole with its Sahara, Palestine a country (القدس), never Israel', () => {
  const all = QAIMA_LISTS.flatMap((l) => l.items.flatMap((i) => [i.name, ...i.aliases]).concat(l.title, l.hint ?? '', l.note ?? '', ...(l.decoys ?? [])));
  for (const t of all) expect(t, t).not.toMatch(/إسرائيل|اسرائيل|الصحراء الغربية|الصحراء الغريبة/);
  const names = (id: string) => QAIMA_BY_ID[id].items.map((i) => i.name);
  for (const id of ['africa', 'arab', 'med']) expect(names(id)).toContain('المغرب');
  for (const id of ['asia', 'arab', 'med']) expect(names(id)).toContain('فلسطين');
  expect(names('arabcaps')).toContain('القدس');
  expect(names('arabcaps')).toContain('الرباط');
  for (const city of ['العيون', 'الداخلة', 'السمارة', 'بوجدور', 'طرفاية', 'طانطان', 'كلميم', 'الكويرة']) expect(names('macities')).toContain(city);
  expect(names('maregions')).toContain('العيون - الساقية الحمراء');
  expect(names('maregions')).toContain('الداخلة - وادي الذهب');
  // typed, they never count either
  for (const id of ['africa', 'arab', 'macities', 'maregions']) miss(QAIMA_BY_ID[id], 'الصحراء الغربية');
  for (const id of ['asia', 'med', 'arab']) miss(QAIMA_BY_ID[id], 'إسرائيل');
  ok(QAIMA_BY_ID.arabcaps, 'القدس الشريف', 'القدس');
  expect(COUNTRIES.map((c) => c.code)).not.toContain('il');
  expect(COUNTRIES.map((c) => c.code)).not.toContain('eh');
});

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

test('matching: hamza, ة/ه, ى/ي, «ال», spaces and vowel marks are forgiven; aliases count', () => {
  const af = QAIMA_BY_ID.africa;
  ok(af, 'كوت ديفوار', 'ساحل العاج');
  ok(af, 'اثيوبيا', 'إثيوبيا');
  ok(af, 'الحبشة', 'إثيوبيا');
  ok(af, 'جزائر', 'الجزائر');
  ok(af, '  المَغْرِب ', 'المغرب');
  ok(af, 'موريتانية', 'موريتانيا');
  ok(af, 'جنوبافريقيا', 'جنوب أفريقيا');
  ok(QAIMA_BY_ID.europe, 'البوسنه و الهرسك', 'البوسنة والهرسك');
  ok(QAIMA_BY_ID.ten, 'عبدالرحمن بن عوف', 'عبد الرحمن بن عوف');
  ok(QAIMA_BY_ID.prophets, 'يحيي', 'يحيى');
  ok(QAIMA_BY_ID.hijri, 'ربيع الثاني', 'ربيع الآخر');
  ok(QAIMA_BY_ID.gmonths, 'غشت', 'أغسطس');
  ok(QAIMA_BY_ID.gmonths, 'كانون الثاني', 'يناير');
  ok(QAIMA_BY_ID.macities, 'ڭلميم', 'كلميم');
  ok(QAIMA_BY_ID.macities, 'كازا', 'الدار البيضاء');
  ok(QAIMA_BY_ID.juzamma, 'سورة الإخلاص', 'الإخلاص');
  ok(QAIMA_BY_ID.juzamma, 'عم', 'النبأ');
  ok(QAIMA_BY_ID.seas, 'الأحمر', 'البحر الأحمر');
  ok(QAIMA_BY_ID.rivers, 'نهر النيل', 'النيل');
  ok(QAIMA_BY_ID.maholidays, '31 أكتوبر', 'عيد الوحدة');
  ok(QAIMA_BY_ID.maholidays, '١١ يناير', 'ذكرى تقديم وثيقة الاستقلال');
});

test('matching: one slip in a word of 5+ letters, none in short words, none when it could be two items', () => {
  const af = QAIMA_BY_ID.africa;
  ok(af, 'نيجريا', 'نيجيريا');
  ok(af, 'تنزانبا', 'تنزانيا');
  ok(af, 'مدغشقرر', 'مدغشقر');
  miss(af, 'نيجيرياا ا');
  miss(af, 'تنزاااانيا');
  // short words stay strict
  miss(af, 'مال');
  miss(QAIMA_BY_ID.planets, 'زحال');
  // as close to two items: refused (زامبيا and غامبيا are both in Africa)
  miss(af, 'سامبيا');
  ok(af, 'زامبيا', 'زامبيا');
  ok(af, 'غامبيا', 'غامبيا');
  // another country is never a slip of a listed one: غانا (Africa) is not غيانا (the Americas)
  miss(QAIMA_BY_ID.americas, 'غانا');
  miss(QAIMA_BY_ID.americas, 'غينيا');
  for (const [id, region] of [['africa', 'africa'], ['asia', 'asia'], ['europe', 'europe'], ['americas', 'americas']] as const)
    for (const c of COUNTRIES.filter((x) => x.region !== region)) miss(QAIMA_BY_ID[id], c.name);
  // nonsense
  miss(af, '');
  miss(af, '؟؟؟');
  miss(af, 'abc');
});

test('matching: a name shared by two items counts for the one I don’t have yet, then «مكتوب من قبل»', () => {
  const mo = QAIMA_BY_ID.mothers;
  const z1 = mo.items.findIndex((i) => i.name === 'زينب بنت خزيمة');
  const z2 = mo.items.findIndex((i) => i.name === 'زينب بنت جحش');
  ok(mo, 'زينب', 'زينب بنت خزيمة');
  ok(mo, 'زينب', 'زينب بنت جحش', [z1]);
  expect(qaimaMatch(mo, 'زينب', new Set([z1, z2])).kind).toBe('dup');
  const pr = QAIMA_BY_ID.pronouns;
  ok(pr, 'أنت', 'أنتَ');
  ok(pr, 'انت', 'أنتِ', [pr.items.findIndex((i) => i.name === 'أنتَ')]);
  // the same item by another name is a duplicate
  const af = QAIMA_BY_ID.africa;
  const ci = af.items.findIndex((i) => i.name === 'ساحل العاج');
  expect(qaimaMatch(af, 'كوت ديفوار', new Set([ci]))).toEqual({ kind: 'dup', item: ci });
});

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

test('settings: defaults 90 s × 5 rounds; times 60/90/120 and rounds 3/5/8 snapped; patched in place', () => {
  expect(DEFAULT_SETTINGS.qaima).toEqual(QAIMA_DEFAULTS);
  expect(QAIMA_DEFAULTS).toEqual({ rounds: 5, seconds: 90 });
  expect(sanitizeQaima({ rounds: 7, seconds: 1000 })).toEqual({ rounds: 8, seconds: 120 });
  expect(sanitizeQaima({ rounds: 'x' as never, seconds: null as never })).toEqual(QAIMA_DEFAULTS);
  expect(sanitizeQaima(undefined)).toEqual(QAIMA_DEFAULTS);
  const st = { ...QAIMA_DEFAULTS };
  qaima.patchSettings!(st, { seconds: 61 });
  expect(st).toEqual({ rounds: 5, seconds: 60 });
  qaima.patchSettings!(st, { rounds: 3, other: 1 });
  expect(st).toEqual({ rounds: 3, seconds: 60 });
  const ctx = fakeCtx();
  const s = startQaima(ctx, ['a'], { rounds: 99, seconds: -4 } as never, seeded(1));
  expect(s.settings).toEqual({ rounds: 8, seconds: 60 });
  expect(s.lists.length).toBe(8);
  expect(new Set(s.lists).size).toBe(8);
  expect(s.endsAt).toBe(ctx.now + 60_000);
});

test('the deck: lists don’t come back in the same room until the pool is used; neighbours rarely share a topic', () => {
  const ctx = fakeCtx();
  const seen = new Set<string>();
  for (let g = 0; g < 6; g++) for (const id of startQaima(ctx, ['a'], { rounds: 8, seconds: 60 }).lists) seen.add(id);
  expect(seen.size).toBe(48);
  const ids = [...QAIMA_LISTS.filter((l) => l.topic === 'geo').slice(0, 5), ...QAIMA_LISTS.filter((l) => l.topic === 'food').slice(0, 5)].map((l) => l.id);
  const spread = spreadTopics(ids);
  expect([...spread].sort()).toEqual([...ids].sort());
  let same = 0;
  for (let i = 1; i < spread.length; i++) if (QAIMA_BY_ID[spread[i]].topic === QAIMA_BY_ID[spread[i - 1]].topic) same++;
  expect(same).toBe(0);
});

/* ------------------------------------------------------------------ */
/* A round                                                             */
/* ------------------------------------------------------------------ */

test('a round: answers checked on the server — accepted, «مكتوب من قبل», «غير موجود في القائمة»; scoring +1 for unique', () => {
  const { ctx, s } = gameOn('planets');
  add(ctx, s, 'a', 'المريخ');
  expect(view(ctx, s, 'a').note).toEqual({ seq: 1, kind: 'ok', text: 'المريخ' });
  add(ctx, s, 'a', 'مارس');
  expect(view(ctx, s, 'a').note).toEqual({ seq: 2, kind: 'dup', text: 'المريخ' });
  add(ctx, s, 'a', 'بلوتو');
  expect(view(ctx, s, 'a').note).toEqual({ seq: 3, kind: 'miss', text: 'بلوتو' });
  add(ctx, s, 'a', 'زحل');
  add(ctx, s, 'b', 'زحل');
  add(ctx, s, 'b', 'الأرض');
  add(ctx, s, 'b', 'نبتون');
  expect(view(ctx, s, 'a').mine).toEqual(['المريخ', 'زحل']);
  expect(view(ctx, s, 'c').counts).toEqual({ a: 2, b: 3, c: 0 });
  // bad payloads and other players are ignored
  qaima.act(ctx, s, 'a', { type: 'add', round: 1, text: 42 });
  qaima.act(ctx, s, 'a', { type: 'add', round: 1, text: 'ع'.repeat(61) });
  qaima.act(ctx, s, 'a', { type: 'add', round: 2, text: 'عطارد' });
  qaima.act(ctx, s, 'zz', { type: 'add', round: 1, text: 'عطارد' });
  expect(s.found.zz).toBeUndefined();
  expect(view(ctx, s, 'a').mine.length).toBe(2);
  // after the time: ignored, then the reveal
  ctx.now = s.endsAt!;
  add(ctx, s, 'c', 'عطارد');
  expect(s.found.c ?? []).toEqual([]);
  qaima.tick!(ctx, s);
  expect(s.phase).toBe('reveal');
  const r = view(ctx, s, 'c').reveal!;
  // a: المريخ (unique) + زحل (shared) = 2 + 1; b: زحل + الأرض (u) + نبتون (u) = 3 + 2
  expect(r.results).toEqual([
    { id: 'a', found: 2, unique: 1, points: 3 },
    { id: 'b', found: 3, unique: 2, points: 5 },
    { id: 'c', found: 0, unique: 0, points: 0 },
  ]);
  expect(s.scores).toEqual({ a: 3, b: 5, c: 0 });
  expect(r.covered).toBe(4);
  // the planets keep their order; the missed ones by fame first (عطارد, الزهرة, المشتري, then أورانوس)
  expect(r.items.map((i) => i.name)).toEqual(QAIMA_BY_ID.planets.items.map((i) => i.name));
  expect(r.items.find((i) => i.name === 'زحل')?.finders).toEqual(['a', 'b']);
  expect(r.missed).toEqual(['عطارد', 'الزهرة', 'المشتري', 'أورانوس']);
  expect(r.note).toContain('بلوتو');
  expect(ctx.said.some((x) => x.text === 'انتهى الوقت · أكثر الإجابات: b (3)')).toBe(true);
});

test('a round alone: no «unique» bonus without anyone to compare with; the answer limit holds', () => {
  const { ctx, s } = gameOn('rainbow', ['solo']);
  add(ctx, s, 'solo', 'أحمر');
  add(ctx, s, 'solo', 'أخضر');
  for (let i = 0; i < QAIMA_MAX_TRIES + 20; i++) add(ctx, s, 'solo', `كلمة${i}`);
  add(ctx, s, 'solo', 'أزرق');
  expect(s.found.solo.length).toBe(2);
  ctx.now = s.endsAt!;
  qaima.tick!(ctx, s);
  expect(view(ctx, s, 'solo').reveal!.results).toEqual([{ id: 'solo', found: 2, unique: 0, points: 2 }]);
});

test('no leak: before the reveal a phone gets no item of the list and none of the others’ answers', () => {
  for (const id of ['africa', 'planets', 'juzamma', 'macities', 'fruits', 'ma2022']) {
    const { ctx, s } = gameOn(id);
    const def = cur(s);
    const words = `${def.title} ${def.hint ?? ''}`;
    // a finds three items, b one of them and one more
    add(ctx, s, 'a', def.items[0].name);
    add(ctx, s, 'a', def.items[1].name);
    add(ctx, s, 'a', def.items[2].name);
    add(ctx, s, 'b', def.items[2].name);
    add(ctx, s, 'b', def.items[3].name);
    for (const me of ['a', 'b', 'c', 'spectator']) {
      const v = view(ctx, s, me);
      const json = JSON.stringify(v);
      expect(v.reveal).toBeNull();
      const mine = new Set(v.mine);
      for (const it of def.items) if (!mine.has(it.name) && !words.includes(it.name)) expect(json.includes(`"${it.name}"`), `${id}/${me}: ${it.name}`).toBe(false);
      for (const it of def.items) for (const al of it.aliases) if ([...al].length > 3 && !words.includes(al) && !v.mine.some((n) => n.includes(al))) expect(json.includes(al), `${id}/${me}: ${al}`).toBe(false);
    }
    expect(view(ctx, s, 'c').mine).toEqual([]);
    expect(view(ctx, s, 'b').mine).toEqual([def.items[2].name, def.items[3].name]);
    expect(view(ctx, s, 'c').counts).toEqual({ a: 3, b: 2, c: 0 });
    // the room's lines say nothing of the items
    for (const said of ctx.said) for (const it of def.items) if (!words.includes(it.name)) expect(said.text.includes(it.name), said.text).toBe(false);
    ctx.now = s.endsAt!;
    qaima.tick!(ctx, s);
    const r = view(ctx, s, 'c');
    expect(r.reveal!.items.length).toBe(def.items.length);
    expect(r.note).toBeNull();
  }
});

test('«انتهيت»: when every player still here pressed it the round ends; it can be taken back; bots don’t wait', () => {
  const { ctx, s } = gameOn('africa', ['a', 'b', 'bot1'], ['bot1']);
  qaima.botPlan!(ctx, s, ['bot1']);
  const planned = s.plans.bot1.tries;
  expect(planned.length).toBeGreaterThan(10);
  add(ctx, s, 'a', 'المغرب');
  qaima.act(ctx, s, 'a', { type: 'done', round: 1 });
  expect(view(ctx, s, 'b').done).toEqual(['a']);
  qaima.act(ctx, s, 'a', { type: 'done', round: 1, undo: true });
  expect(s.done).toEqual([]);
  qaima.act(ctx, s, 'a', { type: 'done', round: 1 });
  expect(s.phase).toBe('play');
  ctx.now += 20_000;
  // the room has played the bot's answers due by now
  for (const j of ctx.jobs) if (j.at <= ctx.now) qaima.act(ctx, s, j.by, j.a);
  const before = s.found.bot1?.length ?? 0;
  expect(before).toBeGreaterThan(0);
  qaima.act(ctx, s, 'b', { type: 'done', round: 1 });
  expect(s.phase).toBe('reveal');
  // the bot's planned answers are all in at once (the ones not typed yet)
  const def = QAIMA_BY_ID.africa;
  const want = new Set<number>();
  for (const t of planned) {
    const m = qaimaMatch(def, t.text, want);
    if (m.kind === 'ok') want.add(m.item);
  }
  expect(new Set(s.found.bot1)).toEqual(want);
  expect(s.found.bot1.length).toBeGreaterThan(before);
  // a player away doesn't hold the round
  const g = gameOn('planets', ['a', 'b']);
  g.ctx.offline.add('b');
  qaima.act(g.ctx, g.s, 'a', { type: 'done', round: 1 });
  expect(g.s.phase).toBe('reveal');
});

test('the reveal: the host skips it, else it moves on by itself; the last one leads to the podium and the result', () => {
  const { ctx, s } = gameOn('rainbow', ['a', 'b']);
  qaima.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('play');
  expect(qaima.hostOnly).toContain('next');
  add(ctx, s, 'a', 'الأحمر');
  add(ctx, s, 'a', 'الأصفر');
  add(ctx, s, 'b', 'الأحمر');
  ctx.now = s.endsAt!;
  qaima.tick!(ctx, s);
  qaima.act(ctx, s, 'a', { type: 'next' });
  expect(s.round).toBe(1);
  expect(s.phase).toBe('play');
  expect(view(ctx, s, 'a').mine).toEqual([]);
  expect(view(ctx, s, 'a').note).toBeNull();
  ctx.now = s.endsAt!;
  qaima.tick!(ctx, s);
  ctx.now = s.endsAt!;
  qaima.tick!(ctx, s);
  expect(s.round).toBe(2);
  ctx.now = s.endsAt!;
  qaima.tick!(ctx, s);
  expect(qaima.result!(s)).toBeNull();
  ctx.now = s.endsAt!;
  qaima.tick!(ctx, s);
  expect(s.phase).toBe('final');
  // a: 1 + الأصفر unique (2) = 3, b: 1
  expect(qaima.result!(s)).toEqual({ places: [['a'], ['b']] });
  expect(ctx.fxs.some(([k, t]) => k === 'win' && t === 'a')).toBe(true);
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: by level they know ~20–30% / ~40–55% / ~60–75% of the list, mostly the famous, at a human pace', () => {
  const def = QAIMA_BY_ID.africa;
  const famous = new Set(def.items.map((it, i) => (it.fame === 3 ? i : -1)).filter((i) => i >= 0));
  for (const level of ['easy', 'smart', 'expert'] as const) {
    const p = QAIMA_BOT_LEVELS[level];
    let share = 0;
    let fam = 0;
    let right = 0;
    const N = 200;
    const rnd = seeded(level.length * 13);
    for (let k = 0; k < N; k++) {
      const plan = planBotRound(level, def, 120, rnd, QAIMA_LISTS);
      const got = new Set<number>();
      let prev = -Infinity;
      for (const t of plan) {
        expect(t.at).toBeGreaterThanOrEqual(2500);
        expect(t.at).toBeLessThan(120_000 - 500);
        expect(t.at - prev).toBeGreaterThanOrEqual(900);
        prev = t.at;
        const m = qaimaMatch(def, t.text, got);
        if (m.kind === 'ok') {
          got.add(m.item);
          if (famous.has(m.item)) fam++;
          right++;
        }
      }
      share += got.size / def.items.length;
    }
    const avg = share / N;
    expect(avg).toBeGreaterThan(p.from - 0.03);
    expect(avg).toBeLessThan(p.to + 0.02);
    // the famous items are a minority of the list but most of what an easy bot finds
    if (level === 'easy') expect(fam / right).toBeGreaterThan(0.6);
  }
  // a short round: never faster than the level's pace
  const quick = planBotRound('expert', QAIMA_BY_ID.elements, 60, seeded(2), QAIMA_LISTS);
  expect(quick.length).toBeLessThanOrEqual(Math.ceil((60_000 - 5000) / QAIMA_BOT_LEVELS.expert.gap) * 1.3 + 2);
});

test('bots: play whole games through ordinary answers (some rejected); the expert finds far more than the easy bot', () => {
  let expert = 0;
  let easy = 0;
  let misses = 0;
  for (let seed = 1; seed <= 5; seed++) {
    for (const level of ['expert', 'easy'] as const) {
      const ctx = fakeCtx(['b1', 'b2'], level);
      const s = startQaima(ctx, ['b1', 'b2'], { rounds: 3, seconds: 60 }, seeded(seed));
      let lastSeq = { b1: 0, b2: 0 } as Record<string, number>;
      let counted = -1;
      playOut(qaima as never, ctx, s, ['b1', 'b2'], (st) => {
        if (st.phase !== 'play') {
          lastSeq = { b1: 0, b2: 0 };
          // the answers found (the points depend on overlaps: two easy bots share less)
          if (st.phase === 'reveal' && counted !== st.round) {
            counted = st.round;
            const found = st.reveal!.results.reduce((n, r) => n + r.found, 0);
            if (level === 'expert') expert += found;
            else easy += found;
          }
          return;
        }
        for (const b of ['b1', 'b2']) {
          const v = view(ctx, st, b);
          expect(v.reveal).toBeNull();
          if (v.note && v.note.seq !== lastSeq[b]) {
            lastSeq[b] = v.note.seq;
            if (v.note.kind !== 'ok') misses++;
          }
        }
      });
      expect(s.phase).toBe('final');
      expect(qaima.result!(s)?.places.flat().sort()).toEqual(['b1', 'b2']);
    }
  }
  expect(expert).toBeGreaterThan(easy * 2);
  expect(misses).toBeGreaterThan(5);
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('leaving: the round ends when the ones left are done; the game ends cleanly when nobody is left', () => {
  const { ctx, s } = gameOn('planets', ['a', 'b', 'c']);
  add(ctx, s, 'b', 'زحل');
  qaima.act(ctx, s, 'a', { type: 'done', round: 1 });
  qaima.onLeave!(ctx, s, 'b');
  expect(s.phase).toBe('play');
  expect(Object.keys(s.scores)).toEqual(['a', 'c']);
  qaima.onLeave!(ctx, s, 'nobody');
  qaima.onLeave!(ctx, s, 'c');
  expect(s.phase).toBe('reveal');
  expect(s.reveal!.results.map((r) => r.id)).toEqual(['a']);
  expect(s.reveal!.items.find((i) => i.name === 'زحل')?.finders).toEqual([]);
  qaima.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('final');
  expect(qaima.result!(s)).toBeNull();
});
