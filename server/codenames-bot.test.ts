/** «الكلمات السرية»: the big word list, its links, and the spymaster bot (a bot is only ever a spymaster). */
import { expect, test } from 'bun:test';

import { norm } from '../src/shared/arabic';
import type { CodeColor, PlayerInfo, ServerMsg } from '../src/shared/protocol';
import { SAFETY, chooseClue, linkStrength, linkedAtAll, relatedness, sameFamily } from './codenames-bot';
import { judgeRelated, judgeSize } from './codenames-judge';
import { CODENAMES_ENTRIES } from './codenames-links';
import { CODENAMES_WORDS } from './content-extra';
import { codenames } from './games/codenames';
import { Room, type Sock } from './room';
import { GameError } from './types';

type Team = 'red' | 'blue';
const LEVELS = ['easy', 'smart', 'expert'] as const;

/* ------------------------------------------------------------------ */
/* The word list and its links                                         */
/* ------------------------------------------------------------------ */

test('the word list: about 1,500 single words, no duplicates', () => {
  expect(CODENAMES_WORDS.length).toBeGreaterThanOrEqual(1450);
  expect(CODENAMES_WORDS.length).toBeLessThanOrEqual(1600);
  const seen = new Map<string, string>();
  for (const w of CODENAMES_WORDS) {
    expect(w, w).toMatch(/^[ء-ي]+$/); // one Arabic word: no space, no punctuation
    expect(w.startsWith('ال') && w.length > 3, w).toBe(false);
    const k = norm(w);
    if (seen.has(k)) throw new Error(`«${w}» duplicates «${seen.get(k)}»`);
    seen.set(k, w);
  }
  // the old words that had a space are gone, the old single words stay
  for (const w of ['شمس', 'طاجين', 'كسكاس', 'جلابة', 'رائد', 'عمارية']) expect(CODENAMES_WORDS).toContain(w);
  for (const w of ['رائد فضاء', 'طائرة ورقية', 'قنبلة']) expect(CODENAMES_WORDS).not.toContain(w);
});

/** Clue words the data must never hold (the bot gives links as clues): drink, smoking, war, weapons, blood, fear. */
const OFF_LIMITS = ['خمر', 'نبيذ', 'سيجارة', 'تدخين', 'قنبلة', 'مسدس', 'ذخيرة', 'قتل', 'موت', 'رعب', 'يانصيب', 'قمار', 'مخدر'];

test('every board word has 18+ links in three tiers: single words, never a form of the word itself', () => {
  let total = 0;
  const uses = new Map<string, number>();
  for (const e of CODENAMES_ENTRIES) {
    expect(e.links.length, e.word).toBeGreaterThanOrEqual(18);
    expect(e.links.length, e.word).toBeLessThanOrEqual(34);
    expect(e.tiers.length, e.word).toBe(e.links.length);
    expect(e.tiers.every((t, i) => t >= 0 && t <= 2 && (i === 0 || t >= e.tiers[i - 1])), e.word).toBe(true);
    expect(new Set(e.links.map(norm)).size, e.word).toBe(e.links.length);
    for (const l of e.links) {
      expect(l, `${e.word}: ${l}`).toMatch(/^[ء-ي]+$/);
      expect(l.startsWith('ال') && l.length > 4, `${e.word}: ${l}`).toBe(false);
      expect(sameFamily(l, e.word), `${e.word}: ${l}`).toBe(false);
      expect(OFF_LIMITS.includes(l), `${e.word}: ${l}`).toBe(false);
      uses.set(norm(l), (uses.get(norm(l)) ?? 0) + 1);
    }
    total += e.links.length;
  }
  expect(total).toBeGreaterThan(29_000);
  expect(total / CODENAMES_ENTRIES.length).toBeGreaterThanOrEqual(20);
  // shared on purpose: many clue words tie a handful to a few dozen board words together
  expect([...uses.values()].filter((n) => n >= 5 && n <= 40).length).toBeGreaterThan(1_500);
});

