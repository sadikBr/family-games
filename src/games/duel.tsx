/** The two-player header used by the 1-vs-1 board games: avatar, name, a colour swatch and a short line. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Txt } from '@/ui/txt';

import type { Helpers } from './helpers';

export interface DuelSlot {
  id: string;
  color: string;
  mark?: ReactNode;
  sub?: string;
}

export function DuelBar({ slots, active, h }: { slots: DuelSlot[]; active: string | null; h: Helpers }) {
  return (
    <Row gap={10} style={{ justifyContent: 'center' }}>
      {slots.map((s) => {
        const on = active === s.id;
        return (
          <View key={s.id} style={[styles.player, on && { borderColor: s.color, backgroundColor: alpha(s.color, 0.18) }]}>
            {s.mark ?? <View style={[styles.dot, { backgroundColor: s.color }]} />}
            <Avatar player={h.player(s.id)} size={30} />
            <View>
              <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 92 }}>
                {h.player(s.id).name}
                {s.id === h.me ? ' (أنت)' : ''}
              </Txt>
              {s.sub ? (
                <Txt v="tiny" color={C.dim}>
                  {s.sub}
                </Txt>
              ) : null}
            </View>
          </View>
        );
      })}
    </Row>
  );
}

const styles = StyleSheet.create({
  player: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 2, borderColor: 'transparent' },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#151726' },
});
