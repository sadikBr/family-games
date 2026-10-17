/**
 * «المستوطنون» — the base settlers game for 3–4 players (bots allowed), with the official rules:
 * 19 land hexes, 18 number tokens, 9 harbours; setup in snake order (the second settlement pays one card
 * per touching hex); roll → production (the robber blocks its hex; a short bank pays nobody for that
 * resource unless only one player is owed it); 7 → everyone over 7 cards gives back half, the robber
 * moves and steals; build (road, settlement, city, development card), trade with the bank (4:1, 3:1,
 * 2:1 with harbours) or the other players; one development card per turn, never on the turn it was
 * bought; longest road (5+) and largest army (3+) are worth 2 points; the player whose turn it is
 * reaching the target (10 by default) wins.
 * Rules helpers: server/catan-rules.ts. Bots: server/catan-bot.ts.
 */
import type { CatanDevKind, CatanFinalRow, CatanPhase, CatanRes, CatanResMap, CatanSettings, CatanView } from '../../src/shared/games/catan';
import { COST, HEX_COUNT, HEX_VERTS, RES, VERT_COUNT, VERT_HEXES, emptyRes, resTotal } from '../../src/shared/catan-board';
import { autoDiscard, botAction, botRobber, botSetupRoad, botSetupSettlement, botVictim, pickAccepter } from '../catan-bot';
import {
  activePlayers,
  addLog,
  canAfford,
  cardCount,
  isActive,
  legalCities,
  legalRoads,
  legalSettlements,
  longestRoad,
  newState,
  pay,
  piecesLeft,
  publicVp,
  ratios,
  seatOf,
  totalVp,
  victimsAt,
  vpCards,
  type State,
} from '../catan-rules';
import { randDelay } from '../cardkit';
import { GameError, type GameCtx, type GameModule } from '../types';
import { isNum, isStr } from '../util';

const isRes = (v: unknown): v is CatanRes => isStr(v) && (RES as string[]).includes(v);

function readMap(v: unknown): CatanResMap {
  const out = emptyRes();
  if (!v || typeof v !== 'object') return out;
  for (const r of RES) {
    const n = (v as Record<string, unknown>)[r];
    if (isNum(n)) out[r] = Math.max(0, Math.min(19, Math.floor(n)));
  }
  return out;
}

const deadline = (ctx: GameCtx, s: State) => (s.settings.seconds ? ctx.now + s.settings.seconds * 1000 : null);

/* ------------------------------------------------------------------ */
/* Points, titles, the end                                             */
/* ------------------------------------------------------------------ */

function finalRows(s: State): Record<string, CatanFinalRow> {
  return Object.fromEntries(
    s.order.map((id) => {
      const { built } = piecesLeft(s, id);
      const row: CatanFinalRow = {
        settlements: built.settlement,
        cities: built.city,
        vpCards: vpCards(s, id),
        longest: s.longest === id ? 2 : 0,
        army: s.army === id ? 2 : 0,
        total: totalVp(s, id),
      };
      return [id, row];
    }),
  );
}

function endGame(ctx: GameCtx, s: State, winner: string | null, reason: 'win' | 'left') {
  s.phase = 'final';
  s.endsAt = null;
  s.trade = null;
  s.discard = {};
  s.final = { winner, reason, rows: finalRows(s) };
  ctx.fx('win', winner ?? undefined);
}

/** The player whose turn it is wins as soon as they reach the target. */
function checkWin(ctx: GameCtx, s: State): boolean {
  if (s.phase === 'final' || s.phase === 'setup') return s.phase === 'final';
  if (isActive(s, s.turn) && totalVp(s, s.turn) >= s.settings.target) {
    endGame(ctx, s, s.turn, 'win');
    return true;
  }
  return false;
}

/**
 * Longest road: 5+ continuous roads. The holder keeps it on a tie; someone who strictly exceeds takes it.
 * If the holder's road is broken and they are no longer the longest, the single longest player (5+)
 * takes it; if several tie, nobody holds it.
 */
