/**
 * «الدومينو» — a tile drawn with its pips (react-native-svg): an ivory face, a groove across the middle
 * with a small brass pin, black pips on a 3×3 grid. Vertical (w < h) or horizontal; `first` is the top
 * (vertical) or left (horizontal) half. The six turns with the tile: two columns of three on a vertical
 * tile, two rows of three on a horizontal one. Also the small face-down tile used for hand counts.
 */
import { View } from 'react-native';
import { Circle, Line, Rect, Svg } from 'react-native-svg';

const FACE = '#FBF5E6';
const EDGE = '#CDBF9F';
const GROOVE = '#BBAE8E';
const PIP = '#1F2230';
const PIN = '#C29A45';

/** Pip centres in a half (0..1), for a vertical tile; a horizontal tile swaps x and y. */
const SPOTS: Record<number, [number, number][]> = {
  0: [],
  1: [[0.5, 0.5]],
  2: [
    [0.27, 0.27],
    [0.73, 0.73],
  ],
  3: [
    [0.25, 0.25],
    [0.5, 0.5],
    [0.75, 0.75],
  ],
  4: [
    [0.27, 0.27],
    [0.73, 0.27],
    [0.27, 0.73],
    [0.73, 0.73],
  ],
  5: [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.5, 0.5],
    [0.25, 0.75],
    [0.75, 0.75],
  ],
  6: [
    [0.28, 0.22],
    [0.28, 0.5],
    [0.28, 0.78],
    [0.72, 0.22],
    [0.72, 0.5],
    [0.72, 0.78],
  ],
};

export function DominoFace({ first, second, w, h }: { first: number; second: number; w: number; h: number }) {
  const vertical = h >= w;
  const u = Math.min(w, h);
  const r = Math.max(1.4, u * 0.092);
  const pad = Math.max(1, u * 0.04);
  const half = (n: number, ox: number, oy: number) =>
    (SPOTS[n] ?? []).map(([x, y], i) => {
      const [px, py] = vertical ? [x, y] : [y, x];
      return <Circle key={`${ox}-${oy}-${i}`} cx={ox + pad + px * (u - 2 * pad)} cy={oy + pad + py * (u - 2 * pad)} r={r} fill={PIP} />;
    });
  const sw = Math.max(1, u * 0.045);
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Rect x={sw / 2} y={sw / 2} width={w - sw} height={h - sw} rx={u * 0.16} fill={FACE} stroke={EDGE} strokeWidth={sw} />
      {vertical ? (
        <Line x1={u * 0.14} y1={h / 2} x2={w - u * 0.14} y2={h / 2} stroke={GROOVE} strokeWidth={Math.max(1, u * 0.05)} strokeLinecap="round" />
      ) : (
        <Line x1={w / 2} y1={u * 0.14} x2={w / 2} y2={h - u * 0.14} stroke={GROOVE} strokeWidth={Math.max(1, u * 0.05)} strokeLinecap="round" />
      )}
      {half(first, 0, 0)}
      {vertical ? half(second, 0, u) : half(second, u, 0)}
      <Circle cx={w / 2} cy={h / 2} r={Math.max(1, u * 0.055)} fill={PIN} />
    </Svg>
  );
}

/** A small face-down tile (hand counts, the boneyard). */
export function DominoBack({ size = 12, color = '#2F8F83' }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size * 1.7, borderRadius: size * 0.22, backgroundColor: color, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.55, height: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />
    </View>
  );
}
