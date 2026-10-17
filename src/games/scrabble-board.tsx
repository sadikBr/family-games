/** «شبكة الكلمات» — the board and the tiles. Column 0 is drawn on the RIGHT (across words read right to left). */
import { Pressable, StyleSheet, View } from 'react-native';

import type { ScrabbleCell } from '@/shared/games/scrabble';
import { PREMIUM, SIZE, type Premium } from '@/shared/scrabble-rules';
import { C, F } from '@/theme';
import { Row } from '@/ui/bits';
import { Txt } from '@/ui/txt';

/** Our board colours: deep teal squares, warm premium squares, cream tiles. */
export const PREMIUM_STYLE: Record<Exclude<Premium, ''>, { bg: string; label: string; legend: string }> = {
  tw: { bg: '#C9473F', label: 'ك×3', legend: 'كلمة ×٣' },
  dw: { bg: '#D9806A', label: 'ك×2', legend: 'كلمة ×٢' },
  star: { bg: '#D9806A', label: '★', legend: '' },
  tl: { bg: '#3C63C9', label: 'ح×3', legend: 'حرف ×٣' },
  dl: { bg: '#4A9DB5', label: 'ح×2', legend: 'حرف ×٢' },
};
const SQUARE = '#1F4B52';
const FRAME = '#0F2B30';
const TILE = '#F4E3BC';
const TILE_EDGE = '#C9A86A';
const PENDING = '#FFD36A';

export function TileFace({ l, v, size, blank, pending, last, dim, selected }: { l: string; v: number; size: number; blank?: boolean; pending?: boolean; last?: boolean; dim?: boolean; selected?: boolean }) {
  const showPoints = size >= 22 && !blank;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(3, size * 0.16),
          backgroundColor: pending ? PENDING : TILE,
          borderBottomWidth: Math.max(1, size * 0.07),
          borderColor: last ? C.green : selected ? C.yellow : TILE_EDGE,
          opacity: dim ? 0.3 : 1,
        },
        (last || selected) && { borderWidth: Math.max(2, size * 0.08) },
      ]}>
      <Txt
        style={{
          fontFamily: F.display,
          fontSize: size * (l ? 0.58 : 0.4),
          lineHeight: size * 0.9,
          color: blank ? '#8A6D3B' : C.ink,
          textAlign: 'center',
          includeFontPadding: false,
        }}>
        {l || '؟'}
      </Txt>
      {showPoints ? (
        <Txt style={[styles.points, { fontSize: Math.max(7, size * 0.24), lineHeight: Math.max(8, size * 0.3), left: size * 0.07, bottom: size * 0.02 }]}>{v}</Txt>
      ) : null}
    </View>
  );
}

export interface BoardWindow {
  r0: number;
  c0: number;
  n: number;
}

export function Board({
  board,
  pending,
  last,
  width,
  win,
  onCell,
}: {
  board: readonly (ScrabbleCell | null)[];
  pending: ReadonlyMap<number, { l: string; blank: boolean }>;
  last: ReadonlySet<number>;
  width: number;
  win: BoardWindow;
  onCell?: (cell: number) => void;
}) {
  const pad = 3;
  const cell = Math.floor(((width - pad * 2) / win.n) * 10) / 10;
  const inner = cell - 1;
  const rows = Array.from({ length: win.n }, (_, i) => win.r0 + i);
  const cols = Array.from({ length: win.n }, (_, i) => win.c0 + i);
  return (
    <View style={[styles.board, { width: cell * win.n + pad * 2, padding: pad }]}>
      {rows.map((r) => (
        // row-reverse inside an ltr box: the first column (c0) is on the right
        <View key={r} style={styles.row}>
          {cols.map((c) => {
            const i = r * SIZE + c;
            const t = board[i];
            const p = pending.get(i);
            const prem = PREMIUM[i];
            const content = t ? (
              <TileFace l={t.l} v={t.v} blank={t.v === 0} size={inner} last={last.has(i)} />
            ) : p ? (
              <TileFace l={p.l} v={0} blank={p.blank} size={inner} pending />
            ) : (
              <View style={[styles.square, { width: inner, height: inner, borderRadius: Math.max(2, inner * 0.12), backgroundColor: prem ? PREMIUM_STYLE[prem].bg : SQUARE }]}>
                {prem && (inner >= 24 || prem === 'star') ? (
                  <Txt style={{ fontFamily: F.black, fontSize: prem === 'star' ? inner * 0.6 : inner * 0.3, lineHeight: inner * 0.7, color: 'rgba(255,255,255,0.92)', textAlign: 'center' }} numberOfLines={1}>
                    {PREMIUM_STYLE[prem].label}
                  </Txt>
                ) : null}
              </View>
            );
            return onCell ? (
              <Pressable key={c} onPress={() => onCell(i)} style={[styles.cell, { width: cell, height: cell }]} accessibilityLabel={`مربع ${r + 1}، ${c + 1}`}>
                {content}
              </Pressable>
            ) : (
              <View key={c} style={[styles.cell, { width: cell, height: cell }]}>
                {content}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function Legend() {
  return (
    <Row gap={10} wrap center>
      {(['tw', 'dw', 'tl', 'dl'] as const).map((k) => (
        <Row key={k} gap={4}>
          <View style={[styles.swatch, { backgroundColor: PREMIUM_STYLE[k].bg }]} />
          <Txt v="tiny" color={C.muted}>
            {PREMIUM_STYLE[k].legend}
          </Txt>
        </Row>
      ))}
    </Row>
  );
}

const styles = StyleSheet.create({
  board: { alignSelf: 'center', direction: 'ltr', backgroundColor: FRAME, borderRadius: 10 },
  row: { flexDirection: 'row-reverse' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  square: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  points: { position: 'absolute', fontFamily: F.black, color: '#5A4520' },
  swatch: { width: 14, height: 14, borderRadius: 4 },
});
