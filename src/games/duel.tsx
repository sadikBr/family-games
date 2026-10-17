/** The two-player header used by the 1-vs-1 board games: avatar, name, a colour swatch, a short line and the series score. */
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Txt, num } from '@/ui/txt';

import type { Helpers } from './helpers';

export interface DuelSlot {
  id: string;
  color: string;
  mark?: ReactNode;
  sub?: string;
  /** Games won in this series (shown as «الفوز: n»). */
  score?: number;
}

export function DuelBar({ slots, active, h }: { slots: DuelSlot[]; active: string | null; h: Helpers }) {
  return (
    <Row gap={8} style={{ justifyContent: 'center', width: '100%' }}>
      {slots.map((s) => {
        const on = active === s.id;
        return (
          <View key={s.id} style={[styles.player, on && { borderColor: s.color, backgroundColor: alpha(s.color, 0.18) }]}>
            {s.mark ?? <View style={[styles.dot, { backgroundColor: s.color }]} />}
            <Avatar player={h.player(s.id)} size={30} />
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              <Txt v="tiny" numberOfLines={1}>
                {h.player(s.id).name}
                {s.id === h.me ? ' (أنت)' : ''}
              </Txt>
              {s.sub ? (
                <Txt v="tiny" color={C.dim} numberOfLines={1}>
                  {s.sub}
                </Txt>
              ) : null}
              {s.score !== undefined ? (
                <Txt v="tiny" color={C.yellow} numberOfLines={1}>
                  الفوز: {num(s.score)}
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </Row>
  );
}

/**
 * A piece that just arrived on its square: it slides in from where it came from (and through the squares
 * of a capture chain), so a quick move by the other player can be followed. `steps` are the earlier
 * positions, oldest first, as offsets in px from where the piece now sits. Remount it (key) per move.
 */
export function SlideIn({ steps, ms = 190, children }: { steps: { x: number; y: number }[]; ms?: number; children: ReactNode }) {
  const x = useSharedValue(steps[0]?.x ?? 0);
  const y = useSharedValue(steps[0]?.y ?? 0);
  useEffect(() => {
    if (!steps.length) return;
    const path = [...steps.slice(1), { x: 0, y: 0 }];
    const ease = { duration: ms, easing: Easing.inOut(Easing.quad) };
    x.set(withSequence(...path.map((p) => withTiming(p.x, ease))));
    y.set(withSequence(...path.map((p) => withTiming(p.y, ease))));
    // a new move remounts the piece: animate once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }, { translateY: y.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  player: { flexShrink: 1, minWidth: 0, maxWidth: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 2, borderColor: 'transparent' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#151726' },
});
