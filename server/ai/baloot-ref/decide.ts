/**
 * «البلوط» — the PREVIOUS bots' move (frozen copy of the old `decide`): expert / smart simulate with the
 * old mind, 'easy' / a number is the old rule-of-thumb bot. Only for the strength tests and the
 * self-play script (scripts/baloot-selfplay.ts); the game never uses it.
 */
import { projectKey } from '../../../src/shared/baloot-rules';
import type { BotLevel, GameAction } from '../../../src/shared/protocol';
import { isMorocco, maBidOptions, maBotDeclare } from '../../baloot-morocco';
import { bidOptions, playable, sideOf, turnOf, type State } from '../../games/baloot';
import { botBid, botPlay, botRaise, hokmStrength } from './bot';
import { mindBid, mindPlay, mindRaise } from './mind';

export { setMindBudget as setRefBudget } from './mind';

function maDecideBidOld(s: State, id: string, level: number): GameAction {
  const options = maBidOptions(s, id);
  if (options.length === 1) return { type: 'bid', call: options[0].call };
  const withUp = [...s.hands[id], s.faceUp!];
  const jitter = level < 2 ? (Math.random() * 2 - 1) * 1.5 + 0.8 : 0;
  const T = 6.6 + jitter;
  if (options.some((o) => o.call === 'hokm') && hokmStrength(withUp, s.faceUp!.suit) >= T) return { type: 'bid', call: 'hokm' };
  const h2 = options.find((o) => o.call === 'hokm2');
  if (h2?.suits?.length) {
    const best = h2.suits.map((x) => ({ x, v: hokmStrength(withUp, x) })).sort((a, b) => b.v - a.v)[0];
    if (best.v >= T + 0.3) return { type: 'bid', call: 'hokm2', suit: best.x };
  }
  return { type: 'bid', call: 'pass' };
}

/** The old bot's move for the seat whose turn it is (`lvl` as the old `decide` took it). */
export function refDecide(s: State, id: string, lvl: BotLevel | number): GameAction | null {
  if (turnOf(s)[0] !== id) return null;
  const ma = isMorocco(s);
  const declare = () => (ma ? maBotDeclare(s, id) : s.trickNo === 1 ? (s.avail[id] ?? []).map(projectKey) : []);
  if (lvl === 'expert' || lvl === 'smart') {
    if (s.phase === 'bid') {
      const options = bidOptions(s, id);
      if (!options.length) return null;
      const pick = mindBid(s, id, options, lvl);
      return { type: 'bid', call: pick.call, suit: pick.suit };
    }
    if (s.phase === 'double') return { type: 'raise', raise: mindRaise(s, id, s.raise!.step, lvl) ? s.raise!.step : 'pass' };
    const legal = playable(s, id);
    if (!legal.length) return null;
    return { type: 'play', card: mindPlay(s, id, legal, lvl).id, declare: declare() };
  }
  const level = typeof lvl === 'number' ? lvl : 1;
  if (s.phase === 'bid' && ma) return maDecideBidOld(s, id, level);
  if (s.phase === 'bid') {
    const pick = botBid({ hand: s.hands[id], faceUp: s.faceUp!, options: bidOptions(s, id), level, noise: Math.random() * 2 - 1 });
    return { type: 'bid', call: pick.call, suit: pick.suit };
  }
  if (s.phase === 'double') {
    const step = s.raise!.step;
    return { type: 'raise', raise: botRaise(s.hands[id], s.contract!.mode, s.contract!.trump, step, level) ? step : 'pass' };
  }
  const legal = playable(s, id);
  if (!legal.length) return null;
  const card = botPlay({
    hand: s.hands[id],
    legal,
    trick: s.trick,
    trump: s.contract!.trump,
    played: s.played,
    buyers: sideOf(s, id) === sideOf(s, s.contract!.buyer),
    level,
    roll: Math.random(),
  });
  return { type: 'play', card: card.id, declare: declare() };
}
