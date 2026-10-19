/**
 * «الباقي لنا» — finishing a hand whose remaining tricks are all certain for one team (the server
 * checks it exactly). Shared by the trick games: the calm button above my hand, and the claimer's
 * cards shown face up to everyone for a few seconds before the end of the hand.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { C, alpha } from '@/theme';
import { Btn } from '@/ui/btn';
import { Txt } from '@/ui/txt';

import type { Helpers } from '../helpers';
import { CardMotion, EASE, MOTION } from './motion';

/** The option (it is only an option: the hand can be played on). */
export function ClaimButton({ onPress }: { onPress: () => void }) {
  return (
    <Animated.View entering={FadeIn.duration(MOTION.enter).easing(EASE)} exiting={FadeOut.duration(200)} style={{ gap: 2, alignItems: 'center' }}>
      <Btn size="md" icon="check" color={C.green} label="الباقي لنا — أنهِ اليد" onPress={onPress} />
      <Txt v="tiny" color={C.muted} center numberOfLines={1}>
        كل الأكلات الباقية مضمونة لفريقكم
      </Txt>
    </Animated.View>
  );
}

export interface Claimed<CardT> {
  by: string;
  side: string;
  reveal: { by: string; cards: CardT[] }[];
}

/**
 * The claimed hand: «الباقي لفريقكم» and the claimer's cards (the partner's too when they were
 * needed) laid face up, one after the other — on the claimer's own phone they glide out of the hand.
 */
export function ClaimReveal<CardT extends { id: string }>({
  claimed,
  mySide,
  sideNames,
  h,
  renderCard,
}: {
  claimed: Claimed<CardT>;
  mySide: string | null;
  /** «بابا وماما» for a side key */
  sideNames: (side: string) => string;
  h: Helpers;
  renderCard: (c: CardT) => ReactNode;
}) {
  const title = claimed.side === mySide ? 'الباقي لفريقكم' : `الباقي لفريق ${sideNames(claimed.side)}`;
  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.enter).easing(EASE)}
      style={{ gap: 6, alignItems: 'center', backgroundColor: alpha(C.green, 0.14), borderRadius: 16, borderWidth: 1, borderColor: alpha(C.green, 0.45), paddingVertical: 8, paddingHorizontal: 8 }}>
      <Txt v="bold" center color={C.green} numberOfLines={1}>
        {title} — أُنهيت اليد
      </Txt>
      {claimed.reveal.map((r) => (
        <View key={r.by} style={{ gap: 3, alignItems: 'center', alignSelf: 'stretch' }}>
          <Txt v="tiny" color={C.muted} numberOfLines={1}>
            أوراق {r.by === h.me ? 'يدك' : h.player(r.by).name}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3, direction: 'ltr' }}>
            {r.cards.map((c) => (
              <CardMotion key={c.id} id={c.id} enter="deal" from="top" source={false}>
                {renderCard(c)}
              </CardMotion>
            ))}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/** One line for the end-of-hand sheet: «إنهاء مبكر — الباقي لنا». */
export function ClaimNote({ mine }: { mine: boolean | null }) {
  return (
    <Txt v="small" center color={C.green}>
      إنهاء مبكر — الباقي {mine === null ? 'للفائزين بالأكلات' : mine ? 'لنا' : 'لهم'}، دون لعب الأوراق الباقية
    </Txt>
  );
}
