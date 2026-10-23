/** «حروف»: the question is revealed word by word; the buzzer freezes it; a wrong answer shows it all. */
import { expect, test } from 'bun:test';

import { huroofKnowShare } from './ai/social-huroof';
import { huroof, shownShare, wordMs } from './games/huroof';

type Job = { by: string; key: string; delay: number; a: any };

function setup(opts: { pace?: number; level?: 'easy' | 'smart' | 'expert'; bots?: string[]; minWords?: number } = {}) {
  const jobs: Job[] = [];
  const ctx: any = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: (id: string) => (opts.bots ?? []).includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: any) => jobs.push({ by, key, delay, a }),
    botLevel: () => opts.level ?? 'expert',
    ...(opts.pace ? { pace: () => opts.pace } : {}),
  };
  // a question long enough to be caught half-way
  for (;;) {
    const s: any = huroof.start(ctx, ['r1', 'r2', 'g1', 'g2'], { seconds: 15 });
    s.teams = { red: ['r1', 'r2'], green: ['g1', 'g2'] };
    s.turn = 'red';
    huroof.act(ctx, s, 'r1', { type: 'pick', cell: 0 });
    if (s.reveal.words.length >= (opts.minWords ?? 5)) return { ctx, s, jobs, words: s.reveal.words as string[] };
  }
}

const views = (ctx: any, s: any) => ['r1', 'r2', 'g1', 'g2'].map((id) => huroof.view(ctx, s, id) as any);

/** Move the clock to the moment word `k` (1-based) appears and tick. */
function toWord(ctx: any, s: any, k: number) {
  ctx.now = Math.max(ctx.now, s.reveal.at[k - 1]);
  huroof.tick!(ctx, s);
}

test('huroof reveal: words appear one by one after a short pause, at ~0.35–0.45 s each; the timer waits for the last word', () => {
  const { ctx, s, words } = setup();
  const start = ctx.now;
  expect(s.reveal.shown).toBe(0);
  expect(s.endsAt).toBeNull();
  expect(views(ctx, s)[0].question).toEqual({ text: '', hidden: words.length, frozen: false, cat: 'إسلامية' });
  // the pause before the first word
  ctx.now = start + 600;
  expect(huroof.tick!(ctx, s)).toBe(false);
  expect(s.reveal.at[0] - start).toBe(700);
  for (let i = 1; i < words.length; i++) {
    const gap = s.reveal.at[i] - s.reveal.at[i - 1];
    expect(gap).toBe(wordMs(words[i - 1]));
    expect(gap).toBeGreaterThanOrEqual(350);
    expect(gap).toBeLessThanOrEqual(450);
  }
  for (let k = 1; k <= words.length; k++) {
    ctx.now = s.reveal.at[k - 1] - 1;
    huroof.tick!(ctx, s);
    expect(s.reveal.shown).toBe(k - 1);
    ctx.now += 1;
    expect(huroof.tick!(ctx, s)).toBe(true);
    expect(s.reveal.shown).toBe(k);
    const q = views(ctx, s)[2].question;
    expect(q).toEqual({ text: words.slice(0, k).join(' '), hidden: words.length - k, frozen: false, cat: 'إسلامية' });
    if (k < words.length) expect(s.endsAt).toBeNull();
  }
  // all shown: now the question's own timer runs
  expect(s.endsAt).toBe(ctx.now + 15000);
});

