/**
 * 3D dice that get thrown onto the table: they fly in, tumble (pre-rendered 3D frames),
 * bounce and land on the rolled value. Used by Ludo and «ملك العقار».
 */
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BOARD_IMG } from '@/art/assets';
import { play } from '@/lib/sfx';

const FRAMES = 36; // 6×6 sprite sheet
const FLIGHT_MS = 950;

function Die({ value, rollId, size, from, to, delay, animate, onLanded, linger }: {
  value: number;
  rollId: number;
  size: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  delay: number;
  animate: boolean;
  onLanded?: () => void;
  linger?: number;
}) {
  const p = useSharedValue(animate ? 0 : 1);
  const fade = useSharedValue(animate || linger === undefined ? 1 : 0);
  const [landed, setLanded] = useState(!animate);
  // Defined on the JS side: worklets may only hand scheduleOnRN functions created outside the worklet.
  const land = () => {
    setLanded(true);
    onLanded?.();
  };

  useEffect(() => {
    if (!animate) return;
    p.set(0);
    p.set(
      withDelay(
        delay,
        withTiming(1, { duration: FLIGHT_MS, easing: Easing.out(Easing.quad) }, (done) => {
          if (done) scheduleOnRN(land);
        }),
      ),
    );
    fade.set(1);
    if (linger !== undefined) fade.set(withDelay(delay + FLIGHT_MS + linger, withTiming(0, { duration: 300 })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollId]);

  const body = useAnimatedStyle(() => {
    const t = p.get();
    const travel = Math.min(1, t * 1.25);
    const x = from.x + (to.x - from.x) * travel;
    const base = from.y + (to.y - from.y) * travel;
    const hop = size * 1.1 * Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * (1 - t);
    const squash = t > 0.97 ? 1 : 1 - 0.08 * Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t);
    return {
      opacity: fade.get(),
      transform: [{ translateX: x - size / 2 }, { translateY: base - hop - size / 2 }, { rotate: `${(1 - t) * (1 - t) * 900}deg` }, { scaleY: squash }],
    };
  });
  const sprite = useAnimatedStyle(() => {
    const f = Math.floor(p.get() * 54) % FRAMES;
    return { transform: [{ translateX: -(f % 6) * size }, { translateY: -Math.floor(f / 6) * size }] };
  });
  const shadow = useAnimatedStyle(() => {
    const t = p.get();
    const travel = Math.min(1, t * 1.25);
    const x = from.x + (to.x - from.x) * travel;
    const y = from.y + (to.y - from.y) * travel;
    const hop = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * (1 - t);
    return { opacity: (0.35 - hop * 0.25) * fade.get(), transform: [{ translateX: x - size * 0.35 }, { translateY: y + size * 0.3 }, { scale: 1 - hop * 0.4 }] };
  });

  return (
    <>
      <Animated.View style={[styles.shadow, { width: size * 0.7, height: size * 0.2, borderRadius: size }, shadow]} />
      <Animated.View style={[styles.die, { width: size, height: size }, body]}>
        {landed ? (
          <Image source={BOARD_IMG[`dice3d-${value}`]} style={{ width: size, height: size }} contentFit="contain" transition={0} />
        ) : (
          <View style={{ width: size, height: size, overflow: 'hidden' }}>
            <Animated.View style={sprite}>
              <Image source={BOARD_IMG['dice3d-tumble']} style={{ width: size * 6, height: size * 6 }} contentFit="fill" transition={0} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </>
  );
}

/**
 * values: the dice to show (null = nothing rolled yet). rollId changes on every new roll.
 * The dice are thrown inside a box of width × height.
 */
export function ThrownDice({ values, rollId, width, height, size = 64, onLanded, linger }: {
  values: number[] | null;
  rollId: number;
  width: number;
  height: number;
  size?: number;
  onLanded?: () => void;
  /** If set, the dice fade away this long after landing (when they're thrown over a board). */
  linger?: number;
}) {
  // the first render shows the current roll at rest; later rolls are thrown
  const [firstRoll] = useState(rollId);
  const animate = rollId !== firstRoll;
  useEffect(() => {
    if (animate) play('tick');
  }, [rollId, animate]);
  if (!values) return <View style={{ width, height }} />;
  const n = values.length;
  const gap = size * 0.25;
  const total = n * size + (n - 1) * gap;
  return (
    <View style={{ width, height, direction: 'ltr' }} pointerEvents="none">
      {values.map((v, i) => (
        <Die
          key={`${rollId}:${i}`}
          value={v}
          rollId={rollId}
          size={size}
          animate={animate}
          delay={i * 90}
          from={{ x: width + size * (0.6 + i * 0.5), y: height * (0.9 - i * 0.1) }}
          to={{ x: (width - total) / 2 + size / 2 + i * (size + gap), y: height / 2 + (i % 2 ? size * 0.08 : -size * 0.06) }}
          onLanded={i === n - 1 ? onLanded : undefined}
          linger={linger}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  die: { position: 'absolute', left: 0, top: 0 },
  shadow: { position: 'absolute', left: 0, top: 0, backgroundColor: '#05040e' },
});
