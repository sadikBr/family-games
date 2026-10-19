/**
 * Small helpers on top of the card motion kit (motion.tsx) for games with a draw pile and a discard
 * pile (أونو فليب، فاز 10):
 * - `tiltOf(id)`: the resting angle of a card on the discard pile (a few degrees, always the same
 *   for the same card), so the pile looks like real cards dropped one on another;
 * - `usePile(top, idOf, how)`: the discard pile remembers the card under the top one (it stays
 *   visible while the next card glides onto it) and the card that was just taken from it;
 * - `useArrivals(ids)`: the cards that just arrived in my hand (for a moment), so a single card
 *   drawn from the stock can glide from the stock instead of sliding in from the side;
 * - `STOCK_ID`: the motion id of the draw pile (a flight origin, see `FromStock`).
 */
import { useEffect, useState, type ReactNode } from 'react';

import { CardMotion } from './motion';

/** motion id of the draw pile: a card drawn from it flies from there */
export const STOCK_ID = 'pile:stock';

/** A calm resting angle (−4…4°) for a card on the discard pile, the same every time for the same card. */
export function tiltOf(id: string, max = 4): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return (h % (2 * max + 1)) - max;
}

/** How the top of the discard pile changed: a card played on it, the top card taken, or a new deal. */
export type PileChange = 'cover' | 'take' | 'reset';

/**
 * The discard pile: `under` is the card the top one covered (shown beneath it, so the pile never
 * looks empty while a card flies in), `taken` the card that was just taken from the top (for a
 * short leaving animation). `how` says what happened when the top changes.
 */
export function usePile<T>(top: T | null, idOf: (t: T) => string, how: PileChange, ms = 620): { under: T | null; taken: T | null } {
  const id = top ? idOf(top) : null;
  const [st, setSt] = useState(() => ({ id, top, under: null as T | null, taken: null as T | null, n: 0 }));
  let cur = st;
  if (st.id !== id) {
    if (how === 'cover' && st.top) cur = { id, top, under: st.top, taken: null, n: st.n };
    else if (how === 'take' && st.top) cur = { id, top, under: null, taken: st.top, n: st.n + 1 };
    else cur = { id, top, under: null, taken: null, n: st.n };
    setSt(cur);
  }
  const n = cur.n;
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => setSt((s) => (s.taken ? { ...s, taken: null } : s)), ms);
    return () => clearTimeout(t);
  }, [n, ms]);
  return { under: cur.under, taken: cur.taken };
}

/** The ids that just arrived in the list (cleared after a moment, so a card coming back later is not «new»). */
export function useArrivals(ids: readonly string[], ms = 700): readonly string[] {
  const key = ids.join('\n');
  const [st, setSt] = useState(() => ({ key, ids, added: [] as readonly string[], n: 0 }));
  let cur = st;
  if (st.key !== key) {
    const prev = new Set(st.ids);
    const added = ids.filter((x) => !prev.has(x));
    cur = { key, ids, added, n: added.length ? st.n + 1 : st.n };
    setSt(cur);
  }
  const n = cur.n;
  useEffect(() => {
    if (!n) return;
    const t = setTimeout(() => setSt((s) => (s.added.length ? { ...s, added: [] } : s)), ms);
    return () => clearTimeout(t);
  }, [n, ms]);
  return cur.added;
}

/**
 * The inner layer of a card in my hand: when `fromStock` is set as the card mounts, it flies in from
 * the draw pile (a `CardMotion` with id STOCK_ID must be on screen). The outer `CardMotion` keeps the
 * card's own id (so it can fly on to the table later) and should then use `enter="none"`.
 */
export function FromStock({ id, fromStock, children }: { id: string; fromStock: boolean; children: ReactNode }) {
  return (
    <CardMotion id={fromStock ? STOCK_ID : `${id}:inner`} enter={fromStock ? 'play' : 'none'} source={false}>
      {children}
    </CardMotion>
  );
}
