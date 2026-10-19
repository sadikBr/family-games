/**
 * The players of a game as one consistent strip of chips: avatar, name, an optional line (cards
 * left, team, role…) and the score. Whoever is playing now gets a frame and a soft tint in their own
 * colour — the same language as the turn bar — and «(أنت)» marks me.
 *
 * Use it instead of hand-made score rows so every game reads the same way. Two to four players
 * sit on one line; more wrap onto as many lines as needed, always fitting a 320 px phone.
 *
 * A numeric score that grows counts up to its new value, and the gain («+3») floats up once above
 * it (`gains={false}` keeps just the count-up). Nothing moves in the first moments after the strip
 * appears (a screen that just opened shows the scores as they are).
 */
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { CountUp } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { FloatUp, useSettled } from './touch-motion';

export interface StripEntry {
  id: string;
  /** big number on the chip (points, cards…) */
  score?: number | string;
  /** one small line under the name */
  sub?: string;
  /** a colour of its own (a team, a pawn colour); defaults to the player's colour */
  color?: string;
  /** dimmed (out of the round, eliminated…) */
  out?: boolean;
}

export function PlayerStrip({ room, entries, active = [], gains = true }: { room: RoomView; entries: StripEntry[]; active?: string[]; gains?: boolean }) {
  const { width } = useWindowDimensions();
  const settled = useSettled();
  const inner = Math.min(width - 32, 560);
  const n = entries.length;
  // chips per line: everyone on one line up to 4 (3 on narrow phones), then wrap evenly
  let perLine = n <= (inner < 340 ? 3 : 4) ? n : Math.min(inner < 340 ? 2 : 3, n);
  const gap = 6;
  const hasSub = entries.some((e) => !!e.sub);
  // names need room too: never narrower than ~110 px (150 with a sub line), down to 2 per line
  const minW = hasSub ? 150 : 110;
  while (perLine > 2 && (inner - gap * (perLine - 1)) / perLine < minW) perLine--;
  const chipW = (inner - gap * (perLine - 1)) / perLine;
  const small = chipW < 100;
  return (
    <Row wrap gap={gap} style={{ justifyContent: 'center' }}>
      {entries.map((e) => {
        const p = room.players.find((x) => x.id === e.id);
        if (!p) return null;
        const color = e.color ?? p.color;
        const on = active.includes(e.id);
        return (
          <View
            key={e.id}
            accessibilityLabel={`${p.name}${e.score !== undefined ? `: ${e.score}` : ''}${on ? ' — دوره الآن' : ''}`}
            style={{
              width: chipW,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: on ? color : C.border,
              backgroundColor: on ? alpha(color, 0.2) : C.surface,
              opacity: e.out ? 0.45 : 1,
            }}>
            <Avatar player={p} size={small ? 26 : 30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="tiny" numberOfLines={1} style={{ fontSize: small ? 12 : 13 }}>
                {/* narrow chips: just «أنت» for me, so the name isn't cut */}
                {p.id === room.me ? (chipW < 140 ? 'أنت' : `${p.name} (أنت)`) : p.name}
              </Txt>
              {e.sub ? (
                <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ fontSize: 11 }}>
                  {e.sub}
                </Txt>
              ) : null}
            </View>
            {e.score !== undefined ? <Score score={e.score} on={on} small={small} live={settled} gains={gains} /> : null}
          </View>
        );
      })}
    </Row>
  );
}

/** The chip's number: counts up when it grows, with the gain floating up once above it. */
function Score({ score, on, small, live, gains }: { score: number | string; on: boolean; small: boolean; live: boolean; gains: boolean }) {
  // the previous score, to see what was gained (only changes seen while the strip is settled float)
  const [st, setSt] = useState({ score, gain: 0, k: 0 });
  if (st.score !== score) {
    const gain = typeof score === 'number' && typeof st.score === 'number' && live && gains ? score - st.score : 0;
    setSt({ score, gain, k: gain > 0 ? st.k + 1 : st.k });
  }
  const color = on ? C.text : C.yellow;
  return (
    <View>
      <Txt v="bold" color={color} style={{ fontSize: small ? 15 : 17 }}>
        {typeof score === 'number' ? <CountUp value={score} enabled={live} /> : score}
      </Txt>
      {st.k > 0 ? (
        <FloatUp key={st.k} style={{ bottom: '70%', left: -14, right: -14, alignItems: 'center' }}>
          <Txt v="tiny" color={C.yellow} style={{ fontSize: 13 }}>
            {num(`+${st.gain}`)}
          </Txt>
        </FloatUp>
      ) : null}
    </View>
  );
}
