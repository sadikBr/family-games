/**
 * «قراءة الأحداث بصوت» in the quiz and party games: the say that reaches the phones (the LAST say of an
 * action) carries the expected call, ordinary moves carry none, and no secret ever reaches a voice.
 */
import { expect, test } from 'bun:test';

import { DEFAULT_SETTINGS, isWolfRole } from '../src/shared/protocol';
import { charades } from './games/charades';
import { codenames } from './games/codenames';
import { draw } from './games/draw';
import { huroof } from './games/huroof';
import { imposter } from './games/imposter';
import { names } from './games/names';
import { oneword } from './games/oneword';
import { potato } from './games/potato';
import { quiz } from './games/quiz';
import { spy } from './games/spy';
import { survey } from './games/survey';
import { surah } from './games/surah';
import { taboo } from './games/taboo';
import { werewolf } from './games/werewolf';
import { whois } from './games/whois';
import {
  ASK,
  LETTER_VOICE,
  PVOICE,
  TEAM_VOICE,
  voiceAnswer,
  voiceBook,
  voiceBurnt,
  voiceCell,
  voiceClosest,
  voiceCodeClue,
  voiceDead,
  voiceFinal,
  voiceGuesser,
  voiceHunter,
  voiceLetter,
  voiceMayor,
  voiceOut,
  voiceQuestion,
  voiceRoundTo,
  voiceTeamRound,
  voiceTeamWin,
  voiceTeamsFinal,
  voiceWinner,
  voiceWord,
  type VoiceTeam,
} from './voice-calls-party';

type Said = { text: string; by?: string; voice?: string };

/** A context that records every say (the last one of an action is what the phones get). */
function fakeCtx() {
  const said: Said[] = [];
  const ctx: any = {
    now: 1000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => id,
    memo: new Map(),
    bot: () => {},
    say: (text: string, by?: string, voice?: string) => said.push({ text, by, ...(voice ? { voice } : {}) }),
    botLevel: () => 'easy',
  };
  return { ctx, said };
}

const last = (said: Said[]) => said[said.length - 1];
const voices = (said: Said[]) => said.map((x) => x.voice).filter((v): v is string => !!v);

/* —— the dictionary ————————————————————————————————————————————————————————————— */

const ARABIC_CALL = /^[ء-غف-يً-ْ]+( [ء-غف-يً-ْ]+)*$/;
/** Each part of a call (calls are joined by «، »): Arabic letters, vowel marks and spaces, ≤ 40 characters, ≤ 5 words. */
function expectShort(v: string, vowelled = true) {
  for (const part of v.split('، ')) {
    expect(part).toMatch(ARABIC_CALL);
    if (vowelled) expect(part).toMatch(/[ً-ْ]/);
    expect(part.length).toBeLessThanOrEqual(40);
    expect(part.split(' ').length).toBeLessThanOrEqual(5);
  }
}

test('voice (party): every short call is Arabic, vowelled, at most 5 words and 40 characters', () => {
  const teams = Object.keys(TEAM_VOICE) as VoiceTeam[];
  const fixed = [
    ...Object.values(PVOICE),
    ...Object.values(LETTER_VOICE).map(voiceLetter),
    ...teams.flatMap((t) => [voiceTeamWin(t), voiceCell(t), voiceTeamRound(t)]),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => voiceCodeClue('بَحْر', n)),
    voiceTeamsFinal([3, 3]),
    voiceTeamsFinal([1, 4]),
  ];
  for (const v of fixed) expectShort(v);
  // with players' names (read as typed, without vowel marks)
  const withNames = [
    voiceWinner('مريم'),
    voiceWinner('الحسن'),
    voiceRoundTo('بابا'),
    voiceGuesser('ماما'),
    voiceClosest('سلمى'),
    voiceBurnt('جدو'),
    voiceOut('يوسف'),
    voiceDead(['يوسف']),
    voiceDead(['يوسف', 'مريم']),
    voiceHunter('علي'),
    voiceMayor('فاطمة'),
    voiceBook('ماما'),
    voiceWord('قطار'),
  ];
  for (const v of withNames) expectShort(v, false);
  expect(voiceWinner('الحسن')).toBe('الفَوْزُ لِلحسن');
  expect(voiceLetter('ب')).toBe('حَرْفُ البَاء');
  expect(voiceCodeClue('بحر', 3)).toBe('بحر، ثَلَاثَة');
  expect(voiceCodeClue('بحر', 0)).toBe(`بحر، ${PVOICE.noLimit}`);
  expect(voiceTeamsFinal([1, 4])).toBe(voiceTeamWin('blue'));
});

