/**
 * «الممالك الخمس» cards, drawn with react-native-svg: five suits with their own colour and symbol (a red
 * flame, a golden sun, a green leaf, a blue drop, a purple star) so colour-blind players can tell them
 * apart, a big rank in the suit's colour, the jokers dark with a golden crown, and the back. The round's
 * wild cards wear a golden ring and a «جوكر» tag. The design is ours.
 * Below ~46 px wide a card keeps only the big rank and the symbol, so it stays readable in a hand of 14.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { haptic } from '@/lib/sfx';
import { REALM_SUITS, type RealmCard, type RealmGroup, type RealmSuit } from '@/shared/games/realms';
import { isJoker, isWild, rankLabel, realmCardName } from '@/shared/realms-rules';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Txt } from '@/ui/txt';

import { CardMotion, useCardLook, type Side } from './cards/motion';

/** height / width */
export const REALM_RATIO = 1.4;

/** each suit's colour (bright, for symbols) and ink (darker, for the rank on paper) */
export const REALM_HEX: Record<RealmSuit, string> = { fire: '#D7263D', sun: '#E59A12', leaf: '#2E9E4F', water: '#1F7AE0', star: '#8445CF' };
const INK: Record<RealmSuit, string> = { fire: '#B81D32', sun: '#B5730A', leaf: '#21803D', water: '#1862B8', star: '#6B33AD' };
const PAPER = '#FFF9EE';
const GOLD = '#F2C23D';
const JOKER_BG = '#2A2350';

function starPath(cx: number, cy: number, r: number, inner = 0.45): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)} ${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}

const SUN_RAYS = (() => {
  const parts: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI / 4) * k;
    const p = (r: number, da: number) => `${(50 + r * Math.cos(a + da)).toFixed(1)} ${(50 + r * Math.sin(a + da)).toFixed(1)}`;
    parts.push(`M${p(30, -0.2)} L${p(47, 0)} L${p(30, 0.2)} Z`);
  }
  return parts.join(' ');
})();

/** A suit's symbol in a 100×100 box (placed with x, y, size). `light`: drawn for a dark background. */
export function SuitIcon({ suit, x, y, size, color }: { suit: RealmSuit; x: number; y: number; size: number; color?: string }) {
  const col = color ?? REALM_HEX[suit];
  const k = size / 100;
  let body;
  switch (suit) {
    case 'fire':
      body = (
        <>
          <Path d="M50 4 C60 24 80 34 80 60 C80 82 66 96 50 96 C34 96 20 82 20 62 C20 46 30 36 36 26 C38 40 42 48 47 52 C44 36 44 20 50 4 Z" fill={col} />
          {color ? null : <Path d="M50 50 C57 60 64 66 64 76 C64 87 57 94 50 94 C43 94 36 87 36 78 C36 69 45 62 50 50 Z" fill="#FFB347" />}
        </>
      );
      break;
    case 'sun':
      body = (
        <>
          <Path d={SUN_RAYS} fill={col} />
          <Circle cx={50} cy={50} r={24} fill={col} />
          {color ? null : <Circle cx={50} cy={50} r={15} fill="#FFD66B" />}
        </>
      );
      break;
    case 'leaf':
      body = (
        <>
          <Path d="M50 4 C82 22 88 62 52 92 L50 96 L48 92 C12 62 18 22 50 4 Z" fill={col} />
          <Path d="M50 92 L50 22 M50 44 L36 34 M50 44 L64 34 M50 62 L34 50 M50 62 L66 50 M50 78 L38 68 M50 78 L62 68" stroke={color ? JOKER_BG : '#E6F6EA'} strokeWidth={4} strokeLinecap="round" fill="none" />
        </>
      );
      break;
    case 'water':
      body = (
        <>
          <Path d="M50 4 C62 28 82 46 82 66 C82 84 68 96 50 96 C32 96 18 84 18 66 C18 46 38 28 50 4 Z" fill={col} />
          {color ? null : <Path d="M36 66 C36 56 42 48 46 44" stroke="#CFE4FF" strokeWidth={6} strokeLinecap="round" fill="none" />}
        </>
      );
      break;
    case 'star':
      body = <Path d={starPath(50, 54, 48, 0.46)} fill={col} />;
      break;
  }
  return <G transform={`translate(${x} ${y}) scale(${k})`}>{body}</G>;
}

