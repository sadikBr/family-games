/**
 * My hand and the table's growing parts, for card games where the hand changes a lot during a hand
 * (الكونكان، الكذّاب): the cards keep one size, the hand never shrinks under the buttons, and blocks
 * that grow (a new group on the table) glide to their new height — so nothing on screen jumps.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import type { Card } from '@/shared/cards';
import { Row } from '@/ui/bits';
import { Txt } from '@/ui/txt';

import { PlayingCard } from './card-ui';
import { CardMotion, EASE, MOTION, useCardStage } from './motion';

/**
 * The card size for a hand of about `n` cards: «md» while it fits on two lines, «sm» beyond (never
 * smaller: the cards must stay easy to tap). Choose it from the deal, not from the current count,
 * so the cards never change size in the middle of a hand. `room` is the content width.
 */
export function handSize(n: number, room: number, gap = 5): 'md' | 'sm' {
  const perLine = Math.max(1, Math.floor((room - 16 + gap) / (58 + 4 + gap)));
  return Math.ceil(n / perLine) <= 2 ? 'md' : 'sm';
}

/**
 * My hand as rows of cards that deal in from `from`, fly to the table by themselves (same card id
 * there) and close gaps smoothly. Unlike CardRow, the size never changes with the number of cards,
 * and the hand keeps the tallest height it had since `keep` changed (a new hand), so the buttons
 * under it and the page never jump up when cards leave.
 */
export function HandRow({
  cards,
  size,
  gap = 5,
  selected,
  dim = [],
  onPress,
  keep,
  empty,
}: {
  cards: Card[];
  size: 'md' | 'sm';
  gap?: number;
  selected: string[];
  dim?: string[];
  onPress: (c: Card) => void;
  keep: string;
  empty?: string;
}) {
  const [tall, setTall] = useState({ keep, h: 0 });
  // the gap-closing glide starts only once the hand has been on screen a moment: on the web a layout
  // transition armed while the new screen is still settling sends freshly dealt cards across it
  const [glide, setGlide] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setGlide(true), MOTION.settle + 300);
    return () => clearTimeout(t);
  }, []);
  const reduced = !!useCardStage()?.reduced;
  // several cards coming or going at once (a group laid down, a pile taken, a new deal) rearrange the
  // whole hand: the cards then take their new places at once while the moving ones fly, instead of a
  // dozen glides crossing each other from line to line
  const ids = cards.map((c) => c.id).join(',');
  const [arrival, setArrival] = useState({ ids, bulk: false });
  let bulk = arrival.bulk;
  if (arrival.ids !== ids) {
    const old = arrival.ids ? arrival.ids.split(',') : [];
    const now = new Set(cards.map((c) => c.id));
    const added = cards.filter((c) => !old.includes(c.id)).length;
    bulk = added + old.filter((id) => !now.has(id)).length >= 2;
    setArrival({ ids, bulk });
  }
  const minHeight = tall.keep === keep ? tall.h : 0;
  return (
    <View
      style={{ minHeight, justifyContent: 'flex-start' }}
      onLayout={(e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (tall.keep !== keep || h > tall.h) setTall({ keep, h });
      }}>
      {!cards.length && empty ? (
        <Txt v="small" center color="rgba(255,255,255,0.6)">
          {empty}
        </Txt>
      ) : null}
      <Row wrap gap={gap} center>
        {cards.map((c) => (
          <Animated.View key={c.id} layout={glide && !reduced && !bulk ? LinearTransition.duration(MOTION.glide).easing(EASE) : undefined}>
            <CardMotion id={c.id} enter="deal" from="top">
              <PlayingCard card={c} size={size} selected={selected.includes(c.id)} dim={dim.includes(c.id)} onPress={() => onPress(c)} />
            </CardMotion>
          </Animated.View>
        ))}
      </Row>
    </View>
  );
}

/**
 * A block whose height glides to fit its content (a new group on the table, a line that appears),
 * so whatever sits under it moves smoothly instead of jumping. Instant before the card stage has
 * settled (first screen, reconnect) and with reduced motion.
 */
export function Grow({ children }: { children: ReactNode }) {
  const stage = useCardStage();
  const h = useSharedValue(-1);
  const style = useAnimatedStyle(() => (h.get() < 0 ? {} : { height: h.get() }));
  return (
    <Animated.View style={[{ overflow: 'hidden' }, style]}>
      <View
        onLayout={(e) => {
          const v = e.nativeEvent.layout.height;
          if (h.get() < 0 || !stage?.settled || stage.reduced) h.set(v);
          else h.set(withTiming(v, { duration: MOTION.glide, easing: EASE }));
        }}>
        {children}
      </View>
    </Animated.View>
  );
}
