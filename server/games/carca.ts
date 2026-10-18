/**
 * «المدن والطرق» — a tile-laying game for 2–5 players (bots allowed), the base game rules.
 * 72 tiles (src/shared/carca-tiles.ts); the start tile is placed, the other 71 are shuffled. A turn:
 * draw a tile (everyone sees it; a tile that fits nowhere is discarded and another drawn), place it so
 * every edge matches and it touches the board, then optionally put one of your 7 followers on one of
 * its features whose connected feature holds no follower yet. Then completed roads (1/tile), cities
 * (2/tile + 2/pennant) and monasteries (9) touching that tile score for the majority (ties all score)
 * and their followers come back. After the last tile: unfinished roads 1/tile, cities 1/tile + 1/pennant,
 * monasteries 1 + 1/neighbour, and (setting) each field with farmers gives its majority 3 per completed
 * city it touches.
 * A player who leaves is taken out of the turn order; their followers stay on the board: they still
 * block features and count for majorities, but nobody scores the points that would have gone to them.
 */
import type { CarcaBreakdown, CarcaEvent, CarcaFollower, CarcaScoreKind, CarcaSettings, CarcaTilePlaced, CarcaView } from '../../src/shared/games/carca';
import {
  FOLLOWERS,
  START_TILE,
  TILES,
  canPlace,
  completedPoints,
  fieldPoints,
  fits,
  groupOf,
  key,
  majority,
  makeBoard,
  makePile,
  memberKey,
  unfinishedPoints,
  type Board,
  type Group,
} from '../../src/shared/carca-tiles';
import { planMove, type BotMove } from '../carca-bot';
import { randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';

const LOG = 12;
/** the follower step gets at least this long when the turn timer is on */
const FOLLOWER_MS = 15_000;

export interface CarcaState {
  settings: CarcaSettings;
  order: string[];
  colors: Record<string, number>;
  phase: CarcaView['phase'];
  board: CarcaTilePlaced[];
  followers: CarcaFollower[];
  pile: string[];
  tile: string | null;
  step: CarcaView['step'];
  turn: string;
  turnNo: number;
  preview: CarcaView['preview'];
  last: CarcaView['last'];
  options: number[];
  endsAt: number | null;
  supply: Record<string, number>;
  scores: Record<string, number>;
  breakdown: Record<string, CarcaBreakdown>;
  log: CarcaEvent[];
  logN: number;
  /** tiles that fitted nowhere */
  discarded: number;
  left: string[];
  final: CarcaView['final'];
  /** the bot move worked out for a turn */
  botMove: ({ turnNo: number } & BotMove) | null;
}

const BREAK: Record<Group['kind'], CarcaScoreKind> = { road: 'road', city: 'city', monastery: 'monastery', field: 'farm' };
const DONE: Record<CarcaScoreKind, string> = { road: 'اكتمل طريق', city: 'اكتملت مدينة', monastery: 'اكتمل دير', farm: 'حقل' };
const ROLE: Record<Group['kind'], string> = { city: 'فارس في مدينة', road: 'قاطع طريق على طريق', monastery: 'راهب في دير', field: 'مزارع في حقل' };

function remember(s: CarcaState, e: Omit<CarcaEvent, 'n'>) {
  s.log.push({ ...e, n: ++s.logN });
  if (s.log.length > LOG) s.log.shift();
}

function nextAfter(s: CarcaState, id: string): string {
  const i = s.order.indexOf(id);
  return s.order[(i + 1) % s.order.length];
}

const boardOf = (s: CarcaState): Board => makeBoard(s.board);

function followersIn(s: CarcaState, g: Group): CarcaFollower[] {
  const keys = new Set(g.members.map(memberKey));
  return s.followers.filter((f) => keys.has(memberKey(f)));
}

/** Give a feature's points to its majority (players still in the game). */
function award(s: CarcaState, g: Group, pts: number, end: boolean): string[] {
  const held = followersIn(s, g);
  const who = majority(held.map((f) => f.owner)).filter((o) => s.order.includes(o));
  if (pts > 0) {
    for (const o of who) {
      s.scores[o] += pts;
      s.breakdown[o][BREAK[g.kind]] += pts;
    }
  }
  remember(s, { kind: BREAK[g.kind], pts, who, end });
  return who;
}

/** Score every completed feature with followers that the tile at (x, y) belongs to or borders. */
function scoreCompleted(ctx: GameCtx, s: CarcaState, x: number, y: number) {
  const board = boardOf(s);
  const done: Group[] = [];
  const seen = new Set<string>();
  const placed = board.get(key(x, y))!;
  TILES[placed.t].feats.forEach((feat, f) => {
    if (feat.k !== 'city' && feat.k !== 'road') return;
    const g = groupOf(board, x, y, f);
    if (seen.has(g.id)) return;
    seen.add(g.id);
    if (g.complete) done.push(g);
  });
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const pl = board.get(key(x + dx, y + dy));
      if (!pl) continue;
      const mi = TILES[pl.t].feats.findIndex((ft) => ft.k === 'monastery');
      if (mi < 0) continue;
      const g = groupOf(board, pl.x, pl.y, mi);
      if (g.complete) done.push(g);
    }
  }
  let scored = false;
  for (const g of done) {
    const held = followersIn(s, g);
    if (!held.length) continue;
    award(s, g, completedPoints(g), false);
    scored = true;
    for (const f of held) s.supply[f.owner] = (s.supply[f.owner] ?? 0) + 1;
    const gone = new Set(held);
    s.followers = s.followers.filter((f) => !gone.has(f));
  }
  if (scored) ctx.fx('correct');
}

