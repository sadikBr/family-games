/**
 * «قراءة الأحداث بصوت» for the board, dice and word games: the big moments carry a short call
 * (Said.voice) on the say that reaches the phones (the LAST say of a move), ordinary moves carry none,
 * every game's end reads its winner, and no call gives away hidden information.
 */
import { afterEach, expect, test } from 'bun:test';

import { FINISH, SAFE, trackIndex } from '../src/shared/ludo';
import { JUMPS } from '../src/shared/islamic';
import { BOARD, isOwnable } from '../src/shared/estate';
import { DEFAULT_SETTINGS, type GameAction } from '../src/shared/protocol';
import { normWord } from '../src/shared/wordle';
import { seeded } from './ai/boards-search';
import { battleship } from './games/battleship';
import { blocks } from './games/blocks';
import { boggle } from './games/boggle';
import { carca } from './games/carca';
import { catan } from './games/catan';
import { chess } from './games/chess';
import { codebreak } from './games/codebreak';
import { connect4 } from './games/connect4';
import { dama } from './games/dama';
import { dots } from './games/dots';
import { estate } from './games/estate';
import { hajj } from './games/hajj';
import { kharbga } from './games/kharbga';
import { ladders } from './games/ladders';
import { ludo } from './games/ludo';
import { mancala } from './games/mancala';
import { memory } from './games/memory';
import { scrabble } from './games/scrabble';
import { sudoku } from './games/sudoku';
import { VALID_GUESSES, wordle } from './games/wordle';
import { xo } from './games/xo';
import { GameError, type GameModule } from './types';
import {
  BIG_WORD,
  HAJJ_STATION_VOICE,
  VB,
  roundWin,
  voiceAnd,
  voiceDice,
  voiceLastTry,
  voicePlace,
  voicePoints,
  voiceResult,
  voiceSolved,
  voiceWinner,
} from './voice-calls-boards';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Said = { text: string; by?: string; voice?: string };

/** Arabic names, so the calls that carry a name stay Arabic-only. */
const NAMES: Record<string, string> = { a: 'سارة', b: 'يوسف', c: 'الحسن', d: 'مريم' };

function fakeCtx() {
  const said: Said[] = [];
  const ctx: any = {
    now: 1_000_000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => false,
    playerName: (id: string) => NAMES[id] ?? id,
    memo: new Map(),
    bot: () => {},
    say: (text: string, by?: string, voice?: string) => said.push({ text, by, ...(voice ? { voice } : {}) }),
    botLevel: () => 'easy',
  };
  return { ctx, said };
}

const last = (said: Said[]) => said[said.length - 1];
const realRandom = Math.random;
afterEach(() => {
  Math.random = realRandom;
});
/** The next die shows `d` (1 … 6). */
const dice = (d: number) => (Math.random = () => (d - 1) / 6 + 0.01);

/** A short call: Arabic letters, vowel marks, spaces and the joining comma only; 40 characters at most. */
const SHORT = /^[ء-غف-يً-ْ]+(،? [ء-غف-يً-ْ]+)*$/;
function expectShort(v: string) {
  expect(v).toMatch(SHORT);
  expect(v.length).toBeLessThanOrEqual(40);
}

/* —— the dictionary ————————————————————————————————————————————————————————————— */

