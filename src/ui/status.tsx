/**
 * Status marks («حالتي»): the small dot on a face, and the «في لعبة» die. Each status has its own
 * shape as well as its colour (not only colour): متاح a full green dot, بعيد a yellow half-moon,
 * مشغول a red dot with a bar, غير مرئي (only ever seen by me) a grey ring. غير متصل has no dot.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/art/icons';
import type { GroupMember } from '@/shared/protocol';
import type { MemberStatus, MyStatus } from '@/shared/status';
import { C } from '@/theme';

export type ShownStatus = MyStatus | MemberStatus;

export const STATUS_COLOR: Record<ShownStatus, string> = {
  available: C.green,
  away: C.yellow,
  busy: C.red,
  invisible: C.dim,
  offline: C.dim,
};

/** A member's status as shown (an older server sends only `online`); my own row shows what I chose. */
export function shownStatus(m: Pick<GroupMember, 'id' | 'online' | 'status'>, me?: { id: string; status: MyStatus }): ShownStatus {
  if (me && m.id === me.id) return me.status;
  return m.status ?? (m.online ? 'available' : 'offline');
}

export function StatusDot({ status, size = 12, ring = C.surface, style }: { status: ShownStatus; size?: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  if (status === 'offline') return null;
  const border = Math.max(1.5, Math.round(size * 0.18));
  const inner = size - border * 2;
  const color = STATUS_COLOR[status];
  const hollow = status === 'invisible';
  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, borderWidth: border, borderColor: ring, backgroundColor: ring, overflow: 'hidden' },
        style,
      ]}>
      <View
        style={[
          styles.fill,
          { borderRadius: inner / 2, backgroundColor: hollow ? ring : color },
          hollow && { borderWidth: Math.max(1.5, inner * 0.26), borderColor: color },
        ]}>
        {status === 'away' ? (
          // a half-moon: a disc of the ring's colour bites the yellow one
          <View style={[styles.bite, { width: inner * 0.66, height: inner * 0.66, borderRadius: inner, backgroundColor: ring, top: -inner * 0.08, start: -inner * 0.08 }]} />
        ) : null}
        {status === 'busy' ? <View style={[styles.bar, { width: inner * 0.6, height: Math.max(1.5, inner * 0.2), borderRadius: inner }]} /> : null}
      </View>
    </View>
  );
}

/** «في لعبة»: a small die on the face. */
export function InGameBadge({ size = 14, ring = C.surface, style }: { size?: number; ring?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.game, { width: size, height: size, borderRadius: size / 2, borderColor: ring }, style]}>
      <Icon name="dice" size={size * 0.72} color={C.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bite: { position: 'absolute' },
  bar: { backgroundColor: '#FFFFFF' },
  game: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.text, borderWidth: 1.5 },
});
