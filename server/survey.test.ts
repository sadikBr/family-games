/** «ماذا قال الناس؟» — rules, matching, strikes / steal, multipliers, bots, content checks. */
import { expect, test } from 'bun:test';

import { surveyMultiplier, type SurveyView } from '../src/shared/games/survey';
import { answerKey } from '../src/shared/arabic';
import { botGuess, ROUND_END_MS, survey, type SurveyState } from './games/survey';
import { SURVEY_QUESTIONS, type SurveyQuestion } from './survey-content';
import { candidates, exactName, fuzzyName, matchAnswer, namesOf } from './survey-match';
import { GameError, type GameCtx } from './types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

interface Job {
  at: number;
  by: string;
  key: string;
  a: { type: string; [k: string]: unknown };
}

function fakeCtx(bots: string[] = []) {
  const jobs: Job[] = [];
  const keys = new Set<string>();
  const fx: [string, string | undefined][] = [];
  const offline = new Set<string>();
  const ctx: GameCtx & { jobs: Job[]; keys: Set<string>; fxs: typeof fx; offline: Set<string> } = {
    now: 1_000_000,
    fx: (k, t) => fx.push([k, t]),
    isConnected: (id) => !offline.has(id),
    isBot: (id) => bots.includes(id),
    playerName: (id) => id,
    memo: new Map(),
    bot: (by, key, d, a) => {
      const k = `${by}|${key}`;
      if (keys.has(k)) return;
      keys.add(k);
      jobs.push({ at: ctx.now + d, by, key: k, a });
    },
    jobs,
    keys,
    fxs: fx,
    offline,
  };
  return ctx;
}

/** A small known question for rule tests. */
const Q: SurveyQuestion = {
  q: 'سؤال تجريبي',
  answers: [
    { text: 'شاي', points: 40, aliases: ['أتاي'] },
    { text: 'قهوة', points: 25, aliases: [] },
    { text: 'حليب', points: 15, aliases: [] },
    { text: 'عصير', points: 10, aliases: [] },
    { text: 'ماء', points: 6, aliases: [] },
  ],
};

/** Four players, fixed teams [a, b] vs [c, d], the known question in every round, face-off begun. */
function setup(rounds = 3, seconds = 20) {
  const ctx = fakeCtx();
  const s = survey.start(ctx, ['a', 'b', 'c', 'd'], { rounds, seconds }) as SurveyState;
  s.teams = [['a', 'b'], ['c', 'd']];
  s.questions = s.questions.map(() => Q);
  s.starter = 0;
  survey.act(ctx, s, 'host', { type: 'begin' });
  return { ctx, s };
}

const view = (ctx: GameCtx, s: SurveyState, me = 'a') => survey.view(ctx, s, me) as SurveyView;
const say = (ctx: GameCtx, s: SurveyState, by: string, text: string) => survey.act(ctx, s, by, { type: 'answer', text });
const timeout = (ctx: GameCtx & { now: number }, s: SurveyState) => {
  ctx.now = s.endsAt! + 1;
  survey.tick!(ctx, s);
};

