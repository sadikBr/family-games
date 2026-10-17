/**
 * «مشوار الحياة» — server rules.
 *
 * Roll one die and walk the road (src/shared/life-board.ts). Forks, graduation, the house and
 * retirement are stop spaces: the pawn stops there whatever the die said. Paydays pay when you pass
 * or land on them (minus the interest on your loans). One space is resolved per turn; a decision is
 * asked only when needed (which road, which job, which house, insurance, a risky project).
 * Money below zero turns into loans automatically. Retiring sells the house and repays the loans;
 * the first three to retire get a bonus. When everyone has retired, the richest wins.
 */
import {
  LIFE_RULES as R,
  type LifeCard,
  type LifeCardKind,
  type LifeChoice,
  type LifeHouse,
  type LifeJob,
  type LifeLength,
  type LifeMove,
  type LifePlayer,
  type LifeScore,
  type LifeSettings,
  type LifeTokenKind,
  type LifeView,
  lifeMoney,
} from '../../src/shared/games/life';
import { LIFE_STOPS, lifeBoard, lifePaydaysLeft, lifeStepsLeft, type LifeBoard } from '../../src/shared/life-board';
import { Feed, randDelay } from '../cardkit';
import { DEGREE_JOBS, FAMILY_CARDS, HOUSES, LIFE_EVENTS, RISK_PROJECTS, SCHOOL_EVENTS, WORK_JOBS, type LifeEvent } from '../life-content';
import { GameError, type GameCtx, type GameModule } from '../types';
import { Deck, clamp, isNum, isStr, pick, randInt, shuffle } from '../util';

interface Pl extends LifePlayer {
  /** fork node → the branch chosen there (index into its `next`) */
  ways: Record<number, number>;
}

export interface LifeState {
  settings: LifeSettings;
  players: Pl[];
  turnIdx: number;
  phase: LifeView['phase'];
  choice: LifeChoice | null;
  dice: number | null;
  rollId: number;
  move: LifeMove | null;
  moveN: number;
  card: LifeCard | null;
  cardN: number;
  school: Deck<LifeEvent>;
  life: Deck<LifeEvent>;
  family: Deck<{ text: string; kind: LifeTokenKind }>;
  retiredN: number;
  winner: string | null;
  feed: Feed;
  /** bumps on every accepted action (bot keys) */
  seq: number;
  /** the last action threw the die: bots wait for the animation */
  anim: boolean;
}

const boardOf = (s: LifeState): LifeBoard => lifeBoard(s.settings.length);
const cur = (s: LifeState) => s.players[s.turnIdx];
const P = (s: LifeState, id: string) => s.players.find((p) => p.id === id);
const name = (ctx: GameCtx, id: string) => ctx.playerName(id);

/** Money in feed lines: thousands separated, isolated so the sign stays put in Arabic text. */
export const dh = (n: number) => `⁦${lifeMoney(n)}⁩`;

/* ---------------- money ---------------- */

/** Money below zero becomes loans (10,000 each). */
function cover(ctx: GameCtx, s: LifeState, p: Pl) {
  let n = 0;
  while (p.money < 0) {
    p.money += R.loan;
    p.loans += 1;
    n += 1;
  }
  if (n) s.feed.push(`${name(ctx, p.id)} أخذ ${n === 1 ? 'قرضاً' : `${n} قروض`} من البنك`, { by: p.id });
}

function addMoney(ctx: GameCtx, s: LifeState, p: Pl, amount: number) {
  p.money += amount;
  cover(ctx, s, p);
}

function payday(ctx: GameCtx, s: LifeState, p: Pl, landed: boolean) {
  const interest = p.loans * R.interest;
  const net = p.salary - interest;
  addMoney(ctx, s, p, net);
  s.feed.push(`${name(ctx, p.id)} قبض راتبه ${dh(p.salary)}${interest ? ` (فائدة القروض ${dh(-interest)})` : ''}`, { by: p.id });
  if (landed) setCard(s, p.id, 'payday', 'يوم الأجرة', interest ? `راتبك ${dh(p.salary)}، بعد خصم فائدة القروض ${dh(interest)}.` : `قبضت راتبك ${p.job ? `كـ${p.job.title}` : ''}.`, net);
  ctx.fx('correct', p.id);
}

function setCard(s: LifeState, by: string, kind: LifeCardKind, title: string, text: string, amount?: number) {
  s.card = { id: ++s.cardN, by, kind, title, text, amount, move: s.move?.id ?? 0 };
}

/* ---------------- scoring ---------------- */

