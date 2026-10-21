/**
 * «البلوط» — self-play measurements of the bots (not a test: a long run, a report on stdout).
 *
 *   bun scripts/baloot-selfplay.ts [--mode morocco|saudi] [--deals 1000] [--seed 1] [--x new:expert] [--y old:expert]
 *                                  [--bids 4000] [--examples 10] [--games 0] [--clock]
 *
 * - duplicate deals: every seeded deal is played twice with the teams swapped (X at seats 0/2, then 1/3),
 *   so the cards even out; reports the points share, hands won, bid frequency / contract success of
 *   each side's purchases (also per kind of hand: J + 9, J, 9 or neither of the trumps held), and «bad»
 *   purchases (an expected score clearly negative by the fitted evaluator, ../server/ai/baloot-bid.ts);
 * - `--bids N`: N seeded deals bid out by four bots of each agent (old / new, every level), each purchase
 *   played out by new expert bots: bid frequency, success, bad purchases per level;
 * - `--examples K`: K positions where the old and the new expert disagree on the purchase, with a reason;
 * - `--games G`: G whole games (to the target) new X vs old Y, seats alternating: the game win rate.
 * Fixed sample counts by default (repeatable); `--clock` uses the real time budgets instead.
 */
import { makeBalootDeck } from '../src/shared/baloot-rules';
import { maCardLabel } from '../src/shared/baloot-morocco';
import type { BCard, BSuit } from '../src/shared/games/baloot';
import type { BotLevel, GameAction } from '../src/shared/protocol';
import { refDecide, setRefBudget } from '../server/ai/baloot-ref/decide';
import { BAD_VALUE, hokmEval, hokmWhy } from '../server/ai/baloot-bid';
import { bidReason, lastBidNote, setMindBudget } from '../server/ai/baloot-mind';
import { baloot, bidOptions, decide, turnOf, type State } from '../server/games/baloot';

const P = ['p0', 'p1', 'p2', 'p3'];
const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const MODE = arg('mode', 'morocco') as 'morocco' | 'saudi';
const DEALS = Number(arg('deals', '0'));
const SEED = Number(arg('seed', '1'));
const BIDS = Number(arg('bids', '0'));
const EXAMPLES = Number(arg('examples', '0'));
const GAMES = Number(arg('games', '0'));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Agent = (s: State, id: string) => GameAction | null;
const agent = (spec: string): Agent => {
  const [who, lv] = spec.split(':');
  const level = (lv ?? 'expert') as BotLevel;
  return who === 'old' ? (s, id) => refDecide(s, id, level) : (s, id) => decide(s, id, level);
};

const ctxOf = (): any => ({ now: 1000, fx() {}, isConnected: () => true, isBot: () => true, playerName: (id: string) => id, memo: new Map(), bot() {}, say() {} });

interface BuyRec {
  seat: number;
  trump: BSuit;
  /** the buyer leads the first trick */
  lead: boolean;
  /** the take was forced (Moroccan الفورص: a face-up Jack) */
  forced: boolean;
  known: BCard[];
  failed: boolean;
  /** buyer team points minus the defenders' */
  diff: number;
}

function newState(mode: 'morocco' | 'saudi') {
  const ctx = ctxOf();
  const s = baloot.start(ctx, P, { mode, target: mode === 'morocco' ? 1000 : 152, timer: 0, doubling: true, level: 2 }) as State;
  return { ctx, s };
}

/** deal `seed` into a fresh hand of `s` */
function rig(s: State, seed: number) {
  const r = rng(seed);
  const deck = makeBalootDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  s.dealer = seed % 4;
  const order = [1, 2, 3, 0].map((k) => P[(s.dealer + k) % 4]);
  s.hands = Object.fromEntries(P.map((id) => [id, [] as BCard[]]));
  for (const id of order) s.hands[id].push(...deck.splice(0, 5));
  s.faceUp = deck.shift()!;
  s.stock = deck;
  s.bid = { round: 1, stage: 'main', order, queue: order.slice(), calls: {}, best: null };
}

