/**
 * «الذئب» — narrator-led Werewolf. The narrator's phone runs the script and records every night pick;
 * players only see their own role. Roles: wolf, big bad wolf, white wolf, villager, seer, doctor, guard,
 * witch, hunter, tanner, plus an elected mayor.
 */
import {
  isWolfRole,
  type WerewolfSettings,
  type WerewolfView,
  type WolfPickStep,
  type WolfRole,
  type WolfStep,
  type WolfWinner,
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
  stepIdx: number;
  step: WolfStep;
  wolvesTarget: string | null;
  bigwolfTarget: string | null;
  whitewolfTarget: string | null;
  guardSave: string | null;
  lastGuard: string | null;
  doctorSave: string | null;
  seerCheck: string | null;
  witchHeal: string | null;
  witchPoison: string | null;
  healUsed: boolean;
  poisonUsed: boolean;
  hunterTarget: string | null;
  hunterAfter: 'night' | 'day' | null;
  mayorId: string | null;
  mayorPick: string | null;
  wolfDied: boolean; // the big bad wolf loses his extra victim once any wolf has died
  lastDeaths: string[] | null;
  lastEliminated: string | null | undefined;
  winner: WolfWinner | null;
  log: string[];
  auto: Partial<Record<WolfPickStep, boolean>>;
  seerKnown: Record<string, boolean>; // what a bot seer has learned (true = wolf)
  accusations: { by: string; target: string }[];
  accusedDay: number;
}

const WIN_TEXT: Record<WolfWinner, string> = {
  wolves: 'فازت الذئاب!',
  village: 'فازت القرية!',
  tanner: 'فاز المجنون! أقصته القرية كما أراد',
  whitewolf: 'فاز الذئب الأبيض وحده!',
};

function autoWolves(n: number) {
  if (n <= 5) return 1;
  if (n <= 9) return 2;
  return 3;
}

