/**
 * «من سيربح المليون؟» — the pieces of the stage: the deep blue studio panel, the lozenges (the question and
 * the four answers أ ب ج د, drawn as the show's long hexagons on a thin rail), the money ladder, the three
 * lifeline buttons, the audience's chart and the phone-a-friend card.
 *
 * Motion stays gentle: a tone (the chosen answer lit orange, then green / red at the reveal) fades in over
 * the navy lozenge; nothing moves in the first moments after a screen opens.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Line, Path, Rect } from 'react-native-svg';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import { MILLION_LADDER, MILLION_LETTERS, MILLION_SAFE, formatMoney, type MillionLifeline } from '@/shared/games/million';
import { F, alpha } from '@/theme';
import { dk } from '@/ui/layout';
import { Txt, num } from '@/ui/txt';

import { useSettled } from './touch-motion';

export const GOLD = '#F4C552';
export const GOLD_DEEP = '#C9922A';
export const SILVER = '#C8CCEA';
export const NAVY = '#0D0A3E';
export const STAGE_TOP = '#23137A';
export const STAGE_MID = '#140C58';
export const STAGE_BOTTOM = '#07052A';
export const LIT = '#F08A1C';
export const RIGHT = '#2FB67C';
export const WRONG = '#E2475F';
export const CREAM = '#FFF6DE';

/** «1,000,000» with the digits kept left-to-right in Arabic text. */
export const money = (n: number) => num(formatMoney(n));

/** The deep studio panel everything sits on. */
export function Stage({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stage, style]}>
      <LinearGradient colors={[STAGE_TOP, STAGE_MID, STAGE_BOTTOM]} locations={[0, 0.35, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lozenges                                                            */
/* ------------------------------------------------------------------ */

function hexPath(w: number, h: number, tip: number) {
  const m = h / 2;
  return `M${tip} 1 H${w - tip} L${w - 1} ${m} L${w - tip} ${h - 1} H${tip} L1 ${m} Z`;
}

/**
 * The show's long hexagon: navy with a silver edge, on a thin rail that runs across. `tone` lights it
 * (fading in); the text sits in the middle.
 */
export function Lozenge({
  tone,
  edge = SILVER,
  rail = true,
  minHeight = 52,
  children,
  style,
}: {
  tone?: string | null;
  edge?: string;
  rail?: boolean;
  minHeight?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const settled = useSettled();
  const tip = Math.min(18, Math.round(box.h / 2.6));
  return (
    <View
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - box.w) > 0.5 || Math.abs(height - box.h) > 0.5) setBox({ w: width, h: height });
      }}
      style={[{ minHeight, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 6 }, style]}>
      {box.w > 0 ? (
        <>
          {rail ? <View pointerEvents="none" style={[styles.rail, { top: box.h / 2 - 1 }]} /> : null}
          <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={box.w} height={box.h}>
            <Path d={hexPath(box.w, box.h, tip)} fill={NAVY} stroke={edge} strokeWidth={2} />
          </Svg>
          {tone ? (
            <Animated.View key={tone} pointerEvents="none" entering={settled ? FadeIn.duration(420) : undefined} style={StyleSheet.absoluteFill}>
              <Svg width={box.w} height={box.h}>
                <Path d={hexPath(box.w, box.h, tip)} fill={tone} stroke={CREAM} strokeWidth={2} />
              </Svg>
            </Animated.View>
          ) : null}
        </>
      ) : null}
      {children}
    </View>
  );
}

export function QuestionLozenge({ text, label, kicker }: { text: string; label?: string; kicker?: string }) {
  return (
    <Lozenge minHeight={dk(76)} edge={GOLD} style={{ paddingHorizontal: 26, paddingVertical: 8 }}>
      {kicker ? (
        <Txt v="tiny" center color={alpha(GOLD, 0.9)}>
          {kicker}
          {label ? ` · ${label}` : ''}
        </Txt>
      ) : null}
      <Txt center style={{ fontFamily: F.bold, color: '#FFFFFF', fontSize: dk(17), lineHeight: Math.round(dk(17) * 1.55) }}>
        {text}
      </Txt>
    </Lozenge>
  );
}

export type AnswerState = 'idle' | 'chosen' | 'locked' | 'right' | 'wrong' | 'gone';

const TONE: Record<AnswerState, string | null> = { idle: null, chosen: '#9A4E0C', locked: LIT, right: RIGHT, wrong: WRONG, gone: null };

