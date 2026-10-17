import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { C, F } from '@/theme';

type Variant = 'hero' | 'display' | 'title' | 'h2' | 'h3' | 'body' | 'bold' | 'small' | 'tiny';

const VARIANTS: Record<Variant, TextStyle> = {
  hero: { fontFamily: F.display, fontSize: 44, lineHeight: 64, textAlign: 'center' },
  display: { fontFamily: F.display, fontSize: 32, lineHeight: 48, textAlign: 'center' },
  title: { fontFamily: F.display, fontSize: 25, lineHeight: 38 },
  h2: { fontFamily: F.display, fontSize: 20, lineHeight: 31 },
  h3: { fontFamily: F.black, fontSize: 16, lineHeight: 25 },
  body: { fontFamily: F.body, fontSize: 16, lineHeight: 25 },
  bold: { fontFamily: F.bold, fontSize: 16, lineHeight: 25 },
  small: { fontFamily: F.body, fontSize: 14, lineHeight: 21 },
  tiny: { fontFamily: F.bold, fontSize: 12, lineHeight: 18 },
};

export interface TxtProps extends TextProps {
  v?: Variant;
  color?: string;
  center?: boolean;
  size?: number;
}

export function Txt({ v = 'body', color, center, size, style, ...rest }: TxtProps) {
  const base = VARIANTS[v];
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      {...rest}
      style={[
        styles.base,
        base,
        color ? { color } : null,
        center ? styles.center : null,
        size ? { fontSize: size, lineHeight: Math.round(size * (base.fontFamily === F.display ? 1.5 : 1.55)) } : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { color: C.text, writingDirection: 'rtl' },
  center: { textAlign: 'center' },
});

/** Numbers that may be negative: keep the minus sign on the left in RTL text. */
export function num(v: number | string): string {
  return `⁦${v}⁩`;
}