test('huroof reveal: no view ever carries a hidden word or the answer', () => {
  for (let g = 0; g < 30; g++) {
    const { ctx, s, words } = setup({ minWords: 3 });
    const answer = s.question.answer;
    const check = () => {
      const shown = words.slice(0, s.reveal ? s.reveal.shown : words.length);
      const shownText = shown.join(' ');
      for (const v of views(ctx, s)) {
        const json = JSON.stringify(v);
        if (!s.question.text.includes(answer)) expect(json).not.toContain(answer); // (a few questions quote their answer)
        if (shown.length < words.length) expect(json).not.toContain(s.question.text);
        expect(v.question.text).toBe(shownText);
        // every hidden word that isn't also part of the shown text (or a word of the UI) stays out
        // (the question's category label, e.g. «إسلامية», is UI text too)
        const ui = JSON.stringify(v.feed) + String((v.question as { cat?: string }).cat ?? '');
        for (const w of words.slice(shown.length)) if (w.length >= 3 && !shownText.includes(w) && !ui.includes(w)) expect([w, json.includes(w)]).toEqual([w, false]);
      }
    };
    check();
    const stop = 1 + Math.floor(Math.random() * (words.length - 1));
    for (let k = 1; k <= stop; k++) {
      toWord(ctx, s, k);
      check();
    }
    // a buzz freezes it there: time passes, nothing more is shown
    huroof.act(ctx, s, 'g1', { type: 'buzz' });
    ctx.now += 10_000;
    huroof.tick!(ctx, s);
    check();
  }
});

test('huroof reveal: the buzzer works from the first word and freezes the question for everyone', () => {
  const { ctx, s, words } = setup();
  toWord(ctx, s, 2);
  huroof.act(ctx, s, 'g2', { type: 'buzz' });
  expect(s.phase).toBe('answer');
  expect(s.endsAt).toBe(ctx.now + 20_000); // the answer timer, as before
  for (let t = 0; t < 15; t++) {
    ctx.now += 1000;
    if (ctx.now < s.endsAt) huroof.tick!(ctx, s);
  }
  expect(s.reveal.shown).toBe(2);
  for (const v of views(ctx, s)) expect(v.question).toEqual({ text: words.slice(0, 2).join(' '), hidden: words.length - 2, frozen: true, cat: 'إسلامية' });
  expect(s.feed.list().at(-1).text).toContain('قبل اكتمال السؤال');
});

test('huroof reveal: a wrong early answer shows the whole question, locks that team out, and the other team answers', () => {
  const { ctx, s, words } = setup();
  toWord(ctx, s, 1);
  huroof.act(ctx, s, 'g1', { type: 'buzz' });
  huroof.act(ctx, s, 'g1', { type: 'answer', text: 'كلام فارغ تماما' });
  expect(s.phase).toBe('question');
  expect(s.canAnswer).toEqual(['red']);
  for (const v of views(ctx, s)) expect(v.question).toEqual({ text: words.join(' '), hidden: 0, frozen: false, cat: 'إسلامية' });
  expect(s.endsAt).toBe(ctx.now + 15_000); // the timer starts at once: the question is all there
  expect(() => huroof.act(ctx, s, 'g2', { type: 'buzz' })).toThrow();
  huroof.act(ctx, s, 'r2', { type: 'buzz' });
  expect(s.buzzer).toBe('r2');
  expect(views(ctx, s)[0].question.frozen).toBe(false);
  huroof.act(ctx, s, 'r2', { type: 'answer', text: s.question.answer });
  expect(s.cells[0].owner).toBe('red');
  expect(s.last).toMatchObject({ team: 'red', question: words.join(' ') });
});

test('huroof reveal: a buzzer who runs out of time also shows the whole question; both teams wrong → the answer', () => {
  const { ctx, s, words } = setup();
  const answer = s.question.answer;
  toWord(ctx, s, 3);
  huroof.act(ctx, s, 'r1', { type: 'buzz' });
  ctx.now += 21_000;
  huroof.tick!(ctx, s); // time's up for r1
  expect(s.canAnswer).toEqual(['green']);
  expect(views(ctx, s)[3].question).toEqual({ text: words.join(' '), hidden: 0, frozen: false, cat: 'إسلامية' });
  huroof.act(ctx, s, 'g1', { type: 'buzz' });
  huroof.act(ctx, s, 'g1', { type: 'answer', text: 'كلام فارغ تماما' });
  expect(s.phase).toBe('pick');
  expect(s.cells[0].owner).toBeNull();
  expect(s.last).toMatchObject({ team: null, answer, question: words.join(' ') });
  expect(views(ctx, s)[0].question).toBeNull();
});

