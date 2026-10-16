import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Zellige } from '@/art/game-art';
import { C } from '@/theme';

export interface ScreenProps {
  children: ReactNode;
  /** background colour (defaults to the indigo night) */
  bg?: string;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
  pattern?: boolean;
}

export function Screen({ children, bg = C.bg, header, footer, scroll = true, contentStyle, pattern = true }: ScreenProps) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {pattern ? <Zellige width={width} height={height} /> : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {header}
        {scroll ? (
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.inner}>{children}</View>
          </ScrollView>
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
