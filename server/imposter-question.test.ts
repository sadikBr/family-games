/** «الدخيل» — the «سؤال مختلف» mode: content, dealing without leaks, answers, reveal, votes, bots; the classic mode unchanged. */
import { expect, test } from 'bun:test';

import { answerKey } from '../src/shared/arabic';
import { DEFAULT_SETTINGS, IMPOSTER_ANSWER_MAX, type BotLevel, type ImposterSettings, type ImposterView, type PlayerInfo, type ServerMsg } from '../src/shared/protocol';
import { answerNumber, botAnswer, misfit } from './ai/imposter-question';
import { IMPOSTER_QUESTIONS, type AnswerTag } from './content-imposter-questions';
import { imposter } from './games/imposter';
import { Room, type Sock } from './room';

const fakeCtx = (bots: string[] = [], level: BotLevel = 'expert'): any => {
  const fxs: { kind: string; target?: string }[] = [];
  const said: string[] = [];
  const queue: { by: string; a: any }[] = [];
  return {
    now: 1_000_000,
    fxs,
    said,
    queue,
    fx: (kind: string, target?: string) => fxs.push({ kind, target }),
    say: (text: string) => said.push(text),
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    botLevel: () => level,
    bot: (by: string, _key: string, _ms: number, a: any) => queue.push({ by, a }),
  };
};

const settings = (o: Partial<ImposterSettings> = {}): ImposterSettings => ({ ...DEFAULT_SETTINGS.imposter, mode: 'question', imposters: 1, rounds: 3, ...o });
const P5 = ['a', 'b', 'c', 'd', 'e'];
const v = (ctx: any, s: any, me: string) => imposter.view(ctx, s, me) as ImposterView;

/* ------------------------------------------------------------------ */
/* content                                                             */
/* ------------------------------------------------------------------ */

const YESNO = new Set(['نعم', 'لا', 'أحياناً']);
const COLORS = new Set(['أزرق', 'أحمر', 'أخضر', 'أسود', 'وردي', 'بنفسجي', 'أصفر', 'برتقالي', 'بني', 'أبيض', 'رمادي', 'ذهبي']);
const TIMES = new Set([
  'الصيف', 'الربيع', 'الشتاء', 'الخريف', 'الصباح', 'المساء', 'الليل', 'العصر', 'بعد الغداء',
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة',
]);

/** The shape of one answer, as far as it can be told from the text. */
function shapeOf(a: string): 'number' | 'yesno' | 'color' | 'time' | 'other' {
  if (/^\d+$/.test(a)) return 'number';
  if (YESNO.has(a)) return 'yesno';
  if (COLORS.has(a)) return 'color';
  if (TIMES.has(a)) return 'time';
  return 'other';
}
const SHAPED: Partial<Record<AnswerTag, ReturnType<typeof shapeOf>>> = { number: 'number', yesno: 'yesno', color: 'color', time: 'time' };

test('question pairs: 150+, complete, no duplicates, both questions of a pair answered with the same shape', () => {
  expect(IMPOSTER_QUESTIONS.length).toBeGreaterThanOrEqual(150);
  const all = IMPOSTER_QUESTIONS.flatMap((p) => [p.real.q, p.imposter.q]).map(answerKey);
  expect(new Set(all).size).toBe(all.length);
  const tags = new Set(IMPOSTER_QUESTIONS.map((p) => p.tag));
  expect(tags.size).toBeGreaterThanOrEqual(10); // varied
  for (const p of IMPOSTER_QUESTIONS) {
    for (const q of [p.real, p.imposter]) {
      expect(q.q.endsWith('؟')).toBe(true);
      expect(q.answers.length).toBeGreaterThanOrEqual(2);
      for (const a of q.answers) {
        expect(a.trim()).toBe(a);
        expect(a.length).toBeGreaterThan(0);
        expect(a.length).toBeLessThanOrEqual(IMPOSTER_ANSWER_MAX);
      }
    }
    // the tag of each question, read from its answers, is the pair's tag
    const want = SHAPED[p.tag] ?? 'other';
    const shapes = (q: { answers: string[] }): string[] => [...new Set(q.answers.map(shapeOf))];
    expect([p.real.q, shapes(p.real)]).toEqual([p.real.q, [want]]);
    expect([p.imposter.q, shapes(p.imposter)]).toEqual([p.imposter.q, [want]]);
  }
  // a good share of numbers, and Moroccan flavour
  expect(IMPOSTER_QUESTIONS.filter((p) => p.tag === 'number').length).toBeGreaterThanOrEqual(30);
  expect(IMPOSTER_QUESTIONS.filter((p) => /مغرب|مراكش|كسكس|طاجين|جلابة|قفطان/.test(p.real.q + p.imposter.q)).length).toBeGreaterThanOrEqual(5);
});