test('forms of a word count as the same word', () => {
  for (const [a, b] of [['الكتاب', 'كتاب'], ['سمك', 'سمكة'], ['بحار', 'بحر'], ['نجوم', 'نجم'], ['سيارات', 'سيارة'], ['أسد', 'اسد'], ['منارة', 'نار'], ['طيور', 'طائر'], ['أشجار', 'شجرة'], ['أوراق', 'ورق'], ['بيوت', 'بيت'], ['ألوان', 'لون'], ['ألعاب', 'لعبة'], ['عيون', 'عين']]) {
    expect(sameFamily(a, b), `${a} / ${b}`).toBe(true);
  }
  for (const [a, b] of [['شمس', 'قمر'], ['بحر', 'سمكة'], ['قلم', 'ورقة'], ['يرقة', 'ورقة'], ['مليون', 'مال'], ['ألبوم', 'لبن']]) expect(sameFamily(a, b), `${a} / ${b}`).toBe(false);
});

/* ------------------------------------------------------------------ */
/* The clue                                                            */
/* ------------------------------------------------------------------ */

let seed = 12345;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
function randomBoard() {
  const words = shuffled(CODENAMES_WORDS).slice(0, 25);
  const key = shuffled<CodeColor>([...Array(9).fill('red'), ...Array(8).fill('blue'), 'assassin', ...Array(7).fill('neutral')]);
  // a game in progress: some words already found (never all of one team's)
  const revealed = key.map((k) => k !== 'assassin' && rand() < 0.25);
  for (const t of ['red', 'blue'] as Team[]) if (key.every((k, i) => k !== t || revealed[i])) revealed[key.indexOf(t)] = false;
  return { words, key, revealed };
}

/** Words a family game never gives as a clue (they may still be links, to warn of a risk). */
const NEVER_A_CLUE = ['أحمر', 'أزرق', 'أسود', 'حرب', 'سلاح', 'دم', 'خوف', 'بندقية', 'رصاص', 'معركة', 'جيش', 'جندي', 'سيف', 'مدفع'];

/** Check one clue against every hard rule, and its guessability. */
function checkClue(board: ReturnType<typeof randomBoard>, team: Team, level: (typeof LEVELS)[number], used: string[], clue: ReturnType<typeof chooseClue>) {
  const ctx = `${level}: «${clue.word}» ${clue.n} → ${clue.targets.join('، ')} | ${board.words.join(' ')}`;
  // one word, not a board word or a form of one, not a clue given before, nothing a family game avoids
  expect(clue.word, ctx).toMatch(/^[ء-ي]+$/);
  expect(NEVER_A_CLUE.includes(clue.word), ctx).toBe(false);
  for (const w of board.words) expect(sameFamily(clue.word, w), `${ctx} ~ ${w}`).toBe(false);
  for (const u of used) expect(sameFamily(clue.word, u), `${ctx} ~ ${u}`).toBe(false);
  // never anything to do with the other team's words or the black word: no link, and hardly related the way a
  // person sees it (two hops, category, form, words said together)
  const opponent: Team = team === 'red' ? 'blue' : 'red';
  const open = (k: CodeColor) => board.words.filter((_, i) => !board.revealed[i] && board.key[i] === k);
  for (const w of [...open(opponent), ...open('assassin')]) expect(linkedAtAll(clue.word, w), `${ctx} ~ ${w}`).toBe(false);
  for (const w of open('assassin')) expect(relatedness(clue.word, w), `${ctx} ~ ${w}`).toBeLessThan(SAFETY.assassin);
  // (a fallback, when the team's last words sit next to their synonyms, may be closer, though still never linked
  // and still pointing at its word first)
  if (!clue.fallback) for (const w of open(opponent)) expect(relatedness(clue.word, w), `${ctx} ~ ${w}`).toBeLessThan(SAFETY.opponent);
  // the number = the team's open words the clue aims at
  expect(clue.n, ctx).toBe(clue.targets.length);
  expect(clue.n, ctx).toBeGreaterThanOrEqual(1);
  expect(clue.n, ctx).toBeLessThanOrEqual(level === 'expert' ? 3 : 2);
  for (const w of clue.targets) {
    const i = board.words.indexOf(w);
    expect(board.key[i], ctx).toBe(team);
    expect(board.revealed[i], ctx).toBe(false);
    expect(linkStrength(clue.word, w), ctx).toBeGreaterThan(0);
  }
  // guessable: the targets are the team words the clue points at most strongly…
  const weakest = Math.min(...clue.targets.map((w) => linkStrength(clue.word, w)));
  for (const w of open(team)) if (!clue.targets.includes(w)) expect(linkStrength(clue.word, w) > weakest, `${ctx} ~ ${w}`).toBe(false);
  // …every target comes before every word that is not the team's, the way a person relates them…
  const weakestR = Math.min(...clue.targets.map((w) => relatedness(clue.word, w)));
  for (const w of [...open(opponent), ...open('assassin'), ...open('neutral')]) expect(relatedness(clue.word, w), `${ctx} ~ ${w}`).toBeLessThan(weakestR);
  // …and a neutral word: never linked nor clearly related for easy and smart; for an expert only weakly related,
  // and much less than its targets unless the team is behind (when no clue meets every rule, late in a game, the
  // bot falls back on the clue that points at its word most clearly ahead of the neutral words)
  const behind = open(team).length > open(opponent).length;
  for (const w of clue.fallback ? [] : open('neutral')) {
    const r = relatedness(clue.word, w);
    if (level !== 'expert') {
      expect(linkedAtAll(clue.word, w), `${ctx} ~ ${w}`).toBe(false);
      expect(r, `${ctx} ~ ${w}`).toBeLessThan(SAFETY.neutral);
    } else {
      expect(r, `${ctx} ~ ${w}`).toBeLessThan(SAFETY.neutralExpert);
      expect(r, `${ctx} ~ ${w}`).toBeLessThanOrEqual(weakestR - (behind ? SAFETY.neutralGapBehind : SAFETY.neutralGap) + 1e-9);
    }
  }
}