test('voice boards: every call is short, Arabic-only, and the game words carry vowel marks', () => {
  const names = Object.values(NAMES);
  const calls = [
    ...Object.values(VB),
    ...Object.values(HAJJ_STATION_VOICE),
    ...names.flatMap((n) => [voiceWinner(n), voiceResult(n), roundWin(n), voiceSolved(n, true), voiceSolved(n, false), voiceLastTry(n), voicePlace(0, n)!, voicePlace(3, n)!]),
    voiceResult(null),
    ...Array.from({ length: 12 }, (_, i) => voiceDice(i + 1)),
    voiceAnd(voiceDice(7), VB.robber)!,
    voiceAnd(VB.mate, voiceWinner('الحسن'))!,
    voiceAnd(VB.promotion, VB.queenTaken, VB.check)!,
    voiceAnd(VB.sunk, voiceWinner('مريم'))!,
    voiceAnd(HAJJ_STATION_VOICE['طواف الوداع'], voiceWinner('يوسف'))!,
    voiceAnd(VB.bankrupt, voiceWinner('سارة'))!,
  ];
  for (let n = BIG_WORD; n < 200; n++) calls.push(voiceAnd(VB.bigWord, voicePoints(n))!, voiceAnd(VB.bingo, voicePoints(n))!);
  for (const v of calls) expectShort(v);
  // the game words are vowelled (the scrabble calls are plain words read with the points)
  for (const v of [...Object.values(VB), ...Object.values(HAJJ_STATION_VOICE)]) if (v !== VB.bingo && v !== VB.bigWord) expect(v).toMatch(/[ً-ْ]/);
  // «لِلحسن», not «لِالحسن»
  expect(voiceWinner('الحسن')).toBe('الفَوْزُ لِلحسن');
  expect(voiceResult(null)).toBe('تَعَادُلْ');
  expect(voicePlace(4, 'سارة')).toBeUndefined();
  expect(voiceDice(8)).toBe('ثَمَانِيَة');
  expect(voicePoints(1)).toBe('نقطة واحدة');
  expect(voicePoints(2)).toBe('نقطتان');
  expect(voicePoints(10)).toBe('عشر نقاط');
  expect(voicePoints(15)).toBe('خمس عشرة نقطة');
  expect(voicePoints(30)).toBe('ثلاثون نقطة');
  expect(voicePoints(83)).toBe('ثلاث وثمانون نقطة');
  expect(voicePoints(100)).toBe('مئة نقطة');
  expect(voicePoints(142)).toBe('مئة واثنتان وأربعون نقطة');
  expect(voicePoints(200)).toBe('مئتا نقطة');
  // every station of the journey has its call
  expect(Object.keys(HAJJ_STATION_VOICE)).toHaveLength(11);
});

/* —— الشطرنج ————————————————————————————————————————————————————————————————————— */

/** 'e2' → the board index (rank 8 first). */
const sq = (n: string) => (8 - Number(n[1])) * 8 + 'abcdefgh'.indexOf(n[0]);

function chessGame() {
  const f = fakeCtx();
  const s: any = chess.start(f.ctx, ['a', 'b'], { level: 1 } as any);
  const move = (from: string, to: string) => chess.act(f.ctx, s, s.pos.turn === 'w' ? s.white : s.black, { type: 'move', from: sq(from), to: sq(to) });
  return { ...f, s, move };
}

test('voice boards: الشطرنج — an ordinary move is silent, «كش ملك» is read aloud', () => {
  const { said, move } = chessGame();
  move('e2', 'e4');
  expect(last(said).voice).toBeUndefined();
  move('f7', 'f6');
  expect(last(said).voice).toBeUndefined();
  move('d1', 'h5');
  expect(last(said).text).toContain('كش!');
  expect(last(said).voice).toBe(VB.check);
});

test('voice boards: الشطرنج — «كش مات» and the winner, on the move itself', () => {
  const { said, s, move } = chessGame();
  move('f2', 'f3');
  move('e7', 'e5');
  move('g2', 'g4');
  move('d8', 'h4');
  expect(s.phase).toBe('final');
  expect(last(said)).toMatchObject({ by: s.black, voice: voiceAnd(VB.mate, voiceWinner(NAMES[s.black])) });
});

test('voice boards: الشطرنج — resigning reads the winner', () => {
  const { ctx, said, s } = chessGame();
  chess.act(ctx, s, s.white, { type: 'resign' });
  expect(last(said).voice).toBe(voiceAnd(VB.resign, voiceWinner(NAMES[s.black])));
});

/* —— أربعة في خط، XO ———————————————————————————————————————————————————————————— */

test('voice boards: أربعة في خط — a disc is silent, four in a row reads the winner', () => {
  const { ctx, said } = fakeCtx();
  const s: any = connect4.start(ctx, ['a', 'b'], { level: 1 } as any);
  for (let k = 0; k < 3; k++) {
    connect4.act(ctx, s, s.red, { type: 'drop', col: 0 });
    expect(last(said).voice).toBeUndefined();
    connect4.act(ctx, s, s.yellow, { type: 'drop', col: 1 });
  }
  connect4.act(ctx, s, s.red, { type: 'drop', col: 0 });
  expect(s.phase).toBe('final');
  expect(last(said).voice).toBe(voiceAnd(VB.fourInRow, voiceWinner(NAMES[s.red])));
});