/** One answer: «أ: الرباط». */
export function AnswerLozenge({ index, text, state, mine, onPress, disabled }: { index: number; text: string; state: AnswerState; mine?: boolean; onPress?: () => void; disabled?: boolean }) {
  const gone = state === 'gone';
  const lit = state === 'locked' || state === 'right' || state === 'wrong';
  return (
    <Pressable
      disabled={disabled || gone || !onPress}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${MILLION_LETTERS[index]}: ${gone ? 'محذوفة' : text}`}
      accessibilityState={{ selected: state === 'chosen' || state === 'locked', disabled: disabled || gone }}
      style={({ pressed }) => [{ opacity: gone ? 0.35 : pressed ? 0.85 : 1 }]}>
      <Lozenge tone={TONE[state]} minHeight={dk(44)} style={{ paddingVertical: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt style={{ fontFamily: F.black, color: lit ? '#FFFFFF' : GOLD, fontSize: dk(16), lineHeight: Math.round(dk(16) * 1.5) }}>{MILLION_LETTERS[index]}:</Txt>
          <Txt numberOfLines={3} style={{ flex: 1, fontFamily: F.bold, color: lit ? '#FFFFFF' : CREAM, fontSize: dk(15), lineHeight: Math.round(dk(15) * 1.5) }}>
            {gone ? '' : text}
          </Txt>
          {mine ? (
            <View style={styles.mineDot} accessibilityLabel="جوابك">
              <Icon name="user" size={11} color={NAVY} />
            </View>
          ) : null}
        </View>
      </Lozenge>
    </Pressable>
  );
}

/** The four answers: two by two when there is room, else one under the other. */
export function AnswerGrid({ options, stateOf, mineOf, onPick, disabled }: { options: string[]; stateOf: (i: number) => AnswerState; mineOf?: (i: number) => boolean; onPick?: (i: number) => void; disabled?: boolean }) {
  const [width, setWidth] = useState(0);
  const two = width >= 420;
  const gap = 8;
  const w = two ? Math.floor((width - gap) / 2) - 1 : width;
  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', flexWrap: 'wrap', gap, opacity: width ? 1 : 0 }}>
      {options.map((o, i) => (
        <View key={i} style={{ width: w }}>
          <AnswerLozenge index={i} text={o} state={stateOf(i)} mine={mineOf?.(i)} disabled={disabled} onPress={onPick ? () => onPick(i) : undefined} />
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The money ladder                                                    */
/* ------------------------------------------------------------------ */

/** The 15 rungs, the million on top: the current one in gold, the safe ones in white, the ones passed marked. */
export function Ladder({ step, won, active, compact }: { step: number; won: number; active: boolean; compact?: boolean }) {
  const rows = [...MILLION_LADDER.keys()].reverse();
  return (
    <View style={styles.ladder} accessibilityLabel={`سلّم الجوائز: السؤال ${step + 1}`}>
      {rows.map((i) => {
        const current = active && i === step;
        const safe = (MILLION_SAFE as readonly number[]).includes(i);
        const passed = i < won;
        return (
          <View key={i} style={[styles.rung, { paddingVertical: compact ? 1 : 2 }, current && { backgroundColor: GOLD }]}>
            <Txt style={[styles.rungNo, { color: current ? NAVY : alpha(GOLD, 0.75) }]}>{num(i + 1)}</Txt>
            <View style={{ width: 12, alignItems: 'center' }}>{passed ? <View style={[styles.diamond, { backgroundColor: current ? NAVY : GOLD }]} /> : null}</View>
            <Txt style={[styles.rungAmount, { color: current ? NAVY : safe ? '#FFFFFF' : GOLD, fontFamily: safe || current ? F.black : F.bold }]}>{money(MILLION_LADDER[i])}</Txt>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lifelines                                                           */
/* ------------------------------------------------------------------ */

const LIFE_LABEL: Record<MillionLifeline, string> = { fifty: 'حذف إجابتين', audience: 'اسأل الجمهور', friend: 'اتصل بصديق' };

function PhoneGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"
        fill={color}
      />
    </Svg>
  );
}

function AudienceGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={13} width={4} height={8} rx={1} fill={color} />
      <Rect x={10} y={6} width={4} height={15} rx={1} fill={color} />
      <Rect x={17} y={10} width={4} height={11} rx={1} fill={color} />
    </Svg>
  );
}

function LifeFace({ kind, size, color }: { kind: MillionLifeline; size: number; color: string }) {
  if (kind === 'fifty') return <Txt style={{ fontFamily: F.black, color, fontSize: size * 0.3, lineHeight: size * 0.42 }}>{num('50:50')}</Txt>;
  if (kind === 'audience') return <AudienceGlyph size={size * 0.46} color={color} />;
  return <PhoneGlyph size={size * 0.46} color={color} />;
}

/** The three lifeline ovals: used ones crossed out; only the contestant can press them. */
export function Lifelines({ used, can, onUse, enabled }: { used: Record<MillionLifeline, boolean>; can: Record<MillionLifeline, boolean>; onUse?: (l: MillionLifeline) => void; enabled: boolean }) {
  const size = dk(56);
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: dk(14) }}>
      {(['fifty', 'audience', 'friend'] as MillionLifeline[]).map((l) => {
        const off = used[l] || !can[l];
        const press = enabled && !off && !!onUse;
        return (
          <Pressable
            key={l}
            disabled={!press}
            onPress={() => onUse?.(l)}
            accessibilityRole="button"
            accessibilityLabel={`${LIFE_LABEL[l]}${used[l] ? ' — استُعملت' : !can[l] ? ' — غير متاحة' : ''}`}
            style={({ pressed }) => [{ alignItems: 'center', gap: 2, opacity: pressed ? 0.8 : 1 }]}>
            <View style={[styles.life, { width: size * 1.3, height: size, borderRadius: size / 2, borderColor: off ? alpha(SILVER, 0.3) : press ? GOLD : SILVER, opacity: off ? 0.45 : 1 }]}>
              <LifeFace kind={l} size={size} color={off ? SILVER : '#FFFFFF'} />
              {used[l] ? (
                <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={size * 1.3} height={size}>
                  <Line x1={size * 0.32} y1={size * 0.2} x2={size * 0.98} y2={size * 0.8} stroke={WRONG} strokeWidth={4} strokeLinecap="round" />
                  <Line x1={size * 0.98} y1={size * 0.2} x2={size * 0.32} y2={size * 0.8} stroke={WRONG} strokeWidth={4} strokeLinecap="round" />
                </Svg>
              ) : null}
            </View>
            <Txt v="tiny" color={off ? alpha(SILVER, 0.5) : SILVER} style={{ fontSize: 11 }}>
              {LIFE_LABEL[l]}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The audience's chart                                                */
/* ------------------------------------------------------------------ */

export function PollChart({ counts, removed }: { counts: number[]; removed: number[] }) {
  const settled = useSettled();
  const total = counts.reduce((a, b) => a + b, 0);
  const H = dk(64);
  return (
    <Animated.View entering={settled ? FadeIn.duration(300) : undefined} style={styles.poll} accessibilityLabel="تصويت الجمهور">
      <Txt v="tiny" center color={GOLD}>
        تصويت الجمهور {total ? `· ${num(total)} ${total === 1 ? 'صوت' : total === 2 ? 'صوتان' : total <= 10 ? 'أصوات' : 'صوتاً'}` : ''}
      </Txt>
      {total === 0 ? (
        <Txt v="small" center color={SILVER}>
          لم تصل أصوات من الجمهور
        </Txt>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: H + 42 }}>
          {counts.map((c, i) => {
            const pct = Math.round((100 * c) / total);
            return (
              <View key={i} style={{ alignItems: 'center', gap: 2, width: dk(46), opacity: removed.includes(i) ? 0.35 : 1 }}>
                <Txt style={{ fontFamily: F.black, fontSize: 13, lineHeight: 19, color: CREAM }}>{num(`${pct}%`)}</Txt>
                <View style={{ height: H, justifyContent: 'flex-end', width: dk(26) }}>
                  <View style={{ height: Math.max(2, (H * pct) / 100), backgroundColor: GOLD, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                </View>
                <Txt style={{ fontFamily: F.black, fontSize: 14, lineHeight: 20, color: GOLD }}>{MILLION_LETTERS[i]}</Txt>
              </View>
            );
          })}
        </View>
      )}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Small bits                                                          */
/* ------------------------------------------------------------------ */

/** Seconds left on a deadline («18 ث»). */
export function SecondsLeft({ endsAt, color = SILVER }: { endsAt: number | null; color?: string }) {
  const left = useCountdown(endsAt, 250);
  return (
    <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color }}>
      {num(Math.ceil(left / 1000))} ث
    </Txt>
  );
}

export const styles = StyleSheet.create({
  stage: { borderRadius: 24, overflow: 'hidden', padding: 12, gap: 10, borderWidth: 1.5, borderColor: alpha(GOLD, 0.35) },
  rail: { position: 'absolute', left: -14, right: -14, height: 2, backgroundColor: alpha(SILVER, 0.55) },
  mineDot: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#8FD3DC', alignItems: 'center', justifyContent: 'center' },
  ladder: { backgroundColor: alpha(NAVY, 0.85), borderRadius: 16, borderWidth: 1, borderColor: alpha(GOLD, 0.35), padding: 6, gap: 1 },
  rung: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8 },
  rungNo: { fontFamily: F.bold, fontSize: 12, lineHeight: 18, minWidth: 18, textAlign: 'center' },
  rungAmount: { flex: 1, fontSize: 14, lineHeight: 20, textAlign: 'left' },
  diamond: { width: 7, height: 7, transform: [{ rotate: '45deg' }] },
  life: { borderWidth: 2, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  poll: { backgroundColor: alpha(NAVY, 0.9), borderRadius: 18, borderWidth: 1.5, borderColor: alpha(GOLD, 0.45), padding: 10, gap: 6 },
  card: { backgroundColor: alpha(NAVY, 0.9), borderRadius: 18, borderWidth: 1.5, borderColor: alpha(SILVER, 0.35), padding: 12, gap: 8 },
});

