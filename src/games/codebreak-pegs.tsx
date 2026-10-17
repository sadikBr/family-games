/**
 * «فك الشيفرة»: the coloured pegs and the clue dots. Every colour also has its own shape, drawn with
 * plain views (no emoji fonts), so players who don't tell colours apart can still read a code.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { C } from '@/theme';

type Shape = 'circle' | 'triangle' | 'square' | 'diamond' | 'plus' | 'ring' | 'cross' | 'bars';

/** Colours picked to stay apart for colour-blind eyes (light / dark alternate), each with a shape. */
export const PEGS: { color: string; ink: string; name: string; shape: Shape }[] = [
  { color: '#E8553E', ink: '#151726', name: 'أحمر', shape: 'circle' },
  { color: '#F5D33F', ink: '#151726', name: 'أصفر', shape: 'triangle' },
  { color: '#1FA37A', ink: '#151726', name: 'أخضر', shape: 'square' },
  { color: '#62BDF2', ink: '#151726', name: 'سماوي', shape: 'diamond' },
  { color: '#2D55D2', ink: '#FFFFFF', name: 'أزرق', shape: 'plus' },
  { color: '#E883BE', ink: '#151726', name: 'وردي', shape: 'ring' },
  { color: '#F7F4EC', ink: '#151726', name: 'أبيض', shape: 'cross' },
  { color: '#8A5530', ink: '#FFFFFF', name: 'بني', shape: 'bars' },
];

function PegMark({ shape, size, ink }: { shape: Shape; size: number; ink: string }) {
  const k = size;
  const bar = Math.max(2, Math.round(k * 0.26));
  const center = { position: 'absolute' as const };
  let body: ReactNode = null;
  switch (shape) {
    case 'circle':
      body = <View style={{ width: k * 0.72, height: k * 0.72, borderRadius: k, backgroundColor: ink }} />;
      break;
    case 'triangle':
      body = (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: k * 0.46,
            borderRightWidth: k * 0.46,
            borderBottomWidth: k * 0.8,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: ink,
            marginTop: -k * 0.08,
          }}
        />
      );
      break;
    case 'square':
      body = <View style={{ width: k * 0.66, height: k * 0.66, backgroundColor: ink, borderRadius: 2 }} />;
      break;
    case 'diamond':
      body = <View style={{ width: k * 0.6, height: k * 0.6, backgroundColor: ink, transform: [{ rotate: '45deg' }] }} />;
      break;
    case 'plus':
    case 'cross':
      body = (
        <View style={{ width: k, height: k, alignItems: 'center', justifyContent: 'center', transform: shape === 'cross' ? [{ rotate: '45deg' }] : undefined }}>
          <View style={[center, { width: k * 0.9, height: bar, backgroundColor: ink, borderRadius: 1 }]} />
          <View style={[center, { width: bar, height: k * 0.9, backgroundColor: ink, borderRadius: 1 }]} />
        </View>
      );
      break;
    case 'ring':
      body = <View style={{ width: k * 0.76, height: k * 0.76, borderRadius: k, borderWidth: Math.max(2, k * 0.18), borderColor: ink }} />;
      break;
    case 'bars':
      body = (
        <View style={{ gap: bar * 0.9 }}>
          <View style={{ width: k * 0.8, height: bar, backgroundColor: ink, borderRadius: 1 }} />
          <View style={{ width: k * 0.8, height: bar, backgroundColor: ink, borderRadius: 1 }} />
        </View>
      );
      break;
  }
  return <View style={{ width: k, height: k, alignItems: 'center', justifyContent: 'center' }}>{body}</View>;
}

/** One peg: a coloured disc with its shape; `null` draws an empty hole. */
export function Peg({ c, size, active }: { c: number | null; size: number; active?: boolean }) {
  if (c === null) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: active ? C.yellow : C.borderStrong,
          backgroundColor: 'rgba(0,0,0,0.18)',
        }}
      />
    );
  }
  const p = PEGS[c] ?? PEGS[0];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: p.color,
        borderWidth: Math.max(1.5, size / 20),
        borderColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        direction: 'ltr',
      }}>
      <PegMark shape={p.shape} size={size * 0.46} ink={p.ink} />
    </View>
  );
}

/** Clue dots: filled = right place, hollow ring = right colour elsewhere, faint = nothing. */
export function KeyPegs({ black, white, pegs, dot = 10 }: { black: number; white: number; pegs: number; dot?: number }) {
  const cols = pegs <= 4 ? 2 : 3;
  const kinds = Array.from({ length: pegs }, (_, i) => (i < black ? 'b' : i < black + white ? 'w' : 'n'));
  const gap = Math.max(2, Math.round(dot * 0.3));
  return (
    <View style={{ width: cols * dot + (cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', gap, direction: 'ltr' }} accessibilityLabel={`${black} في مكانه، ${white} في مكان آخر`}>
      {kinds.map((k, i) => (
        <View
          key={i}
          style={{
            width: dot,
            height: dot,
            borderRadius: dot / 2,
            backgroundColor: k === 'b' ? C.text : 'transparent',
            borderWidth: k === 'n' ? 0 : Math.max(1.5, dot * 0.2),
            borderColor: C.text,
            ...(k === 'n' ? { backgroundColor: 'rgba(255,255,255,0.12)', transform: [{ scale: 0.6 }] } : null),
          }}
        />
      ))}
    </View>
  );
}

/** Mini clue dots in one line (the others' progress). */
export function KeyLine({ black, white, pegs, dot = 6 }: { black: number; white: number; pegs: number; dot?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, direction: 'ltr' }}>
      {Array.from({ length: pegs }, (_, i) => {
        const k = i < black ? 'b' : i < black + white ? 'w' : 'n';
        return (
          <View
            key={i}
            style={{
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: k === 'b' ? C.text : k === 'n' ? 'rgba(255,255,255,0.12)' : 'transparent',
              borderWidth: k === 'w' ? 1.5 : 0,
              borderColor: C.text,
            }}
          />
        );
      })}
    </View>
  );
}
