/**
 * «المثلثات» — the digital «Chain Triangle» for 2–4 players. A hexagon of pegs on a triangular lattice;
 * each turn a player stretches a band in a straight line between two pegs (1…`band` units along one of
 * the three directions), covering every unit edge on its way (at least one new). Covering the last side
 * of a unit triangle takes it and (with «دور إضافي عند الإكمال») gives another turn; when every edge is
 * covered, the most triangles wins (a tie is allowed). The starting player rotates between games of the
 * same group and a series score is kept (2 players: the shared duel series). Geometry and rules in
 * src/shared/games/triangles.ts, the bots in server/ai/triangles-bot.ts.
 */
import {
  TRI_BANDS,
  TRI_SIZES,
  triBandEdges,
  triGeometry,
  type TriBand,
  type TrianglesSettings,
  type TrianglesView,
} from '../../src/shared/games/triangles';
import { trianglesBotBand } from '../ai/triangles-bot';
import { randDelay } from '../cardkit';
import { duelWin, startDuel } from '../duel';
import { GameError, botLevel, type GameCtx, type GameModule } from '../types';
import { isNum, shuffle } from '../util';
import { VB, voiceAnd, voiceResult, voiceTriangles } from '../voice-calls-triangles';

interface State {
  size: number;
  band: number;
  bonus: boolean;
  seats: string[];
  names: Record<string, string>;
  active: string[];
  turnIdx: number;
  edges: number[];
  bands: TriBand[];
  tris: number[];
  last: number | null;
  lastTris: number[];
  points: Record<string, number>;
  phase: TrianglesView['phase'];
  winners: string[] | null;
  reason: TrianglesView['reason'];
  moves: number;
  score: Record<string, number>;
  /** the bot's choice for the current move (worked out once per move) */
  botCache: { moves: number; a: number; b: number } | null;
}

