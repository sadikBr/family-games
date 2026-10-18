/** «الرسم المتسلسل» — rotation, timeouts, reveal, votes, leaving, a full game, and no hidden pages leaking. */
import { expect, test } from 'bun:test';

import { TELEDRAW_DEFAULTS, type TeledrawSettings, type TeledrawView } from '../src/shared/games/teledraw';
import { simplifyPoints } from '../src/shared/teledraw-geom';
import { OPTIONS, PASS_MS, REVEAL_INTRO_MS, WRITE_MS, holderOf, teledraw, type TeledrawState } from './games/teledraw';
import { TELEDRAW_PHRASES } from './teledraw-content';
import { GameError, type GameCtx } from './types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

type Ctx = GameCtx & { now: number; fxs: [string, string | undefined][]; says: string[]; offline: Set<string> };

function fakeCtx(): Ctx {
  const offline = new Set<string>();
  const ctx: Ctx = {
    now: 1_000_000,
    fx: (k, t) => ctx.fxs.push([k, t]),
    say: (text) => ctx.says.push(text),
    isConnected: (id) => !offline.has(id),
    isBot: () => false,
    playerName: (id) => `اسم-${id}`,
    memo: new Map(),
    bot: () => {},
    fxs: [],
    says: [],
    offline,
  };
  return ctx;
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function setup(n: number, settings: Partial<TeledrawSettings> = {}) {
  const ctx = fakeCtx();
  const s = teledraw.start(ctx, ids(n), { ...TELEDRAW_DEFAULTS, ...settings });
  return { ctx, s };
}

const view = (ctx: GameCtx, s: TeledrawState, me: string) => teledraw.view(ctx, s, me) as TeledrawView;
const act = (ctx: GameCtx, s: TeledrawState, by: string, type: string, payload: Record<string, unknown> = {}) => teledraw.act(ctx, s, by, { type, ...payload });

/** Let the clock run to the end of the current timer and tick once. */
function timeout(ctx: Ctx, s: TeledrawState) {
  ctx.now = Math.max(ctx.now, s.endsAt) + 1;
  teledraw.tick!(ctx, s);
}

let colorN = 0;
/** A colour nobody else uses: marks a drawing so we can find it in a view. */
const uniqueColor = () => `#${(++colorN).toString(16).padStart(6, '0')}`;

/** Everyone still working makes their page; returns the marker of each page (text or colour). */
function playStep(ctx: Ctx, s: TeledrawState, skip: string[] = []) {
  const marks: Record<string, string> = {};
  for (const id of teledraw.turnOf!(s)) {
    if (skip.includes(id)) continue;
    const t = view(ctx, s, id).task!;
    if (t.kind === 'write') {
      marks[id] = `جملة ${id}`;
      act(ctx, s, id, 'pick', { text: marks[id] });
    } else if (t.kind === 'draw') {
      marks[id] = uniqueColor();
      act(ctx, s, id, 'stroke', { c: marks[id], w: 10, p: [100, 100, 500, 500, 900, 120] });
      act(ctx, s, id, 'done');
    } else {
      marks[id] = `تخمين ${s.step} ${id}`;
      act(ctx, s, id, 'guess', { text: marks[id] });
    }
  }
  return marks;
}

/** Wait out the «books move on» pause. */
function pass(ctx: Ctx, s: TeledrawState) {
  expect(s.phase as string).toBe('pass');
  timeout(ctx, s);
}

/** Play every step with everyone answering, up to the reveal. */
function playAll(ctx: Ctx, s: TeledrawState) {
  while (s.phase !== 'reveal') {
    playStep(ctx, s);
    pass(ctx, s);
  }
}

/** Turn every page of every book (as the host). */
function revealAll(ctx: Ctx, s: TeledrawState) {
  let guard = 0;
  while (s.phase === 'reveal' && guard++ < 500) act(ctx, s, s.live[0], 'next', { at: `${s.rb}:${s.rp}` });
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

test('teledraw: 250+ distinct starting phrases, short enough', () => {
  expect(TELEDRAW_PHRASES.length).toBeGreaterThanOrEqual(250);
  expect(new Set(TELEDRAW_PHRASES).size).toBe(TELEDRAW_PHRASES.length);
  for (const p of TELEDRAW_PHRASES) {
    expect(p.length).toBeLessThanOrEqual(40);
    expect(p).toMatch(/^[؀-ۿ ]+$/);
  }
});

test('teledraw: every player is offered different phrases', () => {
  const { s } = setup(12);
  const all = Object.values(s.options).flat();
  expect(all.length).toBe(12 * OPTIONS);
  expect(new Set(all).size).toBe(all.length);
});

test('teledraw: lines are simplified (straight runs collapse, the ends stay)', () => {
  const line = Array.from({ length: 50 }, (_, i) => [i * 10, i * 10]).flat();
  expect(simplifyPoints(line)).toEqual([0, 0, 490, 490]);
  expect(simplifyPoints([5, 5])).toEqual([5, 5]);
  const { ctx, s } = setup(3);
  playStep(ctx, s);
  pass(ctx, s);
  const drawer = teledraw.turnOf!(s)[0];
  act(ctx, s, drawer, 'stroke', { c: '#123456', w: 10, p: line });
  expect(s.drafts[drawer][0].p).toEqual([0, 0, 490, 490]);
  // bad input is cleaned: coordinates clamped, bad colour replaced, odd length trimmed
  act(ctx, s, drawer, 'stroke', { c: 'red', w: 999, p: [-50, 2000, 10] });
  expect(s.drafts[drawer][1]).toEqual({ c: '#1B1830', w: 60, p: [0, 1000] });
});

/* ------------------------------------------------------------------ */
/* Rotation                                                            */
/* ------------------------------------------------------------------ */

test('teledraw: rotation — each player holds each book exactly once, never their own after the first page, and sees only the previous page', () => {
  for (let n = 3; n <= 12; n++) {
    const { ctx, s } = setup(n);
    expect(s.steps).toBe(n);
    const held: Record<string, string[]> = Object.fromEntries(s.seats.map((id) => [id, []]));
    for (let step = 0; step < n; step++) {
      expect(s.step).toBe(step);
      expect(s.phase as string).toBe(step === 0 ? 'write' : step % 2 ? 'draw' : 'guess');
      expect(teledraw.turnOf!(s).sort()).toEqual(s.seats.slice().sort());
      for (const id of s.seats) {
        const t = view(ctx, s, id).task!;
        expect(t.kind).toBe(s.phase as 'write');
        held[id].push(t.owner);
        if (step === 0) expect(t.owner).toBe(id);
        else expect(t.owner).not.toBe(id);
        const book = s.books.find((b) => b.owner === t.owner)!;
        expect(book.pages.length).toBe(step);
        // exactly the page before mine, and nothing else of the book
        if (step === 0) expect(t.prompt).toBeNull();
        else expect(t.prompt).toEqual(book.pages[step - 1]);
      }
      playStep(ctx, s);
      pass(ctx, s);
    }
    expect(s.phase as string).toBe('reveal');
    for (const id of s.seats) expect(held[id].slice().sort()).toEqual(s.seats.slice().sort());
    // every book: phrase, drawing, guess, drawing… one page per player, each by a different author
    for (const b of s.books) {
      expect(b.pages.length).toBe(n);
      expect(new Set(b.pages.map((p) => p.by)).size).toBe(n);
      expect(b.pages[0].by).toBe(b.owner);
      b.pages.forEach((p, i) => expect(p.kind).toBe(i === 0 ? 'phrase' : i % 2 ? 'draw' : 'guess'));
    }
  }
});

test('teledraw: «6 pages at most» caps the books in a big group', () => {
  const { ctx, s } = setup(10, { capSteps: true });
  expect(s.steps).toBe(6);
  playAll(ctx, s);
  for (const b of s.books) expect(b.pages.length).toBe(6);
});

test('teledraw: holder formula — book b at step k is with seat (b + k) mod N', () => {
  const { s } = setup(5);
  for (let k = 0; k < 5; k++) {
    const holders = s.books.map((_, b) => holderOf(s, b, k));
    expect(new Set(holders).size).toBe(5);
  }
});

/* ------------------------------------------------------------------ */
/* Steps, timeouts                                                     */
/* ------------------------------------------------------------------ */

test('teledraw: a phrase must be offered unless writing your own is on', () => {
  const { ctx, s } = setup(3, { custom: false });
  const id = s.seats[0];
  expect(() => act(ctx, s, id, 'pick', { text: 'شيء من عندي' })).toThrow(GameError);
  act(ctx, s, id, 'pick', { text: s.options[id][1] });
  expect(s.pending[id].text).toBe(s.options[id][1]);
  // taking it back, then choosing again
  act(ctx, s, id, 'edit');
  expect(s.pending[id]).toBeUndefined();
  act(ctx, s, id, 'pick', { text: s.options[id][2] });
  expect(s.pending[id].text).toBe(s.options[id][2]);
  const { ctx: c2, s: s2 } = setup(3, { custom: true });
  expect(() => act(c2, s2, s2.seats[0], 'pick', { text: 'ا' })).toThrow(GameError);
  act(c2, s2, s2.seats[0], 'pick', { text: '  قطة   تطبخ  الحريرة ' });
  expect(s2.pending[s2.seats[0]].text).toBe('قطة تطبخ الحريرة');
});

test('teledraw: the step ends as soon as everyone has sent their page', () => {
  const { ctx, s } = setup(4);
  const [a, b, c, d] = s.seats;
  playStep(ctx, s, [d]);
  expect(s.phase as string).toBe('write');
  expect(teledraw.turnOf!(s)).toEqual([d]);
  expect(view(ctx, s, a).done.sort()).toEqual([a, b, c].sort());
  act(ctx, s, d, 'pick', { text: s.options[d][0] });
  expect(s.phase as string).toBe('pass');
  expect(teledraw.turnOf!(s)).toEqual([]);
  expect(ctx.now).toBeLessThan(1_000_000 + WRITE_MS);
});

test('teledraw: timeouts — a phrase is picked, an unfinished drawing is kept, empty pages pass as nothing', () => {
  const { ctx, s } = setup(3);
  timeout(ctx, s); // nobody picked
  for (const b of s.books) {
    expect(b.pages[0].auto).toBe(true);
    expect(b.pages[0].text).toBe(s.options[b.owner][0]);
  }
  expect(ctx.says.at(-1)).toContain('فارغة');
  pass(ctx, s);
  expect(s.phase as string).toBe('draw');
  const [x, y, z] = teledraw.turnOf!(s);
  act(ctx, s, x, 'stroke', { c: '#E2475F', w: 14, p: [10, 10, 20, 30] }); // drew, never pressed «done»
  expect(() => act(ctx, s, y, 'done')).toThrow(GameError); // nothing drawn yet
  act(ctx, s, z, 'stroke', { c: '#2FB67C', w: 14, p: [10, 10, 20, 30] });
  act(ctx, s, z, 'clear'); // drew then wiped it
  timeout(ctx, s);
  const pageOf = (id: string) => s.books.flatMap((b) => b.pages).find((p) => p.by === id && p.kind === 'draw')!;
  expect(pageOf(x).strokes!.length).toBe(1);
  expect(pageOf(y).empty).toBe(true);
  expect(pageOf(z).empty).toBe(true);
  pass(ctx, s);
  // the next holder of an empty drawing gets it as «nothing» and still guesses
  const holderOfEmpty = s.seats.find((id) => view(ctx, s, id).task?.prompt?.by === y)!;
  expect(view(ctx, s, holderOfEmpty).task!.prompt!.empty).toBe(true);
  act(ctx, s, holderOfEmpty, 'guess', { text: 'لا أعرف' });
  expect(() => act(ctx, s, s.seats.find((id) => id !== holderOfEmpty)!, 'guess', { text: '   ' })).toThrow(GameError);
  timeout(ctx, s);
  expect(s.books.every((b) => b.pages.length === 3)).toBe(true);
  expect(s.books.flatMap((b) => b.pages).filter((p) => p.kind === 'guess' && p.empty).length).toBe(2);
  pass(ctx, s);
  expect(s.phase as string).toBe('reveal');
});

test('teledraw: an offline player does not hold the step up once everyone else is done', () => {
  const { ctx, s } = setup(4);
  const off = s.seats[3];
  ctx.offline.add(off);
  playStep(ctx, s, [off]);
  expect(s.phase as string).toBe('pass');
  expect(s.books[3].pages[0].auto).toBe(true);
});

test('teledraw: undo removes the last line; a sent drawing can be taken back to keep drawing', () => {
  const { ctx, s } = setup(3);
  playStep(ctx, s);
  pass(ctx, s);
  const id = s.seats[0];
  act(ctx, s, id, 'stroke', { c: '#E2475F', w: 14, p: [1, 1, 50, 50] });
  act(ctx, s, id, 'stroke', { c: '#E2475F', w: 14, p: [9, 9, 80, 80] });
  act(ctx, s, id, 'undo');
  expect(s.drafts[id].length).toBe(1);
  act(ctx, s, id, 'done');
  act(ctx, s, id, 'stroke', { c: '#E2475F', w: 14, p: [9, 9, 80, 80] }); // ignored: already sent
  expect(s.drafts[id].length).toBe(1);
  act(ctx, s, id, 'edit');
  act(ctx, s, id, 'stroke', { c: '#E2475F', w: 14, p: [9, 9, 80, 80] });
  expect(view(ctx, s, id).task!.draft.length).toBe(2);
});

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

test('teledraw: reveal — books in order, page by page, the same page on every phone', () => {
  const { ctx, s } = setup(4);
  playAll(ctx, s);
  expect(ctx.fxs.some(([k]) => k === 'reveal')).toBe(true);
  const seen: string[] = [];
  let guard = 0;
  while (s.phase === 'reveal' && guard++ < 100) {
    const views = s.seats.map((id) => view(ctx, s, id));
    const r = views[0].reveal!;
    for (const v of views) expect(v.reveal!.pages).toEqual(r.pages);
    expect(r.pages).toEqual(s.books[r.book].pages.slice(0, r.pages.length));
    expect(r.length).toBe(4);
    seen.push(`${r.book}:${r.pages.length - 1}`);
    // only the book's owner may turn (besides the host's «next»)
    for (const v of views) expect(v.reveal!.canTurn).toBe(s.seats[views.indexOf(v)] === r.owner);
    const other = s.seats.find((id) => id !== r.owner)!;
    act(ctx, s, other, 'turn', { at: `${s.rb}:${s.rp}` });
    expect(`${s.rb}:${s.rp}`).toBe(seen.at(-1)!);
    act(ctx, s, r.owner, 'turn', { at: `${s.rb}:${s.rp}` });
  }
  const expected = [0, 1, 2, 3].flatMap((b) => [0, 1, 2, 3].map((p) => `${b}:${p}`));
  expect(seen).toEqual(expected);
  expect(s.phase as string).toBe('vote');
  expect(ctx.says.some((t) => t.includes('الكشف: دفتر'))).toBe(true);
});

test('teledraw: two taps at the same moment turn only one page', () => {
  const { ctx, s } = setup(3);
  playAll(ctx, s);
  const at = `${s.rb}:${s.rp}`;
  act(ctx, s, s.seats[0], 'next', { at });
  act(ctx, s, s.books[0].owner, 'turn', { at });
  expect(s.rp).toBe(1);
});

test('teledraw: auto-advance turns the pages on its own, and no timer without it', () => {
  const { ctx, s } = setup(3, { autoReveal: true, votes: false });
  playAll(ctx, s);
  expect(view(ctx, s, s.seats[0]).endsAt).not.toBeNull();
  let guard = 0;
  while (s.phase === 'reveal' && guard++ < 50) timeout(ctx, s);
  expect(s.phase as string).toBe('final');
  const m = setup(3);
  playAll(m.ctx, m.s);
  expect(view(m.ctx, m.s, m.s.seats[0]).endsAt).toBeNull();
  m.ctx.now += 10 * 60_000;
  teledraw.tick!(m.ctx, m.s);
  expect(m.s.rp).toBe(0);
});

/* ------------------------------------------------------------------ */
/* Votes                                                               */
/* ------------------------------------------------------------------ */

test('teledraw: votes — one per category, not for yourself, the winners on the final screen', () => {
  const { ctx, s } = setup(3);
  playAll(ctx, s);
  revealAll(ctx, s);
  expect(s.phase as string).toBe('vote');
  const [a, b, c] = s.seats;
  const find = (by: string, kind: string) => {
    for (let bi = 0; bi < s.books.length; bi++) {
      const pi = s.books[bi].pages.findIndex((p) => p.by === by && p.kind === kind);
      if (pi >= 0) return { book: bi, page: pi };
    }
    throw new Error('no page');
  };
  const aDraw = find(a, 'draw');
  const bGuess = find(b, 'guess');
  expect(() => act(ctx, s, a, 'vote', { cat: 'draw', ...aDraw })).toThrow(GameError);
  act(ctx, s, b, 'vote', { cat: 'guess', ...aDraw }); // wrong category: ignored
  expect(s.votes[b]).toBeUndefined();
  act(ctx, s, b, 'vote', { cat: 'draw', ...find(c, 'draw') });
  act(ctx, s, b, 'vote', { cat: 'draw', ...aDraw }); // changed my mind
  act(ctx, s, c, 'vote', { cat: 'draw', ...aDraw });
  act(ctx, s, a, 'vote', { cat: 'guess', ...bGuess });
  act(ctx, s, c, 'vote', { cat: 'guess', ...bGuess });
  expect(view(ctx, s, b).vote!.myDraw).toEqual(aDraw);
  expect(teledraw.turnOf!(s).sort()).toEqual([a, b, c].sort());
  act(ctx, s, a, 'confirm');
  act(ctx, s, b, 'confirm');
  expect(teledraw.turnOf!(s)).toEqual([c]);
  act(ctx, s, c, 'confirm');
  expect(s.phase as string).toBe('final');
  const f = view(ctx, s, a).final!;
  expect(f.votes).toBe(true);
  expect(f.scores[a]).toBe(2);
  expect(f.scores[b]).toBe(2);
  expect(f.bestDraw.map((w) => w.page.by)).toEqual([a]);
  expect(f.bestDraw[0].votes).toBe(2);
  expect(f.bestGuess.map((w) => w.page.by)).toEqual([b]);
  // the funniest guess comes with the drawing it described
  expect(f.bestGuess[0].before).toEqual(s.books[bGuess.book].pages[bGuess.page - 1]);
  expect(ctx.fxs.at(-1)).toEqual(['win', undefined]); // a tie: no single winner
  expect(ctx.says.at(-1)).toBe(`أفضل رسمة لاسم-${a}، وأطرف تخمين لاسم-${b}`);
});

test('teledraw: the vote ends on its timer or when the host closes it; a single top author wins', () => {
  const { ctx, s } = setup(4);
  playAll(ctx, s);
  revealAll(ctx, s);
  const [a, b, c, d] = s.seats;
  const page = s.books.flatMap((bk, bi) => bk.pages.map((p, pi) => ({ p, bi, pi }))).find((x) => x.p.by === a && x.p.kind === 'draw')!;
  for (const id of [b, c, d]) act(ctx, s, id, 'vote', { cat: 'draw', book: page.bi, page: page.pi });
  timeout(ctx, s);
  expect(s.phase as string).toBe('final');
  expect(ctx.fxs.at(-1)).toEqual(['win', a]);
  const m = setup(3);
  playAll(m.ctx, m.s);
  revealAll(m.ctx, m.s);
  act(m.ctx, m.s, m.s.seats[0], 'endVote');
  expect(m.s.phase as string).toBe('final');
  expect(m.s.result!.bestDraw).toEqual([]);
});

test('teledraw: votes off — straight from the reveal to the end', () => {
  const { ctx, s } = setup(3, { votes: false });
  playAll(ctx, s);
  revealAll(ctx, s);
  expect(s.phase as string).toBe('final');
  expect(view(ctx, s, s.seats[0]).final!.votes).toBe(false);
});

test('teledraw: each phone browses the books on its own during the votes and at the end', () => {
  const { ctx, s } = setup(3, { votes: false });
  playAll(ctx, s);
  revealAll(ctx, s);
  act(ctx, s, s.seats[1], 'browse', { book: 2 });
  expect(view(ctx, s, s.seats[1]).browse!.index).toBe(2);
  expect(view(ctx, s, s.seats[1]).browse!.pages).toEqual(s.books[2].pages);
  expect(view(ctx, s, s.seats[0]).browse!.index).toBe(0);
  act(ctx, s, s.seats[1], 'browse', { book: 99 });
  expect(view(ctx, s, s.seats[1]).browse!.index).toBe(2);
});

/* ------------------------------------------------------------------ */
/* Leaving                                                             */
/* ------------------------------------------------------------------ */

test('teledraw: a leaver — their page becomes «left», their book goes on, the rotation skips them', () => {
  const { ctx, s } = setup(5);
  playStep(ctx, s);
  pass(ctx, s);
  const gone = s.seats[2];
  playStep(ctx, s, [gone]);
  expect(s.phase as string).toBe('draw');
  teledraw.onLeave!(ctx, s, gone);
  expect(s.phase as string).toBe('pass'); // everyone else was done
  const leftPage = s.books.flatMap((b) => b.pages).find((p) => p.by === gone && p.kind === 'draw')!;
  expect(leftPage.left).toBe(true);
  pass(ctx, s);
  // 4 players, 5 books: the book the leaver would hold waits, and so does the book whose only drawing
  // is the «left» page (nothing to guess yet); nobody gets the leaver's turn
  expect(teledraw.turnOf!(s).length).toBe(3);
  expect(teledraw.turnOf!(s)).not.toContain(gone);
  const resting = s.live.find((id) => !teledraw.turnOf!(s).includes(id))!;
  expect(view(ctx, s, resting).task).toBeNull();
  // the holder of the book after the «left» page guesses the latest real drawing, or this book waits
  for (const id of teledraw.turnOf!(s)) {
    const t = view(ctx, s, id).task!;
    expect(t.prompt!.kind).toBe('draw');
    expect(t.prompt!.left).toBeUndefined();
  }
  while (s.phase !== 'reveal') {
    playStep(ctx, s);
    pass(ctx, s);
  }
  // the leaver's own book is still revealed; nobody held a book twice
  expect(s.books.length).toBe(5);
  for (const b of s.books) {
    const authors = b.pages.filter((p) => !p.left).map((p) => p.by);
    expect(new Set(authors).size).toBe(authors.length);
  }
  revealAll(ctx, s);
  expect(s.phase as string).toBe('vote');
  for (const id of s.live) act(ctx, s, id, 'confirm');
  expect(s.phase as string).toBe('final');
});

test('teledraw: a leaver before choosing a phrase still gets a book that goes round', () => {
  const { ctx, s } = setup(4);
  const gone = s.seats[1];
  teledraw.onLeave!(ctx, s, gone);
  expect(s.pending[gone].auto).toBe(true);
  playStep(ctx, s);
  expect(s.books[1].pages[0].text).toBe(s.options[gone][0]);
  expect(ctx.says.some((t) => t.startsWith('مغادرة'))).toBe(true);
});

test('teledraw: fewer than 3 players left — the books made so far go to the reveal, then the end', () => {
  const { ctx, s } = setup(4);
  playStep(ctx, s);
  pass(ctx, s);
  playStep(ctx, s);
  pass(ctx, s);
  teledraw.onLeave!(ctx, s, s.seats[0]);
  expect(s.phase as string).toBe('guess');
  teledraw.onLeave!(ctx, s, s.seats[1]);
  expect(s.phase as string).toBe('reveal');
  expect(s.books.every((b) => b.pages.length === 3)).toBe(true);
  revealAll(ctx, s);
  for (const id of s.live) act(ctx, s, id, 'confirm');
  expect(s.phase as string).toBe('final');
  // leaving before anything was drawn: straight to the end
  const m = setup(3);
  teledraw.onLeave!(m.ctx, m.s, m.s.seats[0]);
  expect(m.s.phase as string).toBe('final');
});

test('teledraw: leaving during the votes closes them once everyone left has confirmed', () => {
  const { ctx, s } = setup(4);
  playAll(ctx, s);
  revealAll(ctx, s);
  const [a, b, c, d] = s.seats;
  act(ctx, s, a, 'confirm');
  act(ctx, s, b, 'confirm');
  act(ctx, s, c, 'confirm');
  teledraw.onLeave!(ctx, s, d);
  expect(s.phase as string).toBe('final');
});

/* ------------------------------------------------------------------ */
/* A whole game, hidden information                                    */
/* ------------------------------------------------------------------ */

test('teledraw: a full game with fake players, some slow, some leaving, reaches the final screen', () => {
  for (const n of [3, 6, 9, 12]) {
    const { ctx, s } = setup(n);
    let guard = 0;
    while (s.phase !== 'final' && guard++ < 2000) {
      if (s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess') {
        const slow = teledraw.turnOf!(s).filter((_, i) => i % 3 === 2);
        playStep(ctx, s, slow);
        if ((s.phase as string) !== 'pass') timeout(ctx, s);
        if (n === 9 && s.step === 3 && s.live.length === 9) teledraw.onLeave!(ctx, s, s.live[4]);
      } else if (s.phase === 'pass') timeout(ctx, s);
      else if (s.phase === 'reveal') act(ctx, s, s.seats[0], 'next', { at: `${s.rb}:${s.rp}` });
      else if (s.phase === 'vote') {
        for (const id of s.live) {
          const ref = s.books.flatMap((b, bi) => b.pages.map((p, pi) => ({ p, bi, pi }))).find((x) => x.p.kind === 'draw' && !x.p.empty && !x.p.left && x.p.by !== id);
          if (ref) act(ctx, s, id, 'vote', { cat: 'draw', book: ref.bi, page: ref.pi });
          act(ctx, s, id, 'confirm');
        }
      }
    }
    expect(s.phase as string).toBe('final');
    expect(ctx.fxs.some(([k]) => k === 'win')).toBe(true);
  }
});

test('teledraw: no hidden pages leak — before the reveal a phone sees only the page before its own', () => {
  const { ctx, s } = setup(5);
  const marksOf = new Map<string, string>(); // page marker → author
  const pageMark = (p: { text?: string; strokes?: { c: string }[] }) => p.text ?? p.strokes?.[0]?.c ?? '';
  while (s.phase !== 'reveal') {
    // my options are mine alone
    if (s.phase === 'write') {
      for (const me of s.seats) {
        const json = JSON.stringify(view(ctx, s, me));
        for (const other of s.seats) if (other !== me) for (const o of s.options[other]) expect(json).not.toContain(o);
      }
    }
    // half the players send, then every view is checked
    const half = teledraw.turnOf!(s).filter((_, i) => i % 2);
    const marks = playStep(ctx, s, half);
    for (const [id, m] of Object.entries(marks)) marksOf.set(m, id);
    for (const me of s.seats) {
      const v = view(ctx, s, me);
      const json = JSON.stringify(v);
      const allowed = new Set<string>();
      if (v.task?.prompt) allowed.add(pageMark(v.task.prompt));
      if (marks[me]) allowed.add(marks[me]);
      for (const [m] of marksOf) if (!allowed.has(m)) expect(json).not.toContain(m);
      if (v.task?.prompt) {
        const held = s.books.find((b) => b.owner === v.task!.owner)!;
        expect(v.task.prompt).toEqual(held.pages.at(-1)!);
      }
    }
    // a drawing in progress stays on its author's phone
    if (s.phase === 'draw') {
      const drawer = teledraw.turnOf!(s)[0];
      const c = uniqueColor();
      act(ctx, s, drawer, 'stroke', { c, w: 10, p: [1, 2, 3, 4] });
      for (const me of s.seats) expect(JSON.stringify(view(ctx, s, me)).includes(c)).toBe(me === drawer);
    }
    playStep(ctx, s);
    if ((s.phase as string) !== 'pass') timeout(ctx, s);
    // nothing about the books while they move on
    for (const me of s.seats) for (const [m] of marksOf) expect(JSON.stringify(view(ctx, s, me))).not.toContain(m);
    pass(ctx, s);
  }
  // the reveal shows only the current book, up to the current page
  const v = view(ctx, s, s.seats[0]);
  const json = JSON.stringify(v);
  const shown = new Set(s.books[0].pages.slice(0, 1).map(pageMark));
  for (const [m] of marksOf) if (!shown.has(m)) expect(json).not.toContain(m);
});

test('teledraw: turn bar — players still working, nobody during pauses and the reveal', () => {
  const { ctx, s } = setup(3);
  expect(teledraw.turnOf!(s).length).toBe(3);
  playStep(ctx, s);
  expect(teledraw.turnOf!(s)).toEqual([]);
  ctx.now += PASS_MS + 1;
  teledraw.tick!(ctx, s);
  playAll(ctx, s);
  expect(teledraw.turnOf!(s)).toEqual([]);
  expect(REVEAL_INTRO_MS).toBeGreaterThanOrEqual(3000);
  expect(ctx.says.some((t) => t.includes('وقت الرسم'))).toBe(true);
});

test('teledraw: settings are validated and clamped', () => {
  const st = { ...TELEDRAW_DEFAULTS };
  teledraw.patchSettings!(st, { drawSeconds: 5000, guessSeconds: 1, custom: 'yes', votes: false, autoReveal: true, capSteps: true });
  expect(st).toEqual({ drawSeconds: 180, guessSeconds: 15, custom: true, capSteps: true, votes: false, autoReveal: true });
});
