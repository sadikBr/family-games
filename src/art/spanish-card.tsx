/**
 * Traditional Spanish 40-card deck (coins, cups, swords, clubs; 1–7, 10, 11, 12),
 * drawn in the app's mascot style and rendered as HD images (see assets.ts).
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