/** Face-off won by team 0 with the top answer; team 0 now plays. */
function toPlay() {
  const r = setup();
  survey.act(r.ctx, r.s, 'a', { type: 'buzz' });
  say(r.ctx, r.s, 'a', 'شاي');
  return r;
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

test('matching: spellings, aliases, slips, phrases, duplicates', () => {
  const kitchen = SURVEY_QUESTIONS.find((q) => q.q === 'شيء تجده في مطبخ مغربي')!;
  expect(matchAnswer(kitchen, 'الطاجين')).toBe(0);
  expect(matchAnswer(kitchen, 'طجين')).toBe(0); // alias
  expect(matchAnswer(kitchen, 'طاجن')).toBe(0); // one letter missing
  expect(matchAnswer(kitchen, 'البراد')).toBe(1);
  expect(matchAnswer(kitchen, 'ابريق الشاي')).toBe(1); // hamza shape
  expect(matchAnswer(kitchen, 'طنجره')).toBe(4); // ة / ه
  expect(matchAnswer(kitchen, 'سيارة')).toBe(-1);
  expect(matchAnswer(kitchen, 'ا')).toBe(-1);
  expect(matchAnswer(kitchen, 'طاجين', [true])).toBe('dup');

  expect(matchAnswer(Q, 'أتاي')).toBe(0);
  expect(matchAnswer(Q, 'كأس شاي')).toBe(0); // a phrase containing the answer
  expect(matchAnswer(Q, 'كاس ديال القهوة')).toBe(1);
  expect(matchAnswer(Q, '  حليب  ')).toBe(2);
  expect(candidates(Q, 'تلفاز')).toEqual([]);

  const ramadan = SURVEY_QUESTIONS.find((q) => q.q === 'أكلة رمضانية على مائدة الإفطار')!;
  expect(matchAnswer(ramadan, 'حريره')).toBe(0);
  expect(matchAnswer(ramadan, 'الشباكيه')).toBe(1);
  expect(matchAnswer(ramadan, 'زميتة')).toBe(4);
});

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

test('teams: auto-balanced, host can move players, each team needs someone', () => {
  for (let n = 2; n <= 12; n++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const s = survey.start(fakeCtx(), ids, { rounds: 5, seconds: 20 }) as SurveyState;
    expect(Math.abs(s.teams[0].length - s.teams[1].length)).toBeLessThanOrEqual(1);
    expect([...s.teams[0], ...s.teams[1]].sort()).toEqual([...ids].sort());
    expect(s.phase).toBe('teams');
  }
  const ctx = fakeCtx();
  const s = survey.start(ctx, ['a', 'b', 'c'], { rounds: 3, seconds: 20 }) as SurveyState;
  s.teams = [['a', 'b'], ['c']];
  survey.act(ctx, s, 'host', { type: 'swap', id: 'a' });
  expect(s.teams).toEqual([['b'], ['c', 'a']]);
  expect(() => survey.act(ctx, s, 'host', { type: 'swap', id: 'b' })).toThrow(GameError);
  expect(survey.hostOnly).toContain('begin');
  survey.act(ctx, s, 'host', { type: 'begin' });
  expect(s.phase).toBe('faceoff');
});

/* ------------------------------------------------------------------ */
/* Face-off                                                            */
/* ------------------------------------------------------------------ */

test('face-off: the top answer wins the board at once', () => {
  const { ctx, s } = setup();
  expect(s.face!.players).toEqual(['a', 'c']);
  expect(survey.turnOf!(s)).toEqual(['a', 'c']);
  survey.act(ctx, s, 'b', { type: 'buzz' }); // not at the buzzer
  expect(s.answerer).toBeNull();
  survey.act(ctx, s, 'c', { type: 'buzz' });
  survey.act(ctx, s, 'a', { type: 'buzz' }); // too late
  expect(s.answerer).toBe('c');
  expect(survey.turnOf!(s)).toEqual(['c']);
  say(ctx, s, 'a', 'شاي'); // not their turn
  expect(s.revealed[0]).toBe(false);
  say(ctx, s, 'c', 'أتاي');
  expect(s.phase).toBe('play');
  expect(s.control).toBe(1);
  expect(s.bank).toBe(40);
  // team 1's face-off player (c) answers last: d first
  expect(s.answerer).toBe('d');
});

test('face-off: the higher of the two answers wins', () => {
  // first answers #3, second answers #2 → second's team
  let { ctx, s } = setup();
  survey.act(ctx, s, 'a', { type: 'buzz' });
  say(ctx, s, 'a', 'حليب');
  expect(s.phase).toBe('faceoff');
  expect(s.answerer).toBe('c');
  expect(view(ctx, s).faceoff!.firstSlot).toBe(2);
  say(ctx, s, 'c', 'قهوة');
  expect(s.control).toBe(1);
  expect(s.bank).toBe(40);

  // first answers #2, second answers #4 → first's team
  ({ ctx, s } = setup());
  survey.act(ctx, s, 'c', { type: 'buzz' });
  say(ctx, s, 'c', 'قهوة');
  say(ctx, s, 'a', 'عصير');
  expect(s.control).toBe(1);

  // first misses, second answers anything → second's team
  ({ ctx, s } = setup());
  survey.act(ctx, s, 'a', { type: 'buzz' });
  say(ctx, s, 'a', 'خبز');
  expect(view(ctx, s).faceoff!.firstMissed).toBe(true);
  expect(s.strikes).toBe(0); // face-off misses are not strikes
  say(ctx, s, 'c', 'ماء');
  expect(s.control).toBe(1);

  // first answers, second repeats it → first's team
  ({ ctx, s } = setup());
  survey.act(ctx, s, 'a', { type: 'buzz' });
  say(ctx, s, 'a', 'قهوة');
  say(ctx, s, 'c', 'القهوة');
  expect(s.last!.kind).toBe('dup');
  expect(s.control).toBe(0);
});

test('face-off: both wrong → two other players; after three tries the board goes to the other team', () => {
  const { ctx, s } = setup();
  survey.act(ctx, s, 'a', { type: 'buzz' });
  say(ctx, s, 'a', 'خبز');
  say(ctx, s, 'c', 'سكر');
  expect(s.phase).toBe('faceoff');
  expect(s.face!.players).toEqual(['b', 'd']);
  survey.act(ctx, s, 'd', { type: 'buzz' });
  say(ctx, s, 'd', 'زيت');
  say(ctx, s, 'b', 'ملح');
  expect(s.face!.players).toEqual(['a', 'c']);
  survey.act(ctx, s, 'c', { type: 'buzz' });
  say(ctx, s, 'c', 'زبدة');
  say(ctx, s, 'a', 'عسل');
  expect(s.phase).toBe('play');
  expect(s.control).toBe(0); // c buzzed first on the last try
});

test('face-off: nobody buzzes → the starting team answers; a timeout is a miss', () => {
  const { ctx, s } = setup();
  timeout(ctx, s);
  expect(s.answerer).toBe('a'); // starter is team 0
  timeout(ctx, s);
  expect(s.last!.kind).toBe('timeout');
  expect(s.answerer).toBe('c');
  say(ctx, s, 'c', 'عصير');
  expect(s.control).toBe(1);
});

/* ------------------------------------------------------------------ */
/* Play, strikes, steal                                                */
/* ------------------------------------------------------------------ */

test('play: answers rotate through the team; already-said answers are no strike', () => {
  const { ctx, s } = toPlay();
  expect(s.control).toBe(0);
  expect(s.answerer).toBe('b');
  say(ctx, s, 'b', 'قهوة');
  expect(s.answerer).toBe('a');
  say(ctx, s, 'a', 'شاي'); // already on the board
  expect(s.last!.kind).toBe('dup');
  expect(s.strikes).toBe(0);
  expect(s.answerer).toBe('a');
  say(ctx, s, 'a', 'خبز');
  expect(s.strikes).toBe(1);
  expect(s.answerer).toBe('b');
  timeout(ctx, s); // no answer in time = strike
  expect(s.strikes).toBe(2);
  expect(s.last!.kind).toBe('timeout');
  // hidden slots carry nothing
  const v = view(ctx, s, 'c');
  expect(v.slots[2]).toEqual({ text: null, points: null, found: null });
  expect(v.slots[1]).toEqual({ text: 'قهوة', points: 25, found: 0 });
});

test('play: revealing every answer wins the round (×1)', () => {
  const { ctx, s } = toPlay();
  for (const w of ['قهوة', 'حليب', 'عصير', 'ماء']) say(ctx, s, s.answerer!, w);
  expect(s.phase).toBe('roundEnd');
  expect(s.result).toEqual({ team: 0, points: 96, stolen: false });
  expect(s.scores).toEqual([96, 0]);
});

test('three strikes → one steal attempt: right takes all the points', () => {
  const { ctx, s } = toPlay();
  say(ctx, s, 'b', 'قهوة'); // bank 65
  for (let i = 0; i < 3; i++) say(ctx, s, s.answerer!, 'خطأ' + i);
  expect(s.phase).toBe('steal');
  expect(survey.turnOf!(s)).toEqual(['c', 'd']);
  say(ctx, s, 'a', 'حليب'); // not the stealing team
  expect(s.phase).toBe('steal');
  say(ctx, s, 'd', 'شاي'); // already on the board: try again
  expect(s.phase).toBe('steal');
  say(ctx, s, 'd', 'حليب'); // any team-mate may answer
  expect(s.phase).toBe('roundEnd');
  expect(s.result).toEqual({ team: 1, points: 80, stolen: true });
  expect(s.scores).toEqual([0, 80]);
  // the rest of the board is shown at the end of the round
  const v = view(ctx, s);
  expect(v.slots.every((x) => x.text !== null)).toBe(true);
  expect(v.slots[3].found).toBeNull();
});

test('a failed (or timed-out) steal leaves the points with the team in control', () => {
  let { ctx, s } = toPlay();
  for (let i = 0; i < 3; i++) say(ctx, s, s.answerer!, 'خطأ' + i);
  say(ctx, s, 'c', 'خبز');
  expect(s.result).toEqual({ team: 0, points: 40, stolen: false });

  ({ ctx, s } = toPlay());
  for (let i = 0; i < 3; i++) timeout(ctx, s);
  expect(s.phase).toBe('steal');
  expect(s.timerTotal).toBe(30_000); // 20 s + time to talk it over
  timeout(ctx, s);
  expect(s.result!.team).toBe(0);
});

/* ------------------------------------------------------------------ */
/* Rounds and multipliers                                              */
/* ------------------------------------------------------------------ */

test('multipliers: the last two rounds count ×2 and ×3', () => {
  expect([0, 1, 2].map((r) => surveyMultiplier(r, 3))).toEqual([1, 2, 3]);
  expect([0, 1, 2, 3, 4].map((r) => surveyMultiplier(r, 5))).toEqual([1, 1, 1, 2, 3]);
  expect([0, 1, 2, 3, 4, 5, 6].map((r) => surveyMultiplier(r, 7))).toEqual([1, 1, 1, 1, 1, 2, 3]);

  const { ctx, s } = toPlay(); // 3 rounds
  const winRound = () => {
    while (s.phase !== 'roundEnd') say(ctx, s, s.answerer!, Q.answers[s.revealed.indexOf(false)].text);
  };
  winRound();
  expect(s.scores[0]).toBe(96);
  survey.act(ctx, s, 'host', { type: 'next' });
  expect(view(ctx, s).multiplier).toBe(2);
  expect(s.starter).toBe(1);
  expect(s.face!.players).toEqual(['b', 'd']); // face-off players rotate
  survey.act(ctx, s, 'b', { type: 'buzz' });
  say(ctx, s, 'b', 'شاي');
  winRound();
  expect(s.scores[0]).toBe(96 + 96 * 2);
  // the summary moves on by itself
  ctx.now += ROUND_END_MS + 1;
  survey.tick!(ctx, s);
  expect(view(ctx, s).multiplier).toBe(3);
  survey.act(ctx, s, 'c', { type: 'buzz' });
  say(ctx, s, 'c', 'شاي');
  winRound();
  expect(s.scores).toEqual([288, 288]);
  survey.act(ctx, s, 'host', { type: 'next' });
  expect(s.phase).toBe('final');
  expect(view(ctx, s).winner).toBe(-1);
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]); // a team win has no single target
});

