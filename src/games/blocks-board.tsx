/** «القطع الملونة» — the board (whole, or a zoomed window of it) and the small piece drawings. */
import { useRef } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { orient } from '@/shared/blocks-rules';
import { alpha, shade } from '@/theme';

/** One colour per seat (our own palette: saffron, sky, rose, teal). */
export const BLOCKS_COLORS = ['#F2B33D', '#3D9BE9', '#E86FA6', '#22B8B0'];
export const OK_GREEN = '#2FB67C';
export const BAD_RED = '#E2475F';
const BOARD_BG = '#262B63';
const GRID = '#151838';
const FRAME = '#0E1030';
const BORDER = 2;

export interface BoardWindow {
  r0: number;
  c0: number;
  size: number;
}

/** A piece drawn with square cells of side `cell`, in a box of side `box` (centred). */
export function PieceMini({ piece, t, cell, box, color }: { piece: number; t: number; cell: number; box: number; color: string }) {
  const cells = orient(piece, t);
  const h = Math.max(...cells.map((q) => q[0])) + 1;
  const w = Math.max(...cells.map((q) => q[1])) + 1;
  const left = (box - w * cell) / 2;
  const top = (box - h * cell) / 2;
  return (
    <View style={{ width: box, height: box, direction: 'ltr' }} pointerEvents="none">
      {cells.map(([r, c]) => (
        <View
          key={`${r},${c}`}
          style={{
            position: 'absolute',
            left: left + c * cell,
            top: top + r * cell,
            width: cell - 1,
            height: cell - 1,
            borderRadius: Math.max(1.5, cell * 0.2),
            backgroundColor: color,
            borderBottomWidth: Math.max(1, cell * 0.14),
            borderColor: shade(color, -0.35),
          }}
        />
      ))}
    </View>
  );
}

