import { useEffect, useState } from 'react';

import { client } from './client';

/** Milliseconds left until a server timestamp, refreshed a few times per second. */
export function useCountdown(endsAt: number | null, every = 200): number {
  const calc = () => (endsAt === null ? 0 : Math.max(0, endsAt - client.serverNow()));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const update = () => setLeft(endsAt === null ? 0 : Math.max(0, endsAt - client.serverNow()));
    update();
    if (endsAt === null) return;
    const t = setInterval(update, every);
    return () => clearInterval(t);
  }, [endsAt, every]);
  return left;
}

/** Milliseconds since a server timestamp. */
export function useElapsed(since: number | null, every = 250): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const update = () => setElapsed(since === null ? 0 : Math.max(0, client.serverNow() - since));
    update();
    if (since === null) return;
    const t = setInterval(update, every);
    return () => clearInterval(t);
  }, [since, every]);
  return elapsed;
}