export function scoreOf(p: LifePlayer): LifeScore {
  const house = p.house?.sell ?? 0;
  const tokens = p.tokens.length * R.tokenValue;
  const loans = p.loans * R.loan;
  return { money: p.money, house, tokens, loans, total: p.money + house + tokens - loans };
}

function finish(ctx: GameCtx, s: LifeState) {
  if (s.phase === 'final') return;
  for (const p of s.players) if (!p.score) p.score = scoreOf(p);
  const ranked = [...s.players].sort((a, b) => b.score!.total - a.score!.total || (a.retired ?? 99) - (b.retired ?? 99));
  s.winner = ranked[0]?.id ?? null;
  s.phase = 'final';
  s.choice = null;
  if (s.winner) s.feed.push(`${name(ctx, s.winner)} عاش أغنى مشوار!`, { by: s.winner });
  ctx.fx('win', s.winner ?? undefined);
}

function retire(ctx: GameCtx, s: LifeState, p: Pl) {
  s.retiredN += 1;
  p.retired = s.retiredN;
  p.bonus = R.retireBonus[s.retiredN - 1] ?? 0;
  p.money += p.bonus;
  p.score = scoreOf(p);
  const parts = [p.bonus ? `مكافأة التقاعد ${dh(p.bonus)}` : '', p.house ? `باع ${p.house.title} بـ ${dh(p.house.sell)}` : '', p.loans ? `سدّد ${dh(p.loans * R.loan)}` : ''].filter(Boolean);
  setCard(s, p.id, 'retire', 'التقاعد', `${parts.join('، ')}${parts.length ? '. ' : ''}المجموع: ${dh(p.score.total)}`, p.bonus || undefined);
  s.feed.push(`${name(ctx, p.id)} تقاعد ${p.retired === 1 ? 'أولاً' : `في المرتبة ${p.retired}`}`, { by: p.id });
  ctx.fx('reveal', p.id);
}

/* ---------------- turns ---------------- */

function endTurn(ctx: GameCtx, s: LifeState) {
  s.choice = null;
  if (s.phase === 'final') return;
  s.phase = 'roll';
  if (s.players.every((p) => p.retired !== null)) return finish(ctx, s);
  for (let k = 0; k < s.players.length; k++) {
    s.turnIdx = (s.turnIdx + 1) % s.players.length;
    if (cur(s).retired === null) return;
  }
}

/** Walk `steps` spaces (stopping at stop spaces), collecting paydays on the way. */
export function walk(ctx: GameCtx, s: LifeState, p: Pl, steps: number): number[] {
  const { nodes } = boardOf(s);
  const path: number[] = [];
  for (let k = 0; k < steps; k++) {
    const nx = nodes[p.pos].next;
    if (!nx.length) break;
    const to = nx.length > 1 ? nx[p.ways[p.pos] ?? 0] : nx[0];
    p.pos = to;
    path.push(to);
    const kind = nodes[to].kind;
    if (kind === 'payday') payday(ctx, s, p, k === steps - 1);
    if (LIFE_STOPS.includes(kind)) break;
  }
  return path;
}

function applyEvent(ctx: GameCtx, s: LifeState, p: Pl, kind: LifeCardKind, e: LifeEvent) {
  const fx = e.fx;
  let amount = 0;
  let text = e.text;
  switch (fx.t) {
    case 'money':
      amount = fx.amount;
      break;
    case 'insured':
      if (p.insured) text += ' التأمين دفع عنك!';
      else amount = fx.amount;
      break;
    case 'salary':
      amount = p.salary * fx.times;
      break;
    case 'raise':
      if (p.job) {
        p.salary += fx.amount;
        text += ` راتبك الآن ${dh(p.salary)}.`;
      } else amount = fx.amount;
      break;
    case 'perHead':
      amount = fx.amount * (1 + p.tokens.length);
      break;
    case 'token':
      p.tokens.push(fx.kind);
      break;
    case 'each': {
      const others = s.players.filter((o) => o.id !== p.id && o.retired === null);
      for (const o of others) {
        if (fx.amount > 0) {
          if (o.money < fx.amount) continue; // a gift never forces a loan
          o.money -= fx.amount;
          amount += fx.amount;
        } else {
          addMoney(ctx, s, o, -fx.amount);
          amount += fx.amount;
        }
      }
      break;
    }
  }
  if (amount) {
    p.money += amount;
    cover(ctx, s, p);
  }
  setCard(s, p.id, kind, e.title, text, amount || undefined);
  s.feed.push(`${name(ctx, p.id)}: ${e.title}${amount ? ` ${amount > 0 ? '+' : ''}${dh(amount)}` : ''}`, { by: p.id });
  ctx.fx(amount < 0 ? 'buzz' : 'correct', p.id);
}

