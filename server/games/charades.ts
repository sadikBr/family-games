/** «تمثيل صامت» — server rules. */
import {
  CHARADES_CATEGORIES,
  CHARADES_FREE_SKIPS,
  CHARADES_SECONDS,
  type CharadesCard,
  type CharadesLevel,
  type CharadesResult,
  type CharadesSettings,
  type CharadesView,
} from '../../src/shared/games/charades';
import { CHARADES_ALL, type CharadesWord } from '../charades-content';
import { GameError, paced, type GameCtx, type GameModule } from '../types';
import { Deck, isNum, isStr, shuffle } from '../util';
import { PVOICE, voiceOnly, voiceTeamsFinal } from '../voice-calls-party';

export const COUNTDOWN_MS = 3000;
const NOTICE_MS = 6000;
const TEAM_NAMES = ['الفريق الأحمر', 'الفريق الأزرق'] as const;

interface State {
  settings: CharadesSettings;
  phase: CharadesView['phase'];
  participants: string[];
  teams: [string[], string[]];
  startTeam: 0 | 1;
  turn: number; // 0-based
  totalTurns: number;
  actorIdx: [number, number];
  actorId: string;
  endsAt: number | null;
  card: CharadesCard | null;
  counter: number;
  history: { word: string; result: CharadesResult }[];
  teamScores: [number, number];
  skipsUsed: number;
  notice: { text: string; until: number } | null;
}

const LEVELS: Record<Exclude<CharadesLevel, 'all'>, 1 | 2 | 3> = { easy: 1, medium: 2, hard: 3 };

/** The words matching the settings (never empty: falls back to the whole category, then everything). */
export function charadesPool(settings: CharadesSettings): CharadesWord[] {
  const byCat = settings.category === 'mixed' ? CHARADES_ALL : CHARADES_ALL.filter((w) => w.cat === settings.category);
  const lvl = settings.level === 'all' ? null : LEVELS[settings.level];
  const pool = lvl === null ? byCat : byCat.filter((w) => w.level === lvl);
  return pool.length ? pool : byCat.length ? byCat : CHARADES_ALL;
}

function deck(ctx: GameCtx, s: State): Deck<CharadesWord> {
  const key = `charades:${s.settings.category}:${s.settings.level}`;
  let d = ctx.memo.get(key) as Deck<CharadesWord> | undefined;
  if (!d) {
    d = new Deck(charadesPool(s.settings));
    ctx.memo.set(key, d);
  }
  return d;
}

function makeTeams(participants: string[]): [string[], string[]] {
  const a: string[] = [];
  const b: string[] = [];
  shuffle(participants).forEach((id, i) => (i % 2 === 0 ? a : b).push(id));
  return [a, b];
}

function activeTeam(s: State): 0 | 1 {
  return ((s.startTeam + s.turn) % 2) as 0 | 1;
}

function teamOf(s: State, id: string): 0 | 1 | -1 {
  if (s.teams[0].includes(id)) return 0;
  if (s.teams[1].includes(id)) return 1;
  return -1;
}

/** Both teams get the same number of turns: enough for everyone in the bigger team to act `turnsEach` times. */
function computeTotalTurns(s: State) {
  return 2 * Math.max(1, s.settings.turnsEach) * Math.max(1, s.teams[0].length, s.teams[1].length);
}

function pickActor(ctx: GameCtx, s: State) {
  const team = activeTeam(s);
  const members = s.teams[team];
  for (let i = 0; i < members.length; i++) {
    const k = (s.actorIdx[team] + i) % members.length;
    if (ctx.isConnected(members[k])) {
      s.actorIdx[team] = k;
      s.actorId = members[k];
      return;
    }
  }
  s.actorIdx[team] = members.length ? s.actorIdx[team] % members.length : 0;
  s.actorId = members[s.actorIdx[team]] ?? '';
}

function drawCard(ctx: GameCtx, s: State) {
  const w = deck(ctx, s).draw();
  s.counter += 1;
  s.card = { index: s.counter, word: w.word, category: CHARADES_CATEGORIES.find((c) => c.key === w.cat)?.label ?? '', level: w.level };
}

function endTurn(ctx: GameCtx, s: State) {
  const wasPlaying = s.phase === 'play';
  s.phase = 'turnEnd';
  s.endsAt = null;
  s.card = null;
  ctx.fx('buzz');
  if (!wasPlaying) return;
  const pts = s.history.reduce((n, h) => n + (h.result === 'ok' ? 1 : h.result === 'penalty' ? -1 : 0), 0);
  ctx.say?.(`انتهى الوقت: ${TEAM_NAMES[activeTeam(s)]} ${pts} في هذا الدور`, undefined, PVOICE.timeUp);
}

