/**
 * Per-room question decks kept in ctx.memo, so questions only come back once the whole pool has been
 * used — across games in the same room, not just inside one game.
 */
import type { GameCtx } from './types';
import { shuffle } from './util';

export class QDeck<T> {
  private pile: T[] = [];
  constructor(readonly source: readonly T[]) {}

  /** Items left before the deck is reshuffled. */
  get left(): number {
    return this.pile.length;
  }

  /** Next item; `avoid` skips items when possible (e.g. ones already used in this game). */
  draw(avoid?: (t: T) => boolean): T {
    if (!this.pile.length) this.pile = shuffle(this.source);
    if (!avoid) return this.pile.pop() as T;
    let i = this.pile.findLastIndex((t) => !avoid(t));
    if (i < 0) {
      // everything left in this pass is to be avoided: start the next pass early
      const fresh = shuffle(this.source);
      const j = fresh.findLastIndex((t) => !avoid(t));
      if (j >= 0) {
        this.pile = fresh;
        i = j;
      } else i = this.pile.length - 1;
    }
    return this.pile.splice(i, 1)[0];
  }

  /** Up to `n` different items (never more than the pool has). */
  deal(n: number): T[] {
    const out: T[] = [];
    const want = Math.min(n, this.source.length);
    while (out.length < want) out.push(this.draw((t) => out.includes(t)));
    return out;
  }
}

/** The room's deck for `key`, created on first use. */
export function qdeck<T>(ctx: GameCtx, key: string, source: readonly T[]): QDeck<T> {
  let d = ctx.memo.get(key) as QDeck<T> | undefined;
  if (!d || d.source.length !== source.length) {
    d = new QDeck(source);
    ctx.memo.set(key, d);
  }
  return d;
}
