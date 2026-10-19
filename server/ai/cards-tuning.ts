/**
 * Search effort of the card bots that sample (روندا, الكانزة). In play they stop on a wall-clock budget;
 * tests set `samples` so the strength (and the result) doesn't depend on how loaded the machine is.
 */
export const cardsTuning = {
  /** > 0: the expert bot uses exactly this many samples per decision ('smart' a tenth), no clock */
  samples: 0,
};

/** How many samples to draw, and whether the clock may stop the search. */
export function sampling(level: 'smart' | 'expert', budgetMs: number, maxSamples: number) {
  const fixed = cardsTuning.samples;
  if (fixed > 0) return { max: level === 'expert' ? fixed : Math.max(4, Math.round(fixed / 10)), budget: Infinity };
  return { max: maxSamples, budget: budgetMs };
}
