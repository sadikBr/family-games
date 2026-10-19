import { useRef, useState } from 'react';

import { DOUBLE_TAP_MS, tapClock } from './card-ui';

/**
 * «Tap cards to pick several, tap a lone picked card again to play it» — for games where a move can
 * take more than one card (الكونكان، الكذّاب). Tapping a picked card unpicks it, except when it is
 * the only one picked and `quick(id)` says the second tap may play it now: then `onQuick(id)` sends
 * that single-card move. The same touch reported twice (sooner than DOUBLE_TAP_MS) is dropped.
 * The picks are forgotten whenever `resetKey` changes (the turn or the step moved on) and cards that
 * left the hand or may not be picked now are dropped, so a stale pick never lingers.
 */
export function usePicks({
  resetKey,
  max = Infinity,
  canPick,
  quick,
  onQuick,
}: {
  resetKey: string;
  max?: number;
  canPick: (id: string) => boolean;
  quick: (id: string) => boolean;
  onQuick: (id: string) => void;
}) {
  const [st, setSt] = useState({ key: resetKey, ids: [] as string[] });
  let cur = st;
  if (st.key !== resetKey) {
    cur = { key: resetKey, ids: [] };
    setSt(cur);
  }
  const picked = cur.ids.filter(canPick);
  // the latest tap, for the handler only (taps can come faster than renders)
  const last = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const set = (ids: string[]) => setSt({ key: resetKey, ids });

  const clear = () => {
    last.current = { id: null, at: 0 };
    set([]);
  };
  const tap = (id: string) => {
    if (!canPick(id)) return;
    const now = tapClock();
    const prev = last.current;
    if (prev.id === id && now - prev.at < DOUBLE_TAP_MS) return; // the same touch twice
    last.current = { id, at: now };
    if (picked.includes(id)) {
      if (picked.length === 1 && quick(id)) {
        clear();
        onQuick(id);
        return;
      }
      set(picked.filter((x) => x !== id));
      return;
    }
    if (picked.length >= max) {
      if (max === 1) set([id]);
      return;
    }
    set([...picked, id]);
  };
  return { picked, tap, clear };
}