function endGame(ctx: GameCtx, s: CarcaState) {
  const board = boardOf(s);
  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const f of s.followers) {
    if (seen.has(memberKey(f))) continue;
    const g = groupOf(board, f.x, f.y, f.f);
    for (const m of g.members) seen.add(memberKey(m));
    groups.push(g);
  }
  // unfinished roads, cities and monasteries first, then the farms
  for (const g of groups.filter((x) => x.kind !== 'field')) award(s, g, unfinishedPoints(g), true);
  if (s.settings.farmers) for (const g of groups.filter((x) => x.kind === 'field')) award(s, g, fieldPoints(board, g), true);
  s.phase = 'final';
  s.step = null;
  s.tile = null;
  s.preview = null;
  s.options = [];
  s.endsAt = null;
  const top = Math.max(...s.order.map((id) => s.scores[id]));
  const winners = s.order.filter((id) => s.scores[id] === top);
  s.final = { winners, left: s.left.slice() };
  ctx.fx('win', winners.length === 1 ? winners[0] : undefined);
  ctx.say?.(`انتهت البلاطات: ${winners.length === 1 ? `الفوز لـ${ctx.playerName(winners[0])}` : 'تعادل'} (${top} نقطة)`, winners.length === 1 ? winners[0] : undefined);
}

/** Draw the next tile that fits somewhere (discarding the others); false when the pile runs out. */
function drawTile(s: CarcaState): boolean {
  const board = boardOf(s);
  while (s.pile.length) {
    const t = s.pile.pop()!;
    if (canPlace(board, t)) {
      s.tile = t;
      return true;
    }
    s.discarded += 1;
    remember(s, { kind: 'discard', pts: 0, who: [], end: false, t });
  }
  s.tile = null;
  return false;
}

function startTurn(ctx: GameCtx, s: CarcaState, id: string) {
  if (!drawTile(s)) {
    endGame(ctx, s);
    return;
  }
  s.turn = id;
  s.turnNo += 1;
  s.step = 'place';
  s.preview = null;
  s.options = [];
  s.botMove = null;
  s.endsAt = s.settings.seconds ? ctx.now + s.settings.seconds * 1000 : null;
}

/** The features of the tile at (x, y) a follower may go on now. */
export function followerOptions(s: CarcaState, x: number, y: number): number[] {
  const board = boardOf(s);
  const pl = board.get(key(x, y));
  if (!pl) return [];
  const out: number[] = [];
  TILES[pl.t].feats.forEach((feat, f) => {
    if (feat.k === 'field' && !s.settings.farmers) return;
    if (!followersIn(s, groupOf(board, x, y, f)).length) out.push(f);
  });
  return out;
}

function finishTurn(ctx: GameCtx, s: CarcaState) {
  const last = s.last!;
  s.step = null;
  s.options = [];
  s.preview = null;
  const before = s.logN;
  scoreCompleted(ctx, s, last.x, last.y);
  // completed features that scored: the most points first
  const scored = s.log
    .filter((e): e is CarcaEvent & { kind: CarcaScoreKind } => e.n > before && e.kind !== 'discard' && e.who.length > 0 && e.pts > 0)
    .sort((a, b) => b.pts - a.pts);
  if (scored.length) {
    const e = scored[0];
    const more = scored.length > 1 ? ` (+${scored.length - 1} غيرها)` : '';
    ctx.say?.(`${DONE[e.kind]}: ${e.who.map((id) => ctx.playerName(id)).join(' و')} +${e.pts}${more}`, e.who.length === 1 ? e.who[0] : undefined);
  }
  if (!s.pile.length) endGame(ctx, s);
  else startTurn(ctx, s, nextAfter(s, s.turn));
}

