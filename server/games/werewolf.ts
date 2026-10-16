import type {
  WerewolfSettings,
  WerewolfView,
  WolfRole,
  WolfStep,
} from '../../src/shared/protocol';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isStr, pick, shuffle } from '../util';

interface State {
  settings: WerewolfSettings;
  narratorId: string;
  participants: string[]; // players excluding the narrator
  roles: Record<string, WolfRole>;
  alive: Record<string, boolean>;
  phase: WerewolfView['phase'];
  day: number;
  steps: WolfStep[];
  step: WolfStep;
  wolvesTarget: string | null;
  doctorSave: string | null;
  seerCheck: string | null;
  hunterTarget: string | null;
  hunterAfter: 'night' | 'day' | null;
  lastDeaths: string[] | null;
  lastEliminated: string | null | undefined;
  winner: 'wolves' | 'village' | null;
  log: string[];
  auto: Partial<Record<'wolves' | 'doctor' | 'seer' | 'hunter', boolean>>;
  seerKnown: Record<string, boolean>; // what a bot seer has learned (true = wolf)
  accusations: { by: string; target: string }[];
  accusedDay: number;
}

function autoWolves(n: number) {
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  return 3;
}

function deal(s: State) {
  const n = s.participants.length;
  const wolves = Math.max(1, Math.min(s.settings.wolves || autoWolves(n), Math.floor((n - 1) / 2)));
  const specials: WolfRole[] = [];
  if (s.settings.seer) specials.push('seer');
  if (s.settings.doctor) specials.push('doctor');
  if (s.settings.hunter) specials.push('hunter');
  const pool: WolfRole[] = [];
  for (let i = 0; i < wolves; i++) pool.push('wolf');
  for (const r of specials) if (pool.length < n) pool.push(r);
  while (pool.length < n) pool.push('villager');
  const order = shuffle(s.participants);
  s.roles = {};
  s.alive = {};
  order.forEach((id, i) => {
    s.roles[id] = pool[i];
    s.alive[id] = true;
  });
}

function hasRole(s: State, r: WolfRole) {
  return Object.values(s.roles).includes(r);
}

function nightSteps(s: State): WolfStep[] {
  const steps: WolfStep[] = ['sleep', 'wolves'];
  if (hasRole(s, 'doctor')) steps.push('doctor');
  if (hasRole(s, 'seer')) steps.push('seer');
  steps.push('wake');
  return steps;
}

function startNight(ctx: GameCtx, s: State) {
  s.phase = 'night';
  s.day += 1;
  s.steps = nightSteps(s);
  s.step = 'sleep';
  s.wolvesTarget = null;
  s.doctorSave = null;
  s.seerCheck = null;
  s.hunterTarget = null;
  s.hunterAfter = null;
  s.auto = {};
  s.accusations = [];
  ctx.fx('tick');
}

function checkWinner(s: State): 'wolves' | 'village' | null {
  const alive = s.participants.filter((id) => s.alive[id]);
  const wolves = alive.filter((id) => s.roles[id] === 'wolf').length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'wolves';
  return null;
}

function finishIfWon(ctx: GameCtx, s: State): boolean {
  const w = checkWinner(s);
  if (!w) return false;
  s.winner = w;
  s.phase = 'over';
  s.log.push(w === 'wolves' ? 'فازت الذئاب!' : 'فازت القرية!');
  ctx.fx('win');
  return true;
}

function name(ctx: GameCtx, id: string | null) {
  return id ? ctx.playerName(id) : 'لا أحد';
}

function kill(s: State, id: string) {
  s.alive[id] = false;
}

function resolveNight(ctx: GameCtx, s: State) {
  const deaths: string[] = [];
  if (s.wolvesTarget && s.wolvesTarget !== s.doctorSave && s.alive[s.wolvesTarget]) {
    deaths.push(s.wolvesTarget);
    kill(s, s.wolvesTarget);
  }
  s.log.push(
    `الليلة ${s.day}: الذئاب اختاروا ${name(ctx, s.wolvesTarget)}` +
      (hasRole(s, 'doctor') ? ` — الطبيب حمى ${name(ctx, s.doctorSave)}` : '') +
      (hasRole(s, 'seer') ? ` — العرّافة كشفت ${name(ctx, s.seerCheck)}` : ''),
  );
  s.log.push(deaths.length ? `مات: ${deaths.map((d) => name(ctx, d)).join('، ')}` : 'لم يمت أحد');
  s.lastDeaths = deaths;
  s.lastEliminated = undefined;
  s.phase = 'day';
  const hunterDied = deaths.some((d) => s.roles[d] === 'hunter');
  s.steps = hunterDied ? ['announce', 'hunter', 'vote'] : ['announce', 'vote'];
  s.hunterAfter = hunterDied ? 'night' : null;
  s.step = 'announce';
  ctx.fx(deaths.length ? 'death' : 'reveal');
  if (!hunterDied) finishIfWon(ctx, s);
}

