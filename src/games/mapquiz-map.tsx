/** «أين المكان؟» — the map: real country shapes (see shared/mapquiz-map.ts), pins, the answer, and taps. */
import { useRef } from 'react';
import { Platform, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import { mapProject, mapUnproject, regionBox, type MapquizPoint, type MapquizRegion } from '@/shared/games/mapquiz';
import { MAP_PATH } from '@/shared/mapquiz-map';
import { C, alpha } from '@/theme';
import { Txt } from '@/ui/txt';

export const SEA = '#173A5E';
const LAND = '#D8CBA4';
const BORDER = '#8E7D55';

export interface MapPin {
  key: string;
  point: MapquizPoint;
  color: string;
  /** drawn bigger, on top */
  me?: boolean;
}

/** Sea names: candidate spots (lon, lat), the first where the label fits inside the map is used; `w` = label width (px). */
const SEAS: { name: string; w: number; at: [number, number][] }[] = [
  { name: 'البحر الأبيض المتوسط', w: 92, at: [[18, 34.2], [4.5, 38.6], [29.5, 33.6]] },
  { name: 'المحيط الأطلسي', w: 44, at: [[-13.6, 33.8]] },
  { name: 'المحيط الهندي', w: 80, at: [[68, 3]] },
  { name: 'بحر العرب', w: 56, at: [[63, 15.5], [59.5, 15]] },
  { name: 'البحر الأسود', w: 64, at: [[34.5, 44.1]] },
];

/** The map of a region, fitted to `width` (and at most `maxHeight`). */
export function MapquizMap({
  region,
  width,
  maxHeight,
  pins,
  truth,
  onTap,
}: {
  region: MapquizRegion;
  width: number;
  maxHeight: number;
  pins: MapPin[];
  truth?: MapquizPoint | null;
  onTap?: (p: MapquizPoint) => void;
}) {
  const [bx, by, bw, bh] = regionBox(region);
  const scale = Math.min(width / bw, maxHeight / bh);
  const w = Math.round(bw * scale);
  const h = Math.round(bh * scale);
  const u = 1 / scale; // one screen pixel in map units
  const toPx = (lon: number, lat: number) => {
    const [x, y] = mapProject(lon, lat);
    return { left: (x - bx) * scale, top: (y - by) * scale };
  };
  const seas = SEAS.flatMap((sea) => {
    const fits = (p: { left: number; top: number }) => p.left - sea.w / 2 >= 2 && p.left + sea.w / 2 <= w - 2 && p.top >= 16 && p.top <= h - 16;
    const spot = sea.at.map(([lon, lat]) => toPx(lon, lat)).find(fits);
    return spot ? [{ name: sea.name, w: sea.w, ...spot }] : [];
  });

  const frame = useRef<View>(null);
  const at = (x: number, y: number) => {
    if (!onTap || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const p = mapUnproject(bx + Math.max(0, Math.min(w, x)) / scale, by + Math.max(0, Math.min(h, y)) / scale);
    onTap({ lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000 });
  };
  const tap = (e: GestureResponderEvent) => {
    const { locationX, locationY, pageX, pageY } = e.nativeEvent;
    // the web has no reliable locationX: measure the map and use page coordinates
    if (Platform.OS !== 'web' && Number.isFinite(locationX)) return at(locationX, locationY);
    frame.current?.measure((_x, _y, _w, _h, left, top) => at(pageX - left, pageY - top));
  };

  const truthXY = truth ? mapProject(truth.lon, truth.lat) : null;
  const sorted = [...pins].sort((a, b) => Number(!!a.me) - Number(!!b.me));

  const map = (
    <View ref={frame} style={[styles.frame, { width: w, height: h }]}>
      <Svg width={w} height={h} viewBox={`${bx} ${by} ${bw} ${bh}`} pointerEvents="none">
        <Rect x={bx} y={by} width={bw} height={bh} fill={SEA} />
        <Path d={MAP_PATH} fill={LAND} stroke={BORDER} strokeWidth={0.7 * u} strokeLinejoin="round" />
        {truthXY
          ? sorted.map((p) => {
              const [x, y] = mapProject(p.point.lon, p.point.lat);
              return <Line key={`l-${p.key}`} x1={x} y1={y} x2={truthXY[0]} y2={truthXY[1]} stroke={p.color} strokeWidth={1.6 * u} strokeDasharray={`${4 * u} ${3 * u}`} />;
            })
          : null}
        {sorted.map((p) => {
          const [x, y] = mapProject(p.point.lon, p.point.lat);
          const r = (p.me ? 7 : 5.5) * u;
          return (
            <G key={p.key}>
              <Circle cx={x} cy={y} r={r + 2 * u} fill="#151726" />
              <Circle cx={x} cy={y} r={r} fill={p.color} stroke="#FFFFFF" strokeWidth={(p.me ? 2 : 1.2) * u} />
            </G>
          );
        })}
        {truthXY ? (
          <G>
            <Circle cx={truthXY[0]} cy={truthXY[1]} r={14 * u} fill={alpha(C.green, 0.25)} stroke={C.green} strokeWidth={2 * u} />
            <Circle cx={truthXY[0]} cy={truthXY[1]} r={5 * u} fill={C.green} stroke="#FFFFFF" strokeWidth={2 * u} />
          </G>
        ) : null}
      </Svg>
      {seas.map((s) => (
        <View key={s.name} pointerEvents="none" style={[styles.sea, { width: s.w, left: s.left - s.w / 2, top: s.top - 9 }]}>
          <Txt v="tiny" center color={alpha('#FFFFFF', 0.55)} style={styles.seaText} numberOfLines={2}>
            {s.name}
          </Txt>
        </View>
      ))}
      <View pointerEvents="none" style={styles.edge} />
    </View>
  );

  return (
    <View style={{ alignItems: 'center' }}>
      {onTap ? (
        <Pressable testID="mapquiz-map" onPress={tap} accessibilityRole="button" accessibilityLabel="الخريطة: المس مكان الإجابة">
          {map}
        </Pressable>
      ) : (
        map
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 14, overflow: 'hidden', direction: 'ltr' },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 2, borderColor: alpha('#FFFFFF', 0.14) },
  sea: { position: 'absolute' },
  seaText: { fontSize: 10, lineHeight: 14 },
});