export function Board({
  n,
  board,
  starts,
  last,
  width,
  win,
  ghost,
  hints,
  pivot,
  hintColor,
  onCell,
}: {
  n: number;
  board: readonly number[];
  starts: readonly number[];
  last: readonly number[];
  width: number;
  win: BoardWindow;
  ghost?: { cells: readonly number[]; ok: boolean } | null;
  hints?: readonly number[];
  pivot?: number | null;
  hintColor?: string;
  onCell?: (cell: number) => void;
}) {
  const pad = 3;
  const cell = Math.floor(((width - pad * 2 - BORDER * 2) / win.size) * 10) / 10;
  const side = cell * win.size + pad * 2 + BORDER * 2;
  const down = useRef<{ x: number; y: number } | null>(null);
  const inWin = (i: number) => {
    const r = Math.floor(i / n), c = i % n;
    return r >= win.r0 && r < win.r0 + win.size && c >= win.c0 && c < win.c0 + win.size;
  };
  const at = (i: number) => ({ left: pad + ((i % n) - win.c0) * cell, top: pad + (Math.floor(i / n) - win.r0) * cell });

  const grant = (e: GestureResponderEvent) => {
    down.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
  };
  const release = (e: GestureResponderEvent) => {
    const d = down.current;
    down.current = null;
    if (!onCell || !d) return;
    const { locationX: x, locationY: y } = e.nativeEvent;
    if (Math.abs(x - d.x) > 12 || Math.abs(y - d.y) > 12) return; // a drag, not a tap
    // the touch is measured from the outer edge, the cells from inside the frame
    const c = Math.floor((x - BORDER - pad) / cell), r = Math.floor((y - BORDER - pad) / cell);
    if (r < 0 || c < 0 || r >= win.size || c >= win.size) return;
    onCell((win.r0 + r) * n + win.c0 + c);
  };

  const lines = Array.from({ length: win.size + 1 }, (_, k) => k);
  const lastSet = new Set(last);
  const startSet = new Map(starts.map((s, i) => [s, i]));
  const occupied: number[] = [];
  for (let r = win.r0; r < win.r0 + win.size; r++) for (let c = win.c0; c < win.c0 + win.size; c++) if (board[r * n + c] >= 0) occupied.push(r * n + c);
  const rad = Math.max(1.5, cell * 0.18);

  return (
    <View
      style={[styles.board, { width: side, height: side }]}
      onStartShouldSetResponder={() => !!onCell}
      onResponderGrant={grant}
      onResponderRelease={release}
      onResponderTerminate={() => (down.current = null)}
      accessibilityLabel="اللوحة: المس مربعاً لتضع القطعة هناك">
      {lines.map((k) => (
        <View key={`h${k}`} pointerEvents="none" style={[styles.line, { left: pad, top: pad + k * cell - 0.5, width: cell * win.size, height: 1 }]} />
      ))}
      {lines.map((k) => (
        <View key={`v${k}`} pointerEvents="none" style={[styles.line, { top: pad, left: pad + k * cell - 0.5, height: cell * win.size, width: 1 }]} />
      ))}
      {[...startSet].filter(([s]) => inWin(s) && board[s] < 0).map(([s, seat]) => (
        <View
          key={`s${s}`}
          pointerEvents="none"
          style={[styles.abs, at(s), { width: cell, height: cell, borderRadius: cell / 2, borderWidth: Math.max(2, cell * 0.14), borderColor: BLOCKS_COLORS[seat], backgroundColor: alpha(BLOCKS_COLORS[seat], 0.18) }]}
        />
      ))}
      {occupied.map((i) => {
        const color = BLOCKS_COLORS[board[i]];
        return (
          <View
            key={`o${i}`}
            pointerEvents="none"
            style={[
              styles.abs,
              at(i),
              {
                width: cell - 1,
                height: cell - 1,
                marginLeft: 0.5,
                marginTop: 0.5,
                borderRadius: rad,
                backgroundColor: color,
                borderBottomWidth: Math.max(1, cell * 0.12),
                borderColor: shade(color, -0.38),
              },
            ]}
          />
        );
      })}
      {last.filter(inWin).map((i) => (
        <View key={`l${i}`} pointerEvents="none" style={[styles.abs, at(i), { width: cell, height: cell, borderRadius: rad, borderWidth: Math.max(1.5, cell * 0.1), borderColor: '#FFFFFF' }]} />
      ))}
      {(hints ?? []).filter((i) => inWin(i) && !lastSet.has(i)).map((i) => {
        const d = Math.max(6, cell * 0.36);
        return (
          <View
            key={`d${i}`}
            pointerEvents="none"
            style={[styles.abs, at(i), { width: d, height: d, borderRadius: d, marginLeft: (cell - d) / 2, marginTop: (cell - d) / 2, backgroundColor: alpha(hintColor ?? '#FFFFFF', 0.75), borderWidth: 1, borderColor: '#FFFFFF' }]}
          />
        );
      })}
      {pivot !== null && pivot !== undefined && inWin(pivot) && !ghost ? (
        <View pointerEvents="none" style={[styles.abs, at(pivot), { width: cell, height: cell, borderRadius: rad, borderWidth: 2, borderColor: '#FFFFFF', borderStyle: 'dashed' }]} />
      ) : null}
      {ghost
        ? ghost.cells.filter(inWin).map((i) => (
            <View
              key={`g${i}`}
              pointerEvents="none"
              style={[styles.abs, at(i), { width: cell, height: cell, borderRadius: rad, backgroundColor: alpha(ghost.ok ? OK_GREEN : BAD_RED, 0.78), borderWidth: Math.max(1.5, cell * 0.08), borderColor: '#FFFFFF' }]}
            />
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: BOARD_BG, borderRadius: 10, borderWidth: BORDER, borderColor: FRAME, overflow: 'hidden' },
  line: { position: 'absolute', backgroundColor: GRID },
  abs: { position: 'absolute' },
});
