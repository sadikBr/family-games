/**
 * «حروف مبعثرة»: the letter grid. Drag a finger across touching letters to spell a word (it is sent when
 * the finger lifts), or tap letters one by one (tap the last one again to take it back) and press «أرسل».
 * Every child ignores touches so the coordinates always come from the grid itself.
 */
import { useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { haptic } from '@/lib/sfx';
import { boggleAdjacent } from '@/shared/games/boggle';
import { C, F, alpha } from '@/theme';
import { Txt } from '@/ui/txt';

interface Props {
  grid: string[];
  size: number;
  width: number;
  /** the selected cells, in order */
  path: number[];
  /** colour of the selection (yellow while playing, cyan for a word shown after the round) */
  tint?: string;
  /** null: the grid only shows (after the round) */
  onPath?: (path: number[]) => void;
  /** a dragged word of 3+ letters, when the finger lifts */
  onSwipe?: (path: number[]) => void;
}

export function LetterGrid({ grid, size, width, path, tint = C.yellow, onPath, onSwipe }: Props) {
  const pitch = width / size;
  const gap = Math.max(4, Math.round(pitch * 0.08));
  const tile = pitch - gap;
  const live = useRef<number[]>([]);
  const gesture = useRef<{ moved: boolean; tapLast: boolean }>({ moved: false, tapLast: false });
  const interactive = !!onPath;

  const cellAt = (x: number, y: number, strict: boolean): number | null => {
    const c = Math.floor(x / pitch), r = Math.floor(y / pitch);
    if (c < 0 || r < 0 || c >= size || r >= size) return null;
    // while dragging, only the middle of a cell counts, so a diagonal move doesn't catch a corner
    if (strict && Math.hypot(x - (c + 0.5) * pitch, y - (r + 0.5) * pitch) > pitch * 0.42) return null;
    return r * size + c;
  };

  const set = (p: number[]) => {
    live.current = p;
    onPath?.(p);
  };

  const grant = (e: GestureResponderEvent) => {
    const c = cellAt(e.nativeEvent.locationX, e.nativeEvent.locationY, false);
    gesture.current = { moved: false, tapLast: false };
    if (c === null) return;
    const base = path;
    const last = base[base.length - 1];
    haptic.tap();
    if (base.length && c === last) {
      gesture.current.tapLast = true;
      live.current = base;
    } else if (base.length && !base.includes(c) && boggleAdjacent(size, last, c)) set([...base, c]);
    else set([c]);
  };

  const move = (e: GestureResponderEvent) => {
    const c = cellAt(e.nativeEvent.locationX, e.nativeEvent.locationY, true);
    const p = live.current;
    if (c === null || !p.length || c === p[p.length - 1]) return;
    if (p.length >= 2 && c === p[p.length - 2]) {
      // back to the previous letter: undo the last one
      gesture.current.moved = true;
      gesture.current.tapLast = false;
      haptic.tap();
      set(p.slice(0, -1));
    } else if (!p.includes(c) && boggleAdjacent(size, p[p.length - 1], c)) {
      gesture.current.moved = true;
      gesture.current.tapLast = false;
      haptic.tap();
      set([...p, c]);
    }
  };

  const release = () => {
    const p = live.current;
    const g = gesture.current;
    if (!g.moved) {
      if (g.tapLast) set(p.slice(0, -1)); // tapped the last letter again: take it back
      return;
    }
    if (p.length >= 3 && onSwipe) {
      live.current = [];
      onSwipe(p);
    }
  };

  const center = (i: number) => ({ x: ((i % size) + 0.5) * pitch, y: (Math.floor(i / size) + 0.5) * pitch });
  const order = new Map(path.map((c, k) => [c, k]));
  const th = Math.max(6, tile * 0.16);

  return (
    <View
      style={[styles.grid, { width, height: width }]}
      testID="boggle-grid"
      onStartShouldSetResponder={() => interactive}
      onMoveShouldSetResponder={() => interactive}
      onResponderTerminationRequest={() => false}
      onResponderGrant={grant}
      onResponderMove={move}
      onResponderRelease={release}
      accessibilityLabel="شبكة الحروف: اسحب على الحروف المتجاورة لتكوين كلمة">
      {grid.map((_, i) => {
        const { x, y } = center(i);
        const on = order.has(i);
        const isLast = on && order.get(i) === path.length - 1;
        return (
          <View
            key={i}
            pointerEvents="none"
            style={[
              styles.tile,
              { left: x - tile / 2, top: y - tile / 2, width: tile, height: tile, borderRadius: tile * 0.2 },
              on && { backgroundColor: isLast ? tint : alpha(tint, 0.75), borderColor: tint },
            ]}
          />
        );
      })}
      {path.slice(1).map((c, k) => {
        const a = center(path[k]), b = center(c);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return (
          <View
            key={`l${k}`}
            pointerEvents="none"
            style={[styles.line, { left: (a.x + b.x) / 2 - len / 2, top: (a.y + b.y) / 2 - th / 2, width: len, height: th, borderRadius: th / 2, backgroundColor: alpha(C.ink, 0.35), transform: [{ rotate: `${ang}deg` }] }]}
          />
        );
      })}
      {grid.map((ch, i) => {
        const { x, y } = center(i);
        return (
          <View key={`t${i}`} pointerEvents="none" style={[styles.letter, { left: x - tile / 2, top: y - tile / 2, width: tile, height: tile }]}>
            <Txt selectable={false} style={{ fontFamily: F.display, fontSize: tile * 0.5, lineHeight: tile * 0.78, color: C.ink, textAlign: 'center' }}>
              {ch}
            </Txt>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // userSelect: on the web a drag must never start selecting (and then dragging) text
  grid: { alignSelf: 'center', direction: 'ltr', backgroundColor: '#6B4423', borderRadius: 20, userSelect: 'none' },
  tile: { position: 'absolute', backgroundColor: '#FFF4DA', borderWidth: 2, borderColor: '#E9D9B4' },
  line: { position: 'absolute' },
  letter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
