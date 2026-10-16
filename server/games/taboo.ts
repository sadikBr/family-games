import type { TabooCardResult, TabooSettings, TabooView } from '../../src/shared/protocol';
import { TABOO_CARDS, type TabooCard } from '../content';
import { GameError, type GameCtx, type GameModule } from '../types';
import { Deck, isNum, isStr, shuffle } from '../util';

interface State {
  settings: TabooSettings;
  phase: TabooView['phase'];
  participants: string[];
  teams: [string[], string[]];
  startTeam: 0 | 1;
  turn: number; // 0-based
  describerIdx: [number, number];
  describerId: string;
  endsAt: number | null;
  card: { index: number; word: string; forbidden: string[] } | null;
  counter: number;
  history: { word: string; result: TabooCardResult }[];
  teamScores: [number, number];
}

function deck(ctx: GameCtx): Deck<TabooCard> {
  let d = ctx.memo.get('taboo') as Deck<TabooCard> | undefined;
  if (!d) {
    d = new Deck(TABOO_CARDS);
    ctx.memo.set('taboo', d);
  }
  return d;
}

function makeTeams(participants: string[]): [string[], string[]] {
  const sh = shuffle(participants);
  const a: string[] = [];
  const b: string[] = [];
  sh.forEach((id, i) => (i % 2 === 0 ? a : b).push(id));
  return [a, b];
}

function activeTeam(s: State): 0 | 1 {
  return ((s.startTeam + s.turn) % 2) as 0 | 1;
}

function totalTurns(s: State) {
  return Math.max(1, s.settings.turnsEach) * 2;
}

function pickDescriber(ctx: GameCtx, s: State) {
  const team = activeTeam(s);
  const members = s.teams[team];
  for (let i = 0; i < members.length; i++) {
    const id = members[(s.describerIdx[team] + i) % members.length];
    if (ctx.isConnected(id)) {
      s.describerIdx[team] = (s.describerIdx[team] + i) % members.length;
      s.describerId = id;
      return;
    }
  }
  s.describerId = members[0] ?? '';
}

function drawCard(ctx: GameCtx, s: State) {
  const c = deck(ctx).draw();
  s.counter += 1;
  s.card = { index: s.counter, word: c.word, forbidden: c.forbidden };
}

function endTurn(ctx: GameCtx, s: State) {
  s.phase = 'turnEnd';
  s.endsAt = null;
  s.card = null;
  ctx.fx('tick');
}

function teamOf(s: State, id: string): 0 | 1 | -1 {
  if (s.teams[0].includes(id)) return 0;
  if (s.teams[1].includes(id)) return 1;
  return -1;
}

export const taboo: GameModule<State, TabooSettings> = {
  id: 'taboo',
  hostOnly: ['shuffle', 'swap', 'begin', 'endTurn'],

  start(ctx, participants, settings) {
    const s: State = {
      settings,
      phase: 'teams',
      participants,
      teams: makeTeams(participants),
      startTeam: Math.random() < 0.5 ? 0 : 1,
      turn: 0,
      describerIdx: [0, 0],
      describerId: '',
      endsAt: null,
      card: null,
      counter: 0,
      history: [],
      teamScores: [0, 0],
    };
    pickDescriber(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    const idx = a.index;
    const fresh = s.phase === 'play' && s.card !== null && isNum(idx) && idx === s.card.index;
    switch (a.type) {
      case 'shuffle':
        if (s.phase !== 'teams') return;
        s.teams = makeTeams(s.participants);
        pickDescriber(ctx, s);
        return;
      case 'swap': {
        if (s.phase !== 'teams' || !isStr(a.id)) return;
        const t = teamOf(s, a.id);
        if (t === -1) return;
        if (s.teams[t].length <= 1) throw new GameError('كل فريق يحتاج لاعباً واحداً على الأقل');
        s.teams[t] = s.teams[t].filter((p) => p !== a.id);
        s.teams[t === 0 ? 1 : 0].push(a.id);
        pickDescriber(ctx, s);
        return;
      }
      case 'begin':
        if (s.phase !== 'teams') return;
        if (s.teams[0].length < 2 || s.teams[1].length < 2) {
          throw new GameError('كل فريق يحتاج لاعبَين على الأقل');
        }
        s.phase = 'ready';
        pickDescriber(ctx, s);
        return;
      case 'start':
        if (s.phase !== 'ready') return;
        s.phase = 'play';
        s.history = [];
        s.endsAt = ctx.now + s.settings.seconds * 1000;
        drawCard(ctx, s);
        ctx.fx('start');
        return;
      case 'ok':
      case 'skip': {
        if (!fresh || by !== s.describerId || !s.card) return;
        const ok = a.type === 'ok';
        s.history.push({ word: s.card.word, result: ok ? 'ok' : 'skip' });
        if (ok) s.teamScores[activeTeam(s)] += 1;
        ctx.fx(ok ? 'correct' : 'skip');
        drawCard(ctx, s);
        return;
      }
      case 'buzz': {
        if (!fresh || !s.card) return;
        const t = teamOf(s, by);
        if (t === -1 || t === activeTeam(s)) return; // only the other team can buzz
        s.history.push({ word: s.card.word, result: 'buzz' });
        s.teamScores[activeTeam(s)] -= 1;
        ctx.fx('buzz', by);
        drawCard(ctx, s);
        return;
      }
      case 'endTurn':
        if (s.phase === 'play') endTurn(ctx, s);
        return;
      case 'next': {
        if (s.phase !== 'turnEnd') return;
        const team = activeTeam(s);
        s.describerIdx[team] = (s.describerIdx[team] + 1) % Math.max(1, s.teams[team].length);
        s.turn += 1;
        if (s.turn >= totalTurns(s)) {
          s.phase = 'final';
          ctx.fx('win');
          return;
        }
        s.phase = 'ready';
        s.history = [];
        pickDescriber(ctx, s);
        return;
      }
    }
  },

  tick(ctx, s) {
    if (s.phase === 'play' && s.endsAt !== null && ctx.now >= s.endsAt) {
      endTurn(ctx, s);
      return true;
    }
    return false;
  },

  view(ctx, s, me): TabooView {
    const myTeam = teamOf(s, me);
    const team = activeTeam(s);
    // describer's team-mates must not see the card
    const hide = me !== s.describerId && myTeam === team;
    return {
      game: 'taboo',
      phase: s.phase,
      participants: s.participants,
      teams: s.teams,
      activeTeam: team,
      describerId: s.describerId,
      turn: s.turn + 1,
      totalTurns: totalTurns(s),
      endsAt: s.endsAt,
      card: hide ? null : s.card,
      history: s.history,
      teamScores: s.teamScores,
    };
  },

  onLeave(ctx, s, id) {
    s.participants = s.participants.filter((p) => p !== id);
    s.teams = [s.teams[0].filter((p) => p !== id), s.teams[1].filter((p) => p !== id)];
    if (s.describerId === id) {
      if (s.phase === 'play') endTurn(ctx, s);
      pickDescriber(ctx, s);
    }
  },
};
