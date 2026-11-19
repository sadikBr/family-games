/**
 * «الكلمات المتقاطعة» — the grid and the letter keyboard.
 *
 * The grid is rows of cells laid out right to left (the screen's direction), so cell 0 of a row is its
 * right edge and an across word reads leftwards. A white cell shows its number at the top right, its
 * letter in the middle (a revealed one in blue) and, in the shared grid, a small dot in the colour of
 * whoever wrote it. The selected cell is saffron, the rest of its word pale blue, a right word pale green
 * and, for a moment after «تحقّق», a wrong letter red. The keyboard: the 30 keys (28 letters, ة and ء) in
 * the usual Arabic order, and a delete key.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import { KEY_ROWS } from '@/shared/wordle';
import { C, F, alpha } from '@/theme';
import { Txt } from '@/ui/txt';

export const CELL = {
  black: '#191733',
  white: '#F7F1E3',
  word: '#CFE0FF',
  sel: '#F2C14E',
  right: '#D6F0DF',
  wrong: '#F7B9C3',
  ink: '#1C1A2E',
  hint: '#3157D6',
  frame: '#0E0D20',
};

export interface GridProps {
  rows: number;
  cols: number;
  open: boolean[];
  nums: number[];
  letters: string[];
  /** a dot in the writer's colour (shared grid) */
  dots?: (string | null)[];
  revealed: boolean[];
  /** cells of right words */
  right: boolean[];
  wrong?: ReadonlySet<number>;
  selCell?: number | null;
  selWord?: ReadonlySet<number>;
  /** cells shown faded (the end: letters nobody wrote) */
  faded?: boolean[];
  width: number;
  onTap?: (cell: number) => void;
}

export function CrossGrid({ rows, cols, open, nums, letters, dots, revealed, right, wrong, selCell, selWord, faded, width, onTap }: GridProps) {
  const gap = width / cols < 40 ? 2 : 3;
  const pitch = Math.floor((width - 6 + gap) / cols);
  const size = pitch - gap;
  return (
    <View style={[styles.frame, { padding: 3, borderRadius: Math.max(8, size * 0.22), alignSelf: 'center' }]} accessibilityLabel="شبكة الكلمات">
      <View style={{ gap }}>
        {Array.from({ length: rows }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {Array.from({ length: cols }, (_, c) => {
              const i = r * cols + c;
              return (
                <Cell
                  key={i}
                  i={i}
                  size={size}
                  open={open[i]}
                  num={nums[i]}
                  letter={letters[i]}
                  dot={dots?.[i] ?? null}
                  revealed={revealed[i]}
                  right={right[i]}
                  wrong={!!wrong?.has(i)}
                  sel={selCell === i}
                  inWord={!!selWord?.has(i)}
                  faded={!!faded?.[i]}
                  onTap={onTap}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

interface CellProps {
  i: number;
  size: number;
  open: boolean;
  num: number;
  letter: string;
  dot: string | null;
  revealed: boolean;
  right: boolean;
  wrong: boolean;
  sel: boolean;
  inWord: boolean;
  faded: boolean;
  onTap?: (cell: number) => void;
}

const Cell = memo(function Cell({ i, size, open, num, letter, dot, revealed, right, wrong, sel, inWord, faded, onTap }: CellProps) {
  const radius = Math.max(3, size * 0.14);
  if (!open) return <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: CELL.black }} />;
  const bg = wrong ? CELL.wrong : sel ? CELL.sel : inWord ? CELL.word : right ? CELL.right : CELL.white;
  const numSize = Math.max(8, Math.round(size * 0.24));
  const letterSize = Math.round(size * 0.56);
  return (
    <Pressable
      onPress={onTap ? () => onTap(i) : undefined}
      disabled={!onTap}
      accessibilityRole="button"
      accessibilityLabel={`${num ? `${num} · ` : ''}${letter || 'فارغة'}`}
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      {num ? (
        <View pointerEvents="none" style={[styles.corner, { top: 1, paddingHorizontal: Math.max(2, size * 0.06) }]}>
          <Txt style={{ fontFamily: F.bold, fontSize: numSize, lineHeight: Math.round(numSize * 1.25), color: alpha(CELL.ink, 0.7) }}>{num}</Txt>
        </View>
      ) : null}
      {letter ? (
        <Txt
          style={{
            fontFamily: F.black,
            fontSize: letterSize,
            lineHeight: Math.round(letterSize * 1.45),
            marginTop: Math.round(size * 0.1),
            color: wrong ? '#B0172F' : revealed ? CELL.hint : CELL.ink,
            opacity: faded ? 0.45 : 1,
            textAlign: 'center',
          }}>
          {letter}
        </Txt>
      ) : null}
      {dot ? (
        <View pointerEvents="none" style={[styles.corner, { bottom: Math.max(2, size * 0.07), justifyContent: 'flex-end', paddingHorizontal: Math.max(2, size * 0.08) }]}>
          <View style={{ width: Math.max(5, size * 0.13), height: Math.max(5, size * 0.13), borderRadius: 99, backgroundColor: dot, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' }} />
        </View>
      ) : null}
    </Pressable>
  );
});

/* ------------------------------------------------------------------ */
/* The keyboard                                                        */
/* ------------------------------------------------------------------ */

export function LetterKeys({ width, onKey, onDel, disabled }: { width: number; onKey: (k: string) => void; onDel: () => void; disabled?: boolean }) {
  // 6px padding and 4px gaps: 11 keys on the top rows, 8 keys + a wide delete on the last
  const inner = width - 12;
  const keyW = Math.floor(Math.min(46, (inner - 10 * 4) / 11));
  const delW = Math.floor(Math.min(96, inner - 8 * keyW - 8 * 4));
  const keyH = Math.max(40, Math.min(48, Math.round(keyW * 1.35)));
  return (
    <View style={[styles.keyboard, disabled && { opacity: 0.5 }]} accessibilityLabel="لوحة الحروف">
      {KEY_ROWS.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 4, justifyContent: 'center' }}>
          {row.map((k) => (
            <Pressable
              key={k}
              disabled={disabled}
              onPress={() => onKey(k)}
              accessibilityLabel={k}
              style={({ pressed }) => [styles.key, { width: keyW, height: keyH }, pressed && { backgroundColor: alpha(C.yellow, 0.55) }]}>
              <Txt style={{ fontFamily: F.display, fontSize: keyW < 26 ? 16 : 19, lineHeight: keyW < 26 ? 26 : 30, color: '#FFFFFF' }}>{k}</Txt>
            </Pressable>
          ))}
          {ri === 2 ? (
            <Pressable
              disabled={disabled}
              onPress={onDel}
              accessibilityLabel="مسح"
              style={({ pressed }) => [styles.key, { width: delW, height: keyH, backgroundColor: pressed ? alpha(C.red, 0.6) : '#3A3F7A' }]}>
              <Icon name="back" size={20} color={C.text} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: CELL.frame },
  corner: { position: 'absolute', left: 0, right: 0, flexDirection: 'row' },
  keyboard: { gap: 5, backgroundColor: C.bg3, borderRadius: 16, padding: 6 },
  key: { borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong },
});
