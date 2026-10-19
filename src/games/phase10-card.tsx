/**
 * «المراحل العشر» cards, drawn with Views: a big number in the card's colour, and a shape per colour
 * (triangle, diamond, circle, square) so colour-blind players can tell them apart. Wilds and skips are
 * labelled in Arabic. The design is ours.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { P10_COLORS, type P10Card, type P10Color } from '@/shared/games/phase10';
import { p10CardName } from '@/shared/phase10-rules';
import { C, F, alpha } from '@/theme';

import { useCardLook } from './cards/motion';

export const P10_HEX: Record<P10Color, string> = {
  orange: '#D9620B',
  purple: '#6E3FC4',
  teal: '#0B857A',
  pink: '#C42A6E',
};

type ShapeKind = 'triangle' | 'diamond' | 'circle' | 'square';
export const P10_SHAPE: Record<P10Color, ShapeKind> = { orange: 'triangle', purple: 'diamond', teal: 'circle', pink: 'square' };

export function Shape({ kind, size, color }: { kind: ShapeKind; size: number; color: string }) {
  let inner;
  if (kind === 'circle') inner = <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
  else if (kind === 'square') inner = <View style={{ width: size * 0.86, height: size * 0.86, borderRadius: size * 0.12, backgroundColor: color }} />;
  else if (kind === 'diamond') {
    inner = <View style={{ width: size * 0.7, height: size * 0.7, borderRadius: size * 0.08, backgroundColor: color, transform: [{ rotate: '45deg' }] }} />;
  } else {
    inner = (
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: size / 2,
          borderRightWidth: size / 2,
          borderBottomWidth: size * 0.88,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
    );
  }
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>{inner}</View>;
}

const CREAM = '#FFF9EE';

function Face({ card, w, value }: { card: P10Card | null; w: number; value?: number }) {
  const h = Math.round(w * 1.42);
  const r = Math.max(5, w * 0.12);
  const tiny = w < 36;
  if (!card) {
    // back of the card (the draw pile)
    const s = w * 0.24;
    return (
      <View style={[styles.face, { width: w, height: h, borderRadius: r, backgroundColor: '#2A2F66', borderColor: CREAM }]}>
        <View style={[styles.backInner, { borderRadius: r * 0.7 }]}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: s * 2.2, justifyContent: 'center', gap: s * 0.15 }}>
            {P10_COLORS.map((c) => (
              <Shape key={c} kind={P10_SHAPE[c]} size={s} color={alpha(CREAM, 0.85)} />
            ))}
          </View>
        </View>
      </View>
    );
  }
  if (card.kind === 'wild') {
    const s = w * (tiny ? 0.26 : 0.22);
    return (
      <View style={[styles.face, { width: w, height: h, borderRadius: r, backgroundColor: C.ink, borderColor: C.yellow }]}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: s * 2.3, justifyContent: 'center', gap: s * 0.2 }}>
          {P10_COLORS.map((c) => (
            <Shape key={c} kind={P10_SHAPE[c]} size={s} color={P10_HEX[c]} />
          ))}
        </View>
        {tiny ? (
          <Icon name="star" size={w * 0.38} color={C.yellow} />
        ) : (
          <Text style={[styles.label, { color: C.yellow, fontSize: w * 0.24, lineHeight: w * 0.36 }]} numberOfLines={1}>
            جوكر
          </Text>
        )}
        {value ? (
          <View style={[styles.value, { minWidth: w * 0.36, height: w * 0.32, borderRadius: w * 0.16 }]}>
            <Text style={[styles.valueText, { fontSize: Math.max(9, w * 0.22), lineHeight: Math.max(12, w * 0.3) }]}>{value}</Text>
          </View>
        ) : null}
      </View>
    );
  }
  if (card.kind === 'skip') {
    return (
      <View style={[styles.face, { width: w, height: h, borderRadius: r, backgroundColor: '#E9E4F5', borderColor: '#2B2840' }]}>
        <View style={{ width: w * (tiny ? 0.7 : 0.5), height: w * (tiny ? 0.7 : 0.5), borderRadius: w, backgroundColor: '#2B2840', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="skip" size={w * (tiny ? 0.44 : 0.32)} color="#FFFFFF" />
        </View>
        {tiny ? null : (
          <Text style={[styles.label, { color: '#2B2840', fontSize: w * 0.23, lineHeight: w * 0.36 }]} numberOfLines={1}>
            تخطَّ
          </Text>
        )}
      </View>
    );
  }
  const hex = P10_HEX[card.color!];
  const shape = P10_SHAPE[card.color!];
  const big = w * (card.n! >= 10 ? 0.5 : 0.6);
  return (
    <View style={[styles.face, { width: w, height: h, borderRadius: r, backgroundColor: CREAM, borderColor: hex }]}>
      {!tiny ? (
        <>
          <View style={[styles.corner, { top: w * 0.07, left: w * 0.07 }]}>
            <Shape kind={shape} size={w * 0.2} color={hex} />
          </View>
          <View style={[styles.corner, { bottom: w * 0.07, right: w * 0.07 }]}>
            <Shape kind={shape} size={w * 0.2} color={hex} />
          </View>
        </>
      ) : null}
      <Text style={[styles.number, { color: hex, fontSize: big, lineHeight: big * 1.25 }]}>{card.n}</Text>
      {tiny ? <Shape kind={shape} size={w * 0.26} color={hex} /> : null}
    </View>
  );
}

export const P10CardView = memo(function P10CardView({
  card,
  w,
  selected,
  dim,
  glow,
  value,
  onPress,
}: {
  card: P10Card | null;
  w: number;
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  value?: number;
  onPress?: () => void;
}) {
  // the lift and the dimming glide; the Pressable sits inside the lifted view, so a second tap lands
  // exactly on the raised card
  const look = useCardLook({ lift: selected ? 8 : 0, dim, dimTo: 0.4 });
  const face = (
    <View
      style={[
        styles.wrap,
        { borderRadius: Math.max(6, w * 0.12) + 2 },
        selected && { borderColor: C.yellow, backgroundColor: C.yellow },
        glow && !selected && { borderColor: alpha(C.yellow, 0.7) },
      ]}>
      <Face card={card} w={w} value={value} />
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
          hitSlop={2}
          accessibilityRole="button"
          accessibilityState={{ selected: !!selected }}
          accessibilityLabel={card ? `ورقة ${p10CardName(card)}` : 'الكومة'}>
          {face}
        </Pressable>
      ) : (
        face
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  face: { borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  backInner: { position: 'absolute', top: 4, bottom: 4, left: 4, right: 4, borderWidth: 1.5, borderColor: alpha(CREAM, 0.5), alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute' },
  number: { fontFamily: F.black, textAlign: 'center', includeFontPadding: false },
  label: { fontFamily: F.black, textAlign: 'center', includeFontPadding: false },
  value: { position: 'absolute', top: 2, right: 2, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  valueText: { fontFamily: F.black, color: C.ink, includeFontPadding: false },
});