test('voice (party): a question is read with its options only when they are short', () => {
  expect(voiceQuestion('ما عاصمة المغرب؟', ['الرباط', 'فاس', 'مراكش', 'طنجة'])).toBe('ما عاصمة المغرب؟ الرباط، فاس، مراكش، أَمْ طنجة؟');
  const long = 'معنى طويل جداً لا يحسن أن يقرأه الصوت مع السؤال كله';
  expect(voiceQuestion('ما معنى الرحمن؟', [long, long, long, long])).toBe('ما معنى الرحمن؟');
  expect(voiceAnswer('الرباط')).toBe('الجَوَابُ: الرباط');
});

/* —— the quiz family ———————————————————————————————————————————————————————————— */

test('voice: مسابقة إسلامية — the question at each round, the answer at the reveal, the winner at the end', () => {
  const { ctx, said } = fakeCtx();
  const s = quiz.start(ctx, ['a', 'b'], { ...DEFAULT_SETTINGS.quiz, rounds: 2 });
  const q1 = s.items[0];
  expect(last(said)).toEqual({ text: '', voice: voiceQuestion(q1.text, q1.options) });
  quiz.act(ctx, s, 'a', { type: 'answer', choice: q1.correct });
  expect(said.length).toBe(1); // an answer is silent
  quiz.act(ctx, s, 'b', { type: 'answer', choice: (q1.correct + 1) % q1.options.length });
  expect(s.phase).toBe('reveal');
  expect(last(said).voice).toBe(voiceAnswer(q1.options[q1.correct]));
  ctx.now = s.endsAt!;
  quiz.tick!(ctx, s);
  expect(last(said).voice).toBe(voiceQuestion(s.items[1].text, s.items[1].options));
  ctx.now = s.endsAt!;
  quiz.tick!(ctx, s); // time up: the reveal
  expect(last(said).voice).toBe(voiceAnswer(s.items[1].options[s.items[1].correct]));
  ctx.now = s.endsAt!;
  quiz.tick!(ctx, s);
  expect(s.phase).toBe('final');
  expect(last(said).voice).toBe(voiceWinner('a'));
  expect(last(said).text).toBe(''); // heard, not shown
});

test('voice: من أي سورة؟ — the verse itself is never read, only the plain question and the surah names', () => {
  const { ctx, said } = fakeCtx();
  const s = surah.start(ctx, ['a'], { ...DEFAULT_SETTINGS.surah, rounds: 1 });
  const item = s.items[0];
  expect(last(said).voice).toBe(voiceQuestion(ASK.surah, item.options));
  expect(last(said).voice).not.toContain(item.text);
  surah.act(ctx, s, 'a', { type: 'answer', choice: item.correct });
  expect(last(said).voice).toBe(voiceAnswer(item.ref!.replace(' — ', '، ')));
});

test('voice: من هو؟ — every new clue is read, then the answer', () => {
  const { ctx, said } = fakeCtx();
  const s: any = whois.start(ctx, ['a', 'b'], { ...DEFAULT_SETTINGS.whois, rounds: 1 });
  const e = s.entries[0];
  expect(last(said).voice).toBe(e.clues[0]);
  ctx.now = s.nextClueAt;
  whois.tick!(ctx, s);
  expect(last(said).voice).toBe(e.clues[1]);
  const ans = s.options.indexOf(e.name);
  whois.act(ctx, s, 'a', { type: 'guess', choice: ans });
  expect(last(said).voice).toBe(e.clues[1]); // a guess is silent
  whois.act(ctx, s, 'b', { type: 'guess', choice: ans });
  expect(last(said).voice).toBe(voiceAnswer(e.name));
});

