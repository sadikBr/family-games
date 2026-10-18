import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic, play } from '@/lib/sfx';
import { useCountdown } from '@/lib/time';
import type { PlayerPublic } from '@/shared/protocol';
import { C, F, alpha, hashRand } from '@/theme';

import { Avatar, Row } from './bits';
import { useAccent } from './accent';
import { Txt, num } from './txt';

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

export function TimerBar({ endsAt, total, onTick }: { endsAt: number | null; total: number; onTick?: boolean }) {
  const left = useCountdown(endsAt, 100);
  const secs = Math.ceil(left / 1000);
  const ratio = total > 0 ? Math.min(1, left / total) : 0;
  const color = ratio > 0.5 ? C.green : ratio > 0.2 ? C.yellow : C.red;
  const w = useSharedValue(ratio);
  useEffect(() => {
    w.set(withTiming(ratio, { duration: 120, easing: Easing.linear }));
  }, [ratio, w]);
  const lastTick = useRef(-1);
  useEffect(() => {
    if (onTick && secs <= 5 && secs > 0 && secs !== lastTick.current && endsAt) {
      lastTick.current = secs;
      play('tick');
      haptic.tap();
    }
  }, [secs, onTick, endsAt]);
  const st = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  return (
    <Row gap={10}>
      <View style={styles.timerTrack}>
        <Animated.View style={[styles.timerFill, { backgroundColor: color }, st]} />
      </View>
      <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26, color, minWidth: 30, textAlign: 'center' }}>{secs}</Txt>
    </Row>
  );
}