function deal(s: State) {
  const n = s.participants.length;
  const wolves = Math.max(1, Math.min(s.settings.wolves || autoWolves(n), Math.floor((n - 1) / 2)));
  const pack: WolfRole[] = Array(wolves).fill('wolf');
  if (s.settings.whitewolf && wolves >= 2) pack[0] = 'whitewolf';
  if (s.settings.bigwolf) {
    const i = pack.indexOf('wolf');
    if (i >= 0) pack[i] = 'bigwolf';
  }
  const specials: WolfRole[] = [];
  if (s.settings.seer) specials.push('seer');
  if (s.settings.doctor) specials.push('doctor');
  if (s.settings.witch) specials.push('witch');
  if (s.settings.guard) specials.push('guard');
  if (s.settings.hunter) specials.push('hunter');
  if (s.settings.tanner) specials.push('tanner');
  const pool: WolfRole[] = [...pack];
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

const hasRole = (s: State, r: WolfRole) => Object.values(s.roles).includes(r);
const holder = (s: State, r: WolfRole) => s.participants.find((id) => s.roles[id] === r) ?? null;
const aliveIds = (s: State) => s.participants.filter((id) => s.alive[id]);

function nightSteps(s: State): WolfStep[] {
  const steps: WolfStep[] = ['sleep', 'wolves'];
  if (hasRole(s, 'bigwolf') && !s.wolfDied) steps.push('bigwolf');
  if (hasRole(s, 'whitewolf') && s.day % 2 === 0) steps.push('whitewolf');
  if (hasRole(s, 'guard')) steps.push('guard');
  if (hasRole(s, 'doctor')) steps.push('doctor');
  if (hasRole(s, 'seer')) steps.push('seer');
  if (hasRole(s, 'witch')) steps.push('witch');
  steps.push('wake');
  return steps;
}

function setSteps(s: State, steps: WolfStep[]) {
  s.steps = steps;
  s.stepIdx = 0;
  s.step = steps[0];
}

function startNight(ctx: GameCtx, s: State) {
  s.phase = 'night';
  s.day += 1;
  setSteps(s, nightSteps(s));
  s.wolvesTarget = null;
  s.bigwolfTarget = null;
  s.whitewolfTarget = null;
  s.guardSave = null;
  s.doctorSave = null;
  s.seerCheck = null;
  s.witchHeal = null;
  s.witchPoison = null;
  s.hunterTarget = null;
  s.hunterAfter = null;
  s.mayorPick = null;
  s.auto = {};
  s.accusations = [];
  ctx.fx('tick');
}

function checkWinner(s: State): WolfWinner | null {
  const alive = aliveIds(s);
  const wolves = alive.filter((id) => isWolfRole(s.roles[id]));
  const white = wolves.some((id) => s.roles[id] === 'whitewolf');
  const pack = wolves.length - (white ? 1 : 0);
  const others = alive.length - wolves.length;
  if (!wolves.length) return 'village';
  if (white && pack === 0 && others <= 1) return 'whitewolf';
  if (!white && pack >= others) return 'wolves';
  return null;
}

function finishIfWon(ctx: GameCtx, s: State): boolean {
  const w = checkWinner(s);
  if (!w) return false;
  endGame(ctx, s, w);
  return true;
}

function endGame(ctx: GameCtx, s: State, w: WolfWinner | null) {
  s.winner = w;
  s.phase = 'over';
  if (w) s.log.push(WIN_TEXT[w]);
  ctx.fx('win');
}

const name = (ctx: GameCtx, id: string | null) => (id ? ctx.playerName(id) : 'لا أحد');

function kill(s: State, id: string) {
  s.alive[id] = false;
  if (isWolfRole(s.roles[id])) s.wolfDied = true;
}

function resolveNight(ctx: GameCtx, s: State) {
  const attacked = [...new Set([s.wolvesTarget, s.bigwolfTarget, s.whitewolfTarget])].filter((id): id is string => !!id && s.alive[id]);
  const saved = new Set([s.doctorSave, s.guardSave, s.witchHeal].filter(Boolean));
  const deaths = attacked.filter((id) => !saved.has(id));
  if (s.witchPoison && s.alive[s.witchPoison] && !deaths.includes(s.witchPoison)) deaths.push(s.witchPoison);
  if (s.witchHeal) s.healUsed = true;
  if (s.witchPoison) s.poisonUsed = true;
  s.lastGuard = s.guardSave;
  const mayorWasAlive = !!s.mayorId && s.alive[s.mayorId];
  for (const d of deaths) kill(s, d);

  const parts = [`الليلة ${s.day}: الذئاب اختاروا ${name(ctx, s.wolvesTarget)}`];
  if (s.steps.includes('bigwolf')) parts.push(`الذئب الكبير اختار ${name(ctx, s.bigwolfTarget)}`);
  if (s.steps.includes('whitewolf')) parts.push(`الذئب الأبيض اختار ${name(ctx, s.whitewolfTarget)}`);
  if (hasRole(s, 'guard')) parts.push(`الحارس حرس ${name(ctx, s.guardSave)}`);
  if (hasRole(s, 'doctor')) parts.push(`الطبيب حمى ${name(ctx, s.doctorSave)}`);
  if (hasRole(s, 'seer')) parts.push(`العرّافة كشفت ${name(ctx, s.seerCheck)}`);
  if (s.witchHeal) parts.push(`الساحرة أنقذت ${name(ctx, s.witchHeal)}`);
  if (s.witchPoison) parts.push(`الساحرة سمّمت ${name(ctx, s.witchPoison)}`);
  s.log.push(parts.join(' — '));
  s.log.push(deaths.length ? `مات: ${deaths.map((d) => name(ctx, d)).join('، ')}` : 'لم يمت أحد');

  s.lastDeaths = deaths;
  s.lastEliminated = undefined;
  s.phase = 'day';
  const hunterDied = deaths.some((d) => s.roles[d] === 'hunter');
  const needMayor = (s.settings.mayor && !s.mayorId) || (mayorWasAlive && deaths.includes(s.mayorId!));
  setSteps(s, ['announce', ...(hunterDied ? (['hunter'] as const) : []), ...(needMayor ? (['mayor'] as const) : []), 'vote']);
  s.hunterAfter = hunterDied ? 'night' : null;
  s.mayorPick = null;
  s.hunterTarget = null;
  s.auto = {};
  ctx.fx(deaths.length ? 'death' : 'reveal');
  if (!hunterDied) finishIfWon(ctx, s);
}

function advance(ctx: GameCtx, s: State) {
  if (s.stepIdx + 1 < s.steps.length) {
    s.stepIdx += 1;
    s.step = s.steps[s.stepIdx];
    return;
  }
  if (s.phase === 'day' && !finishIfWon(ctx, s)) startNight(ctx, s);
}

/** Insert follow-up steps (hunter / mayor) right after the current one. */
function insertNext(s: State, steps: WolfStep[]) {
  s.steps = [...s.steps.slice(0, s.stepIdx + 1), ...steps, ...s.steps.slice(s.stepIdx + 1)];
}

function eliminate(ctx: GameCtx, s: State, target: string | null) {
  s.lastEliminated = target;
  if (!target) {
    s.log.push(`النهار ${s.day}: لم يُقصَ أحد`);
    if (!finishIfWon(ctx, s)) startNight(ctx, s);
    return;
  }
  const wasMayor = s.mayorId === target;
  kill(s, target);
  s.log.push(`النهار ${s.day}: القرية أقصت ${name(ctx, target)}`);
  ctx.fx('death', target);
  if (s.roles[target] === 'tanner') return endGame(ctx, s, 'tanner');
  const follow: WolfStep[] = [];
  if (s.roles[target] === 'hunter') {
    follow.push('hunter');
    s.hunterAfter = 'day';
  }
  if (wasMayor) follow.push('mayor');
  if (!follow.includes('hunter') && finishIfWon(ctx, s)) return;
  if (!follow.length) return void startNight(ctx, s);
  s.auto = {};
  s.mayorPick = null;
  insertNext(s, follow);
  advance(ctx, s);
}

function hunterShoot(ctx: GameCtx, s: State) {
  const t = s.hunterTarget;
  if (t && s.alive[t]) {
    const wasMayor = s.mayorId === t;
    kill(s, t);
    s.log.push(`الصيّاد أخذ معه ${name(ctx, t)}`);
    ctx.fx('death', t);
    if (wasMayor && !s.steps.slice(s.stepIdx + 1).includes('mayor')) insertNext(s, ['mayor']);
  }
  s.hunterAfter = null;
  s.hunterTarget = null;
  if (finishIfWon(ctx, s)) return;
  advance(ctx, s);
}

function setMayor(ctx: GameCtx, s: State) {
  const prev = s.mayorId;
  const p = s.mayorPick && s.alive[s.mayorPick] ? s.mayorPick : null;
  s.mayorId = p;
  s.mayorPick = null;
  if (p) s.log.push(prev ? `${name(ctx, prev)} سلّم العمادة إلى ${name(ctx, p)}` : `انتخبت القرية ${name(ctx, p)} عمدة`);
  else if (prev) s.log.push('لم يعد للقرية عمدة');
  ctx.fx('reveal');
  advance(ctx, s);
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
  s.healUsed = false;
  s.poisonUsed = false;
  s.lastGuard = null;
  s.mayorId = null;
  s.wolfDied = false;
  startNight(ctx, s);
  ctx.fx('start');
}

/** Is `target` a legal pick for the current step? */
function canPick(s: State, target: string): boolean {
  if (!s.alive[target]) return false;
  const role = s.roles[target];
  switch (s.step) {
    case 'wolves':
      return !isWolfRole(role);
    case 'bigwolf':
      return !isWolfRole(role) && target !== s.wolvesTarget;
    case 'whitewolf':
      return isWolfRole(role) && role !== 'whitewolf';
    case 'guard':
      return target !== s.lastGuard;
    case 'witch':
      return !s.poisonUsed;
    case 'hunter':
      return role !== 'hunter';
    default:
      return true;
  }
}

export const werewolf: GameModule<State, WerewolfSettings> = {
  id: 'werewolf',

  start(ctx, participants, settings) {
    const narratorId = settings.narratorId && participants.includes(settings.narratorId) ? settings.narratorId : participants[0];
    const s: State = {
      settings,
      narratorId,
      participants: participants.filter((id) => id !== narratorId),
      roles: {},
      alive: {},
      phase: 'night',
      day: 0,
      steps: [],
      stepIdx: 0,
      step: 'sleep',
      wolvesTarget: null,
      bigwolfTarget: null,
      whitewolfTarget: null,
      guardSave: null,
      lastGuard: null,
      doctorSave: null,
      seerCheck: null,
      witchHeal: null,
      witchPoison: null,
      healUsed: false,
      poisonUsed: false,
      hunterTarget: null,
      hunterAfter: null,
      mayorId: null,
      mayorPick: null,
      wolfDied: false,
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
        if (!target || !canPick(s, target)) return;
        const toggle = (cur: string | null) => (cur === target ? null : target);
        if (s.step === 'wolves') s.wolvesTarget = toggle(s.wolvesTarget);
        else if (s.step === 'bigwolf') s.bigwolfTarget = toggle(s.bigwolfTarget);
        else if (s.step === 'whitewolf') s.whitewolfTarget = toggle(s.whitewolfTarget);
        else if (s.step === 'guard') s.guardSave = toggle(s.guardSave);
        else if (s.step === 'doctor') s.doctorSave = toggle(s.doctorSave);
        else if (s.step === 'seer') s.seerCheck = toggle(s.seerCheck);
        else if (s.step === 'witch') s.witchPoison = toggle(s.witchPoison);
        else if (s.step === 'hunter') s.hunterTarget = toggle(s.hunterTarget);
        else if (s.step === 'mayor') s.mayorPick = toggle(s.mayorPick);
        return;
      }
      case 'heal': {
        // the witch's healing potion, on one of tonight's victims
        if (s.step !== 'witch' || s.healUsed || !target || ![s.wolvesTarget, s.bigwolfTarget].includes(target)) return;
        s.witchHeal = s.witchHeal === target ? null : target;
        return;
      }
      case 'next': {
        if (s.phase === 'over') return;
        if (s.step === 'wake') return resolveNight(ctx, s);
        if (s.step === 'hunter') return hunterShoot(ctx, s);
        if (s.step === 'mayor') return setMayor(ctx, s);
        if (s.step === 'vote') return eliminate(ctx, s, null);
        advance(ctx, s);
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
        if (s.alive[target]) kill(s, target);
        else s.alive[target] = true;
        s.log.push(`الراوي غيّر حالة ${name(ctx, target)}`);
        finishIfWon(ctx, s);
        return;
      }
      case 'end': {
        endGame(ctx, s, checkWinner(s));
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
      wolfPack: isWolfRole(myRole) ? s.participants.filter((id) => isWolfRole(s.roles[id]) && id !== me) : null,
      lastDeaths: s.phase === 'night' ? null : s.lastDeaths,
      lastEliminated: s.lastEliminated,
      winner: s.winner,
      mayorId: s.mayorId,
      revealed: s.phase === 'over' ? s.roles : null,
      narrator: isNarrator
        ? {
            roles: s.roles,
            step: s.step,
            steps: s.steps,
            wolvesTarget: s.wolvesTarget,
            bigwolfTarget: s.bigwolfTarget,
            whitewolfTarget: s.whitewolfTarget,
            guardSave: s.guardSave,
            lastGuard: s.lastGuard,
            doctorSave: s.doctorSave,
            seerCheck: s.seerCheck,
            witchHeal: s.witchHeal,
            witchPoison: s.witchPoison,
            healUsed: s.healUsed,
            poisonUsed: s.poisonUsed,
            hunterTarget: s.hunterTarget,
            hunterAfter: s.hunterAfter,
            mayorPick: s.mayorPick,
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
    const alive = aliveIds(s);
    const isBotAlive = (r: WolfRole) => {
      const id = holder(s, r);
      return id && s.alive[id] && ctx.isBot(id) ? id : null;
    };
    const prey = alive.filter((id) => !isWolfRole(s.roles[id]));

    if (s.phase === 'night' && !s.auto[s.step as WolfPickStep]) {
      if (s.step === 'wolves' && !s.wolvesTarget) {
        const wolves = alive.filter((id) => isWolfRole(s.roles[id]));
        // only decide alone when every living wolf is a bot
        if (wolves.length && wolves.every((id) => ctx.isBot(id)) && prey.length) {
          s.wolvesTarget = pick(prey);
          s.auto.wolves = changed = true;
        }
      }
      if (s.step === 'bigwolf' && !s.bigwolfTarget && isBotAlive('bigwolf')) {
        const more = prey.filter((id) => id !== s.wolvesTarget);
        if (more.length) s.bigwolfTarget = pick(more);
        s.auto.bigwolf = changed = true;
      }
      if (s.step === 'whitewolf' && isBotAlive('whitewolf')) {
        const pack = alive.filter((id) => s.roles[id] === 'wolf' || s.roles[id] === 'bigwolf');
        if (pack.length && Math.random() < 0.6) s.whitewolfTarget = pick(pack);
        s.auto.whitewolf = changed = true;
      }
      if (s.step === 'guard' && !s.guardSave && isBotAlive('guard')) {
        const options = alive.filter((id) => id !== s.lastGuard);
        if (options.length) s.guardSave = pick(options);
        s.auto.guard = changed = true;
      }
      if (s.step === 'doctor' && !s.doctorSave) {
        const doc = isBotAlive('doctor');
        if (doc) {
          s.doctorSave = Math.random() < 0.3 ? doc : pick(alive);
          s.auto.doctor = changed = true;
        }
      }
      if (s.step === 'seer' && !s.seerCheck) {
        const seer = isBotAlive('seer');
        if (seer) {
          const others = alive.filter((id) => id !== seer);
          const unknown = others.filter((id) => !(id in s.seerKnown));
          const target = unknown.length ? pick(unknown) : others.length ? pick(others) : null;
          if (target) {
            s.seerCheck = target;
            s.seerKnown[target] = isWolfRole(s.roles[target]);
            s.auto.seer = changed = true;
          }
        }
      }
      if (s.step === 'witch') {
        const witch = isBotAlive('witch');
        if (witch) {
          const victims = [s.wolvesTarget, s.bigwolfTarget].filter((id): id is string => !!id && s.alive[id]);
          if (!s.healUsed && victims.length) {
            const mine = victims.find((id) => id === witch);
            if (mine || Math.random() < 0.5) s.witchHeal = mine ?? victims[0];
          }
          if (!s.poisonUsed) {
            const others = alive.filter((id) => id !== witch && !victims.includes(id));
            if (others.length && s.day >= 2 && Math.random() < 0.2) s.witchPoison = pick(others);
          }
          s.auto.witch = changed = true;
        }
      }
    }

    if (s.step === 'hunter' && !s.hunterTarget && !s.auto.hunter) {
      const hunter = holder(s, 'hunter');
      const others = alive.filter((id) => id !== hunter);
      if (hunter && ctx.isBot(hunter) && others.length) {
        s.hunterTarget = pick(others);
        s.auto.hunter = changed = true;
      }
    }

    // a dying bot mayor names their successor (the first election is the village's job)
    if (s.step === 'mayor' && s.mayorId && !s.alive[s.mayorId] && ctx.isBot(s.mayorId) && !s.auto.mayor && alive.length) {
      s.mayorPick = pick(alive);
      s.auto.mayor = changed = true;
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
        if (isWolfRole(s.roles[b])) {
          const innocents = others.filter((id) => !isWolfRole(s.roles[id]));
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
      kill(s, id);
      if (s.phase !== 'over') finishIfWon(ctx, s);
    }
  },
};
