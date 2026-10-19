/**
 * «الرسم المتسلسل» — server rules.
 *
 * Seats are shuffled once; book b belongs to seats[b]. At step k the book b is in the hands of
 * seats[(b + k) % N], so with no one leaving every player holds every book exactly once and never their
 * own after the first page. Step 0: everyone picks (or writes) the phrase of their own book; odd steps:
 * draw the previous page; even steps: guess the previous drawing. Everyone works at once; a step ends
 * when every connected holder has sent their page, or when time runs out (an empty page is passed on
 * as «(لا شيء)»). Pages are only added to the books at the end of a step, and a phone only ever sees the
 * page just before its own, until the reveal: the books are then shown page by page to everyone (the
 * host or the book's owner turns the pages; optional auto-advance), then optional votes.
 *
 * A player who leaves: their pending page becomes «(غادر)» (a phrase not yet chosen is picked for them,
 * so their book can continue), and later the rotation skips them — the book that would have reached
 * them waits one step, and the next holder responds to the latest page of the right kind. Fewer than 3
 * players left mid-game: the books made so far go straight to the reveal.
 */
import {
  TELEDRAW_CAP,
  TELEDRAW_DEFAULTS,
  TELEDRAW_TEXT_MAX,
  type TeledrawPage,
  type TeledrawPhase,
  type TeledrawRef,
  type TeledrawSettings,
  type TeledrawStroke,
  type TeledrawView,
  type TeledrawWinner,
} from '../../src/shared/games/teledraw';
import { drawingSize, simplifyPoints } from '../../src/shared/teledraw-geom';
import { dealPhrases } from '../teledraw-content';
import { GameError, paced, type GameCtx, type GameModule } from '../types';
import { clamp, isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceAnd, voiceBestDraw, voiceBestGuess, voiceBook } from '../voice-calls-party';

/** time to pick the starting phrase */
export const WRITE_MS = 45000;
/** «the books move on» between two steps */
export const PASS_MS = 3000;
/** before the reveal starts */
export const REVEAL_INTRO_MS = 3500;
/** auto-advance in the reveal: a text page, a drawing, and the extra time on a book's last page */
export const AUTO_TEXT_MS = 5000;
export const AUTO_DRAW_MS = 7000;
export const AUTO_END_MS = 4000;
export const VOTE_MS = 120000;
/** phrases offered to each player */
export const OPTIONS = 3;

const MAX_STROKES = 300;
const MAX_COORDS = 16000;
const MAX_STROKE_COORDS = 800;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

type Kind = 'write' | 'draw' | 'guess';

interface Book {
  owner: string;
  pages: TeledrawPage[];
}

export interface TeledrawState {
  settings: TeledrawSettings;
  /** seat order, fixed for the game (players who left stay here) */
  seats: string[];
  /** players still in the game */
  live: string[];
  names: Record<string, string>;
  books: Book[];
  steps: number;
  step: number;
  phase: TeledrawPhase;
  endsAt: number;
  total: number;
  next: TeledrawView['next'];
  options: Record<string, string[]>;
  /** this step: who holds which book */
  tasks: Record<string, { book: number; kind: Kind }>;
  /** this step: pages sent */
  pending: Record<string, TeledrawPage>;
  /** this step: drawings in progress */
  drafts: Record<string, TeledrawStroke[]>;
  /** reveal: book and page shown */
  rb: number;
  rp: number;
  browse: Record<string, number>;
  votes: Record<string, { draw?: TeledrawRef; guess?: TeledrawRef }>;
  confirmed: string[];
  result: TeledrawView['final'];
}

export const kindOf = (step: number): Kind => (step === 0 ? 'write' : step % 2 ? 'draw' : 'guess');

/** The page the holder of a book responds to: the latest phrase/guess (to draw) or drawing (to guess). */
export function promptFor(book: Book, kind: Kind): TeledrawPage | null {
  if (kind === 'write') return null;
  for (let i = book.pages.length - 1; i >= 0; i--) {
    const p = book.pages[i];
    if (p.left) continue;
    if (kind === 'draw' ? p.kind !== 'draw' : p.kind === 'draw') return p;
  }
  return null;
}

/** Who holds book b at step k (with nobody gone). */
export const holderOf = (s: TeledrawState, book: number, step: number) => s.seats[(book + step) % s.seats.length];

const stepMs = (s: TeledrawState, kind: Kind) => (kind === 'write' ? WRITE_MS : (kind === 'draw' ? s.settings.drawSeconds : s.settings.guessSeconds) * 1000);