/** Play the current hand of `s` to its end; seat agents. Returns the purchase made (or null: redeal). */
function playHand(ctx: any, s: State, agents: Agent[], onBid?: (s: State, id: string, a: GameAction) => void): BuyRec | null {
  let rec: Omit<BuyRec, 'failed' | 'diff'> | null = null;
  for (let i = 0; i < 4000; i++) {
    if (s.phase === 'handEnd' || s.phase === 'final') {
      const r = s.result!;
      if (!rec) return null;
      const bs = r.buyerSide;
      const ds = bs === 'A' ? 'B' : 'A';
      return { ...rec, failed: r.failed, diff: r.points[bs] - r.points[ds] };
    }
    if (s.phase === 'bid' && s.redealAt !== null) return null;
    if (s.claim && !s.claimed) {
      baloot.act(ctx, s, s.claim.by, { type: 'claim' });
      continue;
    }
    const id = turnOf(s)[0];
    if (id) {
      const seat = P.indexOf(id);
      const a = agents[seat](s, id)!;
      if (s.phase === 'bid') {
        onBid?.(s, id, a);
        if (a.call === 'hokm' || a.call === 'hokm2' || a.call === 'sun' || a.call === 'confirm') {
          const suit = (a.call === 'hokm' ? s.faceUp!.suit : a.call === 'confirm' ? s.bid!.best!.suit : a.suit) as BSuit;
          if (a.call !== 'sun') rec = { seat, trump: suit, lead: s.bid!.order[0] === id, forced: bidOptions(s, id).length === 1, known: [...s.hands[id], s.faceUp!] };
        }
      }
      baloot.act(ctx, s, id, a);
      if (s.phase !== 'bid' && rec && s.contract && (s.contract.mode === 'sun' || P.indexOf(s.contract.buyer) !== rec.seat)) rec = null;
      continue;
    }
    ctx.now += 500;
    baloot.tick!(ctx, s);
  }
  throw new Error('stuck');
}

/** the plain (fitted) reading of a purchase from the buyer's known cards */
const evalOf = (r: BuyRec) => hokmEval(r.known, r.trump, MODE === 'morocco', r.lead);
/** a bad purchase: its expected score by the fitted evaluator is clearly negative (a forced take aside) */
const bad = (r: BuyRec) => !r.forced && evalOf(r).value < BAD_VALUE[MODE];

/** contract success per kind of hand (J and/or 9 of trumps among the known cards) */
class ByTop {
  m: Record<string, { n: number; made: number; diff: number }> = {};
  add(r: BuyRec) {
    const k = evalOf(r).top;
    const x = (this.m[k] ??= { n: 0, made: 0, diff: 0 });
    x.n++;
    if (!r.failed) x.made++;
    x.diff += r.diff;
  }
  toString() {
    return (['J+9', 'J', '9', 'none'] as const)
      .map((k) => {
        const x = this.m[k];
        return x ? `${k}: ${x.n} made ${pct(x.made, x.n)} avg ${(x.diff / x.n).toFixed(0)}` : `${k}: 0`;
      })
      .join(' | ');
  }
}

const show = (cards: BCard[]) => cards.map((c) => (MODE === 'morocco' ? maCardLabel(c) : `${c.rank}${c.suit}`)).join(' ');
const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '—');

function setBudgets() {
  if (flag('clock')) {
    setMindBudget(null);
    setRefBudget(null);
  } else {
    // `--play N`: samples per card decision (both); `--newplay N`: the new bots' only
    const play = Number(arg('play', '20'));
    setMindBudget({ play: Number(arg('newplay', String(play))), bid: 48 });
    setRefBudget({ play, bid: 48 });
  }
}

/* ------------------------------------------------------------------ */