test('answers: numbers are read in digits, Arabic digits or words; misfit grows away from the usual answers', () => {
  expect(answerNumber('7')).toBe(7);
  expect(answerNumber('٨ ساعات')).toBe(8);
  expect(answerNumber('سبعة')).toBe(7);
  expect(answerNumber('ثلاثون دقيقة')).toBe(30);
  expect(answerNumber('مرتين')).toBe(2);
  expect(answerNumber('كسكس')).toBeNull();
  const sleep = { q: 'كم ساعة تنام في الليل؟', answers: ['6', '7', '8', '9'] };
  expect(misfit(sleep, '8')).toBe(0);
  expect(misfit(sleep, 'ثمانية')).toBe(0);
  expect(misfit(sleep, '3')).toBeGreaterThan(1);
  expect(misfit(sleep, '1')).toBeGreaterThan(misfit(sleep, '4'));
  expect(misfit(sleep, 'كثيراً')).toBeGreaterThan(1);
  expect(misfit(sleep, '')).toBeGreaterThan(1);
  const food = { q: 'ما أكلتك المفضّلة؟', answers: ['كسكس', 'بيتزا', 'طاجين'] };
  expect(misfit(food, 'الكسكس')).toBe(0);
  expect(misfit(food, 'طاجين بالدجاج')).toBeLessThan(0.5);
  expect(misfit(food, 'باذنجان')).toBeGreaterThan(0.5);
  for (let i = 0; i < 20; i++) expect(food.answers).toContain(botAnswer(food));
});

/* ------------------------------------------------------------------ */
/* the game                                                            */
/* ------------------------------------------------------------------ */

test('dealing: everyone gets the same question but the imposter, who gets the other one; nothing leaks', () => {
  for (let round = 0; round < 30; round++) {
    const ctx = fakeCtx();
    const s: any = imposter.start(ctx, P5, settings());
    expect(s.phase).toBe('answer');
    expect(s.imposters.length).toBe(1);
    const imp = s.imposters[0];
    expect(s.realQ.q).not.toBe(s.impQ.q);
    expect(IMPOSTER_QUESTIONS.some((p) => (p.real === s.realQ && p.imposter === s.impQ) || (p.real === s.impQ && p.imposter === s.realQ))).toBe(true);
    for (const id of P5) {
      const view = v(ctx, s, id);
      expect(view.mode).toBe('question');
      // the same shape for everyone: the imposter doesn't know
      expect(Object.keys(view.secret!).sort()).toEqual(['question', 'role']);
      expect(view.secret).toEqual({ role: 'question', question: id === imp ? s.impQ.q : s.realQ.q });
      expect(view.question).toBeNull();
      expect(view.answers).toEqual({});
      expect(view.result).toBeNull();
      const json = JSON.stringify(view);
      expect(json).not.toContain(id === imp ? s.realQ.q : s.impQ.q);
      expect(json).not.toContain('"role":"imposter"');
      expect(json).not.toContain('partners');
    }
    const spectator = JSON.stringify(v(ctx, s, 'spectator'));
    expect(spectator).not.toContain(s.realQ.q);
    expect(spectator).not.toContain(s.impQ.q);
  }
  // 3 players are enough (one imposter); 7+ get two by default, who share the other question
  const ctx = fakeCtx();
  const s3: any = imposter.start(ctx, ['a', 'b', 'c'], settings({ imposters: 0 }));
  expect(s3.imposters.length).toBe(1);
  const s7: any = imposter.start(ctx, ['a', 'b', 'c', 'd', 'e', 'f', 'g'], settings({ imposters: 0 }));
  expect(s7.imposters.length).toBe(2);
  for (const id of s7.imposters) expect((v(ctx, s7, id).secret as any).question).toBe(s7.impQ.q);
  // apart from the question, an imposter's screen is exactly a civilian's (no partners, no role)
  const civ = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].find((id) => !s7.imposters.includes(id))!;
  for (const id of s7.imposters) expect({ ...v(ctx, s7, id), secret: null }).toEqual({ ...v(ctx, s7, civ), secret: null });
});