test('settings: rounds snap to 3/5/7, seconds are clamped', () => {
  const st = { rounds: 5, seconds: 20 };
  survey.patchSettings!(st, { rounds: 4.2 });
  expect(st.rounds).toBe(5);
  survey.patchSettings!(st, { rounds: 99 });
  expect(st.rounds).toBe(7);
  survey.patchSettings!(st, { rounds: 1 });
  expect(st.rounds).toBe(3);
  survey.patchSettings!(st, { seconds: 3 });
  expect(st.seconds).toBe(10);
  survey.patchSettings!(st, { seconds: 500, rounds: 'x' });
  expect(st).toEqual({ rounds: 3, seconds: 45 });
  // odd saved settings are cleaned up at the start
  const s = survey.start(fakeCtx(), ['a', 'b'], { rounds: 1, seconds: 0 }) as SurveyState;
  expect(s.questions.length).toBe(3);
  expect(s.settings.seconds).toBe(10);
});

test('questions do not repeat across games in the same room', () => {
  const ctx = fakeCtx();
  const seen = new Set<string>();
  const games = Math.floor(SURVEY_QUESTIONS.length / 7);
  for (let g = 0; g < games; g++) {
    const s = survey.start(ctx, ['a', 'b'], { rounds: 7, seconds: 20 }) as SurveyState;
    for (const q of s.questions) {
      expect(seen.has(q.q)).toBe(false);
      seen.add(q.q);
    }
  }
  expect(seen.size).toBe(games * 7);
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('onLeave: the answerer leaving passes the turn without a strike', () => {
  const { ctx, s } = toPlay();
  expect(s.answerer).toBe('b');
  survey.onLeave!(ctx, s, 'b');
  expect(s.answerer).toBe('a');
  expect(s.strikes).toBe(0);
  expect(s.teams).toEqual([['a'], ['c', 'd']]);
});

test('onLeave: an empty team gets a player from the other one; too few players ends the game', () => {
  const { ctx, s } = toPlay();
  survey.onLeave!(ctx, s, 'a');
  survey.onLeave!(ctx, s, 'b');
  expect(s.teams[0].length).toBe(1);
  expect(s.teams[1].length).toBe(1);
  expect(s.phase).not.toBe('final');
  expect(s.answerer).toBe(s.teams[0][0]);
  survey.onLeave!(ctx, s, s.teams[1][0]);
  expect(s.phase).toBe('final');
});

test('onLeave: a face-off player leaving restarts the face-off with someone else', () => {
  const { ctx, s } = setup();
  survey.onLeave!(ctx, s, 'a');
  expect(s.phase).toBe('faceoff');
  expect(s.face!.players[0]).toBe('b');
  expect(s.answerer).toBeNull();
});

/* ------------------------------------------------------------------ */
/* Bots                                                                */
/* ------------------------------------------------------------------ */

test('bots: guesses favour the common answers and sometimes miss', () => {
  const { s } = setup();
  const hits = new Map<number | string, number>();
  for (let i = 0; i < 3000; i++) {
    const r = matchAnswer(Q, botGuess(s));
    hits.set(r, (hits.get(r) ?? 0) + 1);
  }
  expect(hits.get(0)!).toBeGreaterThan(hits.get(2) ?? 0);
  expect(hits.get(1)!).toBeGreaterThan(hits.get(4) ?? 0);
  expect(hits.get(-1)!).toBeGreaterThan(300); // about a quarter are wrong guesses
  expect(hits.get(-1)!).toBeLessThan(1200);
});

/** Run a whole game with bots only, the way the room does: plan → due jobs → tick, on a fake clock. */
function runBotGame(n: number, rounds: number) {
  const ids = Array.from({ length: n }, (_, i) => `bot${i}`);
  const ctx = fakeCtx(ids);
  const s = survey.start(ctx, ids, { rounds, seconds: 15 }) as SurveyState;
  const plan = () => survey.botPlan!(ctx, s, ids);
  plan();
  let guard = 0;
  const phases = new Set<string>();
  while (s.phase !== 'final' && guard++ < 50_000) {
    ctx.now += 250;
    let changed = survey.tick!(ctx, s);
    const due = ctx.jobs.filter((j) => j.at <= ctx.now);
    for (const j of due) {
      ctx.jobs.splice(ctx.jobs.indexOf(j), 1);
      try {
        survey.act(ctx, s, j.by, j.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        ctx.keys.delete(j.key);
      }
      changed = true;
    }
    if (changed) plan();
    phases.add(s.phase);
    // the board never shows hidden answers
    if (s.phase === 'play') expect(view(ctx, s).slots.filter((x) => x.text === null).length).toBe(s.revealed.filter((r) => !r).length);
  }
  return { s, phases, ctx };
}

test('a full bot game reaches the final screen (2, 5 and 12 players; 3, 5 and 7 rounds)', () => {
  for (const [n, rounds] of [
    [2, 3],
    [5, 5],
    [12, 7],
    [3, 5],
  ] as const) {
    const { s, phases, ctx } = runBotGame(n, rounds);
    expect(s.phase).toBe('final');
    expect(s.round).toBe(rounds - 1);
    expect(phases.has('play')).toBe(true);
    expect(phases.has('roundEnd')).toBe(true);
    expect(s.scores[0] + s.scores[1]).toBeGreaterThan(0);
    const v = view(ctx, s);
    expect(v.winner).toBe(s.scores[0] === s.scores[1] ? -1 : s.scores[0] > s.scores[1] ? 0 : 1);
  }
});

test('bot games go through strikes and steals too', () => {
  let steals = 0;
  for (let g = 0; g < 6; g++) {
    const { s, phases } = runBotGame(4, 7);
    expect(s.phase).toBe('final');
    if (phases.has('steal')) steals++;
  }
  expect(steals).toBeGreaterThan(0);
});

test('turnOf follows the game', () => {
  const { ctx, s } = toPlay();
  expect(survey.turnOf!(s)).toEqual(['b']);
  for (let i = 0; i < 3; i++) say(ctx, s, s.answerer!, 'خطأ' + i);
  expect(survey.turnOf!(s)).toEqual(['c', 'd']);
  say(ctx, s, 'c', 'خطأ');
  expect(survey.turnOf!(s)).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('content: 150+ questions, no duplicates, 5–8 answers, points add up to 80–110', () => {
  expect(SURVEY_QUESTIONS.length).toBeGreaterThanOrEqual(150);
  const keys = SURVEY_QUESTIONS.map((q) => answerKey(q.q));
  expect(new Set(keys).size).toBe(keys.length);
  for (const q of SURVEY_QUESTIONS) {
    const where = q.q;
    expect(q.answers.length, where).toBeGreaterThanOrEqual(5);
    expect(q.answers.length, where).toBeLessThanOrEqual(8);
    const sum = q.answers.reduce((n, a) => n + a.points, 0);
    expect(sum, where).toBeGreaterThanOrEqual(80);
    expect(sum, where).toBeLessThanOrEqual(110);
    for (let i = 0; i < q.answers.length; i++) {
      const a = q.answers[i];
      expect(a.text.length, where).toBeGreaterThan(0);
      expect(Number.isInteger(a.points) && a.points > 0, where).toBe(true);
      if (i > 0) expect(a.points, `${where}: ${a.text}`).toBeLessThanOrEqual(q.answers[i - 1].points);
    }
  }
});

test('content: honest wording — never claims a real poll', () => {
  for (const q of SURVEY_QUESTIONS) expect(q.q).not.toMatch(/سألنا|استطلاع|100 شخص|مئة شخص/);
});

/** Pairs that look alike but are both natural answers; typed exactly, each still finds its own answer. */
const LOOK_ALIKE = new Set(['الجمال|الرمال', 'الرمال|الجمال']);

test('content: aliases never collide between answers of the same question', () => {
  for (const q of SURVEY_QUESTIONS) {
    q.answers.forEach((a, i) => {
      for (const name of namesOf(a)) {
        // typed exactly, every name finds its own answer
        expect(matchAnswer(q, name), `${q.q}: ${name}`).toBe(i);
        q.answers.forEach((b, j) => {
          if (i === j) return;
          for (const other of namesOf(b)) {
            expect(exactName(name, other), `${q.q}: ${name} = ${other}`).toBe(false);
            if (!LOOK_ALIKE.has(`${name}|${other}`)) expect(fuzzyName(name, other), `${q.q}: ${name} ~ ${other}`).toBe(false);
          }
        });
      }
    });
  }
});