function placeTile(ctx: GameCtx, s: CarcaState, by: string, x: number, y: number, r: number) {
  const t = s.tile!;
  if (!fits(boardOf(s), t, x, y, r)) throw new GameError('لا تطابق البلاطة جيرانها هنا');
  s.board.push({ x, y, t, r });
  s.tile = null;
  s.preview = null;
  s.last = { x, y, by };
  ctx.fx('card');
  ctx.say?.(`بلاطة جديدة من ${ctx.playerName(by)}`, by);
  const options = (s.supply[by] ?? 0) > 0 ? followerOptions(s, x, y) : [];
  if (!options.length) {
    finishTurn(ctx, s);
    return;
  }
  s.step = 'follower';
  s.options = options;
  if (s.endsAt !== null) s.endsAt = Math.max(s.endsAt, ctx.now + FOLLOWER_MS);
}

function placeFollower(ctx: GameCtx, s: CarcaState, by: string, f: number | null) {
  if (f !== null) {
    if (!s.options.includes(f)) throw new GameError('لا يمكن وضع تابع هنا');
    if ((s.supply[by] ?? 0) <= 0) throw new GameError('لم يبق عندك أتباع');
    const last = s.last!;
    s.followers.push({ owner: by, x: last.x, y: last.y, f });
    s.supply[by] -= 1;
    ctx.fx('reveal', by);
    const t = s.board.find((p) => p.x === last.x && p.y === last.y)?.t;
    const kind = t ? TILES[t].feats[f]?.k : undefined;
    ctx.say?.(`بلاطة جديدة من ${ctx.playerName(by)}، ومعها ${kind ? ROLE[kind] : 'تابع'}`, by);
  }
  finishTurn(ctx, s);
}

/** The best spot for the tile, without a follower (time-outs, and a bot whose plan went stale). */
function autoPlace(ctx: GameCtx, s: CarcaState) {
  const m = movePlan(s, s.turn, false);
  if (m) placeTile(ctx, s, s.turn, m.x, m.y, m.r);
  if (s.step === 'follower') placeFollower(ctx, s, s.turn, null);
}

function movePlan(s: CarcaState, id: string, withFollower: boolean): BotMove | null {
  return planMove({
    board: s.board,
    followers: s.followers,
    tile: s.tile!,
    me: id,
    order: s.order,
    tilesLeft: s.pile.length,
    supply: s.supply[id] ?? 0,
    farmers: s.settings.farmers,
    level: s.settings.level,
    withFollower,
  });
}

function emptyBreakdown(): CarcaBreakdown {
  return { road: 0, city: 0, monastery: 0, farm: 0 };
}

/* ------------------------------------------------------------------ */