/**
 * How long a decision takes, in ms of this process's CPU time: other test files (or other work on the machine)
 * running at the same time don't count.
 */
function timed<T>(fn: () => T): [T, number] {
  const t0 = process.cpuUsage();
  const out = fn();
  const d = process.cpuUsage(t0);
  return [out, (d.user + d.system) / 1000];
}

/** The first clues compile the code (a JIT): warm it up before timing a decision. */
function warmUp() {
  for (let k = 0; k < 5; k++) chooseClue(randomBoard(), 'red', LEVELS[k % 3], [], rand);
}

test('thousands of boards: never an illegal clue, nor one linked or related to an opponent word or the black word; under 100 ms', () => {
  warmUp();
  let slowest = 0;
  for (const level of LEVELS) {
    for (let b = 0; b < 1500; b++) {
      const board = randomBoard();
      const team: Team = rand() < 0.5 ? 'red' : 'blue';
      const used = shuffled(CODENAMES_ENTRIES[Math.floor(rand() * CODENAMES_ENTRIES.length)].links).slice(0, 4);
      const [clue, ms] = timed(() => chooseClue(board, team, level, used, rand));
      slowest = Math.max(slowest, ms);
      checkClue(board, team, level, used, clue);
    }
  }
  expect(slowest).toBeLessThan(100);
}, 400_000);

/**
 * Whole games between two bot spymasters of one level, the people following the clues (the open word the clue
 * relates to most, as many as the number). Returns how many clues aimed at 1, 2, 3 words, and how often the
 * independent judge (codenames-judge.ts, its held-out half) relates a clue to the black word, an opponent's word
 * or a neutral word.
 */