test('answering: short answers, private until the reveal, may be changed; empty or late ones are ignored', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, P5, settings());
  imposter.act(ctx, s, 'a', { type: 'answer', text: '   سبع   ساعات  ' });
  expect(s.answers.get('a')).toBe('سبع ساعات');
  imposter.act(ctx, s, 'a', { type: 'answer', text: 'ثماني ساعات' }); // changed
  imposter.act(ctx, s, 'b', { type: 'answer', text: '   ' }); // empty: ignored
  imposter.act(ctx, s, 'c', { type: 'answer', text: 'س'.repeat(80) });
  imposter.act(ctx, s, 'spectator', { type: 'answer', text: 'x' });
  expect(s.answers.get('c').length).toBe(IMPOSTER_ANSWER_MAX);
  expect([...s.answers.keys()].sort()).toEqual(['a', 'c']);
  const vb = v(ctx, s, 'b');
  expect(vb.answered.sort()).toEqual(['a', 'c']);
  expect(vb.myAnswer).toBeNull();
  expect(JSON.stringify(vb)).not.toContain('ثماني ساعات');
  expect(v(ctx, s, 'a').myAnswer).toBe('ثماني ساعات');
  expect(v(ctx, s, 'a').answerEndsAt).toBe(1_000_000 + 60_000);
  expect(v(ctx, s, 'a').answerSeconds).toBe(60);
  // the vote can't open before the answers are revealed
  imposter.act(ctx, s, 'a', { type: 'toVote' });
  expect(s.phase).toBe('answer');
});

test('time out: the answers are revealed with «no answer» for the late ones, then the real question', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, P5, settings({ answerSeconds: 30 }));
  for (const id of ['a', 'b', 'c']) imposter.act(ctx, s, id, { type: 'answer', text: `جواب ${id}` });
  ctx.now += 29_000;
  expect(imposter.tick!(ctx, s)).toBe(false);
  ctx.now += 1_000;
  expect(imposter.tick!(ctx, s)).toBe(true);
  expect(s.phase).toBe('answers');
  const view = v(ctx, s, 'a');
  expect(view.answers).toEqual({ a: 'جواب a', b: 'جواب b', c: 'جواب c', d: '', e: '' });
  expect(view.answerEndsAt).toBeNull();
  imposter.act(ctx, s, 'd', { type: 'answer', text: 'متأخر' }); // too late
  expect(s.answers.get('d')).toBe('');
});

