import { useEffect, useRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { Zellige } from '@/art/game-art';
import { C } from '@/theme';

import { KeyboardScrollContext } from './field';

export interface ScreenProps {
  children: ReactNode;
  /** background colour (defaults to the indigo night) */
  bg?: string;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  pattern?: boolean;
  /** when this changes, the page scrolls back to the top (e.g. a game starting in the room) */
  scrollKey?: string;
  /** a soft light at the top of the screen in this colour (the game's colour in a room) */
  glow?: string;
}

/** The game's light: a wide, soft radial glow from the top edge, fading into the night. */
function Glow({ color, width, height }: { color: string; width: number; height: number }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id="roomGlow" cx="50%" cy="0%" rx="85%" ry="48%" fx="50%" fy="0%" gradientUnits="objectBoundingBox">
          <Stop offset="0" stopColor={color} stopOpacity={0.34} />
          <Stop offset="0.55" stopColor={color} stopOpacity={0.1} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#roomGlow)" />
    </Svg>
  );
}

/** Usable width inside <Screen> (16px gutters, 560px max), for grids that must fit any phone. */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  return Math.min(width - 32, 560);
}

export function Screen({ children, bg = C.bg, header, footer, scroll = true, contentStyle, pattern = true, scrollKey, glow }: ScreenProps) {
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (scrollKey !== undefined) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  const contentRef = useRef<View>(null);
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {glow ? <Glow color={glow} width={width} height={height} /> : null}
      {pattern ? <Zellige width={width} height={height} color={glow ?? '#FFFFFF'} opacity={glow ? 0.07 : 0.05} /> : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* The app is drawn edge-to-edge, so Android does not shrink it for the keyboard: do it here. */}
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {header}
          {scroll ? (
            <KeyboardScrollContext.Provider value={{ scroll: scrollRef, content: contentRef }}>
              <ScrollView
                ref={scrollRef}
                style={styles.flex}
                contentContainerStyle={[styles.content, contentStyle]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}>
                <View ref={contentRef} style={styles.inner}>
                  {children}
                </View>
              </ScrollView>
            </KeyboardScrollContext.Provider>
          ) : (
            <View style={[styles.flex, styles.content, contentStyle]}>
              <View style={[styles.inner, styles.flex]}>{children}</View>
            </View>
          )}
          {footer ? (
            <View style={styles.footer}>
              <View style={styles.inner}>{footer}</View>
            </View>
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, direction: 'rtl' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32, flexGrow: 1 },
  inner: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 14 },
  footer: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 },
});
