import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AvatarArt, isArtAvatar } from '@/art/avatars';
import { Icon, type IconName } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import type { PlayerPublic } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';

import { useRoomAccent } from './accent';
import { Txt } from './txt';

export function Card({
  children,
  style,
  color,
  outline,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  color?: string;
  outline?: string;
}) {
  // inside a game, plain cards take a faint edge of the game's colour
  const accent = useRoomAccent();
  return (
    <View style={[styles.card, accent && !outline ? { borderColor: alpha(accent, 0.2) } : null, color ? { backgroundColor: color } : null, outline ? { borderColor: outline, borderWidth: 2 } : null, style]}>
      {children}
    </View>
  );
}

/** A solid coloured panel (used for headline moments). */
export function Tile({ color, children, style }: { color: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.tile, { backgroundColor: color }, style]}>{children}</View>;
}

export function Row({
  children,
  gap = 10,
  style,
  wrap,
  center,
}: {
  children: ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  wrap?: boolean;
  center?: boolean;
}) {
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap },
        wrap ? { flexWrap: 'wrap' } : null,
        center ? { justifyContent: 'center' } : null,
        style,
      ]}>
      {children}
    </View>
  );
}

export function Pill({ label, color = C.surfaceStrong, textColor = C.text, icon }: { label: string; color?: string; textColor?: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      {icon ? <Icon name={icon} size={13} color={textColor} /> : null}
      <Txt v="tiny" color={textColor}>
        {label}
      </Txt>
    </View>
  );
}

/** Circular icon "badge" used as a small illustration. */
export function IconBubble({ icon, size = 56, color = C.surfaceStrong, iconColor = C.text }: { icon: IconName; size?: number; color?: string; iconColor?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.5} color={iconColor} />
    </View>
  );
}

type AvatarBadge = 'star' | 'crown' | 'check' | 'skull' | 'mic' | 'cards' | 'bars' | null | undefined;

export function Avatar({
  player,
  size = 56,
  crown,
  dim,
  ring,
  badge,
}: {
  player: Pick<PlayerPublic, 'avatar' | 'color'> & { connected?: boolean; bot?: boolean };
  size?: number;
  crown?: boolean;
  dim?: boolean;
  ring?: string;
  badge?: AvatarBadge;
}) {
  const offline = player.connected === false;
  const art = isArtAvatar(player.avatar) || player.bot;
  const b = size * 0.36;
  const shown: IconName | null = offline ? 'wifiOff' : crown ? 'crown' : (badge ?? (player.bot && size >= 30 ? 'bot' : null));
  return (
    <View style={{ width: size, height: size, opacity: dim || offline ? 0.45 : 1 }}>
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: player.color,
            borderColor: ring ?? '#151726',
            borderWidth: ring ? 3 : Math.max(1.5, size / 22),
          },
        ]}>
        {art ? (
          <AvatarArt id={player.bot ? 'robot' : player.avatar} size={size} />
        ) : (
          <Txt style={{ fontSize: size * 0.5, lineHeight: size * 0.68, textAlign: 'center' }}>{player.avatar}</Txt>
        )}
      </View>
      {shown ? (
        <View style={[styles.badge, { width: b, height: b, borderRadius: b / 2, backgroundColor: shown === 'crown' ? C.yellow : C.bg2 }]}>
          <Icon name={shown} size={b * 0.62} color={shown === 'crown' ? C.ink : C.text} />
        </View>
      ) : null}
    </View>
  );
}

export function PlayerTag({
  player,
  size = 52,
  crown,
  badge,
  dim,
  ring,
  sub,
  onPress,
  selected,
}: {
  player: PlayerPublic;
  size?: number;
  crown?: boolean;
  badge?: AvatarBadge;
  dim?: boolean;
  ring?: string;
  sub?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  const body = (
    <View style={[styles.tag, { width: size + 26 }]}>
      <Avatar player={player} size={size} crown={crown} badge={badge} dim={dim} ring={selected ? C.yellow : ring} />
      <Txt v="tiny" numberOfLines={1} center style={{ maxWidth: size + 26, fontSize: 13 }} color={selected ? C.yellow : C.text}>
        {player.name}
      </Txt>
      {sub ? (
        <Txt v="tiny" center color={C.muted} numberOfLines={1}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return (
    <Row gap={8}>
      {icon ? <Icon name={icon} size={18} color={C.muted} /> : null}
      <Txt v="h3" color={C.muted}>
        {children}
      </Txt>
    </Row>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

/** Big number (room code, countdowns). */
export function BigNumber({ value, color = C.yellow, size = 64 }: { value: string | number; color?: string; size?: number }) {
  return (
    <Txt style={{ fontFamily: F.display, fontSize: size, lineHeight: size * 1.3, color, textAlign: 'center', writingDirection: 'ltr', letterSpacing: 4 }}>
      {value}
    </Txt>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    gap: 12,
  },
  tile: { borderRadius: 22, padding: 18, gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  badge: {
    position: 'absolute',
    bottom: -2,
    end: -2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.bg,
  },
  tag: { alignItems: 'center', gap: 3 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 2 },
});