/** A suit symbol on its own (in a line of text, a chip). */
export function SuitGlyph({ suit, size }: { suit: RealmSuit; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <SuitIcon suit={suit} x={0} y={0} size={100} />
    </Svg>
  );
}

function Back({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * REALM_RATIO} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={10} fill="#2A2F66" stroke={PAPER} strokeWidth={2.5} />
      <Rect x={8} y={8} width={84} height={124} rx={7} fill="none" stroke={alpha(PAPER, 0.45)} strokeWidth={1.5} />
      {REALM_SUITS.map((s, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        return <SuitIcon key={s} suit={s} x={50 + 26 * Math.cos(a) - 11} y={70 + 26 * Math.sin(a) - 11} size={22} />;
      })}
      <Path d="M38 76 L36 62 L44 68 L50 58 L56 68 L64 62 L62 76 Z" fill={GOLD} />
    </Svg>
  );
}

function JokerFace({ width }: { width: number }) {
  const small = width < 46;
  return (
    <Svg width={width} height={width * REALM_RATIO} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={10} fill={JOKER_BG} stroke={GOLD} strokeWidth={2.5} />
      {/* a crown over the five suits */}
      <Path d={small ? 'M22 80 L18 38 L36 56 L50 30 L64 56 L82 38 L78 80 Z' : 'M28 70 L24 36 L39 52 L50 28 L61 52 L76 36 L72 70 Z'} fill={GOLD} />
      {small ? null : <Rect x={28} y={68} width={44} height={8} rx={3} fill={GOLD} />}
      {REALM_SUITS.map((s, i) => {
        const size = small ? 15 : 12;
        const x = (small ? 12 : 20) + i * (small ? 16 : 13);
        return <SuitIcon key={s} suit={s} x={x} y={small ? 96 : 86} size={size} />;
      })}
      {small ? null : (
        <SvgText x={50} y={124} fill={GOLD} fontSize={17} fontWeight="700" textAnchor="middle" fontFamily="Arial">
          JOKER
        </SvgText>
      )}
    </Svg>
  );
}

function Face({ card, width }: { card: RealmCard; width: number }) {
  const suit = card.suit!;
  const small = width < 46;
  const label = rankLabel(card.rank);
  const ten = label === '10';
  const ink = INK[suit];
  if (small) {
    return (
      <Svg width={width} height={width * REALM_RATIO} viewBox="0 0 100 140">
        <Rect x={1} y={1} width={98} height={138} rx={10} fill={PAPER} stroke={alpha(REALM_HEX[suit], 0.55)} strokeWidth={3} />
        <SvgText x={50} y={70} fill={ink} fontSize={ten ? 54 : 64} fontWeight="700" textAnchor="middle" fontFamily="Arial" letterSpacing={ten ? -4 : 0}>
          {label}
        </SvgText>
        <SuitIcon suit={suit} x={27} y={80} size={46} />
      </Svg>
    );
  }
  const corner = (
    <G>
      <SvgText x={8} y={26} fill={ink} fontSize={ten ? 20 : 23} fontWeight="700" fontFamily="Arial" letterSpacing={ten ? -2 : 0}>
        {label}
      </SvgText>
      <SuitIcon suit={suit} x={7} y={30} size={14} />
    </G>
  );
  return (
    <Svg width={width} height={width * REALM_RATIO} viewBox="0 0 100 140">
      <Rect x={1} y={1} width={98} height={138} rx={10} fill={PAPER} stroke={alpha(REALM_HEX[suit], 0.55)} strokeWidth={2.5} />
      <Circle cx={50} cy={70} r={34} fill={alpha(REALM_HEX[suit], 0.1)} />
      <SvgText x={50} y={74} fill={ink} fontSize={ten ? 40 : 46} fontWeight="700" textAnchor="middle" fontFamily="Arial" letterSpacing={ten ? -3 : 0}>
        {label}
      </SvgText>
      <SuitIcon suit={suit} x={36} y={80} size={28} />
      {corner}
      <G transform="rotate(180 50 70)">{corner}</G>
    </Svg>
  );
}