const KIND_NAME: Record<Kind, string> = { write: 'اختيار الجمل', draw: 'وقت الرسم', guess: 'وقت التخمين' };
const KIND_VOICE: Record<Kind, string> = { write: PVOICE.write, draw: PVOICE.draw, guess: PVOICE.guess };

/** A written page (the phrase or a guess) read aloud at the reveal; a drawing or an empty page is silent. */
const pageVoice = (p: TeledrawPage | undefined) => (p && p.kind !== 'draw' && !p.empty && !p.left && p.text ? p.text : undefined);
/** The reveal's line for book `b` («الكشف: دفتر بابا (2 من 5)»; the first book shown is always «1»). */
function bookLine(s: TeledrawState, b: number) {
  const first = s.books.findIndex((x) => x.pages.length);
  return `الكشف: دفتر ${s.names[s.books[b].owner]} (${b === first ? 1 : b + 1} من ${s.books.length})`;
}

function startStep(ctx: GameCtx, s: TeledrawState) {
  for (let guard = 0; guard < s.steps; guard++) {
    const kind = kindOf(s.step);
    s.tasks = {};
    s.pending = {};
    s.drafts = {};
    s.books.forEach((book, b) => {
      const holder = holderOf(s, b, s.step);
      if (!s.live.includes(holder)) return; // the rotation skips a player who left: this book waits
      if (kind !== 'write' && !promptFor(book, kind)) return;
      s.tasks[holder] = { book: b, kind };
    });
    if (Object.keys(s.tasks).length) {
      s.phase = kind;
      s.next = null;
      s.total = stepMs(s, kind);
      s.endsAt = ctx.now + s.total;
      ctx.fx('start');
      ctx.say?.(kind === 'write' ? 'بداية اللعبة: اختيار جملة لكل دفتر' : `الصفحة ${s.step + 1} من ${s.steps}: ${KIND_NAME[kind]}`, undefined, KIND_VOICE[kind]);
      return;
    }
    // nobody can play this step (only possible after people left): skip it
    s.step += 1;
    if (s.step >= s.steps) break;
  }
  startReveal(ctx, s);
}

/** Every connected holder has sent their page (offline ones don't hold the table up). */
function allDone(ctx: GameCtx, s: TeledrawState) {
  const holders = Object.keys(s.tasks).filter((id) => s.live.includes(id));
  const waiting = holders.filter((id) => !s.pending[id]);
  if (!waiting.length) return true;
  return holders.some((id) => ctx.isConnected(id)) && waiting.every((id) => !ctx.isConnected(id));
}

/** Add this step's pages to the books (missing ones become «(لا شيء)»). Returns how many were missing. */
function flushStep(s: TeledrawState): number {
  let missing = 0;
  for (const [id, t] of Object.entries(s.tasks)) {
    let page = s.pending[id];
    if (!page) {
      missing += 1;
      if (t.kind === 'write') page = { kind: 'phrase', by: id, text: s.options[id][0], auto: true };
      else if (t.kind === 'draw' && s.drafts[id]?.length) page = { kind: 'draw', by: id, strokes: s.drafts[id] };
      else page = { kind: t.kind, by: id, empty: true };
    }
    s.books[t.book].pages.push(page);
  }
  s.tasks = {};
  s.pending = {};
  s.drafts = {};
  return missing;
}