/** Resolve the space the player stopped on. Sets a choice when one is needed. */
function land(ctx: GameCtx, s: LifeState, p: Pl) {
  const b = boardOf(s);
  const node = b.nodes[p.pos];
  switch (node.kind) {
    case 'event': {
      const young = node.zone === 'school' || node.zone === 'uni';
      applyEvent(ctx, s, p, young ? 'school' : 'event', (young ? s.school : s.life).draw());
      return;
    }
    case 'family': {
      const c = s.family.draw();
      p.tokens.push(c.kind);
      let gifts = 0;
      for (const o of s.players) {
        if (o.id === p.id || o.retired !== null || o.money < R.gift) continue;
        o.money -= R.gift;
        gifts += R.gift;
      }
      p.money += gifts;
      setCard(s, p.id, 'family', c.kind === 'pet' ? 'حيوان أليف' : c.kind === 'friend' ? 'صديق جديد' : 'العائلة تكبر', `${c.text}${gifts ? ` وهدايا من الجميع: ${dh(gifts)}` : ''}`, gifts || undefined);
      s.feed.push(`${name(ctx, p.id)}: ${c.text}`, { by: p.id });
      ctx.fx('reveal', p.id);
      return;
    }
    case 'raise': {
      if (p.job) {
        p.salary += R.raise;
        setCard(s, p.id, 'raise', 'ترقية في العمل', `زاد راتبك ${dh(R.raise)}، فصار ${dh(p.salary)}.`);
      } else {
        p.money += R.raise;
        setCard(s, p.id, 'raise', 'مكافأة', `مكافأة صغيرة على اجتهادك.`, R.raise);
      }
      s.feed.push(`${name(ctx, p.id)} حصل على ترقية`, { by: p.id });
      ctx.fx('correct', p.id);
      return;
    }
    case 'insure':
      if (p.insured) s.feed.push(`${name(ctx, p.id)} مؤمَّن من قبل`, { by: p.id });
      else if (p.money < R.insurance) s.feed.push(`${name(ctx, p.id)} لم يكفه المال للتأمين`, { by: p.id });
      else s.choice = { kind: 'insure', price: R.insurance };
      return;
    case 'risk':
      s.choice = { kind: 'risk', title: pick(RISK_PROJECTS) };
      return;
    case 'fork':
      s.choice = { kind: 'fork', fork: p.pos === b.fork1 ? 1 : 2 };
      return;
    case 'grad':
      p.degree = true;
      s.choice = { kind: 'job', cards: shuffle(DEGREE_JOBS).slice(0, 3), degree: true };
      s.feed.push(`${name(ctx, p.id)} تخرّج من الجامعة!`, { by: p.id });
      ctx.fx('reveal', p.id);
      return;
    case 'house':
      if (p.house) s.feed.push(`${name(ctx, p.id)} يملك داراً من قبل`, { by: p.id });
      else s.choice = { kind: 'house', cards: shuffle(HOUSES).slice(0, 3).sort((a, z) => a.price - z.price) };
      return;
    case 'retire':
      retire(ctx, s, p);
      return;
    default:
      return;
  }
}

/** After a space is resolved: ask the choice, or pass the turn. */
function settle(ctx: GameCtx, s: LifeState) {
  if (s.phase === 'final') return;
  if (s.choice) {
    s.phase = 'choose';
    return;
  }
  endTurn(ctx, s);
}

/* ---------------- bots ---------------- */

/** The house a bot would buy (null: none is worth it). */
export function botHouse(s: LifeState, p: LifePlayer, cards: LifeHouse[]): LifeHouse | null {
  const paydays = lifePaydaysLeft(boardOf(s), p.pos) + 1;
  let best: LifeHouse | null = null;
  let bestV = 0;
  for (const h of cards) {
    const loans = Math.max(0, Math.ceil((h.price - p.money) / R.loan));
    if (loans > 8) continue;
    const v = h.sell - h.price - loans * R.interest * paydays;
    if (v > bestV) {
      bestV = v;
      best = h;
    }
  }
  return best;
}

export function botJob(cards: LifeJob[]): LifeJob {
  return [...cards].sort((a, b) => b.salary - a.salary)[0];
}

