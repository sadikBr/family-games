export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * A deck that deals items without repeating until every item has been used.
 */
export class Deck<T> {
  private pile: T[] = [];
  constructor(private readonly source: readonly T[]) {}
  draw(): T {
    if (this.pile.length === 0) this.pile = shuffle(this.source);
    return this.pile.pop() as T;
  }
}