test('simultaneous reveal: once everyone answered, all answers at once, then the real question for everyone (never the other one)', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, P5, settings());
  const imp = s.imposters[0];
  P5.forEach((id, i) => {
    expect(s.phase).toBe('answer');
    imposter.act(ctx, s, id, { type: 'answer', text: String(i + 3) });
  });
  expect(s.phase).toBe('answers');
  expect(ctx.fxs.at(-1).kind).toBe('reveal');
  for (const id of [...P5, 'spectator']) {
    const view = v(ctx, s, id);
    expect(view.answers).toEqual({ a: '3', b: '4', c: '5', d: '6', e: '7' });
    expect(view.question).toBe(s.realQ.q);
    expect(view.result).toBeNull();
    if (id !== imp) expect(JSON.stringify(view)).not.toContain(s.impQ.q);
  }
  // the imposter still sees their own question next to the real one: that's when they find out
  expect((v(ctx, s, imp).secret as any).question).toBe(s.impQ.q);
  // the host may also reveal early
  const s2: any = imposter.start(ctx, P5, settings());
  imposter.act(ctx, s2, 'a', { type: 'answer', text: '5' });
  imposter.act(ctx, s2, 'a', { type: 'revealAnswers' });
  expect(s2.phase).toBe('answers');
  expect(v(ctx, s2, 'b').answers.b).toBe('');
});

function toVote(ctx: any, s: any) {
  for (const id of s.participants) if (s.phase === 'answer') imposter.act(ctx, s, id, { type: 'answer', text: '5' });
  imposter.act(ctx, s, 'a', { type: 'toVote' });
  expect(s.phase).toBe('vote');
}

test('votes: the imposter found → a point for each other player (no word to guess); not found → two for the imposter', () => {
  const ctx = fakeCtx();
  const s: any = imposter.start(ctx, P5, settings());
  toVote(ctx, s);
  const imp = s.imposters[0];
  expect(v(ctx, s, 'a').answers[imp]).toBe('5'); // answers stay on screen for the vote
  for (const id of P5) imposter.act(ctx, s, id, { type: 'vote', target: id === imp ? P5.find((p) => p !== imp) : imp });
  expect(s.phase).toBe('result');
  expect(s.result.caught).toBe(true);
  expect(s.result.guessed).toBeNull();
  expect(s.result.winners).toBe('civilians');
  expect(s.result.question).toBe(s.realQ.q);
  expect(s.result.imposterQuestion).toBe(s.impQ.q);
  for (const id of P5) expect(s.scores[id]).toBe(id === imp ? 0 : 1);
  // now everyone sees the other question
  expect(JSON.stringify(v(ctx, s, 'a'))).toContain(s.impQ.q);

  imposter.act(ctx, s, 'a', { type: 'next' });
  expect(s.phase).toBe('answer');
  expect(s.round).toBe(2);
  expect(s.answers.size).toBe(0);
  const imp2 = s.imposters[0];
  toVote(ctx, s);
  const innocent = P5.find((p) => p !== imp2)!;
  for (const id of P5) imposter.act(ctx, s, id, { type: 'vote', target: id === innocent ? imp2 : innocent });
  expect(s.result.caught).toBe(false);
  expect(s.result.winners).toBe('imposters');
  expect(s.scores[imp2]).toBe((imp2 === imp ? 0 : 1) + 2);
});

/** Plays one all-bot round: the bots answer and vote, the host opens the vote. */
function botRound(level: BotLevel, n = 5) {
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const ctx = fakeCtx(ids, level);
  const s: any = imposter.start(ctx, ids, settings({ rounds: 1 }));
  let guard = 0;
  while (s.phase !== 'result' && guard++ < 30) {
    ctx.queue.length = 0;
    imposter.botPlan!(ctx, s, ids);
    for (const { by, a } of ctx.queue) imposter.act(ctx, s, by, a);
    if (s.phase === 'answers') imposter.act(ctx, s, 'host', { type: 'toVote' });
  }
  return s;
}

test('bots: answer their own question from its typical answers, vote by how badly answers fit the real question', () => {
  for (const level of ['easy', 'smart', 'expert'] as const) {
    for (let i = 0; i < 20; i++) {
      const s = botRound(level);
      expect(s.phase).toBe('result');
      for (const id of s.participants) {
        const q = s.imposters.includes(id) ? s.impQ : s.realQ;
        expect(q.answers).toContain(s.answers.get(id));
        const target = s.result.votes[id];
        expect(s.participants).toContain(target);
        expect(target).not.toBe(id);
      }
    }
  }
  // the expert bots find the imposter far more often than by chance (1 in 4 for one voter)
  let caught = 0;
  const n = 200;
  for (let i = 0; i < n; i++) if (botRound('expert').result.caught) caught++;
  console.log(`«سؤال مختلف»: the expert bots caught the imposter ${caught}/${n}`);
  expect(caught / n).toBeGreaterThan(0.4);
  expect(caught / n).toBeLessThan(0.95); // the imposter can blend in
});