function playGames(level: (typeof LEVELS)[number], games: number) {
  const sizes = [0, 0, 0, 0];
  const judged = { assassin: 0, opponent: 0, neutral: 0, any: 0 };
  let wrong = 0;
  let fallbacks = 0;
  let clues = 0;
  for (let g = 0; g < games; g++) {
    const words = shuffled(CODENAMES_WORDS).slice(0, 25);
    const first: Team = rand() < 0.5 ? 'red' : 'blue';
    const second: Team = first === 'red' ? 'blue' : 'red';
    const key = shuffled<CodeColor>([...Array(9).fill(first), ...Array(8).fill(second), 'assassin', ...Array(7).fill('neutral')]);
    const board = { words, key, revealed: Array(25).fill(false) as boolean[] };
    const used: string[] = [];
    let turn = first;
    for (let t = 0; t < 60; t++) {
      const left = (k: CodeColor) => key.filter((c, i) => c === k && !board.revealed[i]).length;
      if (!left('red') || !left('blue')) break;
      const [clue, ms] = timed(() => chooseClue(board, turn, level, used, rand));
      expect(ms).toBeLessThan(100);
      checkClue(board, turn, level, used, clue);
      used.push(clue.word);
      sizes[clue.n]++;
      clues++;
      if (clue.fallback) fallbacks++;
      const openOf = (k: CodeColor) => words.filter((w, i) => !board.revealed[i] && key[i] === k);
      const hit = (k: CodeColor) => openOf(k).some((w) => judgeRelated(clue.word, w, 'test'));
      const hits = { assassin: hit('assassin'), opponent: hit(turn === 'red' ? 'blue' : 'red'), neutral: hit('neutral') };
      for (const k of ['assassin', 'opponent', 'neutral'] as const) if (hits[k]) judged[k]++;
      if (hits.assassin || hits.opponent || hits.neutral) judged.any++;
      for (let p = 0; p < clue.n; p++) {
        const open = words.map((w, i) => ({ w, i })).filter((x) => !board.revealed[x.i]);
        open.sort((x, y) => relatedness(clue.word, y.w) - relatedness(clue.word, x.w));
        board.revealed[open[0].i] = true;
        // following the clues, nobody ever steps on the black word
        expect(key[open[0].i]).not.toBe('assassin');
        if (key[open[0].i] !== turn) {
          wrong++;
          break;
        }
      }
      turn = turn === 'red' ? 'blue' : 'red';
    }
  }
  expect(wrong / clues).toBeLessThan(0.02);
  expect(fallbacks / clues).toBeLessThan(0.01);
  const share = sizes.map((n) => n / clues);
  const rate = { assassin: judged.assassin / clues, opponent: judged.opponent / clues, neutral: judged.neutral / clues, any: judged.any / clues };
  return { share, clues, rate };
}

const GAMES = { easy: 120, smart: 200, expert: 200 } as const;
const played = new Map<(typeof LEVELS)[number], ReturnType<typeof playGames>>();
const gamesOf = (level: (typeof LEVELS)[number]) => {
  if (!played.has(level)) {
    warmUp();
    played.set(level, playGames(level, GAMES[level]));
  }
  return played.get(level)!;
};

test('over whole games, smart and expert bots aim at two or three words about half the time, easy ones mostly at one', () => {
  const easy = gamesOf('easy').share;
  const smart = gamesOf('smart').share;
  const expert = gamesOf('expert').share;
  // measured with 3,000 games: easy 90 / 10 / 0 %, smart 55 / 45 / 0 %, expert 55 / 40 / 5 %
  // (before the broader safety checks: easy 89 / 11 / 0 %, smart 53 / 47 / 0 %, expert 50 / 44 / 6 %)
  expect(easy[1]).toBeGreaterThan(0.8);
  expect(easy[1]).toBeLessThan(0.96);
  expect(easy[3]).toBe(0);
  expect(smart[1]).toBeGreaterThan(0.45);
  expect(smart[1]).toBeLessThan(0.63);
  expect(smart[3]).toBe(0);
  expect(expert[1]).toBeLessThan(0.62);
  expect(expert[2]).toBeGreaterThan(0.33);
  expect(expert[3]).toBeGreaterThan(0.02);
  expect(expert[3]).toBeLessThan(0.12);
}, 400_000);

test('a human-like judge (hand-written, apart from the bot data) rarely relates a clue to the black word, an opponent or a neutral word', () => {
  // measured over 3,000 games per level, the judge's held-out half: a clue related to any of them
  // before: easy 0.34 %, smart 0.29 %, expert 0.67 %; now: easy 0.16 %, smart 0.12 %, expert 0.16 %
  for (const level of LEVELS) {
    const { rate, clues } = gamesOf(level);
    const ctx = `${level}: ${(100 * rate.any).toFixed(2)} % of ${clues} clues`;
    expect(rate.assassin, ctx).toBeLessThan(0.002);
    expect(rate.any, ctx).toBeLessThan(0.006);
  }
}, 400_000);

test('the judge: hundreds of obvious relations, written apart from the link lists', () => {
  expect(judgeSize('all')).toBeGreaterThan(3000);
  expect(judgeSize('test')).toBeGreaterThan(1000);
  for (const [clue, word] of [['كتاب', 'رواية'], ['سرعة', 'قطار'], ['أطفال', 'دمية'], ['مطبخ', 'ملعقة'], ['أسد', 'نمر']]) expect(judgeRelated(clue, word), `${clue} / ${word}`).toBe(true);
  for (const [clue, word] of [['كتاب', 'نمر'], ['قصيدة', 'صياد'], ['كنز', 'كنزة'], ['خضار', 'شجرة']]) expect(judgeRelated(clue, word), `${clue} / ${word}`).toBe(false);
});