function endStep(ctx: GameCtx, s: TeledrawState) {
  const missing = flushStep(s);
  s.step += 1;
  s.phase = 'pass';
  ctx.fx('card');
  if (s.step >= s.steps) {
    s.next = 'reveal';
    s.total = paced(ctx, REVEAL_INTRO_MS);
    ctx.say?.('اكتملت الدفاتر: حان وقت الكشف!', undefined, voiceAnd(missing > 0 && PVOICE.timeUp, PVOICE.reveal));
  } else {
    s.next = kindOf(s.step) === 'draw' ? 'draw' : 'guess';
    s.total = paced(ctx, PASS_MS);
    ctx.say?.(missing ? 'انتهى الوقت: الصفحات الناقصة تمرّ فارغة' : 'اكتملت الصفحات: الدفاتر تنتقل', undefined, missing ? PVOICE.timeUp : undefined);
  }
  s.endsAt = ctx.now + s.total;
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function revealTimer(ctx: GameCtx, s: TeledrawState) {
  if (!s.settings.autoReveal) {
    s.endsAt = 0;
    return;
  }
  const book = s.books[s.rb];
  const page = book.pages[s.rp];
  s.total = paced(ctx, (page.kind === 'draw' && !page.empty && !page.left ? AUTO_DRAW_MS : AUTO_TEXT_MS) + (s.rp === book.pages.length - 1 ? AUTO_END_MS : 0));
  s.endsAt = ctx.now + s.total;
}

function startReveal(ctx: GameCtx, s: TeledrawState) {
  s.phase = 'reveal';
  s.next = null;
  s.tasks = {};
  s.rb = 0;
  s.rp = 0;
  while (s.rb < s.books.length && !s.books[s.rb].pages.length) s.rb += 1;
  if (s.rb >= s.books.length) {
    finish(ctx, s, false);
    return;
  }
  ctx.fx('reveal');
  // the book's owner, then its first page (the phrase) read aloud
  ctx.say?.(`الكشف: دفتر ${s.names[s.books[s.rb].owner]} (1 من ${s.books.length})`, s.books[s.rb].owner, voiceAnd(voiceBook(s.names[s.books[s.rb].owner] ?? ''), pageVoice(s.books[s.rb].pages[0])));
  revealTimer(ctx, s);
}

function turnPage(ctx: GameCtx, s: TeledrawState) {
  const book = s.books[s.rb];
  if (s.rp < book.pages.length - 1) {
    s.rp += 1;
    ctx.fx('card');
    // a written page is read aloud (the line under the turn bar stays the same)
    const v = pageVoice(book.pages[s.rp]);
    if (v) ctx.say?.(bookLine(s, s.rb), book.owner, v);
    revealTimer(ctx, s);
    return;
  }
  let nb = s.rb + 1;
  while (nb < s.books.length && !s.books[nb].pages.length) nb += 1;
  if (nb >= s.books.length) {
    endReveal(ctx, s);
    return;
  }
  s.rb = nb;
  s.rp = 0;
  ctx.fx('reveal');
  ctx.say?.(`الكشف: دفتر ${s.names[s.books[nb].owner]} (${nb + 1} من ${s.books.length})`, s.books[nb].owner, voiceAnd(voiceBook(s.names[s.books[nb].owner] ?? ''), pageVoice(s.books[nb].pages[0])));
  revealTimer(ctx, s);
}

/** Pages someone could vote for (not empty, not a leaver's placeholder). */
const votable = (p: TeledrawPage | undefined, cat: 'draw' | 'guess') => !!p && p.kind === cat && !p.empty && !p.left;

function endReveal(ctx: GameCtx, s: TeledrawState) {
  const anyCandidates = s.books.some((b) => b.pages.some((p) => votable(p, 'draw') || votable(p, 'guess')));
  if (s.settings.votes && s.live.length >= 2 && anyCandidates) {
    s.phase = 'vote';
    s.total = VOTE_MS;
    s.endsAt = ctx.now + VOTE_MS;
    s.confirmed = [];
    s.votes = {};
    ctx.fx('start');
    ctx.say?.('وقت التصويت: أفضل رسمة وأطرف تخمين', undefined, PVOICE.vote);
    return;
  }
  finish(ctx, s, false);
}

/* ------------------------------------------------------------------ */
/* Votes and the end                                                   */
/* ------------------------------------------------------------------ */

const refKey = (r: TeledrawRef) => `${r.book}:${r.page}`;

function winners(s: TeledrawState, cat: 'draw' | 'guess'): TeledrawWinner[] {
  const count = new Map<string, number>();
  for (const v of Object.values(s.votes)) {
    const r = v[cat];
    if (r) count.set(refKey(r), (count.get(refKey(r)) ?? 0) + 1);
  }
  const best = Math.max(0, ...count.values());
  if (!best) return [];
  const out: TeledrawWinner[] = [];
  s.books.forEach((book, b) =>
    book.pages.forEach((page, i) => {
      if (count.get(`${b}:${i}`) !== best || out.length >= 3) return;
      const before = cat === 'guess' ? (book.pages.slice(0, i).reverse().find((p) => p.kind === 'draw' && !p.left) ?? null) : null;
      out.push({ ref: { book: b, page: i }, page, before, votes: best });
    }),
  );
  return out;
}

function finish(ctx: GameCtx, s: TeledrawState, voted: boolean) {
  s.phase = 'final';
  s.endsAt = 0;
  s.tasks = {};
  const scores: Record<string, number> = {};
  if (voted) {
    for (const v of Object.values(s.votes)) {
      for (const r of [v.draw, v.guess]) {
        const p = r && s.books[r.book]?.pages[r.page];
        if (p) scores[p.by] = (scores[p.by] ?? 0) + 1;
      }
    }
  }
  const bestDraw = voted ? winners(s, 'draw') : [];
  const bestGuess = voted ? winners(s, 'guess') : [];
  s.result = { votes: voted, scores, bestDraw, bestGuess };
  const top = Math.max(0, ...Object.values(scores));
  const leaders = Object.keys(scores).filter((id) => scores[id] === top);
  if (top > 0 && leaders.length === 1 && s.live.includes(leaders[0])) ctx.fx('win', leaders[0]);
  else ctx.fx('win');
  if (voted && (bestDraw.length || bestGuess.length)) {
    const parts: string[] = [];
    if (bestDraw.length === 1) parts.push(`أفضل رسمة ${li(s.names[bestDraw[0].page.by] ?? '؟')}`);
    if (bestGuess.length === 1) parts.push(`أطرف تخمين ${li(s.names[bestGuess[0].page.by] ?? '؟')}`);
    const voice = voiceAnd(
      bestDraw.length === 1 && voiceBestDraw(s.names[bestDraw[0].page.by] ?? ''),
      bestGuess.length === 1 && voiceBestGuess(s.names[bestGuess[0].page.by] ?? ''),
    );
    ctx.say?.(parts.length ? parts.join('، و') : 'انتهى التصويت: تعادل في الأصوات', undefined, voice ?? PVOICE.voteTie);
  } else ctx.say?.('انتهت الدفاتر: شكراً على الضحك!');
}

/** «لـ» + a name (see src/shared/li.ts). */
const li = (name: string) => (/^[ء-ي]/.test(name) ? `ل${name.startsWith('ال') ? name.slice(1) : name}` : `لـ${name}`);

/** Players left mid-game: below 3, what was made so far goes to the reveal. */
function tooFew(ctx: GameCtx, s: TeledrawState) {
  if (['write', 'draw', 'guess'].includes(s.phase)) {
    flushStep(s);
    s.step += 1;
  }
  if (s.live.length === 0) {
    finish(ctx, s, false);
    return;
  }
  s.steps = Math.max(1, s.step); // no more steps
  if (s.books.some((b) => b.pages.length >= 2)) startReveal(ctx, s);
  else finish(ctx, s, false);
}

const cleanText = (v: unknown) => (isStr(v) ? v.replace(/\s+/g, ' ').trim().slice(0, TELEDRAW_TEXT_MAX) : '');

/** For result(): the highest `score` first; equal scores share a place. */
function placesByScore(ids: string[], score: (id: string) => number): string[][] {
  const out: string[][] = [];
  let prev: number | null = null;
  for (const id of [...ids].sort((a, b) => score(b) - score(a))) {
    const v = score(id);
    if (v === prev) out[out.length - 1].push(id);
    else out.push([id]);
    prev = v;
  }
  return out;
}

export const teledraw: GameModule<TeledrawState, TeledrawSettings> = {
  id: 'teledraw',
  hostOnly: ['next', 'endVote'],

  start(ctx, participants, settings) {
    const seats = shuffle(participants);
    const n = seats.length;
    const set = { ...TELEDRAW_DEFAULTS, ...settings };
    const s: TeledrawState = {
      settings: set,
      seats,
      live: seats.slice(),
      names: Object.fromEntries(seats.map((id) => [id, ctx.playerName(id)])),
      books: seats.map((owner) => ({ owner, pages: [] })),
      steps: set.capSteps ? Math.min(n, TELEDRAW_CAP) : n,
      step: 0,
      phase: 'write',
      endsAt: 0,
      total: 0,
      next: null,
      options: dealPhrases(ctx.memo, seats, OPTIONS, shuffle),
      tasks: {},
      pending: {},
      drafts: {},
      rb: 0,
      rp: 0,
      browse: {},
      votes: {},
      confirmed: [],
      result: null,
    };
    startStep(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (!s.live.includes(by)) return;
    const t = s.tasks[by];
    const working = (s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess') && !!t;

    switch (a.type) {
      case 'pick': {
        if (!working || t.kind !== 'write' || s.pending[by]) return;
        const text = cleanText(a.text);
        const offered = s.options[by].includes(text);
        if (!offered) {
          if (!s.settings.custom) throw new GameError('اختر جملة من الجمل المقترحة');
          if (text.length < 2) throw new GameError('اكتب جملة أطول قليلاً');
        }
        s.pending[by] = { kind: 'phrase', by, text };
        break;
      }
      case 'stroke': {
        if (!working || t.kind !== 'draw' || s.pending[by] || !Array.isArray(a.p)) return;
        const raw = (a.p as unknown[]).filter(isNum).map((v) => clamp(Math.round(v), 0, 1000));
        if (raw.length % 2) raw.pop();
        if (!raw.length) return;
        const p = simplifyPoints(raw).slice(0, MAX_STROKE_COORDS);
        const draft = (s.drafts[by] ??= []);
        if (draft.length >= MAX_STROKES || drawingSize(draft) + p.length > MAX_COORDS) throw new GameError('الرسمة ممتلئة: لا مكان لخطوط أخرى');
        draft.push({ c: isStr(a.c) && COLOR_RE.test(a.c) ? a.c : '#1B1830', w: isNum(a.w) ? clamp(Math.round(a.w), 2, 60) : 14, p });
        return; // private to the author: nothing for the other phones
      }
      case 'undo': {
        if (working && t.kind === 'draw' && !s.pending[by]) s.drafts[by]?.pop();
        return;
      }
      case 'clear': {
        if (working && t.kind === 'draw' && !s.pending[by]) s.drafts[by] = [];
        return;
      }
      case 'done': {
        if (!working || t.kind !== 'draw' || s.pending[by]) return;
        const strokes = s.drafts[by] ?? [];
        if (!strokes.length) throw new GameError('ارسم شيئاً أولاً');
        s.pending[by] = { kind: 'draw', by, strokes };
        break;
      }
      case 'guess': {
        if (!working || t.kind !== 'guess' || s.pending[by]) return;
        const text = cleanText(a.text);
        if (!text) throw new GameError('اكتب تخمينك أولاً');
        s.pending[by] = { kind: 'guess', by, text };
        break;
      }
      case 'edit': {
        // take back what I sent while the step is still running
        if (working) delete s.pending[by];
        return;
      }
      case 'next':
      case 'turn': {
        if (s.phase !== 'reveal') return;
        if (a.type === 'turn' && by !== s.books[s.rb].owner) return;
        // two people tapping at once must not skip a page
        if (a.at !== `${s.rb}:${s.rp}`) return;
        turnPage(ctx, s);
        return;
      }
      case 'browse': {
        if ((s.phase !== 'vote' && s.phase !== 'final') || !isNum(a.book)) return;
        s.browse[by] = clamp(Math.round(a.book), 0, s.books.length - 1);
        return;
      }
      case 'vote': {
        if (s.phase !== 'vote' || s.confirmed.includes(by)) return;
        const cat = a.cat === 'draw' || a.cat === 'guess' ? a.cat : null;
        if (!cat || !isNum(a.book) || !isNum(a.page)) return;
        const page = s.books[a.book]?.pages[a.page];
        if (!votable(page, cat)) return;
        if (page!.by === by) throw new GameError('لا يمكن التصويت لصفحتك');
        (s.votes[by] ??= {})[cat] = { book: a.book, page: a.page };
        return;
      }
      case 'confirm': {
        if (s.phase !== 'vote' || s.confirmed.includes(by)) return;
        s.confirmed.push(by);
        if (s.live.every((id) => s.confirmed.includes(id))) finish(ctx, s, true);
        return;
      }
      case 'endVote': {
        if (s.phase === 'vote') finish(ctx, s, true);
        return;
      }
      default:
        return;
    }
    if ((s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess') && allDone(ctx, s)) endStep(ctx, s);
  },

  tick(ctx, s) {
    if (s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess') {
      if (ctx.now >= s.endsAt || allDone(ctx, s)) {
        endStep(ctx, s);
        return true;
      }
      return false;
    }
    if (s.phase === 'pass' && ctx.now >= s.endsAt) {
      if (s.next === 'reveal' || s.step >= s.steps) startReveal(ctx, s);
      else startStep(ctx, s);
      return true;
    }
    if (s.phase === 'reveal' && s.settings.autoReveal && s.endsAt && ctx.now >= s.endsAt) {
      turnPage(ctx, s);
      return true;
    }
    if (s.phase === 'vote' && ctx.now >= s.endsAt) {
      finish(ctx, s, true);
      return true;
    }
    return false;
  },

  view(_ctx, s, me): TeledrawView {
    const t = s.tasks[me];
    const stepping = s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess';
    const mine = s.pending[me];
    const book = s.books[s.rb];
    const browsing = s.phase === 'vote' || s.phase === 'final';
    const bi = clamp(s.browse[me] ?? 0, 0, s.books.length - 1);
    const working = stepping ? Object.keys(s.tasks).filter((id) => s.live.includes(id)) : [];
    return {
      game: 'teledraw',
      phase: s.phase,
      players: s.live,
      owners: s.books.map((b) => b.owner),
      names: s.names,
      step: Math.min(s.step, s.steps - 1),
      steps: s.steps,
      endsAt: stepping || s.phase === 'pass' || s.phase === 'vote' || (s.phase === 'reveal' && s.settings.autoReveal) ? s.endsAt || null : null,
      total: s.total,
      task:
        stepping && t
          ? {
              kind: t.kind,
              owner: s.books[t.book].owner,
              options: t.kind === 'write' ? s.options[me] : [],
              prompt: promptFor(s.books[t.book], t.kind),
              done: !!mine,
              draft: t.kind === 'draw' ? (s.drafts[me] ?? []) : [],
              sent: mine?.text ?? null,
            }
          : null,
      working,
      done: working.filter((id) => !!s.pending[id]),
      next: s.phase === 'pass' ? s.next : null,
      reveal:
        s.phase === 'reveal' && book
          ? {
              book: s.rb,
              books: s.books.length,
              owner: book.owner,
              pages: book.pages.slice(0, s.rp + 1),
              length: book.pages.length,
              canTurn: me === book.owner,
              auto: s.settings.autoReveal,
            }
          : null,
      vote: s.phase === 'vote' ? { myDraw: s.votes[me]?.draw ?? null, myGuess: s.votes[me]?.guess ?? null, confirmed: s.confirmed } : null,
      browse: browsing && s.books.length ? { index: bi, owner: s.books[bi].owner, pages: s.books[bi].pages } : null,
      final: s.phase === 'final' ? s.result : null,
    };
  },

  turnOf(s) {
    if (s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess') return Object.keys(s.tasks).filter((id) => s.live.includes(id) && !s.pending[id]);
    if (s.phase === 'vote') return s.live.filter((id) => !s.confirmed.includes(id));
    return [];
  },

  onLeave(ctx, s, id) {
    if (!s.live.includes(id)) return;
    s.live = s.live.filter((x) => x !== id);
    delete s.browse[id];
    ctx.say?.(`مغادرة ${s.names[id] ?? '؟'}: الدفاتر تكمل الدوران`);
    const stepping = s.phase === 'write' || s.phase === 'draw' || s.phase === 'guess';
    const t = s.tasks[id];
    if (stepping && t) {
      // the leaver's page: a phrase is picked for them (their book goes on), any other page is «(غادر)»
      if (t.kind === 'write') s.pending[id] ??= { kind: 'phrase', by: id, text: s.options[id][0], auto: true };
      else s.pending[id] = { kind: t.kind, by: id, left: true };
    }
    if (s.phase === 'final') return;
    if (s.live.length < 3 && (stepping || s.phase === 'pass')) {
      tooFew(ctx, s);
      return;
    }
    if (s.live.length === 0) {
      finish(ctx, s, false);
      return;
    }
    if (stepping && allDone(ctx, s)) endStep(ctx, s);
    if (s.phase === 'vote') {
      delete s.votes[id];
      s.confirmed = s.confirmed.filter((x) => x !== id);
      if (s.live.every((x) => s.confirmed.includes(x))) finish(ctx, s, true);
    }
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (isNum(patch.drawSeconds)) settings.drawSeconds = clamp(Math.round(patch.drawSeconds), 30, 180);
    if (isNum(patch.guessSeconds)) settings.guessSeconds = clamp(Math.round(patch.guessSeconds), 15, 90);
    for (const k of ['custom', 'capSteps', 'votes', 'autoReveal'] as const) if (typeof patch[k] === 'boolean') settings[k] = patch[k];
  },

  result(s) {
    if (s.phase !== 'final' || !s.live.length) return null;
    // with the votes: ranked by votes received; without them nobody is ahead, so everyone shares first place
    const scores = s.result?.votes ? s.result.scores : null;
    return { places: scores ? placesByScore(s.live, (id) => scores[id] ?? 0) : [[...s.live]] };
  },
};