function eliminate(ctx: GameCtx, s: State, target: string | null) {
  s.lastEliminated = target;
  if (target) {
    kill(s, target);
    s.log.push(`النهار ${s.day}: القرية أقصت ${name(ctx, target)}`);
    ctx.fx('death', target);
    if (s.roles[target] === 'hunter') {
      s.hunterAfter = 'day';
      s.steps = [...s.steps, 'hunter'];
      s.step = 'hunter';
      return;
    }
  } else {
    s.log.push(`النهار ${s.day}: لم يُقصَ أحد`);
  }
  if (!finishIfWon(ctx, s)) startNight(ctx, s);
}

function hunterShoot(ctx: GameCtx, s: State) {
  if (s.hunterTarget && s.alive[s.hunterTarget]) {
    kill(s, s.hunterTarget);
    s.log.push(`الصياد أخذ معه ${name(ctx, s.hunterTarget)}`);
    ctx.fx('death', s.hunterTarget);
  }
  const after = s.hunterAfter;
  s.hunterAfter = null;
  s.hunterTarget = null;
  if (finishIfWon(ctx, s)) return;
  if (after === 'night') s.step = 'vote';
  else startNight(ctx, s);
}

function resetGame(ctx: GameCtx, s: State) {
  deal(s);
  s.day = 0;
  s.winner = null;
  s.lastDeaths = null;
  s.lastEliminated = undefined;
  s.log = [];
  s.seerKnown = {};
  s.accusedDay = 0;
  startNight(ctx, s);
  ctx.fx('start');
}

