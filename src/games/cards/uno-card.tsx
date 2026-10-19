import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { UNO_IMG } from '@/art/assets';
import { haptic } from '@/lib/sfx';
import { faceName, type UnoFace, type UnoSide } from '@/shared/uno';
import { C, alpha } from '@/theme';

import { useCardLook } from './motion';

export const unoKey = (side: UnoSide, f: UnoFace) => `${side}-${f.color ?? 'wild'}-${f.kind}${f.n ?? ''}`;

export const UnoCard = memo(function UnoCard({
  face,
  side,
  width,
  selected,
  dim,
  onPress,
}: {
  face: UnoFace;
  side: UnoSide;
  width: number;
  selected?: boolean;
  dim?: boolean;
  onPress?: () => void;
}) {
  // the lift and the dimming glide; the Pressable sits inside the lifted view, so a second tap lands
  // exactly on the raised card
  const look = useCardLook({ lift: selected ? 14 : 0, dim, dimTo: 0.4 });
  const img = (
    <View style={[styles.wrap, { borderRadius: width * 0.1 }, selected && { borderColor: C.yellow }]}>
      <Image source={UNO_IMG[unoKey(side, face)]} style={{ width, height: width * 1.5 }} contentFit="contain" transition={0} />
    </View>
  );
  return (
    <Animated.View style={look}>
      {onPress ? (
        <Pressable
          onPress={() => {
            haptic.tap();
            onPress();
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: !!selected }}
          accessibilityLabel={`ورقة ${faceName(face)}`}>
          {img}
        </Pressable>
      ) : (
        img
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
});

export const glowRing = (c: string) => ({ borderColor: alpha(c, 0.9) });
