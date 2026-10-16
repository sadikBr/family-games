/** Helpers shared by the card games. */
import { makeDeck, type Card } from '../src/shared/cards';
import type { CardSide, FeedItem } from '../src/shared/protocol';
import { shuffle } from './util';

export function freshDeck(): Card[] {
  return shuffle(makeDeck());
}

/**
 * Seats → scoring sides. With 4 players and `teams`, partners sit opposite:
 * seats 0 & 2 vs seats 1 & 3. Otherwise everyone plays alone.
 */
export function makeSides(seats: string[], teams: boolean): CardSide[] {
  if (teams && seats.length === 4) {
    return [
      { key: 'A', members: [seats[0], seats[2]] },
      { key: 'B', members: [seats[1], seats[3]] },
    ];
  }
  return seats.map((id) => ({ key: id, members: [id] }));
}

export function sideOf(sides: CardSide[], player: string): string {
  return sides.find((s) => s.members.includes(player))?.key ?? player;
}

export class Feed {
  private items: FeedItem[] = [];
  private n = 0;
  push(text: string, extra: Omit<FeedItem, 'id' | 'text'> = {}) {
    this.items.push({ id: ++this.n, text, ...extra });
    if (this.items.length > 8) this.items.shift();
  }
  clear() {
    this.items = [];
  }
  list(): FeedItem[] {
    return this.items;
  }
}

export function removeCard(hand: Card[], id: string): Card | null {
  const i = hand.findIndex((c) => c.id === id);
  if (i < 0) return null;
  return hand.splice(i, 1)[0];
}

export const randDelay = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