test('huroof reveal: the room pace stretches the reveal', () => {
  const a = setup({ pace: 1 });
  const b = setup({ pace: 1.7 });
  const per = (x: any) => (x.s.reveal.at.at(-1) - x.s.reveal.start) / x.words.length;
  // the pause before the first word
  expect(b.s.reveal.at[0] - b.s.reveal.start).toBe(Math.round(700 * 1.7));
  expect(a.s.reveal.at[0] - a.s.reveal.start).toBe(700);
  // each word, at the pace
  for (let i = 1; i < b.words.length; i++) expect(b.s.reveal.at[i] - b.s.reveal.at[i - 1]).toBe(Math.round(wordMs(b.words[i - 1]) * 1.7));
  expect(per(b)).toBeGreaterThan(per(a));
});

/** Run the bots' plans word by word; returns the share shown when a buzz was first scheduled (null: none). */
function firstBuzz(opts: { level: 'easy' | 'smart' | 'expert'; bots: string[] }) {
  const { ctx, s, jobs, words } = setup({ ...opts, minWords: 6 });
  for (let k = 0; k <= words.length; k++) {
    if (k) toWord(ctx, s, k);
    huroof.botPlan!(ctx, s, opts.bots);
    const buzz = jobs.find((j) => j.a.type === 'buzz');
    if (buzz) return { share: shownShare(s), buzz };
  }
  return null;
}

test('huroof reveal: easy bots wait for the whole question', () => {
  for (let g = 0; g < 60; g++) {
    const r = firstBuzz({ level: 'easy', bots: ['r1', 'r2', 'g1', 'g2'] });
    expect(r?.share).toBe(1);
  }
  expect(huroofKnowShare('easy', 0.95)).toBe(0);
  expect(huroofKnowShare('easy', 1)).toBe(1);
});

test('huroof reveal: an expert bot may buzz early — when enough of the question is shown — and answers from that part', () => {
  let early = 0;
  let trials = 0;
  for (let g = 0; g < 200; g++) {
    const r = firstBuzz({ level: 'expert', bots: ['r1', 'r2', 'g1', 'g2'] });
    if (!r) continue;
    trials++;
    expect(r.share).toBeGreaterThan(0.4); // never on the first words
    if (r.share < 1) early++;
  }
  console.log(`huroof: expert buzzed before the end in ${early}/${trials}`);
  expect(early).toBeGreaterThan(trials * 0.4);
  // the knowledge curve: rises with the share shown, the expert's above the smart one's
  for (const f of [0.65, 0.8, 0.9]) {
    expect(huroofKnowShare('expert', f)).toBeGreaterThan(huroofKnowShare('smart', f));
    expect(huroofKnowShare('expert', f + 0.1)).toBeGreaterThanOrEqual(huroofKnowShare('expert', f));
  }
  expect(huroofKnowShare('smart', 0.6)).toBe(0);
  expect(huroofKnowShare('expert', 0.4)).toBe(0);
});

test('huroof reveal: a bot on a team with people never buzzes before the whole question is shown', () => {
  for (let g = 0; g < 80; g++) {
    // r1 and g1 are people
    const r = firstBuzz({ level: 'expert', bots: ['r2', 'g2'] });
    if (r) expect(r.share).toBe(1);
  }
});

test('huroof reveal: an expert bot that buzzed early answers right only if it knew from the part shown', () => {
  let right = 0;
  let all = 0;
  for (let g = 0; g < 120; g++) {
    const bots = ['r1', 'r2', 'g1', 'g2'];
    const { ctx, s, jobs, words } = setup({ level: 'expert', bots, minWords: 6 });
    let k = 0;
    while (!jobs.some((j) => j.a.type === 'buzz') && k < words.length) {
      toWord(ctx, s, ++k);
      huroof.botPlan!(ctx, s, bots);
    }
    const buzz = jobs.find((j) => j.a.type === 'buzz');
    if (!buzz || s.reveal.shown === words.length) continue;
    huroof.act(ctx, s, buzz.by, buzz.a);
    huroof.botPlan!(ctx, s, bots);
    const ans = jobs.find((j) => j.a.type === 'answer');
    expect(ans?.by).toBe(buzz.by);
    all++;
    if (ans!.a.text === s.question.answer) right++;
  }
  // it only buzzed because it knew
  expect(right).toBe(all);
});