function finish(ctx: GameCtx, s: State) {
  s.phase = 'final';
  s.endsAt = null;
  s.card = null;
  ctx.fx('win'); // a team win: no single target
  voiceOnly(ctx, voiceTeamsFinal(s.teamScores));
}

function freeSkipsLeft(s: State) {
  return s.settings.skips >= CHARADES_FREE_SKIPS ? CHARADES_FREE_SKIPS : Math.max(0, s.settings.skips - s.skipsUsed);
}

function canPlay(s: State) {
  return s.teams[0].length >= 2 && s.teams[1].length >= 2;
}

/** After someone leaves: a team needs at least 2 players, so move one over from the bigger team. */
function balanceTeams(ctx: GameCtx, s: State) {
  for (const t of [0, 1] as const) {
    const o = t === 0 ? 1 : 0;
    if (s.teams[t].length >= 2 || s.teams[o].length <= 2) continue;
    const pool = s.teams[o].filter((id) => id !== s.actorId);
    const mover = pool.find((id) => ctx.isConnected(id)) ?? pool[0];
    if (!mover) continue;
    s.teams[o] = s.teams[o].filter((id) => id !== mover);
    s.teams[t] = [...s.teams[t], mover];
    s.notice = { text: `انتقل ${ctx.playerName(mover)} إلى ${TEAM_NAMES[t]} ليبقى في كل فريق لاعبان`, until: ctx.now + paced(ctx, NOTICE_MS) };
    ctx.fx('reveal');
  }
}