function duplicate() {
  const X = arg('x', 'new:expert');
  const Y = arg('y', 'old:expert');
  const ax = agent(X);
  const ay = agent(Y);
  Math.random = rng(SEED * 7919);
  const st = {
    x: { pts: 0, won: 0, buys: 0, fails: 0, bad: 0, buyDiff: 0, sun: 0, sunFails: 0, top: new ByTop() },
    y: { pts: 0, won: 0, buys: 0, fails: 0, bad: 0, buyDiff: 0, sun: 0, sunFails: 0, top: new ByTop() },
  };
  let hands = 0;
  let redeals = 0;
  const t0 = performance.now();
  for (let k = 0; k < DEALS; k++) {
    for (const flip of [0, 1]) {
      const { ctx, s } = newState(MODE);
      rig(s, SEED * 100_000 + k);
      const agents = P.map((_, seat) => ((seat & 1) === flip ? ax : ay));
      const rec = playHand(ctx, s, agents);
      if (!s.result) {
        redeals++;
        continue;
      }
      hands++;
      const xs = flip === 0 ? 'A' : 'B';
      const ys = flip === 0 ? 'B' : 'A';
      st.x.pts += s.result.points[xs];
      st.y.pts += s.result.points[ys];
      if (s.result.points[xs] > s.result.points[ys]) st.x.won++;
      else if (s.result.points[ys] > s.result.points[xs]) st.y.won++;
      if (s.result.contract.mode === 'sun') {
        const side = s.result.buyerSide === xs ? st.x : st.y;
        side.sun++;
        if (s.result.failed) side.sunFails++;
        continue;
      }
      if (!rec) continue;
      const side = (rec.seat & 1) === flip ? st.x : st.y;
      side.buys++;
      if (rec.failed) side.fails++;
      side.buyDiff += rec.diff;
      if (bad(rec)) side.bad++;
      side.top.add(rec);
    }
    if ((k + 1) % 100 === 0) process.stderr.write(`  ${k + 1}/${DEALS} deals, ${((performance.now() - t0) / 1000).toFixed(0)} s\n`);
  }
  console.log(`\n## ${MODE}: ${X} (X) vs ${Y} (Y) — ${DEALS} deals × 2 (teams swapped), ${hands} hands played, ${redeals} all-pass (redealt)`);
  console.log(`points share X: ${pct(st.x.pts, st.x.pts + st.y.pts)}  (X ${st.x.pts}, Y ${st.y.pts}; per hand X ${(st.x.pts / hands).toFixed(1)}, Y ${(st.y.pts / hands).toFixed(1)})`);
  console.log(`hands won: X ${st.x.won}, Y ${st.y.won}`);
  for (const [name, v] of [['X', st.x], ['Y', st.y]] as const) {
    console.log(
      `${name} حكم purchases: ${v.buys} (${pct(v.buys, hands)} of hands), contract made ${pct(v.buys - v.fails, v.buys)}, avg buyer-team diff ${(v.buyDiff / Math.max(1, v.buys)).toFixed(1)}, bad purchases ${v.bad}`,
    );
    console.log(`   by top trumps held: ${v.top}`);
    if (MODE === 'saudi') console.log(`   صن purchases: ${v.sun}, made ${pct(v.sun - v.sunFails, v.sun)}`);
  }
}

/** every level of both agents: bid frequency, success, bad purchases (purchases played out by new experts) */
function bidStudy() {
  const levels: BotLevel[] = ['easy', 'smart', 'expert'];
  const expertPlay = agent('new:expert');
  console.log(`\n## ${MODE}: bidding by level — ${BIDS} seeded deals, four bots of the level bid, new experts play the hand`);
  for (const who of ['old', 'new']) {
    for (const lv of levels) {
      Math.random = rng(SEED * 31 + lv.length);
      const bidder = agent(`${who}:${lv}`);
      let buys = 0;
      let fails = 0;
      let nbad = 0;
      let sun = 0;
      let sunFails = 0;
      const top = new ByTop();
      let diff = 0;
      let deals = 0;
      let maxMs = 0;
      for (let k = 0; k < BIDS; k++) {
        const { ctx, s } = newState(MODE);
        rig(s, SEED * 1_000_003 + k);
        deals++;
        const agents = P.map(() => ((st: State, id: string) => {
          if (st.phase !== 'bid') return expertPlay(st, id);
          const t0 = performance.now();
          const a = bidder(st, id);
          maxMs = Math.max(maxMs, performance.now() - t0);
          return a;
        }) as Agent);
        const rec = playHand(ctx, s, agents);
        if (s.result?.contract.mode === 'sun') {
          sun++;
          if (s.result.failed) sunFails++;
        }
        if (!rec) continue;
        buys++;
        if (rec.failed) fails++;
        diff += rec.diff;
        if (bad(rec)) {
          nbad++;
          if (process.env.SHOW_BAD) console.log('   bad:', show(rec.known), rec.trump, rec.forced ? 'forced' : '', hokmWhy(evalOf(rec)));
        }
        top.add(rec);
      }
      console.log(`${who} ${lv.padEnd(6)}: ${MODE === 'saudi' ? `صن ${pct(sun, deals)} of deals (made ${pct(sun - sunFails, sun)}); حكم ` : ''}bought ${pct(buys, deals)} of deals, made ${pct(buys - fails, buys)}, avg buyer diff ${(diff / Math.max(1, buys)).toFixed(1)}, bad ${nbad}, slowest bid ${maxMs.toFixed(0)} ms`);
      console.log(`     by top trumps held: ${top}`);
    }
  }
}

