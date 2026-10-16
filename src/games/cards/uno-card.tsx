import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { UNO_IMG } from '@/art/assets';
import { haptic } from '@/lib/sfx';
import { faceName, type UnoFace, type UnoSide } from '@/shared/uno';
import { C, alpha } from '@/theme';

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
  const img = (
    <View
      style={[
        styles.wrap,
        { borderRadius: width * 0.1, transform: [{ translateY: selected ? -14 : 0 }] },
        selected && { borderColor: C.yellow },
        dim && { opacity: 0.4 },
      ]}>
      <Image source={UNO_IMG[unoKey(side, face)]} style={{ width, height: width * 1.5 }} contentFit="contain" transition={0} />
    </View>
  );
  if (!onPress) return img;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`ورقة ${faceName(face)}`}>
      {img}
    </Pressable>
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