/* —— حروف —————————————————————————————————————————————————————————————————————— */

test('voice: حروف — the letter and the question, silence on the buzzer, the cell for the team, the winning path', () => {
  const { ctx, said } = fakeCtx();
  const s: any = huroof.start(ctx, ['a', 'b'], { ...DEFAULT_SETTINGS.huroof });
  const team = s.turn;
  const me = s.teams[team][0];
  huroof.act(ctx, s, me, { type: 'pick', cell: 3 });
  expect(last(said).voice).toBe(`${voiceLetter(s.cells[3].letter)}. ${s.question.text}`);
  const n = said.length;
  huroof.act(ctx, s, me, { type: 'buzz' });
  expect(said.length).toBe(n + 1);
  expect(last(said).voice).toBeUndefined();
  huroof.act(ctx, s, me, { type: 'answer', text: s.question.answer });
  expect(last(said).voice).toBe(`${PVOICE.right}، ${voiceCell(team)}`);
  // the last free cell of a board the team almost owns: the winner
  s.cells.forEach((c: any, i: number) => (c.owner = i === 0 ? null : team));
  s.phase = 'pick';
  s.turn = team;
  huroof.act(ctx, s, me, { type: 'pick', cell: 0 });
  huroof.act(ctx, s, me, { type: 'buzz' });
  huroof.act(ctx, s, me, { type: 'answer', text: s.question.answer });
  expect(s.winner).toBe(team);
  expect(last(said).voice).toEndWith(voiceTeamWin(team));
});

/* —— ماذا قال الناس؟ ——————————————————————————————————————————————————————————— */

test('voice: ماذا قال الناس؟ — the question, each answer revealed, «خطأ»', () => {
  const { ctx, said } = fakeCtx();
  const s: any = survey.start(ctx, ['a', 'b', 'c', 'd'], { ...DEFAULT_SETTINGS.survey });
  survey.act(ctx, s, 'a', { type: 'begin' });
  const q = s.questions[0];
  expect(last(said).voice).toBe(voiceQuestion(q.q));
  const [p0] = s.face.players;
  survey.act(ctx, s, p0, { type: 'buzz' });
  expect(last(said).voice).toBeUndefined(); // the buzzer is silent
  survey.act(ctx, s, p0, { type: 'answer', text: q.answers[0].text });
  expect(s.phase).toBe('play');
  expect(last(said).voice).toBe(q.answers[0].text);
  survey.act(ctx, s, s.answerer, { type: 'answer', text: 'كلمة لا علاقة لها أبداً' });
  expect(last(said).voice).toBe(PVOICE.wrong);
});

/* —— الذئب ——————————————————————————————————————————————————————————————————————— */

const WOLF_PLAYERS = ['سعيد', 'مريم', 'يوسف', 'سلمى', 'علي', 'هند', 'كريم'];
/** The only shapes a werewolf call may take before the end: the narrator's fixed calls, or a public event with names. */
const PUBLIC_WITH_NAMES = /^(الضَّحِيَّةُ|الضَّحَايَا|إِقْصَاءُ|طَلْقَةُ الصَّيَّادِ|العُمْدَةُ) [ء-ي ]+$/;
const FIXED = new Set<string>(Object.values(PVOICE).flatMap((v) => v.split('، ')));