function botChoice(s: LifeState, p: Pl, c: LifeChoice): { type: string; [k: string]: unknown } {
  switch (c.kind) {
    case 'fork': {
      if (c.fork === 1) {
        let uni = p.money + R.loan >= R.tuition;
        if (Math.random() < 0.15) uni = !uni;
        return { type: 'fork', way: uni ? 0 : 1 };
      }
      const bold = p.money >= 15000 ? Math.random() < 0.7 : Math.random() < 0.25;
      return { type: 'fork', way: bold ? 0 : 1 };
    }
    case 'job':
      return { type: 'job', id: botJob(c.cards).id };
    case 'house':
      return { type: 'house', id: botHouse(s, p, c.cards)?.id ?? null };
    case 'insure':
      return { type: 'insure', yes: p.money - c.price >= 3000 && lifeStepsLeft(boardOf(s), p.pos) > 8 };
    case 'risk':
      return { type: 'risk', go: p.money >= -R.risk[0] || Math.random() < 0.3 };
  }
}

/* ---------------- module ---------------- */

export const life: GameModule<LifeState, LifeSettings> = {
  id: 'life',

  turnOf: (s) => (s.phase === 'roll' || s.phase === 'choose') && cur(s) ? [cur(s).id] : [],

  start(ctx, participants, settings) {
    ctx.fx('start');
    return {
      settings,
      players: shuffle(participants).map((id) => ({
        id,
        pos: 0,
        money: settings.startCash,
        loans: 0,
        job: null,
        salary: 0,
        degree: false,
        house: null,
        tokens: [],
        insured: false,
        retired: null,
        bonus: 0,
        score: null,
        ways: {},
      })),
      turnIdx: 0,
      phase: 'roll',
      choice: null,
      dice: null,
      rollId: 0,
      move: null,
      moveN: 0,
      card: null,
      cardN: 0,
      school: new Deck(SCHOOL_EVENTS),
      life: new Deck(LIFE_EVENTS),
      family: new Deck(FAMILY_CARDS),
      retiredN: 0,
      winner: null,
      feed: new Feed(),
      seq: 0,
      anim: false,
    };
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final') return;
    const p = cur(s);
    if (!p || !P(s, by)) return;
    if (p.id !== by) throw new GameError('ليس دورك');

    if (a.type === 'repay') {
      if (s.phase !== 'roll' || !p.loans) return;
      if (p.money < R.loan) throw new GameError('لا يكفي المال لتسديد قرض');
      p.money -= R.loan;
      p.loans -= 1;
      s.feed.push(`${name(ctx, by)} سدّد قرضاً`, { by });
      s.seq += 1;
      s.anim = false;
      return;
    }

    if (a.type === 'roll') {
      if (s.phase !== 'roll') return;
      const d = randInt(1, 6);
      s.dice = d;
      s.rollId += 1;
      s.card = null;
      const path = walk(ctx, s, p, d);
      s.move = { id: ++s.moveN, by, path, rollId: s.rollId };
      ctx.fx('tick', by);
      land(ctx, s, p);
      s.seq += 1;
      s.anim = true;
      settle(ctx, s);
      return;
    }

    if (s.phase !== 'choose' || !s.choice) return;
    const c = s.choice;
    if (a.type !== c.kind) return;
    s.choice = null;
    s.anim = false;

    if (c.kind === 'fork') {
      const way = a.way === 1 ? 1 : a.way === 0 ? 0 : null;
      if (way === null) {
        s.choice = c;
        return;
      }
      p.ways[p.pos] = way;
      if (c.fork === 1) {
        if (way === 0) {
          addMoney(ctx, s, p, -R.tuition);
          setCard(s, by, 'uni', 'الجامعة', `اخترت الجامعة: مصاريف الدراسة ${dh(R.tuition)}. المهن بعد التخرج أعلى راتباً.`, -R.tuition);
          s.feed.push(`${name(ctx, by)} اختار الجامعة`, { by });
        } else {
          s.choice = { kind: 'job', cards: shuffle(WORK_JOBS).slice(0, 3), degree: false };
          s.feed.push(`${name(ctx, by)} اختار العمل مباشرة`, { by });
        }
      } else s.feed.push(`${name(ctx, by)} اختار ${way === 0 ? 'طريق المغامرة' : 'الطريق الهادئ'}`, { by });
      ctx.fx('card', by);
    } else if (c.kind === 'job') {
      const job = c.cards.find((j) => j.id === a.id);
      if (!job) {
        s.choice = c;
        throw new GameError('اختر مهنة من البطاقات');
      }
      p.job = job;
      p.salary = job.salary;
      setCard(s, by, 'job', job.title, `صار ${name(ctx, by)} ${job.title}. الراتب: ${dh(job.salary)} في كل يوم أجرة.`);
      s.feed.push(`${name(ctx, by)} صار ${job.title} (${dh(job.salary)})`, { by });
      ctx.fx('correct', by);
    } else if (c.kind === 'house') {
      if (a.id === null || a.id === undefined) {
        s.feed.push(`${name(ctx, by)} فضّل الاستئجار`, { by });
      } else {
        const h = isStr(a.id) ? c.cards.find((x) => x.id === a.id) : null;
        if (!h) {
          s.choice = c;
          throw new GameError('اختر داراً من البطاقات');
        }
        p.house = h;
        addMoney(ctx, s, p, -h.price);
        setCard(s, by, 'house', h.title, `اشترى ${name(ctx, by)} ${h.title} بـ ${dh(h.price)}. تُباع عند التقاعد بـ ${dh(h.sell)}.`, -h.price);
        s.feed.push(`${name(ctx, by)} اشترى ${h.title}`, { by });
        ctx.fx('correct', by);
      }
    } else if (c.kind === 'insure') {
      if (a.yes === true) {
        if (p.money < c.price) {
          s.choice = c;
          throw new GameError('لا يكفي المال');
        }
        p.money -= c.price;
        p.insured = true;
        setCard(s, by, 'insure', 'التأمين', 'أنت مؤمَّن الآن: لن تدفع ثمن الأعطال والسرقات.', -c.price);
        s.feed.push(`${name(ctx, by)} اشترى التأمين`, { by });
      } else s.feed.push(`${name(ctx, by)} رفض التأمين`, { by });
    } else if (c.kind === 'risk') {
      if (a.go === true) {
        const d = randInt(1, 6);
        s.dice = d;
        s.rollId += 1;
        s.anim = true;
        const amount = R.risk[d <= 2 ? 0 : d <= 4 ? 1 : 2];
        addMoney(ctx, s, p, amount);
        const verdict = amount < 0 ? 'المشروع لم ينجح…' : amount < R.risk[2] ? 'ربح متواضع.' : 'نجاح كبير!';
        setCard(s, by, 'risk', c.title, `النرد: ${d}. ${verdict}`, amount);
        s.feed.push(`${name(ctx, by)}: ${c.title} ${amount > 0 ? '+' : ''}${dh(amount)}`, { by });
        ctx.fx(amount < 0 ? 'buzz' : 'correct', by);
      } else s.feed.push(`${name(ctx, by)} لم يغامر`, { by });
    }
    s.seq += 1;
    settle(ctx, s);
  },

  botPlan(ctx, s, bots) {
    if (s.phase === 'final') return;
    const p = cur(s);
    if (!p || !bots.includes(p.id) || !ctx.isBot(p.id)) return;
    const key = `${s.seq}`;
    // wait for the die and the walk to finish on the phones before the next move
    const wait = s.anim ? randDelay(3000, 3700) : randDelay(1500, 2200);
    if (s.phase === 'roll') {
      if (p.loans && p.money >= R.loan + 15000) return void ctx.bot(p.id, key, wait, { type: 'repay' });
      ctx.bot(p.id, key, s.anim ? randDelay(2900, 3500) : randDelay(1700, 2400), { type: 'roll' });
      return;
    }
    if (s.phase === 'choose' && s.choice) ctx.bot(p.id, key, wait, botChoice(s, p, s.choice));
  },

  view(_ctx, s): LifeView {
    return {
      game: 'life',
      phase: s.phase,
      length: s.settings.length,
      players: s.players.map(({ ways: _ways, ...p }) => p),
      turn: cur(s)?.id ?? '',
      dice: s.dice,
      rollId: s.rollId,
      move: s.move,
      choice: s.choice,
      card: s.card,
      feed: s.feed.list(),
      winner: s.winner,
    };
  },

  onLeave(ctx, s, id) {
    const i = s.players.findIndex((p) => p.id === id);
    if (i < 0 || s.phase === 'final') return;
    const wasTurn = i === s.turnIdx;
    s.players.splice(i, 1);
    s.feed.push(`${name(ctx, id)} غادر اللعبة`);
    if (!s.players.length) {
      s.phase = 'final';
      s.winner = null;
      return;
    }
    if (s.players.length === 1) return finish(ctx, s);
    if (i < s.turnIdx) s.turnIdx -= 1;
    if (wasTurn) {
      // the next player in line takes the turn
      s.turnIdx = (s.turnIdx - 1 + s.players.length) % s.players.length;
      s.seq += 1;
      s.anim = false;
      endTurn(ctx, s);
    } else if (s.players.every((p) => p.retired !== null)) finish(ctx, s);
  },

  patchSettings(settings, patch) {
    if (patch.length === 'short' || patch.length === 'normal') settings.length = patch.length as LifeLength;
    if (isNum(patch.startCash)) settings.startCash = clamp(Math.round(patch.startCash / 1000) * 1000, 5000, 50000);
  },
};