test('voice boards: XO — a full line reads the winner, a full board «تعادل»', () => {
  const g = fakeCtx();
  const s: any = xo.start(g.ctx, ['a', 'b'], { level: 1, size: 3 } as any);
  const mark = (cell: number) => xo.act(g.ctx, s, s.turn === 'x' ? s.x : s.o, { type: 'mark', cell });
  for (const c of [0, 3, 1, 4]) {
    mark(c);
    expect(last(g.said).voice).toBeUndefined();
  }
  mark(2);
  expect(last(g.said).voice).toBe(voiceAnd(VB.fullLine, voiceWinner(NAMES[s.x])));

  const h = fakeCtx();
  const t: any = xo.start(h.ctx, ['a', 'b'], { level: 1, size: 3 } as any);
  // x o x / x o o / o x x
  for (const c of [0, 1, 2, 4, 3, 5, 7, 6, 8]) xo.act(h.ctx, t, t.turn === 'x' ? t.x : t.o, { type: 'mark', cell: c });
  expect(t.winner).toBe('draw');
  expect(last(h.said).voice).toBe(VB.draw);
});

/* —— معركة السفن ——————————————————————————————————————————————————————————————— */

test('voice boards: معركة السفن — a miss is silent, «إصابة», «غرق», and the winner with the last ship', () => {
  const { ctx, said } = fakeCtx();
  const s: any = battleship.start(ctx, ['a', 'b'], { level: 1 } as any);
  const [p, q] = s.players;
  s.fleets[q] = [[0, 1], [20]];
  s.fleets[p] = [[90, 91]];
  s.phase = 'play';
  s.turnIdx = 0;
  battleship.act(ctx, s, p, { type: 'fire', cell: 50 });
  expect(last(said).voice).toBeUndefined();
  battleship.act(ctx, s, q, { type: 'fire', cell: 50 });
  battleship.act(ctx, s, p, { type: 'fire', cell: 0 });
  expect(last(said).voice).toBe(VB.hit);
  battleship.act(ctx, s, p, { type: 'fire', cell: 1 });
  expect(last(said).voice).toBe(VB.sunk);
  battleship.act(ctx, s, p, { type: 'fire', cell: 20 });
  expect(s.phase).toBe('final');
  expect(last(said).voice).toBe(voiceAnd(VB.sunk, voiceWinner(NAMES[p])));
});

/* —— لودو، السلم والثعبان ————————————————————————————————————————————————————— */

test('voice boards: لودو — a 6 is «ستة», a 4 is silent, landing on a piece is «أكل»', () => {
  const { ctx, said } = fakeCtx();
  const s: any = ludo.start(ctx, ['a', 'b'], { exitOnOne: false, podium: false, quick: false });
  s.turnIdx = 0;
  const [A, B] = s.seats;
  s.tokens[A.id] = [10, -1, -1, -1];
  // a piece of the other colour 4 squares ahead, on a square that isn't safe
  const at = trackIndex(A.color, 14)!;
  expect(SAFE.includes(at)).toBe(false);
  const pb = Array.from({ length: FINISH }, (_, k) => k).find((k) => trackIndex(B.color, k) === at)!;
  s.tokens[B.id] = [pb, -1, -1, -1];
  dice(4);
  ludo.act(ctx, s, A.id, { type: 'roll' });
  expect(last(said).voice).toBeUndefined();
  ludo.act(ctx, s, A.id, { type: 'move', token: 0 });
  expect(last(said).text).toContain('عادت إلى القاعدة');
  expect(last(said).voice).toBe(VB.capture);
  dice(6);
  ludo.act(ctx, s, A.id, { type: 'roll' });
  expect(last(said)).toMatchObject({ by: A.id, voice: VB.six });
});

test('voice boards: السلم والثعبان — a ladder is «سلّم», a plain square is silent', () => {
  const { ctx, said } = fakeCtx();
  const s: any = ladders.start(ctx, ['a', 'b'], { exact: true });
  const from = Number(Object.keys(JUMPS).find((k) => JUMPS[Number(k)].kind === 'ladder' && Number(k) > 10 && !JUMPS[Number(k) - 3] && !JUMPS[Number(k) - 1]));
  const p = s.players[0];
  p.pos = from - 3;
  dice(3);
  ladders.act(ctx, s, p.id, { type: 'roll' });
  expect(last(said).voice).toBe(VB.ladder);
  const q = s.players[1];
  q.pos = from - 3;
  dice(2);
  ladders.act(ctx, s, q.id, { type: 'roll' });
  expect(last(said).voice).toBeUndefined();
});