export function updateLongest(s: State) {
  const lens = Object.fromEntries(activePlayers(s).map((id) => [id, longestRoad(s, seatOf(s, id))]));
  const ids = Object.keys(lens);
  const best = Math.max(0, ...ids.map((id) => lens[id]));
  const holder = s.longest && s.longest in lens ? s.longest : null;
  let next: string | null;
  if (holder && lens[holder] >= 5 && lens[holder] >= best) next = holder;
  else {
    const top = ids.filter((id) => lens[id] === best);
    next = best >= 5 && top.length === 1 ? top[0] : null;
  }
  if (next !== s.longest) {
    s.longest = next;
    addLog(s, { t: 'longest', p: next });
  }
}

/** Largest army: 3+ knights; someone who strictly exceeds the holder takes it. */
export function updateArmy(s: State, id: string) {
  const k = s.knights[id];
  if (k < 3 || s.army === id) return;
  if (s.army && isActive(s, s.army) && s.knights[s.army] >= k) return;
  s.army = id;
  addLog(s, { t: 'army', p: id });
}

/* ------------------------------------------------------------------ */
/* Turns                                                               */
/* ------------------------------------------------------------------ */

function nextActive(s: State, id: string): string {
  const n = s.order.length;
  let i = s.order.indexOf(id);
  for (let k = 0; k < n; k++) {
    i = (i + 1) % n;
    if (!s.gone.includes(s.order[i])) return s.order[i];
  }
  return id;
}

function startTurn(ctx: GameCtx, s: State, id: string) {
  s.turn = id;
  s.turnNo += 1;
  s.phase = 'roll';
  s.devPlayed = false;
  s.freeRoads = 0;
  s.trade = null;
  s.victims = [];
  s.discard = {};
  s.resume = 'main';
  s.endsAt = deadline(ctx, s);
  // points reached during someone else's turn count now
  checkWin(ctx, s);
}

function endTurn(ctx: GameCtx, s: State) {
  s.trade = null;
  startTurn(ctx, s, nextActive(s, s.turn));
}

/* --- setup --- */

function setupBegin(ctx: GameCtx, s: State) {
  // skip players who left
  while (s.setupStep < s.setupList.length && s.gone.includes(s.setupList[s.setupStep])) s.setupStep++;
  if (s.setupStep >= s.setupList.length) {
    s.setupAt = null;
    startTurn(ctx, s, activePlayers(s)[0]);
    return;
  }
  s.turn = s.setupList[s.setupStep];
  s.setupNeed = 'settlement';
  s.setupAt = null;
  s.endsAt = deadline(ctx, s);
}

function setupSettle(ctx: GameCtx, s: State, by: string, v: number) {
  if (s.setupNeed !== 'settlement') throw new GameError('ضع الطريق أولاً');
  if (!legalSettlements(s, seatOf(s, by), true).includes(v)) throw new GameError('لا يمكن البناء هنا: يجب أن يبعد عن كل قرية تقاطعاً واحداً على الأقل');
  s.buildings[v] = { s: seatOf(s, by), city: false };
  s.setupNeed = 'road';
  s.setupAt = v;
  addLog(s, { t: 'build', p: by, b: 'settlement' });
  if (s.setupStep >= s.order.length) {
    // the second settlement pays one card from each touching hex
    const got = emptyRes();
    for (const h of VERT_HEXES[v]) {
      const t = s.hexes[h];
      if (t === 'desert' || s.bank[t] <= 0) continue;
      got[t]++;
      s.bank[t]--;
      s.hands[by][t]++;
    }
    if (resTotal(got)) addLog(s, { t: 'gain', p: by, r: got });
  }
  ctx.fx('correct', by);
}

function setupRoad(ctx: GameCtx, s: State, by: string, e: number) {
  if (s.setupNeed !== 'road') throw new GameError('ضع القرية أولاً');
  if (!legalRoads(s, seatOf(s, by)).includes(e)) throw new GameError('ضع الطريق بجانب القرية التي وضعتها الآن');
  s.roads[e] = seatOf(s, by);
  addLog(s, { t: 'build', p: by, b: 'road' });
  ctx.fx('correct', by);
  s.setupStep++;
  setupBegin(ctx, s);
}

/* --- dice and production --- */

