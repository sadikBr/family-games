/**
 * The traditional Moroccan deck (Spanish suits: أوروص, الكوباص, شباضا, الباسطوص; 1–7, 10, 11, 12)
 * in the classic printed style, rendered as HD images (see assets.ts and tools/art/cards.mjs).
 */
import { Image } from 'expo-image';
import { memo } from 'react';

import type { Card } from '@/shared/cards';

import { CARD_IMG } from './assets';

export const CARD_RATIO = 1.5;

export const SpanishCard = memo(function SpanishCard({ card, width }: { card: Card | null; width: number }) {
  const src = card ? CARD_IMG[`${card.suit}-${card.rank}`] : CARD_IMG.back;
  return <Image source={src} style={{ width, height: width * CARD_RATIO }} contentFit="contain" transition={0} />;
});