/* —— العقارات ——————————————————————————————————————————————————————————————————— */

test('voice boards: العقارات — «شراء»', () => {
  const { ctx, said } = fakeCtx();
  const s: any = estate.start(ctx, ['a', 'b'], { startCash: 1500, rounds: 15 });
  const id = s.players[s.turnIdx].id;
  const i = BOARD.findIndex((b) => isOwnable(b));
  s.phase = 'buy';
  s.buy = i;
  estate.act(ctx, s, id, { type: 'buy' });
  expect(last(said)).toMatchObject({ by: id, voice: VB.buy });
});

/* —— كلمة السر، فك الشيفرة، الذاكرة، سودوكو ——————————————————————————————————— */

test('voice boards: كلمة السر — «المحاولة الأخيرة», then who solved it, never the word', () => {
  const { ctx, said } = fakeCtx();
  const s: any = wordle.start(ctx, ['a', 'b'], { rounds: 1, words: 'general', race: false, hint: true });
  const key = s.words[0].key;
  const wrong = [...VALID_GUESSES].filter((w) => w !== key && [...w].length === 5).slice(0, 5);
  for (let k = 0; k < 4; k++) {
    wordle.act(ctx, s, 'a', { type: 'guess', word: wrong[k] });
    expect(said.at(-1)?.voice).toBeUndefined();
  }
  wordle.act(ctx, s, 'a', { type: 'guess', word: wrong[4] });
  expect(last(said)).toMatchObject({ by: 'a', voice: voiceLastTry('سارة') });
  wordle.act(ctx, s, 'b', { type: 'guess', word: key });
  expect(last(said)).toMatchObject({ by: 'b', voice: voiceSolved('يوسف', true) });
  for (const x of said) {
    expect(x.text).not.toContain(key);
    if (x.voice) expect(normWord(x.voice.replace(/[ً-ْ]/g, ''))).not.toContain(key);
  }
});

test('voice boards: فك الشيفرة — who cracked the code; the game\'s end reads the winner', () => {
  const { ctx, said } = fakeCtx();
  const s: any = codebreak.start(ctx, ['a', 'b'], { ...DEFAULT_SETTINGS.codebreak, rounds: 1 });
  codebreak.act(ctx, s, 'a', { type: 'guess', code: s.code.slice() });
  expect(last(said)).toMatchObject({ by: 'a', voice: voiceSolved('سارة', true) });
  codebreak.act(ctx, s, 'b', { type: 'guess', code: s.code.slice() });
  expect(s.phase).toBe('final');
  expect(last(said).voice).toBe(voiceWinner('سارة'));
});

test('voice boards: الذاكرة — a pair is «زوج», two different cards are silent', () => {
  const { ctx, said } = fakeCtx();
  const s: any = memory.start(ctx, ['a', 'b'], { pairs: 4 });
  const p = s.order[0];
  const x = 0;
  const y = s.deck.findIndex((f: string, i: number) => i !== x && f === s.deck[x]);
  const z = s.deck.findIndex((f: string) => f !== s.deck[x]);
  memory.act(ctx, s, p, { type: 'flip', card: x });
  memory.act(ctx, s, p, { type: 'flip', card: y });
  expect(last(said)).toMatchObject({ by: p, voice: VB.pair });
  const w = s.deck.findIndex((f: string, i: number) => i !== z && f !== s.deck[z] && !s.owners[i]);
  memory.act(ctx, s, p, { type: 'flip', card: z });
  memory.act(ctx, s, p, { type: 'flip', card: w });
  expect(last(said).voice).toBeUndefined();
});

test('voice boards: سودوكو — the place of each finisher, then the winner', () => {
  const { ctx, said } = fakeCtx();
  const s: any = sudoku.start(ctx, ['a', 'b'], { level: 'easy' });
  const fill = (id: string) => {
    const empty = s.puzzle.map((v: number, i: number) => (v ? -1 : i)).filter((i: number) => i >= 0);
    for (const i of empty) sudoku.act(ctx, s, id, { type: 'set', cell: i, value: s.solution[i] });
  };
  fill('b');
  expect(last(said)).toMatchObject({ by: 'b', voice: voicePlace(0, 'يوسف') });
  fill('a');
  expect(s.phase).toBe('final');
  expect(last(said).voice).toBe(voiceWinner('يوسف'));
});

