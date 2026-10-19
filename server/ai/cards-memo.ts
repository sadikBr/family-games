/**
 * The room calls botPlan after every change, and the search behind a strong move is not free: remember
 * the decision made for a given state key (per game state, forgotten with it) so it is computed once.
 */
const memo = new WeakMap<object, Map<string, unknown>>();

export function decideOnce<T>(state: object, key: string, compute: () => T): T {
  let m = memo.get(state);
  if (!m) memo.set(state, (m = new Map()));
  if (m.has(key)) return m.get(key) as T;
  const v = compute();
  if (m.size > 64) m.clear();
  m.set(key, v);
  return v;
}