test('relatedness sees what the link lists miss, and leaves unrelated words alone', () => {
  // the same rough root, words said together, a category, words much like each other
  for (const [clue, word] of [['مطبخ', 'طباخ'], ['شوكة', 'ملعقة'], ['حيوان', 'زرافة'], ['قلم', 'ممحاة'], ['كتاب', 'مجلة'], ['صيف', 'ربيع']]) {
    expect(relatedness(clue, word), `${clue} / ${word}`).toBeGreaterThanOrEqual(SAFETY.assassin);
  }
  for (const [clue, word] of [['بحر', 'مفتاح'], ['كتاب', 'صاروخ'], ['شمس', 'ملعقة']]) expect(relatedness(clue, word), `${clue} / ${word}`).toBeLessThan(0.1);
  // random pairs the lists don't link: hardly ever related
  let related = 0;
  let total = 0;
  const clues = [...new Set(CODENAMES_ENTRIES.flatMap((e) => e.links))];
  for (let k = 0; k < 5000; k++) {
    const clue = clues[Math.floor(rand() * clues.length)];
    const word = CODENAMES_WORDS[Math.floor(rand() * CODENAMES_WORDS.length)];
    if (linkedAtAll(clue, word) || sameFamily(clue, word)) continue;
    total++;
    if (relatedness(clue, word) >= SAFETY.opponent) related++;
  }
  expect(related / total).toBeLessThan(0.01);
});

test('a clue never comes back: each turn of a game gets a new one', () => {
  const board = randomBoard();
  const used: string[] = [];
  for (let k = 0; k < 12; k++) {
    const clue = chooseClue(board, 'red', 'expert', used);
    expect(used.some((u) => sameFamily(clue.word, u))).toBe(false);
    used.push(clue.word);
  }
});

/* ------------------------------------------------------------------ */
/* Seats: bots only ever lead a team                                   */
/* ------------------------------------------------------------------ */

const fakeCtx = (bots: string[] = [], level: 'easy' | 'smart' | 'expert' = 'expert') => {
  const jobs: { id: string; key: string; delay: number; action: any }[] = [];
  const keys = new Set<string>();
  return {
    now: 1_000_000,
    jobs,
    fx: () => {},
    say: () => {},
    isConnected: () => true,
    isBot: (id: string) => bots.includes(id),
    playerName: (id: string) => id,
    memo: new Map(),
    botLevel: () => level,
    bot: (id: string, key: string, delay: number, action: any) => {
      if (keys.has(key)) return;
      keys.add(key);
      jobs.push({ id, key, delay, action });
    },
  } as any;
};
const P = ['h1', 'h2', 'b1', 'b2'];
const settings = { assassin: true, clueSeconds: 0, guessSeconds: 0 };
const teamWith = (s: any, id: string): Team => (s.teams.red.includes(id) ? 'red' : 'blue');

test('two bots lead the two teams; the people guess', () => {
  for (let k = 0; k < 20; k++) {
    const s: any = codenames.start(fakeCtx(['b1', 'b2']), P, settings);
    expect(teamWith(s, 'b1')).not.toBe(teamWith(s, 'b2'));
    expect(s.spymasters[teamWith(s, 'b1')]).toBe('b1');
    expect(s.spymasters[teamWith(s, 'b2')]).toBe('b2');
    expect(s.teams.red.length).toBe(2);
    expect(s.teams.blue.length).toBe(2);
  }
});

test('one bot with three people: the bot team gets one person, the other team two', () => {
  for (let k = 0; k < 20; k++) {
    const ctx = fakeCtx(['b1']);
    const s: any = codenames.start(ctx, ['h1', 'h2', 'h3', 'b1'], settings);
    const bt = teamWith(s, 'b1');
    const ot: Team = bt === 'red' ? 'blue' : 'red';
    expect(s.spymasters[bt]).toBe('b1');
    expect(s.teams[bt].length).toBe(2);
    expect(s.teams[ot].length).toBe(2);
    codenames.act(ctx, s, 'h1', { type: 'begin' });
    expect(s.phase).toBe('clue');
  }
});

test('more than two bots: the game does not start', () => {
  expect(() => codenames.start(fakeCtx(['b1', 'b2', 'b3']), ['h1', 'h2', 'b1', 'b2', 'b3'], settings)).toThrow(GameError);
});

