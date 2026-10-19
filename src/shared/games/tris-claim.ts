/** «التريس» — «الباقي لنا»: the parts of the view added for the claim (old servers simply don't send them). */
import type { Card } from '../cards';

export interface TrisClaimView {
  /** every remaining trick is certain for my team and my hand shows it: I may end the hand */
  canClaim?: boolean;
  /** «الباقي لنا» was claimed: the claimer's hand (and the partner's if it was needed), shown to everyone */
  claimed?: { by: string; side: string; reveal: { by: string; cards: Card[] }[] } | null;
}