/* —— whole bot games: every call is well formed, and each game's end reads its result —— */

/**
 * A bot-only game through a game module, run like the room does: botPlan schedules (once per key),
 * the earliest job is played, the clock moves and tick() runs. Returns every say.
 */
function sim(mod: GameModule<any, any>, ids: string[], settings: unknown, seed: number, maxSteps = 40_000) {
  Math.random = seeded(seed);
  const said: Said[] = [];
  const jobs: { by: string; a: GameAction; at: number }[] = [];
  const keys = new Set<string>();
  const ctx: any = {
    now: 1_000_000,
    fx: () => {},
    isConnected: () => true,
    isBot: () => true,
    playerName: (id: string) => NAMES[id] ?? id,
    memo: new Map(),
    bot: (by: string, key: string, delay: number, a: GameAction) => {
      if (keys.has(`${by}|${key}`)) return;
      keys.add(`${by}|${key}`);
      jobs.push({ by, a, at: ctx.now + delay });
    },
    say: (text: string, by?: string, voice?: string) => said.push({ text, by, ...(voice ? { voice } : {}) }),
    botLevel: () => 'easy',
  };
  const s: any = mod.start(ctx, ids, structuredClone(settings));
  for (let k = 0; k < maxSteps && s.phase !== 'final'; k++) {
    mod.botPlan?.(ctx, s, ids);
    jobs.sort((x, y) => x.at - y.at);
    const job = jobs[0];
    ctx.now = job && job.at <= ctx.now + 500 ? Math.max(ctx.now, job.at) : ctx.now + 500;
    if (job && job.at <= ctx.now) {
      jobs.shift();
      try {
        mod.act(ctx, s, job.by, job.a);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
      }
    }
    mod.tick?.(ctx, s);
  }
  return { s, said };
}

const GAMES: [string, GameModule<any, any>, number][] = [
  ['chess', chess, 2],
  ['dama', dama, 2],
  ['kharbga', kharbga, 2],
  ['connect4', connect4, 2],
  ['xo', xo, 2],
  ['mancala', mancala, 2],
  ['dots', dots, 3],
  ['battleship', battleship, 2],
  ['blocks', blocks, 2],
  ['ludo', ludo, 3],
  ['ladders', ladders, 3],
  ['hajj', hajj, 3],
  ['memory', memory, 3],
  ['wordle', wordle, 2],
  ['codebreak', codebreak, 2],
  ['boggle', boggle, 2],
  ['scrabble', scrabble, 2],
  ['carca', carca, 2],
  ['catan', catan, 3],
  ['estate', estate, 3],
];

for (const [id, mod, n] of GAMES) {
  test(`voice boards: a whole ${id} game — short Arabic calls only, the end reads the result`, () => {
    const ids = Object.keys(NAMES).slice(0, n);
    const settings = { ...(DEFAULT_SETTINGS as any)[id], ...(id === 'estate' ? { rounds: 4 } : {}), ...(id === 'boggle' ? { rounds: 1 } : {}) };
    const { s, said } = sim(mod, ids, settings, 7);
    expect(s.phase).toBe('final');
    const voices = said.filter((x) => x.voice).map((x) => x.voice!);
    for (const v of voices) expectShort(v);
    // a game ended on the board (not by a player leaving) says its result last
    expect(last(said).voice ?? '').toMatch(/الفَوْزُ لِ|تَعَادُلْ/);
    // ordinary moves stay silent: most says carry no voice (catan reads every roll; in the word games
    // every line is a solve or a result)
    if (!['catan', 'wordle', 'codebreak', 'boggle', 'memory'].includes(id)) expect(voices.length).toBeLessThan(Math.max(4, said.length * 0.6));
    // hidden information: the secret words never reach a voice
    if (id === 'wordle') for (const w of s.words) for (const v of voices) expect(normWord(v.replace(/[ً-ْ]/g, ''))).not.toContain(w.key);
  });
}