test('voice: الذئب — a calm narrator: night, wolves, the roles\' steps, morning and its dead, the vote, the winner', () => {
  const { ctx, said } = fakeCtx();
  const s: any = werewolf.start(ctx, ['راوي', ...WOLF_PLAYERS.slice(0, 5)], { ...DEFAULT_SETTINGS.werewolf, narratorId: 'راوي' });
  const N = 'راوي';
  expect(last(said)).toEqual({ text: '', voice: PVOICE.night });
  werewolf.act(ctx, s, N, { type: 'next' });
  expect(last(said).voice).toBe(PVOICE.wolves);
  const victim = s.participants.find((id: string) => !isWolfRole(s.roles[id]));
  werewolf.act(ctx, s, N, { type: 'pick', target: victim });
  werewolf.act(ctx, s, N, { type: 'next' });
  expect(last(said).voice).toBe(PVOICE.doctor);
  werewolf.act(ctx, s, N, { type: 'next' });
  expect(last(said).voice).toBe(PVOICE.seer);
  werewolf.act(ctx, s, N, { type: 'next' }); // «wake»: the morning comes with the next tap
  expect(s.step).toBe('wake');
  werewolf.act(ctx, s, N, { type: 'next' });
  expect(last(said).voice).toBe(`${PVOICE.morning}، ${voiceDead([victim])}`);
  werewolf.act(ctx, s, N, { type: 'next' });
  expect(last(said).voice).toBe(PVOICE.vote);
  const wolf = s.participants.find((id: string) => isWolfRole(s.roles[id]));
  werewolf.act(ctx, s, N, { type: 'eliminate', target: wolf });
  expect(s.phase).toBe('over');
  expect(last(said).voice).toBe(`${voiceOut(wolf)}، ${PVOICE.winVillage}`);
});

test('voice: الذئب — no role ever reaches a voice before the end (random games)', () => {
  for (let g = 0; g < 40; g++) {
    const { ctx, said } = fakeCtx();
    const settings = { ...DEFAULT_SETTINGS.werewolf, narratorId: 'راوي', hunter: true, witch: true, guard: true, mayor: true, bigwolf: true, whitewolf: g % 2 === 0 };
    const s: any = werewolf.start(ctx, ['راوي', ...WOLF_PLAYERS], settings);
    for (let k = 0; k < 300 && s.phase !== 'over'; k++) {
      const before = said.length;
      const alive = s.participants.filter((id: string) => s.alive[id]);
      const any = alive[Math.floor(Math.random() * alive.length)];
      if (s.step === 'vote') werewolf.act(ctx, s, 'راوي', { type: 'eliminate', target: Math.random() < 0.15 ? null : any });
      else {
        if (Math.random() < 0.8) werewolf.act(ctx, s, 'راوي', { type: 'pick', target: any });
        werewolf.act(ctx, s, 'راوي', { type: 'next' });
      }
      // the voice of this action (only the last say reaches the phones): fixed calls and public events only
      const v = said.length > before ? last(said).voice : undefined;
      if (!v || s.phase === 'over') continue;
      for (const part of v.split('، ')) expect(FIXED.has(part) || PUBLIC_WITH_NAMES.test(part)).toBe(true);
    }
    expect(s.phase).toBe('over');
    const end = last(said).voice!;
    expect([PVOICE.winWolves, PVOICE.winVillage, PVOICE.winTanner, PVOICE.winWhite].some((w) => end.endsWith(w))).toBe(true);
  }
});

/* —— الدخيل ——————————————————————————————————————————————————————————————————————— */

test('voice: الدخيل — the vote result and who wins, never the secret word', () => {
  for (const catch_ of [true, false]) {
    const { ctx, said } = fakeCtx();
    const P = ['a', 'b', 'c', 'd'];
    const s: any = imposter.start(ctx, P, { ...DEFAULT_SETTINGS.imposter, imposters: 1 });
    imposter.act(ctx, s, 'a', { type: 'skipReady' });
    expect(last(said).voice).toBe(PVOICE.clues);
    imposter.act(ctx, s, 'a', { type: 'toVote' });
    expect(last(said).voice).toBe(PVOICE.vote);
    const imp = s.imposters[0];
    const civ = P.find((p) => p !== imp)!;
    const target = catch_ ? imp : civ;
    const n = said.length;
    for (const p of P) if (p !== target) imposter.act(ctx, s, p, { type: 'vote', target });
    imposter.act(ctx, s, target, { type: 'vote', target: P.find((p) => p !== target)! });
    expect(said.length).toBe(n + 1); // a vote is silent: only the result speaks
    if (catch_) {
      expect(last(said).voice).toBe(PVOICE.imposterCaught);
      imposter.act(ctx, s, imp, { type: 'guess', word: s.guessOptions.find((w: string) => w !== s.word) });
      expect(last(said).voice).toBe(`${PVOICE.guessWrong}، ${PVOICE.winCivilians}`);
    } else expect(last(said).voice).toBe(`${PVOICE.notImposter}، ${PVOICE.winImposter}`);
    for (const v of voices(said)) expect(v).not.toContain(s.word);
  }
});

