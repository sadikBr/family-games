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
  /** the frame and tint when it's this player's turn (a mark colour like X/O); defaults to the player's colour */
  color?: string;
  /** what this player plays with (a piece image, a mark); without it, a dot in `swatch` (or `color`) */
  mark?: ReactNode;
  swatch?: string;
  sub?: string;
  /** Games won in this series (shown once someone has won one). */
  score?: number;
}

/** «لماما»، «للجدّ»، «لـ Sam»: a name after the preposition لـ, so lines about a player need no verb. */
export const li = (n: string) => (/^[\u0621-\u064A]/.test(n) ? `ل${n.startsWith('ال') ? n.slice(1) : n}` : `لـ${n}`);

/** «الفوز لماما» — the winner's line without a verb conjugated for them. */
export const winLine = (name: string) => `الفوز ${li(name)}`;

/**
 * The two players of a 1-vs-1 game, styled like the shared PlayerStrip: same chips, the player on
 * turn framed and tinted in their colour, «(أنت)» for me, plus what each one plays with (a piece,
 * a mark) and the series score once someone has won a game.
 */
export function DuelBar({ slots, active, h }: { slots: DuelSlot[]; active: string | null; h: Helpers }) {
  const series = slots.some((s) => (s.score ?? 0) > 0);
  return (
    <Row gap={6} style={{ justifyContent: 'center', width: '100%' }}>
      {slots.map((s) => {
        const p = h.player(s.id);
        const color = s.color ?? p.color;
        const on = active === s.id;
        return (
          <View
            key={s.id}
            accessibilityLabel={`${p.name}${s.sub ? ` — ${s.sub}` : ''}${series ? ` — الفوز: ${s.score ?? 0}` : ''}${on ? ' — دوره الآن' : ''}`}
            style={[styles.player, on && { borderColor: color, backgroundColor: alpha(color, 0.2) }]}>
            <Avatar player={p} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="tiny" numberOfLines={1} style={{ fontSize: 13 }}>
                {p.name}
                {s.id === h.me ? ' (أنت)' : ''}
              </Txt>
              <Row gap={4}>
                {s.mark ?? <View style={[styles.dot, { backgroundColor: s.swatch ?? color }]} />}
                {s.sub ? (
                  <Txt v="tiny" color={C.muted} numberOfLines={2} style={{ fontSize: 11, lineHeight: 15, flexShrink: 1 }}>
                    {s.sub}
                  </Txt>
                ) : null}
              </Row>
            </View>
            {series ? (
              <Txt v="bold" color={on ? C.text : C.yellow} style={{ fontSize: 17 }}>
                {num(s.score ?? 0)}
              </Txt>
            ) : null}
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
  player: { flex: 1, minWidth: 0, maxWidth: 280, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1.5, borderColor: C.border },
  dot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: '#151726' },
});