function rollDice(s: State): [number, number] {
  const r = s.rig?.shift();
  if (r) return r;
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

/** Production for a roll. If the bank can't pay everyone a resource, nobody gets it — unless one player only is owed it. */
export function produce(s: State, total: number) {
  const owed: Record<string, CatanResMap> = Object.fromEntries(activePlayers(s).map((id) => [id, emptyRes()]));
  for (let h = 0; h < HEX_COUNT; h++) {
    const t = s.hexes[h];
    if (s.nums[h] !== total || h === s.robber || t === 'desert') continue;
    for (const v of HEX_VERTS[h]) {
      const b = s.buildings[v];
      if (!b) continue;
      const id = s.order[b.s];
      if (!owed[id]) continue;
      owed[id][t] += b.city ? 2 : 1;
    }
  }
  const got: Record<string, CatanResMap> = Object.fromEntries(Object.keys(owed).map((id) => [id, emptyRes()]));
  for (const r of RES) {
    const who = Object.keys(owed).filter((id) => owed[id][r] > 0);
    const need = who.reduce((a, id) => a + owed[id][r], 0);
    if (!need) continue;
    if (need <= s.bank[r]) {
      for (const id of who) got[id][r] = owed[id][r];
    } else if (who.length === 1) {
      got[who[0]][r] = s.bank[r];
      if (s.bank[r] < need) addLog(s, { t: 'short', r });
    } else {
      addLog(s, { t: 'short', r });
      continue;
    }
    for (const id of who) {
      s.hands[id][r] += got[id][r];
      s.bank[r] -= got[id][r];
    }
  }
  let any = false;
  for (const id of s.order) {
    if (got[id] && resTotal(got[id])) {
      any = true;
      addLog(s, { t: 'gain', p: id, r: got[id] });
    }
  }
  if (!any) addLog(s, { t: 'nothing' });
}

function doRoll(ctx: GameCtx, s: State) {
  const d = rollDice(s);
  s.dice = d;
  s.rollId += 1;
  const total = d[0] + d[1];
  addLog(s, { t: 'roll', p: s.turn, d });
  ctx.fx('throw', s.turn);
  if (total !== 7) {
    produce(s, total);
    s.phase = 'main';
    return;
  }
  s.discard = {};
  for (const id of activePlayers(s)) {
    const n = cardCount(s, id);
    if (n > 7) s.discard[id] = Math.floor(n / 2);
  }
  s.resume = 'main';
  if (Object.keys(s.discard).length) {
    s.phase = 'discard';
    s.endsAt = deadline(ctx, s);
  } else {
    s.phase = 'robber';
  }
}

function discard(ctx: GameCtx, s: State, by: string, cards: CatanResMap) {
  const need = s.discard[by];
  if (!need) throw new GameError('لا يلزمك إرجاع بطاقات');
  if (resTotal(cards) !== need) throw new GameError(`اختر ${need} بطاقات بالضبط`);
  if (!canAfford(s.hands[by], cards)) throw new GameError('ليست لديك هذه البطاقات');
  pay(s, by, cards);
  delete s.discard[by];
  addLog(s, { t: 'discard', p: by, n: need });
  ctx.fx('card', by);
  if (!Object.keys(s.discard).length) {
    s.phase = 'robber';
    s.endsAt = deadline(ctx, s);
  }
}

/* --- the robber --- */

function moveRobber(ctx: GameCtx, s: State, by: string, h: number) {
  if (!Number.isInteger(h) || h < 0 || h >= HEX_COUNT) throw new GameError('اختر أرضاً');
  if (h === s.robber) throw new GameError('انقل اللص إلى أرض أخرى');
  s.robber = h;
  addLog(s, { t: 'robber', p: by, h });
  ctx.fx('boom', by);
  const vs = victimsAt(s, by, h);
  if (vs.length === 1) steal(ctx, s, by, vs[0]);
  else if (vs.length > 1) {
    s.victims = vs;
    s.phase = 'steal';
  } else afterRobber(s);
}

function steal(ctx: GameCtx, s: State, by: string, victim: string) {
  const hand = s.hands[victim];
  const pool = RES.flatMap((r) => Array<CatanRes>(hand[r]).fill(r));
  if (pool.length) {
    const r = pool[Math.floor(Math.random() * pool.length)];
    hand[r]--;
    s.hands[by][r]++;
    addLog(s, { t: 'steal', p: by, from: victim, r });
    ctx.fx('card', by);
  }
  s.victims = [];
  afterRobber(s);
}

function afterRobber(s: State) {
  s.victims = [];
  s.phase = s.resume;
}

/* --- building --- */

function needMain(s: State) {
  if (s.phase === 'roll') throw new GameError('ارمِ النرد أولاً');
  if (s.phase !== 'main') throw new GameError('ليس الآن');
}

function buildRoad(ctx: GameCtx, s: State, by: string, e: number) {
  const seat = seatOf(s, by);
  const free = s.phase === 'roads';
  if (!free) needMain(s);
  if (piecesLeft(s, by).road <= 0) throw new GameError('لم تبقَ لديك طرق');
  if (!legalRoads(s, seat).includes(e)) throw new GameError('يجب أن يتصل الطريق بطريق أو قرية لك');
  if (!free) {
    if (!canAfford(s.hands[by], COST.road)) throw new GameError('الطريق يحتاج خشباً وطوباً');
    pay(s, by, COST.road);
  }
  s.roads[e] = seat;
  addLog(s, { t: 'build', p: by, b: 'road' });
  ctx.fx('correct', by);
  updateLongest(s);
  if (free) {
    s.freeRoads -= 1;
    if (s.freeRoads <= 0 || piecesLeft(s, by).road <= 0 || !legalRoads(s, seat).length) {
      s.freeRoads = 0;
      s.phase = s.resume;
    }
  }
  checkWin(ctx, s);
}

function buildSettlement(ctx: GameCtx, s: State, by: string, v: number) {
  needMain(s);
  const seat = seatOf(s, by);
  if (piecesLeft(s, by).settlement <= 0) throw new GameError('لم تبقَ لديك قرى: رقِّ قرية إلى مدينة');
  if (!legalSettlements(s, seat, false).includes(v)) throw new GameError('لا يمكن البناء هنا: يجب أن تتصل بطريقك وأن تبعد عن كل قرية');
  if (!canAfford(s.hands[by], COST.settlement)) throw new GameError('القرية تحتاج خشباً وطوباً وصوفاً وقمحاً');
  pay(s, by, COST.settlement);
  s.buildings[v] = { s: seat, city: false };
  addLog(s, { t: 'build', p: by, b: 'settlement' });
  ctx.fx('correct', by);
  updateLongest(s); // a settlement can break someone's road
  checkWin(ctx, s);
}

function buildCity(ctx: GameCtx, s: State, by: string, v: number) {
  needMain(s);
  const seat = seatOf(s, by);
  if (piecesLeft(s, by).city <= 0) throw new GameError('لم تبقَ لديك مدن');
  if (!legalCities(s, seat).includes(v)) throw new GameError('المدينة تُبنى مكان قرية لك');
  if (!canAfford(s.hands[by], COST.city)) throw new GameError('المدينة تحتاج قمحتين وثلاثة أحجار');
  pay(s, by, COST.city);
  s.buildings[v] = { s: seat, city: true };
  addLog(s, { t: 'build', p: by, b: 'city' });
  ctx.fx('correct', by);
  checkWin(ctx, s);
}

function buyDev(ctx: GameCtx, s: State, by: string) {
  needMain(s);
  if (!s.deck.length) throw new GameError('نفدت بطاقات التطوير');
  if (!canAfford(s.hands[by], COST.dev)) throw new GameError('بطاقة التطوير تحتاج صوفاً وقمحاً وحجراً');
  pay(s, by, COST.dev);
  const k = s.deck.pop()!;
  s.devs[by].push({ k, turn: s.turnNo });
  addLog(s, { t: 'build', p: by, b: 'dev' });
  ctx.fx('card', by);
  checkWin(ctx, s); // a victory-point card counts at once
}

/* --- development cards --- */

function playDev(ctx: GameCtx, s: State, by: string, k: CatanDevKind, a: Record<string, unknown>) {
  if (s.phase !== 'roll' && s.phase !== 'main') throw new GameError('ليس الآن');
  if (k === 'vp') throw new GameError('بطاقة النصر تُحسب وحدها');
  if (s.devPlayed) throw new GameError('بطاقة تطوير واحدة فقط في كل دور');
  const i = s.devs[by].findIndex((d) => d.k === k && d.turn < s.turnNo);
  if (i < 0) {
    if (s.devs[by].some((d) => d.k === k)) throw new GameError('لا تُلعب البطاقة في دور شرائها');
    throw new GameError('ليست لديك هذه البطاقة');
  }
  const seat = seatOf(s, by);
  if (k === 'roads' && (piecesLeft(s, by).road <= 0 || !legalRoads(s, seat).length)) throw new GameError('لا مكان لطريق جديد');
  if (k === 'plenty') {
    const r1 = a.r;
    const r2 = a.r2;
    if (!isRes(r1) || !isRes(r2)) throw new GameError('اختر موردين');
    const want = emptyRes();
    want[r1]++;
    want[r2]++;
    if (!canAfford(s.bank, want)) throw new GameError('البنك لا يملك هذين الموردين');
  }
  if (k === 'monopoly' && !isRes(a.r)) throw new GameError('اختر مورداً');

  s.devs[by].splice(i, 1);
  s.devPlayed = true;
  s.trade = null;
  ctx.fx('card', by);
  const resume = s.phase as 'roll' | 'main';
  switch (k) {
    case 'knight':
      s.knights[by]++;
      addLog(s, { t: 'dev', p: by, k });
      updateArmy(s, by);
      s.resume = resume;
      s.phase = 'robber';
      checkWin(ctx, s);
      return;
    case 'roads':
      addLog(s, { t: 'dev', p: by, k });
      s.resume = resume;
      s.phase = 'roads';
      s.freeRoads = Math.min(2, piecesLeft(s, by).road);
      return;
    case 'plenty': {
      const r1 = a.r as CatanRes;
      const r2 = a.r2 as CatanRes;
      for (const r of [r1, r2]) {
        s.bank[r]--;
        s.hands[by][r]++;
      }
      addLog(s, { t: 'dev', p: by, k, r: r1, r2 });
      return;
    }
    case 'monopoly': {
      const r = a.r as CatanRes;
      let n = 0;
      for (const id of s.order) {
        if (id === by) continue;
        n += s.hands[id][r];
        s.hands[id][r] = 0;
      }
      s.hands[by][r] += n;
      addLog(s, { t: 'dev', p: by, k, r, n });
      return;
    }
  }
}

/* --- trading --- */

function bankTrade(ctx: GameCtx, s: State, by: string, give: unknown, get: unknown) {
  needMain(s);
  if (!isRes(give) || !isRes(get) || give === get) throw new GameError('اختر ما تعطي وما تأخذ');
  const n = ratios(s, seatOf(s, by))[give];
  if (s.hands[by][give] < n) throw new GameError(`تحتاج ${n} من ${give === 'wood' ? 'الخشب' : 'هذا المورد'}`);
  if (s.bank[get] <= 0) throw new GameError('البنك لا يملك هذا المورد');
  s.hands[by][give] -= n;
  s.bank[give] += n;
  s.hands[by][get] += 1;
  s.bank[get] -= 1;
  addLog(s, { t: 'bank', p: by, give, n, get });
  ctx.fx('card', by);
}

function offer(ctx: GameCtx, s: State, by: string, giveRaw: unknown, wantRaw: unknown) {
  needMain(s);
  const give = readMap(giveRaw);
  const want = readMap(wantRaw);
  if (!resTotal(give) || !resTotal(want)) throw new GameError('اختر ما تعطي وما تريد');
  if (RES.some((r) => give[r] && want[r])) throw new GameError('لا تعطِ وتطلب المورد نفسه');
  if (!canAfford(s.hands[by], give)) throw new GameError('ليست لديك هذه البطاقات');
  s.trade = { id: ++s.tradeSeq, from: by, give, want, answers: {} };
  s.botOffered[by] = s.turnNo;
  ctx.fx('reveal', by);
}

function answer(s: State, by: string, id: unknown, yes: boolean) {
  const t = s.trade;
  if (!t || t.id !== id) throw new GameError('انتهى هذا العرض');
  if (by === t.from) return;
  if (yes && !canAfford(s.hands[by], t.want)) throw new GameError('ليست لديك البطاقات المطلوبة');
  t.answers[by] = yes;
}

function accept(ctx: GameCtx, s: State, by: string, id: unknown, who: unknown) {
  const t = s.trade;
  if (!t || t.id !== id || t.from !== by) throw new GameError('انتهى هذا العرض');
  if (!isStr(who) || t.answers[who] !== true || !isActive(s, who)) throw new GameError('هذا اللاعب لم يقبل العرض');
  if (!canAfford(s.hands[by], t.give)) throw new GameError('لم تعد لديك البطاقات التي عرضتها');
  if (!canAfford(s.hands[who], t.want)) {
    t.answers[who] = false;
    throw new GameError('لم تعد لدى هذا اللاعب البطاقات المطلوبة');
  }
  for (const r of RES) {
    s.hands[by][r] += t.want[r] - t.give[r];
    s.hands[who][r] += t.give[r] - t.want[r];
  }
  addLog(s, { t: 'trade', p: by, with: who, give: t.give, get: t.want });
  s.trade = null;
  ctx.fx('reveal', by);
}

/* ------------------------------------------------------------------ */
/* Time-outs: the turn is played automatically                          */
/* ------------------------------------------------------------------ */

function autoplay(ctx: GameCtx, s: State) {
  if (s.phase === 'discard') {
    for (const id of Object.keys(s.discard)) discard(ctx, s, id, autoDiscard(s, id, s.discard[id]));
    return;
  }
  const who = s.turn;
  addLog(s, { t: 'timeout', p: who });
  ctx.fx('buzz', who);
  s.trade = null;
  const phase = (): CatanPhase => s.phase;
  for (let guard = 0; guard < 12 && s.turn === who && phase() !== 'final' && phase() !== 'discard'; guard++) {
    switch (phase()) {
      case 'setup':
        if (s.setupNeed === 'settlement') setupSettle(ctx, s, who, botSetupSettlement(s, who));
        setupRoad(ctx, s, who, botSetupRoad(s, who));
        // one settlement and road per time-out (the same player may place again right after)
        return;
      case 'roll':
        doRoll(ctx, s);
        break;
      case 'robber':
        moveRobber(ctx, s, who, botRobber(s, who));
        break;
      case 'steal':
        steal(ctx, s, who, botVictim(s, who));
        break;
      case 'roads':
        s.freeRoads = 0;
        s.phase = s.resume;
        break;
      case 'main':
        endTurn(ctx, s);
        break;
    }
  }
}

/* ------------------------------------------------------------------ */

function viewLegal(s: State, me: string): NonNullable<CatanView['me']>['legal'] {
  const none = { settlements: [], cities: [], roads: [], hexes: [] };
  if (s.turn !== me || !isActive(s, me)) return none;
  const seat = seatOf(s, me);
  const left = piecesLeft(s, me);
  switch (s.phase) {
    case 'setup':
      return s.setupNeed === 'settlement' ? { ...none, settlements: legalSettlements(s, seat, true) } : { ...none, roads: legalRoads(s, seat) };
    case 'main':
      return {
        settlements: left.settlement > 0 ? legalSettlements(s, seat, false) : [],
        cities: left.city > 0 ? legalCities(s, seat) : [],
        roads: left.road > 0 ? legalRoads(s, seat) : [],
        hexes: [],
      };
    case 'roads':
      return { ...none, roads: legalRoads(s, seat) };
    case 'robber':
      return { ...none, hexes: Array.from({ length: HEX_COUNT }, (_, h) => h).filter((h) => h !== s.robber) };
    default:
      return none;
  }
}

export const catan: GameModule<State, CatanSettings> = {
  id: 'catan',

  turnOf(s) {
    if (s.phase === 'final') return [];
    if (s.phase === 'discard') return Object.keys(s.discard);
    if (s.trade) return [s.trade.from, ...activePlayers(s).filter((id) => id !== s.trade!.from && !(id in s.trade!.answers))];
    return [s.turn];
  },

  start(ctx, participants, settings) {
    const names = Object.fromEntries(participants.map((id) => [id, ctx.playerName(id)]));
    const s = newState(participants, settings, names);
    setupBegin(ctx, s);
    ctx.fx('start');
    return s;
  },

  act(ctx, s, by, a) {
    if (s.phase === 'final' || !isActive(s, by)) return;
    // a bot move planned for an older state: drop it (the bot plans again)
    if (a.seq !== undefined && a.seq !== s.seq) return;
    const before = s.seq;
    try {
      handle(ctx, s, by, a);
    } finally {
      if (s.seq === before) s.seq++;
    }
  },

  tick(ctx, s) {
    if (s.phase === 'final' || s.endsAt === null || ctx.now < s.endsAt) return false;
    s.endsAt = null;
    autoplay(ctx, s);
    s.seq++;
    return true;
  },

  botPlan(ctx, s) {
    if (s.phase === 'final') return;
    const actors = new Set(catan.turnOf!(s));
    for (const id of actors) {
      if (!ctx.isBot(id) || !isActive(s, id)) continue;
      const plan = botAction(s, id);
      if (!plan) continue;
      ctx.bot(id, `${s.seq}:${plan.key}`, plan.delay, { ...plan.action, seq: s.seq });
    }
    // a bot waiting for answers to its offer: settle it once everyone answered, or after a while
    const t = s.trade;
    if (t && ctx.isBot(t.from)) {
      const others = activePlayers(s).filter((id) => id !== t.from);
      const all = others.every((id) => id in t.answers);
      const wait = all ? randDelay(500, 900) : 9000;
      ctx.bot(t.from, `settle${t.id}${all ? 'all' : ''}`, wait, { type: 'close', id: t.id });
    }
  },

  view(_ctx, s, me): CatanView {
    const seat = seatOf(s, me);
    const playing = seat >= 0;
    return {
      game: 'catan',
      phase: s.phase,
      order: s.order,
      names: s.names,
      hexes: s.hexes,
      nums: s.nums,
      ports: s.ports,
      robber: s.robber,
      buildings: s.buildings,
      roads: s.roads,
      turn: s.phase === 'final' ? null : s.turn,
      turnNo: s.turnNo,
      dice: s.dice,
      rollId: s.rollId,
      setup: s.phase === 'setup' ? { need: s.setupNeed, round: s.setupStep < s.order.length ? 1 : 2, at: s.setupAt } : null,
      players: Object.fromEntries(
        s.order.map((id) => {
          const left = piecesLeft(s, id);
          return [
            id,
            {
              cards: cardCount(s, id),
              dev: s.devs[id].length,
              knights: s.knights[id],
              vp: publicVp(s, id),
              road: longestRoad(s, seatOf(s, id)),
              left: { road: left.road, settlement: left.settlement, city: left.city },
              gone: s.gone.includes(id),
            },
          ];
        }),
      ),
      longest: s.longest,
      army: s.army,
      bank: s.bank,
      deck: s.deck.length,
      discard: s.discard,
      victims: s.victims,
      freeRoads: s.freeRoads,
      devPlayed: s.devPlayed,
      trade: s.trade,
      // a stolen card is seen only by the thief and the victim
      log: s.log.slice(-16).map((e) => (e.t === 'steal' && e.p !== me && e.from !== me ? { ...e, r: undefined } : e)),
      endsAt: s.endsAt,
      total: s.settings.seconds * 1000,
      target: s.settings.target,
      me: playing
        ? {
            seat,
            hand: s.hands[me],
            devs: s.devs[me].map((d) => ({ k: d.k, fresh: d.turn === s.turnNo })),
            vp: totalVp(s, me),
            ratios: ratios(s, seat),
            legal: viewLegal(s, me),
          }
        : null,
      final: s.final,
    };
  },

  onLeave(ctx, s, id) {
    if (s.phase === 'final' || !isActive(s, id)) return;
    s.gone.push(id);
    // their cards go back to the bank; their pieces stay on the board
    for (const r of RES) {
      s.bank[r] += s.hands[id][r];
      s.hands[id][r] = 0;
    }
    s.devs[id] = s.devs[id].filter((d) => d.k === 'vp');
    delete s.discard[id];
    s.victims = s.victims.filter((v) => v !== id);
    addLog(s, { t: 'left', p: id });
    s.seq++;
    const left = activePlayers(s);
    if (left.length < 2) {
      endGame(ctx, s, left[0] ?? null, 'left');
      return;
    }
    if (s.longest === id) updateLongest(s);
    if (s.army === id) {
      // the largest army goes to the single player with the most knights (3 or more), if any
      const ks = left.map((p) => s.knights[p]);
      const best = Math.max(...ks);
      s.army = best >= 3 && ks.filter((k) => k === best).length === 1 ? left[ks.indexOf(best)] : null;
      if (s.army) addLog(s, { t: 'army', p: s.army });
    }
    if (s.trade) {
      if (s.trade.from === id) s.trade = null;
      else delete s.trade.answers[id];
    }
    if (s.phase === 'setup') {
      if (s.turn === id) setupBegin(ctx, s);
      return;
    }
    if (s.turn === id) {
      endTurn(ctx, s);
      return;
    }
    if (s.phase === 'discard' && !Object.keys(s.discard).length) {
      s.phase = 'robber';
      s.endsAt = deadline(ctx, s);
    }
    if (s.phase === 'steal' && !s.victims.length) afterRobber(s);
  },

  /** Validate a settings change from the lobby (only the keys this game knows). */
  patchSettings(settings, patch) {
    if (patch.layout === 'beginner' || patch.layout === 'random') settings.layout = patch.layout;
    if (patch.target === 8 || patch.target === 10 || patch.target === 12) settings.target = patch.target;
    if (patch.seconds === 0 || patch.seconds === 60 || patch.seconds === 90 || patch.seconds === 120) settings.seconds = patch.seconds;
  },
};

function handle(ctx: GameCtx, s: State, by: string, a: Record<string, unknown> & { type: string }) {
  // answers to an offer and discards come from anyone; everything else from the player whose turn it is
  if (a.type === 'answer') return answer(s, by, a.id, a.yes === true);
  if (a.type === 'discard') return discard(ctx, s, by, readMap(a.cards));
  if (a.type === 'close') {
    // (a bot) closes its own offer: trade with the best player who accepted, or withdraw it
    const t = s.trade;
    if (!t || t.id !== a.id || t.from !== by) return;
    const who = pickAccepter(s, t);
    if (who) accept(ctx, s, by, t.id, who);
    else s.trade = null;
    return;
  }
  if (s.turn !== by) throw new GameError('ليس دورك');
  const v = Number(a.v);
  const e = Number(a.e);
  if (s.phase === 'setup') {
    if (a.type === 'settle' && v >= 0 && v < VERT_COUNT) return setupSettle(ctx, s, by, v);
    if (a.type === 'road') return setupRoad(ctx, s, by, e);
    throw new GameError('ضع قريتك وطريقك أولاً');
  }
  if (s.phase === 'discard' && a.type !== 'discard') throw new GameError('انتظر حتى يعيد اللاعبون البطاقات');
  switch (a.type) {
    case 'roll':
      if (s.phase !== 'roll') throw new GameError('رميت النرد في هذا الدور');
      doRoll(ctx, s);
      checkWin(ctx, s);
      return;
    case 'robber':
      if (s.phase !== 'robber') throw new GameError('ليس الآن');
      moveRobber(ctx, s, by, Number(a.h));
      return;
    case 'steal':
      if (s.phase !== 'steal' || !isStr(a.p) || !s.victims.includes(a.p)) throw new GameError('اختر لاعباً بجوار اللص');
      steal(ctx, s, by, a.p);
      return;
    case 'road':
      return buildRoad(ctx, s, by, e);
    case 'settle':
      return buildSettlement(ctx, s, by, v);
    case 'city':
      return buildCity(ctx, s, by, v);
    case 'buy':
      return buyDev(ctx, s, by);
    case 'play':
      if (!isStr(a.k)) throw new GameError('اختر بطاقة');
      return playDev(ctx, s, by, a.k as CatanDevKind, a);
    case 'bank':
      return bankTrade(ctx, s, by, a.give, a.get);
    case 'offer':
      return offer(ctx, s, by, a.give, a.want);
    case 'accept':
      return accept(ctx, s, by, a.id, a.p);
    case 'cancel':
      if (s.trade?.from === by) s.trade = null;
      return;
    case 'end':
      if (s.phase === 'roll') throw new GameError('ارمِ النرد أولاً');
      if (s.phase !== 'main' && s.phase !== 'roads') throw new GameError('أكمل اللص أولاً');
      endTurn(ctx, s);
      return;
    case 'stopRoads':
      if (s.phase !== 'roads') return;
      s.freeRoads = 0;
      s.phase = s.resume;
      return;
  }
}