test('bots: 3 players (bots count) are enough; a bot never answers twice or after the reveal', () => {
  const s = botRound('smart', 3);
  expect(s.phase).toBe('result');
  const ctx = fakeCtx(['x', 'y'], 'expert');
  const s2: any = imposter.start(ctx, ['me', 'x', 'y'], settings());
  imposter.botPlan!(ctx, s2, ['x', 'y']);
  expect(ctx.queue.map((q: any) => q.a.type)).toEqual(['answer', 'answer']);
  for (const { by, a } of ctx.queue) imposter.act(ctx, s2, by, a);
  ctx.queue.length = 0;
  imposter.botPlan!(ctx, s2, ['x', 'y']);
  expect(ctx.queue).toEqual([]);
});

test('the classic «كلمة سرية» mode is unchanged (and is the default)', () => {
  expect(DEFAULT_SETTINGS.imposter.mode).toBe('word');
  for (const o of [{ mode: 'word' as const }, { mode: undefined }]) {
    const ctx = fakeCtx();
    const s: any = imposter.start(ctx, P5, { ...DEFAULT_SETTINGS.imposter, imposters: 1, ...o });
    expect(s.phase).toBe('reveal');
    const imp = s.imposters[0];
    const civ = P5.find((p) => p !== imp)!;
    expect(v(ctx, s, civ).secret).toEqual({ role: 'civilian', word: s.word, category: s.category.label });
    expect(v(ctx, s, imp).secret?.role).toBe('imposter');
    expect(v(ctx, s, civ).mode).toBe('word');
    expect(v(ctx, s, civ).question).toBeNull();
    imposter.act(ctx, s, civ, { type: 'answer', text: 'x' }); // no answers in this mode
    expect(s.answers.size).toBe(0);
    imposter.act(ctx, s, 'a', { type: 'skipReady' });
    expect(s.phase).toBe('clues');
    imposter.act(ctx, s, 'a', { type: 'toVote' });
    for (const id of P5) imposter.act(ctx, s, id, { type: 'vote', target: id === imp ? civ : imp });
    expect(s.phase).toBe('guess'); // the last-chance guess is still there
    expect(s.result).toBeNull();
  }
});

/* ------------------------------------------------------------------ */
/* room settings                                                       */
/* ------------------------------------------------------------------ */

class FakeSock {
  data: { player: PlayerInfo | null; code: string | null } = { player: null, code: null };
  msgs: ServerMsg[] = [];
  send(raw: string) {
    this.msgs.push(JSON.parse(raw));
  }
  close() {}
}
const person = (id: string): PlayerInfo => ({ id, name: id, avatar: 'cat', color: '#E2475F' });

test('room settings: «نوع اللعب» and the answer time are validated', () => {
  const r = new Room('4377', person('h'), 'imposter');
  r.join(person('h'), new FakeSock() as unknown as Sock);
  r.roomAction('h', { type: 'settings', game: 'imposter', patch: { mode: 'question', answerSeconds: 45 } });
  expect(r.settings.imposter.mode).toBe('question');
  expect(r.settings.imposter.answerSeconds).toBe(45);
  r.roomAction('h', { type: 'settings', game: 'imposter', patch: { mode: 'other', answerSeconds: 50 } });
  expect(r.settings.imposter.mode).toBe('question');
  expect(r.settings.imposter.answerSeconds).toBe(45);
  r.roomAction('h', { type: 'settings', game: 'imposter', patch: { mode: 'word' } });
  expect(r.settings.imposter.mode).toBe('word');
});