export const carca: GameModule<CarcaState, CarcaSettings> = {
  id: 'carca',

  turnOf: (s) => (s.phase === 'play' ? [s.turn] : []),

  start(ctx, participants, settings) {
    const order = shuffle(participants);
    const s: CarcaState = {
      settings: { ...settings },
      order,
      colors: Object.fromEntries(order.map((id, i) => [id, i % 5])),
      phase: 'play',
      board: [{ x: 0, y: 0, t: START_TILE, r: 0 }],
      followers: [],
      pile: shuffle(makePile()),
      tile: null,
      step: null,
      turn: order[0],
      turnNo: 0,
      preview: null,
      last: null,
      options: [],
      endsAt: null,
      supply: Object.fromEntries(order.map((id) => [id, FOLLOWERS])),
      scores: Object.fromEntries(order.map((id) => [id, 0])),
      breakdown: Object.fromEntries(order.map((id) => [id, emptyBreakdown()])),
      log: [],
      logN: 0,
      discarded: 0,
      left: [],
      final: null,
      botMove: null,
    };
    startTurn(ctx, s, order[0]);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || !s.order.includes(by)) return;
    // a bot move planned for an earlier turn: drop it
    if (a.turn !== undefined && a.turn !== s.turnNo) return;
    if (s.turn !== by) throw new GameError('ليس دورك');
    switch (a.type) {
      case 'preview': {
        if (s.step !== 'place') return;
        if (a.x === null || a.x === undefined) {
          s.preview = null;
          return;
        }
        if (!isNum(a.x) || !isNum(a.y) || !isNum(a.r)) return;
        s.preview = { x: Math.round(a.x), y: Math.round(a.y), r: ((Math.round(a.r) % 4) + 4) % 4 };
        return;
      }
      case 'place': {
        if (s.step !== 'place') throw new GameError('وضعت البلاطة من قبل');
        if (!isNum(a.x) || !isNum(a.y) || !isNum(a.r)) throw new GameError('مكان غير صالح');
        const r = ((Math.round(a.r) % 4) + 4) % 4;
        try {
          placeTile(ctx, s, by, Math.round(a.x), Math.round(a.y), r);
        } catch (e) {
          // a refused bot move: place the tile in the best spot instead, so it never gets stuck
          if (a.auto && e instanceof GameError) autoPlace(ctx, s);
          else throw e;
        }
        return;
      }
      case 'follower': {
        if (s.step !== 'follower') throw new GameError('ضع البلاطة أولاً');
        const f = a.f === null || a.f === undefined ? null : isNum(a.f) ? Math.round(a.f) : -1;
        try {
          placeFollower(ctx, s, by, f);
        } catch (e) {
          if (a.auto && e instanceof GameError) placeFollower(ctx, s, by, null);
          else throw e;
        }
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase !== 'play' || s.endsAt === null || ctx.now < s.endsAt) return false;
    ctx.fx('buzz');
    if (s.step === 'place') autoPlace(ctx, s);
    else if (s.step === 'follower') placeFollower(ctx, s, s.turn, null);
    return true;
  },

  botPlan(ctx, s) {
    if (s.phase !== 'play' || !ctx.isBot(s.turn)) return;
    const id = s.turn;
    let changed = false;
    if (s.botMove?.turnNo !== s.turnNo && s.step === 'place') {
      const m = movePlan(s, id, true);
      if (!m) return;
      s.botMove = { turnNo: s.turnNo, ...m };
      // everyone watches where the bot is about to put its tile
      s.preview = { x: m.x, y: m.y, r: m.r };
      changed = true;
    }
    const m = s.botMove?.turnNo === s.turnNo ? s.botMove : null;
    const cap = (ms: number) => (s.settings.seconds ? Math.min(ms, s.settings.seconds * 400) : ms);
    if (s.step === 'place' && m) ctx.bot(id, `p${s.turnNo}`, cap(randDelay(1300, 2400)), { type: 'place', x: m.x, y: m.y, r: m.r, turn: s.turnNo, auto: true });
    else if (s.step === 'follower') {
      // (no plan: a person placed the tile, then went offline and a bot took over)
      const f = m && m.f !== null && s.options.includes(m.f) && s.last?.x === m.x && s.last?.y === m.y ? m.f : null;
      ctx.bot(id, `f${s.turnNo}`, cap(randDelay(600, 1200)), { type: 'follower', f, turn: s.turnNo, auto: true });
    }
    return changed;
  },

  view(_ctx, s): CarcaView {
    const play = s.phase === 'play';
    return {
      game: 'carca',
      phase: s.phase,
      order: s.order,
      colors: s.colors,
      turn: play ? s.turn : null,
      turnNo: s.turnNo,
      step: play ? s.step : null,
      tile: play ? s.tile : null,
      preview: play ? s.preview : null,
      last: s.last,
      options: play ? s.options : [],
      board: s.board,
      followers: s.followers,
      supply: s.supply,
      scores: s.scores,
      breakdown: s.breakdown,
      deck: s.pile.length,
      log: s.log,
      endsAt: s.endsAt,
      total: s.settings.seconds * 1000,
      farmers: s.settings.farmers,
      final: s.final,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase !== 'play' || !s.order.includes(id)) return;
    const onTurn = s.turn === id;
    const next = s.order.length > 1 ? nextAfter(s, id) : id;
    if (onTurn && s.step === 'place' && s.tile) {
      // the drawn tile goes back into the pile at a random place
      s.pile.splice(Math.floor(Math.random() * (s.pile.length + 1)), 0, s.tile);
      s.tile = null;
    }
    s.order = s.order.filter((p) => p !== id);
    s.left.push(id);
    if (s.order.length < 2) {
      if (onTurn && s.step === 'follower') scoreCompleted(ctx, s, s.last!.x, s.last!.y);
      endGame(ctx, s);
      return;
    }
    if (!onTurn) return;
    if (s.step === 'follower') {
      // the tile is down: finish the turn without a follower (completed features still score)
      s.step = null;
      s.options = [];
      scoreCompleted(ctx, s, s.last!.x, s.last!.y);
      if (!s.pile.length) endGame(ctx, s);
      else startTurn(ctx, s, next);
      return;
    }
    startTurn(ctx, s, next);
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (typeof patch.farmers === 'boolean') settings.farmers = patch.farmers;
    if (patch.seconds === 0 || patch.seconds === 45 || patch.seconds === 60 || patch.seconds === 90) settings.seconds = patch.seconds;
    if (patch.level === 1 || patch.level === 2) settings.level = patch.level;
  },
};