/** 3-2-1 countdown. */
export function CountdownBig({ endsAt }: { endsAt: number | null }) {
  const left = useCountdown(endsAt, 100);
  const n = Math.ceil(left / 1000);
  const o = useSharedValue(1);
  useEffect(() => {
    if (n > 0) {
      o.set(withSequence(withTiming(0.35, { duration: 0 }), withTiming(1, { duration: 220 })));
      play('tick');
      haptic.light();
    }
  }, [n, o]);
  const st = useAnimatedStyle(() => ({ opacity: o.get() }));
  return (
    <Animated.View style={[{ alignItems: 'center' }, st]}>
      <Txt style={{ fontFamily: F.display, fontSize: 110, lineHeight: 150, color: C.yellow }}>{n > 0 ? n : 'هيا'}</Txt>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Hold to reveal                                                      */
/* ------------------------------------------------------------------ */

export function HoldReveal({
  children,
  hint = 'اضغط مطوّلاً لرؤية سرّك',
  height = 220,
}: {
  children: ReactNode;
  color?: string;
  hint?: string;
  height?: number;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Pressable
      onPressIn={() => {
        haptic.light();
        setShown(true);
      }}
      onPressOut={() => setShown(false)}
      style={[styles.reveal, { height }, shown && styles.revealOpen]}>
      {shown ? (
        <Animated.View entering={FadeIn.duration(120)} style={styles.revealInner}>
          {children}
        </Animated.View>
      ) : (
        <View style={styles.revealInner}>
          <View style={styles.revealIcon}>
            <Icon name="eye" size={30} color={C.yellow} />
          </View>
          <Txt v="h3" center>
            {hint}
          </Txt>
          <Txt v="small" center color={C.muted}>
            خبّئ الشاشة عن الآخرين
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti (only for wins — small and short)                          */
/* ------------------------------------------------------------------ */

const CONFETTI_COLORS = [C.yellow, C.green, C.pink, C.cyan, C.orange, C.blue];

function Piece({ color, vx, vy, delay, spin, w }: { color: string; vx: number; vy: number; delay: number; spin: number; w: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(1, { duration: 1300, easing: Easing.out(Easing.quad) })));
  }, [p, delay]);
  const st = useAnimatedStyle(() => {
    const t = p.get();
    return {
      opacity: t === 0 ? 0 : 1 - t,
      transform: [{ translateX: vx * t }, { translateY: vy * t + 420 * t * t }, { rotate: `${spin * t}deg` }],
    };
  });
  return <Animated.View style={[styles.piece, { backgroundColor: color, width: w, height: w * 0.45 }, st]} />;
}

export function Confetti({ count = 16, burst = 0 }: { count?: number; burst?: number; emojis?: string[] }) {
  const { width } = useWindowDimensions();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        key: `${burst}-${i}`,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        vx: (hashRand(i + burst * 97, 1) - 0.5) * width * 0.9,
        vy: -180 - hashRand(i + burst * 97, 2) * 260,
        delay: hashRand(i + burst * 97, 3) * 150,
        spin: (hashRand(i + burst * 97, 4) - 0.5) * 540,
        w: 10 + hashRand(i + burst * 97, 5) * 6,
      })),
    [burst, count, width],
  );
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {pieces.map(({ key, ...p }) => (
        <Piece key={key} {...p} />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Small feedback                                                      */
/* ------------------------------------------------------------------ */

export function Shake({ children, trigger }: { children: ReactNode; trigger: unknown }) {
  const x = useSharedValue(0);
  useEffect(() => {
    if (trigger === undefined || trigger === null) return;
    x.set(
      withSequence(
        withTiming(-6, { duration: 45 }),
        withTiming(6, { duration: 45 }),
        withTiming(-3, { duration: 45 }),
        withTiming(0, { duration: 45 }),
      ),
    );
  }, [trigger, x]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

/** Quick fade when `k` changes (new card, new word…). */
export function PopIn({ children, k }: { children: ReactNode; k: string | number }) {
  return (
    <Animated.View key={k} entering={FadeIn.duration(160)}>
      {children}
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Scores                                                              */
/* ------------------------------------------------------------------ */

const MEDAL = [C.yellow, '#C9CED8', '#D08A55'];

function RankBadge({ rank }: { rank: number }) {
  const bg = MEDAL[rank] ?? C.surfaceStrong;
  return (
    <View style={[styles.rank, { backgroundColor: bg }]}>
      <Txt v="tiny" color={rank < 3 ? C.ink : C.text}>
        {rank + 1}
      </Txt>
    </View>
  );
}

export function Scoreboard({
  players,
  scores,
  lowIsBetter,
  unit = 'نقطة',
  highlight,
}: {
  players: PlayerPublic[];
  scores: Record<string, number>;
  lowIsBetter?: boolean;
  unit?: string;
  highlight?: string;
}) {
  const rows = players
    .filter((p) => p.id in scores)
    .map((p) => ({ p, s: scores[p.id] ?? 0 }))
    .sort((a, b) => (lowIsBetter ? a.s - b.s : b.s - a.s));
  const ranks: number[] = [];
  for (let i = 0; i < rows.length; i++) ranks.push(i > 0 && rows[i].s === rows[i - 1].s ? ranks[i - 1] : i);
  return (
    <View style={{ gap: 6 }}>
      {rows.map(({ p, s }, i) => (
        <View key={p.id} style={[styles.scoreRow, highlight === p.id && styles.scoreRowMe]}>
          <RankBadge rank={ranks[i]} />
          <Avatar player={p} size={32} />
          <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
            {p.name}
          </Txt>
          <Txt style={{ fontFamily: F.black, fontSize: 18, lineHeight: 26 }}>{num(s)}</Txt>
          <Txt v="tiny" color={C.dim}>
            {unit}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** Top-3 podium for the final screen. */
export function Podium({ players, scores, lowIsBetter }: { players: PlayerPublic[]; scores: Record<string, number>; lowIsBetter?: boolean }) {
  const sorted = players
    .filter((p) => p.id in scores)
    .sort((a, b) => (lowIsBetter ? scores[a.id] - scores[b.id] : scores[b.id] - scores[a.id]));
  const top = sorted.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights = [84, 60, 44];
  const accent = useAccent();
  // three columns that always fit the screen (16 px gutters, 10 px between columns)
  const { width } = useWindowDimensions();
  const colW = Math.min(96, (Math.min(width - 32, 560) - 20) / 3);
  return (
    <View style={{ alignItems: 'center', marginTop: 8 }}>
    <Row gap={10} style={{ alignItems: 'flex-end', justifyContent: 'center', direction: 'ltr' }}>
      {order.map((p) => {
        const place = top.indexOf(p);
        return (
          <View key={p.id} style={{ alignItems: 'center', gap: 6, width: colW }}>
            <Avatar player={p} size={Math.min(place === 0 ? 68 : 54, colW - 20)} crown={place === 0} />
            <Txt v="bold" numberOfLines={1} center>
              {p.name}
            </Txt>
            <View style={[styles.podium, { height: heights[place], backgroundColor: alpha(MEDAL[place], 0.9) }]}>
              <Txt style={{ fontFamily: F.black, fontSize: 20, lineHeight: 28, color: C.ink }}>{num(scores[p.id])}</Txt>
            </View>
          </View>
        );
      })}
    </Row>
    {/* the stage the podium stands on, in the game's colour */}
    <View style={{ height: 8, width: order.length * (colW + 10), borderRadius: 4, backgroundColor: alpha(accent, 0.55) }} />
    </View>
  );
}

const styles = StyleSheet.create({
  timerTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 4 },
  reveal: {
    borderRadius: 22,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderStyle: 'dashed',
  },
  revealOpen: { backgroundColor: '#FBF7EC', borderStyle: 'solid', borderColor: C.yellow },
  revealInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, gap: 6 },
  revealIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: alpha(C.yellow, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  confetti: { position: 'absolute', top: '40%', start: 0, end: 0, alignItems: 'center', zIndex: 100 },
  piece: { position: 'absolute', borderRadius: 2 },
  rank: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  scoreRowMe: { backgroundColor: alpha(C.yellow, 0.1) },
  podium: { width: '100%', borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: 'center', paddingTop: 6 },
});