/** Just the drawing: a face (null = the back). */
export const RealmFace = memo(function RealmFace({ card, width }: { card: RealmCard | null; width: number }) {
  if (!card) return <Back width={width} />;
  return isJoker(card) ? <JokerFace width={width} /> : <Face card={card} width={width} />;
});

/**
 * A card that can be selected (lifts), dimmed, ringed (the player who threw it), marked as the round's
 * wild (`wild`: a golden ring and a «جوكر» tag) and tapped. `badge`: a small red «+7» (the points it
 * would cost: it fits nowhere yet).
 */
export function RealmCardView({
  card,
  width,
  wild,
  selected,
  dim,
  ring,
  badge,
  onPress,
  steady,
}: {
  card: RealmCard | null;
  width: number;
  wild?: boolean;
  selected?: boolean;
  dim?: boolean;
  ring?: string;
  badge?: string;
  onPress?: () => void;
  /** keep the tap target mounted while onPress comes and goes (my hand: no blink at a change of turn) */
  steady?: boolean;
}) {
  const look = useCardLook({ lift: selected ? 10 : 0, dim, dimTo: 0.4 });
  const joker = !!card && isJoker(card);
  const small = width < 46;
  const face = (
    <View
      style={[
        styles.wrap,
        { borderRadius: width * 0.1 + 3 },
        wild && !joker ? styles.wild : null,
        ring && !selected ? { borderColor: ring, borderWidth: 2.5 } : null,
        selected ? { borderColor: C.yellow } : null,
      ]}>
      <RealmFace card={card} width={width} />
      {wild && !joker ? (
        <View style={[styles.tag, small && styles.tagSmall]} pointerEvents="none">
          <Txt style={[styles.tagText, small && { fontSize: 9, lineHeight: 13 }]}>{small ? '★' : 'جوكر'}</Txt>
        </View>
      ) : null}
      {badge ? (
        <View style={styles.badge} pointerEvents="none">
          <Txt style={styles.badgeText}>{badge}</Txt>
        </View>
      ) : null}
    </View>
  );
  return (
    <Animated.View style={look}>
      {onPress || steady ? (
        <Pressable
          disabled={!onPress}
          onPress={() => {
            if (!onPress) return;
            haptic.tap();
            onPress();
          }}
          hitSlop={2}
          accessibilityRole="button"
          accessibilityState={{ selected: !!selected }}
          accessibilityLabel={card ? `ورقة ${realmCardName(card)}${wild && !joker ? '، جوكر الجولة' : ''}` : 'الكومة'}>
          {face}
        </Pressable>
      ) : (
        face
      )}
    </Animated.View>
  );
}

/** The groups a player laid down (the one who went out, on the table). */
export function GroupsRow({ groups, w, wild, from, motion = true }: { groups: RealmGroup[]; w: number; wild: number; from?: Side; motion?: boolean }) {
  return (
    <Row wrap gap={6} style={{ direction: 'ltr' }}>
      {groups.map((g) => (
        <View key={g.cards.map((c) => c.id).join(',')} style={groupStyle} accessibilityLabel={g.kind === 'book' ? 'مجموعة' : 'متتالية'}>
          <Row gap={2} style={{ direction: 'ltr' }}>
            {g.cards.map((c) =>
              motion ? (
                <CardMotion key={c.id} id={c.id} enter="play" from={from ?? 'top'} flow>
                  <RealmCardView card={c} width={w} wild={isWild(c, wild)} />
                </CardMotion>
              ) : (
                <RealmCardView key={c.id} card={c} width={w} wild={isWild(c, wild)} />
              ),
            )}
          </Row>
        </View>
      ))}
    </Row>
  );
}

const groupStyle = { padding: 3, paddingBottom: 6, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' } as const;

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
  wild: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  tag: { position: 'absolute', bottom: -8, alignSelf: 'center', backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 6 },
  tagSmall: { paddingHorizontal: 4, bottom: -7 },
  tagText: { fontFamily: F.black, fontSize: 10, lineHeight: 15, color: C.ink },
  badge: { position: 'absolute', top: -7, right: -6, backgroundColor: C.red, borderRadius: 999, paddingHorizontal: 4, minWidth: 18, alignItems: 'center', direction: 'ltr' },
  badgeText: { fontFamily: F.black, fontSize: 10, lineHeight: 15, color: '#FFFFFF', writingDirection: 'ltr' },
});