export const werewolf: GameModule<State, WerewolfSettings> = {
  id: 'werewolf',

  start(ctx, participants, settings) {
    const narratorId =
      settings.narratorId && participants.includes(settings.narratorId)
        ? settings.narratorId
        : participants[0];
    const s: State = {
      settings,
      narratorId,
      participants: participants.filter((id) => id !== narratorId),
      roles: {},
      alive: {},
      phase: 'night',
      day: 0,
      steps: [],
      step: 'sleep',
      wolvesTarget: null,
      doctorSave: null,
      seerCheck: null,
      hunterTarget: null,
      hunterAfter: null,
      lastDeaths: null,
      lastEliminated: undefined,
      winner: null,
      log: [],
      auto: {},
      seerKnown: {},
      accusations: [],
      accusedDay: 0,
    };
    resetGame(ctx, s);
    return s;
  },

  act(ctx, s, by, a) {
    if (by !== s.narratorId) throw new GameError('فقط الراوي يتحكم في اللعبة');
    const target = isStr(a.target) && s.participants.includes(a.target) ? a.target : null;
    switch (a.type) {
      case 'pick': {
        if (!target || !s.alive[target]) return;
        const toggle = (cur: string | null) => (cur === target ? null : target);
        if (s.step === 'wolves') s.wolvesTarget = toggle(s.wolvesTarget);
        else if (s.step === 'doctor') s.doctorSave = toggle(s.doctorSave);
        else if (s.step === 'seer') s.seerCheck = toggle(s.seerCheck);
        else if (s.step === 'hunter') s.hunterTarget = toggle(s.hunterTarget);
        return;
      }
      case 'next': {
        if (s.phase === 'over') return;
        if (s.step === 'wake') return resolveNight(ctx, s);
        if (s.step === 'hunter') return hunterShoot(ctx, s);
        if (s.step === 'vote') return eliminate(ctx, s, null);
        const i = s.steps.indexOf(s.step);
        s.step = s.steps[Math.min(i + 1, s.steps.length - 1)];
        return;
      }
      case 'eliminate': {
        if (s.phase !== 'day' || s.step !== 'vote') return;
        if (target && !s.alive[target]) return;
        eliminate(ctx, s, target);
        return;
      }
      case 'toggleAlive': {
        if (!target || s.phase === 'over') return;
        s.alive[target] = !s.alive[target];
        s.log.push(`الراوي غيّر حالة ${name(ctx, target)}`);
        finishIfWon(ctx, s);
        return;
      }
      case 'end': {
        s.winner = checkWinner(s);
        s.phase = 'over';
        ctx.fx('win');
        return;
      }
      case 'again': {
        resetGame(ctx, s);
        return;
      }
    }
  },

  view(ctx, s, me): WerewolfView {
    const isNarrator = me === s.narratorId;
    const myRole = isNarrator ? null : (s.roles[me] ?? null);
    const roleCounts: Partial<Record<WolfRole, number>> = {};
    for (const r of Object.values(s.roles)) roleCounts[r] = (roleCounts[r] ?? 0) + 1;
    return {
      game: 'werewolf',
      phase: s.phase,
      narratorId: s.narratorId,
      participants: s.participants,
      day: s.day,
      alive: s.alive,
      myRole,
      wolfPack:
        myRole === 'wolf'
          ? s.participants.filter((id) => s.roles[id] === 'wolf' && id !== me)
          : null,
      lastDeaths: s.phase === 'night' ? null : s.lastDeaths,
      lastEliminated: s.lastEliminated,
      winner: s.winner,
      revealed: s.phase === 'over' ? s.roles : null,
      narrator: isNarrator
        ? {
            roles: s.roles,
            step: s.step,
            steps: s.steps,
            wolvesTarget: s.wolvesTarget,
            doctorSave: s.doctorSave,
            seerCheck: s.seerCheck,
            hunterTarget: s.hunterTarget,
            hunterAfter: s.hunterAfter,
            log: s.log,
            auto: s.auto,
          }
        : null,
      roleCounts,
      accusations: s.phase === 'day' ? s.accusations : [],
    };
  },

  botPlan(ctx, s) {
    if (s.phase === 'over') return false;
    let changed = false;
    const alive = s.participants.filter((id) => s.alive[id]);
    const aliveWith = (r: WolfRole) => alive.filter((id) => s.roles[id] === r);

    if (s.phase === 'night') {
      if (s.step === 'wolves' && !s.wolvesTarget) {
        const wolves = aliveWith('wolf');
        const prey = alive.filter((id) => s.roles[id] !== 'wolf');
        // only decide alone when every living wolf is a bot
        if (wolves.length && wolves.every((id) => ctx.isBot(id)) && prey.length) {
          s.wolvesTarget = pick(prey);
          s.auto.wolves = true;
          changed = true;
        }
      }
      if (s.step === 'doctor' && !s.doctorSave) {
        const doc = aliveWith('doctor')[0];
        if (doc && ctx.isBot(doc)) {
          s.doctorSave = Math.random() < 0.3 ? doc : pick(alive);
          s.auto.doctor = true;
          changed = true;
        }
      }
      if (s.step === 'seer' && !s.seerCheck) {
        const seer = aliveWith('seer')[0];
        if (seer && ctx.isBot(seer)) {
          const others = alive.filter((id) => id !== seer);
          const unknown = others.filter((id) => !(id in s.seerKnown));
          const target = unknown.length ? pick(unknown) : others.length ? pick(others) : null;
          if (target) {
            s.seerCheck = target;
            s.seerKnown[target] = s.roles[target] === 'wolf';
            s.auto.seer = true;
            changed = true;
          }
        }
      }
    }

    if (s.step === 'hunter' && !s.hunterTarget) {
      const hunter = s.participants.find((id) => s.roles[id] === 'hunter');
      const others = alive.filter((id) => id !== hunter);
      if (hunter && ctx.isBot(hunter) && others.length) {
        s.hunterTarget = pick(others);
        s.auto.hunter = true;
        changed = true;
      }
    }

    // bots speak up during the day
    if (s.phase === 'day' && s.accusedDay !== s.day) {
      s.accusedDay = s.day;
      s.accusations = [];
      const seerBot = alive.find((id) => s.roles[id] === 'seer' && ctx.isBot(id));
      const knownWolf = seerBot ? alive.find((id) => s.seerKnown[id]) : undefined;
      for (const b of alive.filter((id) => ctx.isBot(id))) {
        const others = alive.filter((id) => id !== b);
        if (!others.length) continue;
        let target: string;
        if (s.roles[b] === 'wolf') {
          const innocents = others.filter((id) => s.roles[id] !== 'wolf');
          target = pick(innocents.length ? innocents : others);
        } else if (knownWolf && knownWolf !== b && (b === seerBot || Math.random() < 0.5)) {
          target = knownWolf;
        } else {
          target = pick(others);
        }
        s.accusations.push({ by: b, target });
      }
      changed = true;
    }
    return changed;
  },

  onLeave(ctx, s, id) {
    if (s.participants.includes(id)) {
      s.alive[id] = false;
      if (s.phase !== 'over') finishIfWon(ctx, s);
    }
  },
};