/** «لماما»، «للحسن»: a name after the preposition لـ (announcements never conjugate a verb for the player). */
const li = (n: string) => (/^[ء-ي]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

interface GroupMemo {
  group: string;
  order: string[];
  lastFirst: number;
  score: Record<string, number>;
}

/** 3–4 players: keep the same seating for the group and pass the first move along each game. */
function startGroup(ctx: GameCtx, participants: string[]) {
  const group = participants.slice().sort().join('|');
  const prev = ctx.memo.get('triangles:group') as GroupMemo | undefined;
  if (prev && prev.group === group) {
    const lastFirst = (prev.lastFirst + 1) % prev.order.length;
    ctx.memo.set('triangles:group', { ...prev, lastFirst });
    return { seats: [...prev.order.slice(lastFirst), ...prev.order.slice(0, lastFirst)], score: prev.score };
  }
  const order = shuffle(participants);
  const score = Object.fromEntries(order.map((p) => [p, 0]));
  ctx.memo.set('triangles:group', { group, order, lastFirst: 0, score } satisfies GroupMemo);
  return { seats: order, score };
}

const turnOf = (s: State) => (s.phase === 'play' && s.active.length ? s.active[s.turnIdx % s.active.length] : null);

function finish(ctx: GameCtx, s: State, reason: 'full' | 'forfeit') {
  s.phase = 'final';
  s.reason = reason;
  const best = Math.max(...s.active.map((p) => s.points[p] ?? 0));
  s.winners = s.active.filter((p) => (s.points[p] ?? 0) === best);
  if (s.winners.length !== 1) return; // a tie: no win counted
  const w = s.winners[0];
  if (s.seats.length === 2) duelWin(ctx, s.score, w);
  else {
    s.score[w] = (s.score[w] ?? 0) + 1;
    ctx.fx('win', w);
  }
}

/** A player is out (resigned or left): the others carry on; the last one standing wins. */
function dropOut(ctx: GameCtx, s: State, id: string) {
  const i = s.active.indexOf(id);
  if (i < 0 || s.phase !== 'play') return;
  const wasTurn = i === s.turnIdx;
  s.active.splice(i, 1);
  if (i < s.turnIdx) s.turnIdx -= 1;
  if (s.active.length) s.turnIdx %= s.active.length;
  if (wasTurn) s.botCache = null;
  if (s.active.length <= 1) finish(ctx, s, 'forfeit');
}

const triWord = (k: number) => (k === 1 ? 'مثلث' : k === 2 ? 'مثلثان' : `${k} مثلثات`);

export const triangles: GameModule<State, TrianglesSettings> = {
  id: 'triangles',

  turnOf: (s) => {
    const t = turnOf(s);
    return t ? [t] : [];
  },

  start(ctx, participants, settings) {
    const size = (TRI_SIZES as readonly number[]).includes(settings.size) ? settings.size : 3;
    const band = (TRI_BANDS as readonly number[]).includes(settings.band) ? settings.band : 2;
    const g = triGeometry(size);
    let seats: string[], score: Record<string, number>;
    if (participants.length === 2) {
      const d = startDuel(ctx, 'triangles', participants);
      seats = [d.first, d.second];
      score = d.score;
    } else ({ seats, score } = startGroup(ctx, participants));
    ctx.fx('start');
    return {
      size,
      band,
      bonus: settings.bonus !== false,
      seats,
      names: Object.fromEntries(seats.map((p) => [p, ctx.playerName(p)])),
      active: seats.slice(),
      turnIdx: 0,
      edges: Array(g.edges.length).fill(-1),
      bands: [],
      tris: Array(g.tris.length).fill(-1),
      last: null,
      lastTris: [],
      points: Object.fromEntries(seats.map((p) => [p, 0])),
      phase: 'play',
      winners: null,
      reason: null,
      moves: 0,
      score,
      botCache: null,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase !== 'play' || !s.active.includes(by)) return;
    if (a.type === 'resign') {
      dropOut(ctx, s, by);
      const over = s.phase !== 'play';
      ctx.say?.(`انسحاب من ${ctx.playerName(by)}`, by, voiceAnd(VB.resign, over && voiceResult(s.winners?.length === 1 ? ctx.playerName(s.winners[0]) : null)));
      return;
    }
    if (a.type !== 'band') return;
    if (turnOf(s) !== by) throw new GameError('ليس دورك');
    const g = triGeometry(s.size);
    const { a: pa, b: pb } = a;
    if (!isNum(pa) || !isNum(pb) || !Number.isInteger(pa) || !Number.isInteger(pb) || !g.pts[pa] || !g.pts[pb]) return;
    const es = triBandEdges(g, pa, pb, s.band);
    if (es === 'same') throw new GameError('اختر وتدين مختلفين');
    if (es === 'line') throw new GameError('الشريط يُشدّ في خط مستقيم على أحد الاتجاهات الثلاثة');
    if (es === 'long') throw new GameError(s.band === 1 ? 'الشريط بين وتدين متجاورين فقط' : `أطول شريط ${s.band === 2 ? 'وحدتان' : 'ثلاث وحدات'}`);
    const news = es.filter((e) => s.edges[e] < 0);
    if (!news.length) throw new GameError('كل أضلاع هذا الشريط مغطاة من قبل');
    const seat = s.seats.indexOf(by);
    for (const e of news) s.edges[e] = seat;
    s.bands.push([pa, pb, seat]);
    s.last = s.bands.length - 1;
    s.moves += 1;
    s.lastTris = [...new Set(news.flatMap((e) => g.edgeTris[e]))].filter((t) => s.tris[t] < 0 && g.tris[t].edges.every((x) => s.edges[x] >= 0));
    for (const t of s.lastTris) s.tris[t] = seat;
    const k = s.lastTris.length;
    if (k) {
      s.points[by] += k;
      ctx.fx('correct', by);
      if (s.edges.every((o) => o >= 0)) finish(ctx, s, 'full');
    } else ctx.fx('card', by);
    // (covering the last free edge always completes its triangles, so the game ends above)
    if (s.phase === 'play' && (!k || !s.bonus)) s.turnIdx = (s.turnIdx + 1) % s.active.length;
    // read aloud (after the end check): several triangles with one band, and the winner
    const over = s.phase !== 'play';
    const voice = voiceAnd(voiceTriangles(k), over && voiceResult(s.winners?.length === 1 ? ctx.playerName(s.winners[0]) : null));
    ctx.say?.(k ? `${triWord(k)} ${li(ctx.playerName(by))}${s.bonus && !over ? ' — ودور إضافي' : ''}` : `شريط من ${ctx.playerName(by)}`, by, voice);
  },

  botPlan(ctx, s, bots) {
    const id = turnOf(s);
    if (!id || !bots.includes(id)) return;
    if (s.botCache?.moves !== s.moves) {
      const level = botLevel(ctx);
      const m = trianglesBotBand(s.size, s.band, s.bonus, s.edges.map((x) => x >= 0), level);
      s.botCache = { moves: s.moves, ...m };
    }
    // a quicker hand while eating a chain
    const eating = s.lastTris.length && s.last !== null && s.seats[s.bands[s.last][2]] === id;
    const delay = eating ? randDelay(420, 700) : randDelay(700, 1250);
    ctx.bot(id, `t:${s.moves}`, delay, { type: 'band', a: s.botCache.a, b: s.botCache.b });
  },

  view(ctx, s, me): TrianglesView {
    return {
      game: 'triangles',
      phase: s.phase,
      size: s.size,
      band: s.band,
      bonus: s.bonus,
      seats: s.seats,
      names: s.names,
      active: s.active,
      turn: turnOf(s),
      edges: s.edges,
      bands: s.bands,
      tris: s.tris,
      last: s.last,
      lastTris: s.lastTris,
      points: s.points,
      winners: s.winners,
      reason: s.reason,
      score: s.score,
      me: s.seats.indexOf(me),
    };
  },

  onLeave(ctx, s, id) {
    dropOut(ctx, s, id);
  },

  /** Players still in by triangles, then everyone who dropped out (resigned or left) sharing last place. */
  result(s) {
    if (s.phase !== 'final' || !s.active.length) return null;
    const pts = (p: string) => s.points[p] ?? 0;
    const vals = [...new Set(s.active.map(pts))].sort((a, b) => b - a);
    const places = vals.map((v) => s.active.filter((p) => pts(p) === v));
    const out = s.seats.filter((p) => !s.active.includes(p));
    return { places: out.length ? [...places, out] : places };
  },

  patchSettings(settings, patch) {
    if (isNum(patch.size) && (TRI_SIZES as readonly number[]).includes(patch.size)) settings.size = patch.size;
    if (isNum(patch.band) && (TRI_BANDS as readonly number[]).includes(patch.band)) settings.band = patch.band;
    if (typeof patch.bonus === 'boolean') settings.bonus = patch.bonus;
  },
};
