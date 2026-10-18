/**
 * «الكونكان» — fields of the view each phone gets beyond the shared `KonkanView` (src/shared/protocol.ts),
 * so everyone can see what the last player did on the table.
 */
import type { KonkanView } from '../protocol';

export interface KonkanTableInfo {
  /** who threw the card on top of the discard pile (null: the card turned up at the deal) */
  discardBy: string | null;
  /** the group laid down or added to most recently, and by whom (cleared once the next player has discarded) */
  lastMeld: { id: number; by: string } | null;
}

export type KonkanViewPlus = KonkanView & KonkanTableInfo;