test('swap, spymaster and shuffle keep every bot a spymaster', () => {
  const ctx = fakeCtx(['b1', 'b2']);
  const s: any = codenames.start(ctx, ['h1', 'h2', 'h3', 'b1', 'b2'], settings);
  // a bot can't join the other bot's team, nor be replaced as spymaster
  expect(() => codenames.act(ctx, s, 'h1', { type: 'swap', id: 'b1' })).toThrow(GameError);
  const human = s.teams[teamWith(s, 'b1')].find((id: string) => id !== 'b1');
  expect(() => codenames.act(ctx, s, 'h1', { type: 'spymaster', id: human })).toThrow(GameError);
  codenames.act(ctx, s, 'h1', { type: 'spymaster', id: 'b1' }); // already the spymaster: nothing changes
  // a person moving to a bot team becomes a guesser there
  codenames.act(ctx, s, 'h1', { type: 'swap', id: human });
  expect(s.spymasters[teamWith(s, human)]).not.toBe(human);
  for (let k = 0; k < 10; k++) {
    codenames.act(ctx, s, 'h1', { type: 'shuffle' });
    expect(s.spymasters[teamWith(s, 'b1')]).toBe('b1');
    expect(s.spymasters[teamWith(s, 'b2')]).toBe('b2');
    expect(teamWith(s, 'b1')).not.toBe(teamWith(s, 'b2'));
  }
});

test('one bot moves to the team without a bot and leads it', () => {
  const ctx = fakeCtx(['b1']);
  const s: any = codenames.start(ctx, ['h1', 'h2', 'h3', 'h4', 'b1'], settings);
  const from = teamWith(s, 'b1');
  codenames.act(ctx, s, 'h1', { type: 'swap', id: 'b1' });
  const to = teamWith(s, 'b1');
  expect(to).not.toBe(from);
  expect(s.spymasters[to]).toBe('b1');
  expect(s.spymasters[from]).not.toBeNull();
  expect(s.spymasters[from]).not.toBe('b1');
});

test('begin refuses a team led by a bot without a person to guess', () => {
  const ctx = fakeCtx(['b1', 'b2']);
  const s: any = codenames.start(ctx, P, settings);
  const lonely = teamWith(s, 'b1');
  const human = s.teams[lonely].find((id: string) => id !== 'b1');
  codenames.act(ctx, s, 'h1', { type: 'swap', id: human });
  expect(s.teams[lonely]).toEqual(['b1']);
  expect(() => codenames.act(ctx, s, 'h1', { type: 'begin' })).toThrow('قائده بوت');
  codenames.act(ctx, s, 'h1', { type: 'swap', id: human });
  codenames.act(ctx, s, 'h1', { type: 'begin' });
  expect(s.phase).toBe('clue');
});

test('«جولة جديدة»: a bot stays its team spymaster, the role moves on in a team of people', () => {
  const ctx = fakeCtx(['b1']);
  const s: any = codenames.start(ctx, ['h1', 'h2', 'h3', 'h4', 'b1'], settings);
  const bt = teamWith(s, 'b1');
  const ot: Team = bt === 'red' ? 'blue' : 'red';
  codenames.act(ctx, s, 'h1', { type: 'begin' });
  const before = s.spymasters[ot];
  s.phase = 'final';
  codenames.act(ctx, s, 'h1', { type: 'again' });
  expect(s.phase).toBe('teams');
  expect(s.spymasters[bt]).toBe('b1');
  expect(s.spymasters[ot]).not.toBe(before);
  expect(s.teams[ot]).toContain(s.spymasters[ot]);
});

test('the last person guessing for a bot leaves: back to the teams', () => {
  const ctx = fakeCtx(['b1', 'b2']);
  const s: any = codenames.start(ctx, P, settings);
  codenames.act(ctx, s, 'h1', { type: 'begin' });
  const human = s.teams[teamWith(s, 'b1')].find((id: string) => id !== 'b1');
  codenames.onLeave!(ctx, s, human);
  expect(s.phase).toBe('teams');
  expect(s.notice).toContain('قائد ولاعب يخمّن');
  expect(s.spymasters[teamWith(s, 'b1')]).toBe('b1');
});