export const charades: GameModule<State, CharadesSettings> = {
  id: 'charades',
  hostOnly: ['shuffle', 'swap', 'begin', 'endTurn'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      phase: 'teams',
      participants,
      teams: makeTeams(participants),
      startTeam: Math.random() < 0.5 ? 0 : 1,
      turn: 0,
      totalTurns: 2,
      actorIdx: [0, 0],
      actorId: '',
      endsAt: null,
      card: null,
      counter: 0,
      history: [],
      teamScores: [0, 0],
      skipsUsed: 0,
      notice: null,
    };
    s.totalTurns = computeTotalTurns(s);
    pickActor(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    switch (a.type) {
      case 'shuffle':
        if (s.phase !== 'teams') return;
        s.teams = makeTeams(s.participants);
        pickActor(ctx, s);
        return;
      case 'swap': {
        if (s.phase !== 'teams' || !isStr(a.id)) return;
        const t = teamOf(s, a.id);
        if (t === -1) return;
        if (s.teams[t].length <= 1) throw new GameError('كل فريق يحتاج لاعباً واحداً على الأقل');
        s.teams[t] = s.teams[t].filter((p) => p !== a.id);
        s.teams[t === 0 ? 1 : 0].push(a.id);
        pickActor(ctx, s);
        return;
      }
      case 'begin':
        if (s.phase !== 'teams') return;
        if (!canPlay(s)) throw new GameError('كل فريق يحتاج لاعبَين على الأقل');
        s.totalTurns = computeTotalTurns(s);
        s.phase = 'ready';
        pickActor(ctx, s);
        return;
      case 'start':
        // the actor starts (the host may too, e.g. for a shy child); the screen only offers it to them
        if (s.phase !== 'ready' || !s.participants.includes(by)) return;
        s.phase = 'countdown';
        s.endsAt = ctx.now + COUNTDOWN_MS;
        s.history = [];
        s.skipsUsed = 0;
        ctx.fx('start');
        return;
      case 'ok':
      case 'skip': {
        if (s.phase !== 'play' || !s.card || by !== s.actorId) return;
        if (!isNum(a.index) || a.index !== s.card.index) return; // a stale double tap
        const team = activeTeam(s);
        if (a.type === 'ok') {
          s.history.push({ word: s.card.word, result: 'ok' });
          s.teamScores[team] += 1;
          ctx.fx('correct');
          // the actor is silent: the voice calls the found word for the room (never the word itself)
          ctx.say?.(`خمّنوها! ${TEAM_NAMES[team]}: ${s.history.filter((h) => h.result === 'ok').length} في هذا الدور`, by, PVOICE.right);
        } else {
          const free = freeSkipsLeft(s) > 0;
          s.skipsUsed += 1;
          s.history.push({ word: s.card.word, result: free ? 'skip' : 'penalty' });
          if (!free) s.teamScores[team] -= 1;
          ctx.fx('skip');
          ctx.say?.(free ? `تخطٍّ من ${ctx.playerName(by)}` : `تخطٍّ من ${ctx.playerName(by)} (نقطة أقل)`, by);
        }
        drawCard(ctx, s);
        return;
      }
      case 'endTurn':
        if (s.phase === 'play' || s.phase === 'countdown') endTurn(ctx, s);
        return;
      case 'next': {
        if (s.phase !== 'turnEnd') return;
        const team = activeTeam(s);
        s.actorIdx[team] = (s.actorIdx[team] + 1) % Math.max(1, s.teams[team].length);
        s.turn += 1;
        if (s.turn >= s.totalTurns) {
          finish(ctx, s);
          return;
        }
        s.phase = 'ready';
        s.history = [];
        pickActor(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    let changed = false;
    if (s.endsAt !== null && ctx.now >= s.endsAt) {
      if (s.phase === 'countdown') {
        s.phase = 'play';
        s.endsAt = ctx.now + s.settings.seconds * 1000;
        drawCard(ctx, s);
        ctx.say?.(`حان دور ${ctx.playerName(s.actorId)} في التمثيل ل${TEAM_NAMES[activeTeam(s)].slice(1)}`, s.actorId, PVOICE.go);
        return true;
      }
      if (s.phase === 'play') {
        endTurn(ctx, s);
        return true;
      }
    }
    if (s.notice && ctx.now >= s.notice.until) {
      s.notice = null;
      changed = true;
    }
    return changed;
  },

  view(_ctx, s, me): CharadesView {
    const team = activeTeam(s);
    const myTeam = teamOf(s, me);
    // the actor and the OTHER team see the word; the guessing team (and spectators) don't
    const sees = me === s.actorId || (myTeam !== -1 && myTeam !== team);
    const running = s.phase === 'play' || s.phase === 'countdown';
    return {
      game: 'charades',
      phase: s.phase,
      participants: s.participants,
      teams: s.teams,
      activeTeam: team,
      actorId: s.actorId,
      turn: Math.min(s.turn + 1, s.totalTurns),
      totalTurns: s.totalTurns,
      endsAt: s.endsAt,
      seconds: s.settings.seconds,
      card: sees && s.phase === 'play' ? s.card : null,
      history: s.history.map((h) => ({ word: running && !sees ? null : h.word, result: h.result })),
      teamScores: s.teamScores,
      skipsLeft: freeSkipsLeft(s),
      notice: s.notice?.text ?? null,
    };
  },

  turnOf(s) {
    return (s.phase === 'ready' || s.phase === 'play') && s.actorId ? [s.actorId] : [];
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    for (const t of [0, 1] as const) {
      const i = s.teams[t].indexOf(id);
      if (i === -1) continue;
      s.teams[t] = s.teams[t].filter((p) => p !== id);
      // keep the rotation pointing at the same next actor
      if (i < s.actorIdx[t]) s.actorIdx[t] -= 1;
      if (s.teams[t].length) s.actorIdx[t] %= s.teams[t].length;
      else s.actorIdx[t] = 0;
    }
    if (s.phase === 'final') return;
    if (s.participants.length < 4) {
      if (s.phase === 'teams') return; // the host can still go back to the lobby
      finish(ctx, s);
      return;
    }
    const wasActor = s.actorId === id;
    if (wasActor && (s.phase === 'play' || s.phase === 'countdown')) endTurn(ctx, s);
    if (s.phase !== 'teams') balanceTeams(ctx, s);
    if (wasActor || !s.teams[activeTeam(s)].includes(s.actorId)) pickActor(ctx, s);
  },

  /** The team with more points first (a tie shares first place); null if players left before all the turns were played. */
  result(s) {
    if (s.phase !== 'final' || s.turn < s.totalTurns) return null;
    const [a, b] = s.teamScores;
    const [t0, t1] = [s.teams[0].slice(), s.teams[1].slice()];
    if (a === b) return { places: [[...t0, ...t1]] };
    return { places: a > b ? [t0, t1] : [t1, t0] };
  },

  patchSettings(settings, patch) {
    if (isNum(patch.seconds) && (CHARADES_SECONDS as readonly number[]).includes(patch.seconds)) settings.seconds = patch.seconds;
    if (isNum(patch.turnsEach)) settings.turnsEach = Math.max(1, Math.min(3, Math.round(patch.turnsEach)));
    if (isNum(patch.skips)) {
      const v = Math.round(patch.skips);
      settings.skips = v >= CHARADES_FREE_SKIPS ? CHARADES_FREE_SKIPS : Math.max(0, Math.min(5, v));
    }
    if (patch.category === 'mixed' || CHARADES_CATEGORIES.some((c) => c.key === patch.category)) {
      settings.category = patch.category as CharadesSettings['category'];
    }
    if (patch.level === 'all' || patch.level === 'easy' || patch.level === 'medium' || patch.level === 'hard') settings.level = patch.level;
  },
};
