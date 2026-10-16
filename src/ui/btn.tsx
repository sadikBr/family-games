import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon, type IconName } from '@/art/icons';
import { haptic, play } from '@/lib/sfx';
import { C, F, shade } from '@/theme';

import { Txt } from './txt';

type Size = 'xl' | 'lg' | 'md' | 'sm';

const SIZES: Record<Size, { h: number; font: number; depth: number; radius: number; px: number; icon: number }> = {
  xl: { h: 58, font: 18, depth: 4, radius: 18, px: 22, icon: 22 },
  lg: { h: 52, font: 17, depth: 4, radius: 16, px: 18, icon: 20 },
  md: { h: 46, font: 16, depth: 3, radius: 14, px: 16, icon: 19 },
  sm: { h: 38, font: 14, depth: 3, radius: 12, px: 12, icon: 16 },
};

function isLight(hex: string) {
  if (!hex.startsWith('#')) return false;
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 165;
}

export interface BtnProps {
  label?: string;
  icon?: IconName;
  color?: string;
  textColor?: string;
  size?: Size;
  onPress?: () => void;
  disabled?: boolean;
  silent?: boolean;
  /** quiet outlined button for secondary actions */
  ghost?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  flex?: boolean;
}

/** Solid button with a small pressable edge. */
export function Btn({
  label,
  icon,
  color = C.yellow,
  textColor,
  size = 'lg',
  onPress,
  disabled,
  silent,
  ghost,
  style,
  children,
  flex,
}: BtnProps) {
  const s = SIZES[size];
  const face = ghost ? C.surface : disabled ? '#3A3D6E' : color;
  const edge = ghost ? C.bg3 : shade(face, -0.35);
  const fg = textColor ?? (ghost ? C.text : disabled ? C.dim : isLight(face) ? C.ink : '#FFFFFF');
  const pressed = useSharedValue(0);
  const faceStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pressed.get() * (s.depth - 1) }] }));

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => pressed.set(withTiming(1, { duration: 60 }))}
      onPressOut={() => pressed.set(withTiming(0, { duration: 110 }))}
      onPress={() => {
        if (!silent) {
          play('pop');
          haptic.light();
        }
        onPress?.();
      }}
      style={[flex ? styles.flex : null, style]}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <View style={{ paddingBottom: s.depth }}>
        <View style={[StyleSheet.absoluteFill, { top: s.depth, backgroundColor: edge, borderRadius: s.radius }]} />
        <Animated.View
          style={[
            styles.face,
            { minHeight: s.h, borderRadius: s.radius, paddingHorizontal: s.px, backgroundColor: face },
            ghost && styles.ghost,
            faceStyle,
          ]}>
          {children ?? (
            <>
              {icon ? <Icon name={icon} size={s.icon} color={fg} /> : null}
              {label ? (
                <Txt style={{ fontFamily: F.black, fontSize: s.font, lineHeight: Math.round(s.font * 1.5), color: fg }} numberOfLines={1}>
                  {label}
                </Txt>
              ) : null}
            </>
          )}
        </Animated.View>
      </View>
    </Pressable>
  );
}

/** Round icon button (back, sound, home…) */
export function IconBtn({
  icon,
  onPress,
  color = C.surface,
  iconColor = C.text,
  size = 42,
  label,
}: {
  icon: IconName;
  onPress?: () => void;
  color?: string;
  iconColor?: string;
  size?: number;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.icon,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Icon name={icon} size={size * 0.5} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ghost: { borderWidth: 1, borderColor: C.borderStrong },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
});