/** positions where the old and the new expert disagree, with the new bot's reason */
function examples() {
  console.log(`\n## ${MODE}: purchases where the old and the new expert disagree`);
  Math.random = rng(SEED * 13);
  const oldA = agent('old:expert');
  const newA = agent('new:expert');
  const expertPlay = agent('new:expert');
  let found = { oldOnly: 0, newOnly: 0 };
  for (let k = 0; k < 20_000 && (found.oldOnly < EXAMPLES || found.newOnly < Math.ceil(EXAMPLES / 2)); k++) {
    const { ctx, s } = newState(MODE);
    rig(s, SEED * 7_777 + k);
    // walk the bidding with new bots; stop at the first decision where the two disagree
    for (let i = 0; i < 12 && s.phase === 'bid' && s.redealAt === null; i++) {
      const id = turnOf(s)[0];
      const o = oldA(s, id)!;
      const n = newA(s, id)!;
      const buys = (a: GameAction) => a.call !== 'pass';
      if (buys(o) !== buys(n)) {
        const which = buys(o) ? 'oldOnly' : 'newOnly';
        if ((which === 'oldOnly' && found.oldOnly < EXAMPLES) || (which === 'newOnly' && found.newOnly < Math.ceil(EXAMPLES / 2))) {
          found[which]++;
          const a = buys(o) ? o : n;
          const suit = (a.call === 'hokm' ? s.faceUp!.suit : a.suit) as BSuit;
          const known = [...s.hands[id], s.faceUp!];
          const why = a.call === 'sun' || a.call === 'ashkal' ? `${a.call} (Saudi no-trump contract)` : `${bidReason(s, id, suit)} | new expert: ${lastBidNote() || 'every suit clearly negative'}`;
          // play the purchase out (new experts) to see how it would have gone
          const g = newState(MODE);
          Object.assign(g.s, structuredClone({ ...s, settings: s.settings }));
          const rec = playHand(
            g.ctx,
            g.s,
            P.map(() => ((st: State, pid: string) => {
              if (st.phase !== 'bid') return expertPlay(st, pid);
              if (pid !== id) return { type: 'bid', call: 'pass' } as GameAction;
              return bidOptions(st, pid).some((x) => x.call === 'confirm') ? ({ type: 'bid', call: 'confirm' } as GameAction) : a;
            }) as Agent),
          );
          const out = rec ? (rec.failed ? `failed (${rec.diff})` : `made (+${rec.diff})`) : '—';
          console.log(
            `${which === 'oldOnly' ? 'old buys, new passes' : 'new buys, old passes'} | round ${s.bid!.round}, ${i + 1}. to speak | hand+up: ${show(known)} | ${a.call === 'sun' || a.call === 'ashkal' ? 'صن' : `trump ${suit}`} | played out: ${out} | ${why}`,
          );
        }
        break;
      }
      baloot.act(ctx, s, id, n);
    }
  }
}

/** whole games, new X vs old Y */
function games() {
  const X = arg('x', 'new:expert');
  const Y = arg('y', 'old:expert');
  const ax = agent(X);
  const ay = agent(Y);
  Math.random = rng(SEED * 4243);
  let wx = 0;
  let wy = 0;
  let hands = 0;
  for (let g = 0; g < GAMES; g++) {
    const { ctx, s } = newState(MODE);
    const flip = g & 1;
    const agents = P.map((_, seat) => ((seat & 1) === flip ? ax : ay));
    for (let i = 0; i < 200_000 && s.phase !== 'final'; i++) {
      if (s.claim && !s.claimed) {
        baloot.act(ctx, s, s.claim.by, { type: 'claim' });
        continue;
      }
      const id = turnOf(s)[0];
      if (id) {
        baloot.act(ctx, s, id, agents[P.indexOf(id)](s, id)!);
        continue;
      }
      if (s.phase === 'handEnd') hands++;
      ctx.now += 20_000;
      baloot.tick!(ctx, s);
    }
    const xs = flip === 0 ? 'A' : 'B';
    if (s.winner === xs) wx++;
    else if (s.winner) wy++;
    process.stderr.write(`  game ${g + 1}/${GAMES}: X ${wx} – Y ${wy}\n`);
  }
  console.log(`\n## ${MODE}: ${GAMES} whole games ${X} vs ${Y}: X won ${wx}, Y won ${wy} (${pct(wx, wx + wy)}), ${hands} hands`);
}

setBudgets();
if (DEALS) duplicate();
if (BIDS) bidStudy();
if (EXAMPLES) examples();
if (GAMES) games();