test('a bot leaving hands its team to a person', () => {
  const ctx = fakeCtx(['b1']);
  const s: any = codenames.start(ctx, ['h1', 'h2', 'h3', 'h4', 'b1'], settings);
  const bt = teamWith(s, 'b1');
  codenames.onLeave!(ctx, s, 'b1');
  expect(s.spymasters[bt]).toBe(s.teams[bt][0]);
  expect(s.bots).toEqual([]);
});

/* ------------------------------------------------------------------ */
/* The bot's turn                                                      */
/* ------------------------------------------------------------------ */

test('the bot thinks a few seconds, well within the clue time, then gives a legal clue', () => {
  const ctx = fakeCtx(['b1', 'b2']);
  const s: any = codenames.start(ctx, P, { ...settings, clueSeconds: 60 });
  codenames.act(ctx, s, 'h1', { type: 'begin' });
  codenames.botPlan!(ctx, s, ['b1', 'b2']);
  codenames.botPlan!(ctx, s, ['b1', 'b2']); // planned once per turn
  expect(ctx.jobs.length).toBe(1);
  const job = ctx.jobs[0];
  expect(job.id).toBe(s.spymasters[s.turn]);
  expect(job.delay).toBeGreaterThanOrEqual(2500);
  expect(job.delay).toBeLessThanOrEqual(12_000);
  codenames.act(ctx, s, job.id, job.action);
  expect(s.phase).toBe('guess');
  expect(s.clue.word).toBe(job.action.word);
  // a bot never guesses
  codenames.botPlan!(ctx, s, ['b1', 'b2']);
  expect(ctx.jobs.length).toBe(1);
});

test('a full game with two bot spymasters: the people follow the clues and the game ends', () => {
  for (const level of LEVELS) {
    for (let game = 0; game < 15; game++) {
      const ctx = fakeCtx(['b1', 'b2'], level);
      const s: any = codenames.start(ctx, P, settings);
      codenames.act(ctx, s, 'h1', { type: 'begin' });
      const clues: string[] = [];
      for (let step = 0; step < 300 && s.phase !== 'final'; step++) {
        if (s.phase === 'clue') {
          codenames.botPlan!(ctx, s, ['b1', 'b2']);
          const job = ctx.jobs.at(-1);
          expect(job.id).toBe(s.spymasters[s.turn]);
          codenames.act(ctx, s, job.id, job.action);
          for (const w of s.words) expect(sameFamily(s.clue.word, w)).toBe(false);
          expect(clues.some((c) => sameFamily(s.clue.word, c))).toBe(false);
          clues.push(s.clue.word);
          continue;
        }
        // the team's person reveals the open word closest to the clue (or passes after one, sometimes)
        const guesser = s.teams[s.turn].find((id: string) => !id.startsWith('b'));
        const open = s.words.map((w: string, i: number) => ({ w, i })).filter((x: any) => !s.revealed[x.i]);
        open.sort((a: any, b: any) => relatedness(s.clue.word, b.w) - relatedness(s.clue.word, a.w));
        const done = s.log.at(-1).picks.length;
        if (done >= s.clue.n || (done > 0 && relatedness(s.clue.word, open[0].w) < 0.3)) codenames.act(ctx, s, guesser, { type: 'pass' });
        else codenames.act(ctx, s, guesser, { type: 'reveal', index: open[0].i });
      }
      expect(s.phase).toBe('final');
      // following the bot's clues, nobody ever stepped on the black word
      expect(s.reason).toBe('words');
    }
  }
});

/* ------------------------------------------------------------------ */
/* In a room                                                           */
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

test('in a room: two bots at most, each one leads a team', () => {
  const r = new Room('7311', person('h'), 'codenames');
  r.join(person('h'), new FakeSock() as unknown as Sock);
  r.join(person('g'), new FakeSock() as unknown as Sock);
  r.roomAction('h', { type: 'addBot' });
  r.roomAction('h', { type: 'addBot' });
  expect(() => r.roomAction('h', { type: 'addBot' })).toThrow(GameError);
  r.roomAction('h', { type: 'start' });
  const s: any = r.state;
  const bots = r.players.filter((p) => p.bot).map((p) => p.id);
  expect(bots.length).toBe(2);
  for (const b of bots) expect(Object.values(s.spymasters)).toContain(b);
  expect(s.teams.red.length).toBe(2);
  expect(s.teams.blue.length).toBe(2);
});