/* —— الجاسوس ———————————————————————————————————————————————————————————————————— */

test('voice: الجاسوس — the accusation and the end, never the location', () => {
  const { ctx, said } = fakeCtx();
  const P = ['a', 'b', 'c', 'd'];
  const s: any = spy.start(ctx, P, { ...DEFAULT_SETTINGS.spy });
  spy.act(ctx, s, 'a', { type: 'skipReady' });
  const sp = s.spies[0];
  const civ = P.find((p) => !s.spies.includes(p))!;
  spy.act(ctx, s, civ, { type: 'accuse', target: sp });
  expect(last(said).voice).toBe(PVOICE.accuse);
  for (const p of P) if (p !== sp && p !== civ) spy.act(ctx, s, p, { type: 'accuseVote', yes: true });
  expect(s.phase).toBe('result');
  expect(last(said).voice).toBe(PVOICE.winCivilians);
  for (const v of voices(said)) expect(v).not.toContain(s.location.name);
});

/* —— كلمة واحدة ——————————————————————————————————————————————————————————————————— */

test('voice: كلمة واحدة — whose guess, right / wrong, never the mystery word', () => {
  const { ctx, said } = fakeCtx();
  const s: any = oneword.start(ctx, ['a', 'b', 'c'], { ...DEFAULT_SETTINGS.oneword, cards: 7 });
  const seen: string[] = [];
  for (let k = 0; k < 7 && s.phase !== 'final'; k++) {
    seen.push(s.word.w);
    ctx.now = s.endsAt; // nobody writes: the check
    oneword.tick!(ctx, s);
    ctx.now = s.endsAt; // the guess
    oneword.tick!(ctx, s);
    expect(last(said).voice).toBe(voiceGuesser(s.guesser));
    oneword.act(ctx, s, s.guesser, { type: 'guess', text: 'ضضضض' });
    expect(last(said).voice).toBe(PVOICE.wrong);
    oneword.act(ctx, s, 'a', { type: 'next' });
  }
  expect(s.phase).toBe('final');
  for (const v of voices(said)) for (const w of seen) expect(v).not.toContain(w);
});

/* —— الأسماء الرمزية ——————————————————————————————————————————————————————————— */

test('voice: الأسماء الرمزية — the clue as given, the black word and the winner; no word of the grid', () => {
  const { ctx, said } = fakeCtx();
  const s: any = codenames.start(ctx, ['a', 'b', 'c', 'd'], { ...DEFAULT_SETTINGS.codenames });
  codenames.act(ctx, s, 'a', { type: 'begin' });
  const master = s.spymasters[s.turn];
  codenames.act(ctx, s, master, { type: 'clue', word: 'ززززز', n: 2 });
  expect(last(said).voice).toBe(voiceCodeClue('ززززز', 2));
  const guesser = s.teams[s.turn].find((id: string) => id !== master);
  const mine = s.key.findIndex((k: string, i: number) => k === s.turn && !s.revealed[i]);
  codenames.act(ctx, s, guesser, { type: 'reveal', index: mine });
  expect(last(said).voice).toBeUndefined(); // an ordinary reveal is silent
  const team = s.turn;
  const assassin = s.key.indexOf('assassin');
  codenames.act(ctx, s, guesser, { type: 'reveal', index: assassin });
  const other = team === 'red' ? 'blue' : 'red';
  expect(last(said).voice).toBe(`${PVOICE.assassin}، ${voiceTeamWin(other)}`);
  for (const v of voices(said)) for (const w of s.words) expect(v).not.toContain(w);
});

/* —— the quick party games ———————————————————————————————————————————————————————— */

test('voice: البطاطا الحارة — a throw is silent, «بُووم» names who got burnt', () => {
  const { ctx, said } = fakeCtx();
  const s: any = potato.start(ctx, ['a', 'b', 'c'], { ...DEFAULT_SETTINGS.potato });
  potato.act(ctx, s, s.holderId, { type: 'start' });
  expect(last(said).voice).toBe(PVOICE.potatoOn);
  ctx.now += 1000;
  const to = ['a', 'b', 'c'].find((p) => p !== s.holderId)!;
  potato.act(ctx, s, s.holderId, { type: 'throw', to });
  expect(last(said).text).toContain('البطاطا من');
  expect(last(said).voice).toBeUndefined();
  ctx.now = s.explodeAt;
  potato.tick!(ctx, s);
  expect(last(said).voice).toBe(`${PVOICE.boom}، ${voiceBurnt(to)}`);
});

test('voice: اسم ولد اسم بنت — the letter, «ارفعوا الأقلام» and the end of the time', () => {
  const { ctx, said } = fakeCtx();
  const s: any = names.start(ctx, ['a', 'b'], { ...DEFAULT_SETTINGS.names });
  ctx.now = s.endsAt;
  names.tick!(ctx, s);
  expect(last(said).voice).toBe(voiceLetter(s.letter));
  names.act(ctx, s, 'a', { type: 'answer', cat: 'boy', text: 'باسم' });
  expect(last(said).voice).toBe(voiceLetter(s.letter)); // typing is silent
  ctx.now = s.endsAt;
  names.tick!(ctx, s);
  expect(last(said).voice).toBe(PVOICE.timeUp);
});

test('voice: الرسم — «خمّنوا» at the start, the word at the reveal (after the time is up)', () => {
  const { ctx, said } = fakeCtx();
  const s: any = draw.start(ctx, ['a', 'b'], { ...DEFAULT_SETTINGS.draw });
  const drawer = s.order[s.turn];
  draw.act(ctx, s, drawer, { type: 'choose', word: s.options[0] });
  expect(last(said).voice).toBe(PVOICE.guessIt);
  const n = said.length;
  draw.act(ctx, s, drawer, { type: 'stroke', id: 'x', pts: [1, 2, 3, 4] });
  expect(said.length).toBe(n);
  ctx.now = s.endsAt;
  draw.tick!(ctx, s);
  expect(last(said).voice).toBe(`${PVOICE.timeUp}، ${voiceWord(s.word)}`);
});

test('voice: المحرّم — «كلمة ممنوعة» when the other team buzzes; a found word is silent', () => {
  const { ctx, said } = fakeCtx();
  const s: any = taboo.start(ctx, ['a', 'b', 'c', 'd'], { ...DEFAULT_SETTINGS.taboo });
  taboo.act(ctx, s, 'a', { type: 'begin' });
  taboo.act(ctx, s, s.describerId, { type: 'start' });
  expect(last(said).voice).toBe(PVOICE.go);
  taboo.act(ctx, s, s.describerId, { type: 'ok', index: s.card.index });
  expect(last(said).voice).toBeUndefined();
  const team = s.teams[0].includes(s.describerId) ? 0 : 1;
  const rival = s.teams[1 - team][0];
  taboo.act(ctx, s, rival, { type: 'buzz', index: s.card.index });
  expect(last(said).voice).toBe(PVOICE.taboo);
});

test('voice: التمثيل الصامت — the actor is silent, the voice calls each word found', () => {
  const { ctx, said } = fakeCtx();
  const s: any = charades.start(ctx, ['a', 'b', 'c', 'd'], { ...DEFAULT_SETTINGS.charades });
  charades.act(ctx, s, 'a', { type: 'begin' });
  charades.act(ctx, s, s.actorId, { type: 'start' });
  ctx.now = s.endsAt;
  charades.tick!(ctx, s);
  expect(last(said).voice).toBe(PVOICE.go);
  charades.act(ctx, s, s.actorId, { type: 'ok', index: s.card.index });
  expect(last(said).voice).toBe(PVOICE.right);
  for (const v of voices(said)) expect(v).not.toContain(s.card.word);
});

test('voice: the final call names the sole top scorer, or «تعادل»', () => {
  const { ctx } = fakeCtx();
  expect(voiceFinal(ctx, ['a', 'b'], (id) => (id === 'b' ? 3 : 1))).toBe(voiceWinner('b'));
  expect(voiceFinal(ctx, ['a', 'b'], () => 2)).toBe(PVOICE.tie);
});
