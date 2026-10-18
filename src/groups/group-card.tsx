/**
 * «مجموعاتي» on the home screen: one card per group (who is in it, who has the app open, «لنلعب»),
 * or an inviting card explaining groups when there is none yet.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { useClient } from '@/lib/client';
import { useProfile } from '@/lib/profile';
import type { GroupInfo, PlayerInfo } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { onlineLabel, openGroup, playGroup } from './actions';
import { CreateGroupModal, JoinGroupModal } from './group-forms';

/** A member's face with a small green dot while their app is open. */
export function Face({ player, online, size = 34 }: { player: Pick<PlayerInfo, 'avatar' | 'color'>; online: boolean; size?: number }) {
  const dot = Math.max(9, Math.round(size * 0.3));
  return (
    <View style={{ width: size, height: size }}>
      <Avatar player={player} size={size} dim={!online} />
      {online ? <View style={[styles.dot, { width: dot, height: dot, borderRadius: dot / 2 }]} /> : null}
    </View>
  );
}

/** A row of faces that always fits: the extra members become «+N». */
export function Faces({ members, width, size = 34 }: { members: GroupInfo['members']; width: number; size?: number }) {
  const gap = 6;
  const fit = Math.max(1, Math.floor((width + gap) / (size + gap)));
  // online members first, so the dots are visible
  const sorted = [...members].sort((a, b) => Number(b.online) - Number(a.online));
  const shown = sorted.length > fit ? sorted.slice(0, fit - 1) : sorted;
  const more = sorted.length - shown.length;
  return (
    <Row gap={gap}>
      {shown.map((m) => (
        <Face key={m.id} player={m} online={m.online} size={size} />
      ))}
      {more > 0 ? (
        <View style={[styles.more, { width: size, height: size, borderRadius: size / 2 }]}>
          <Txt v="tiny" color={C.muted}>
            +{num(more)}
          </Txt>
        </View>
      ) : null}
    </Row>
  );
}

function LinkBtn({ icon, label, onPress }: { icon: 'plus' | 'key'; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={15} color={C.yellow} />
      <Txt v="small" color={C.yellow} style={{ fontFamily: F.bold }} numberOfLines={1}>
        {label}
      </Txt>
    </Pressable>
  );
}

function GroupCard({ group, me, width }: { group: GroupInfo; me: string; width: number }) {
  const playing = !!group.playing;
  return (
    <Pressable
      onPress={() => openGroup(group.id)}
      accessibilityRole="button"
      accessibilityLabel={`مجموعة ${group.name}`}
      style={({ pressed }) => [styles.card, playing && styles.cardPlaying, pressed && styles.pressed]}>
      <Row gap={8}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt v="h3" numberOfLines={1}>
            {group.name}
          </Txt>
          <Row gap={6}>
            {playing ? <View style={[styles.liveDot, { backgroundColor: C.green }]} /> : null}
            <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
              {onlineLabel(group, me)}
            </Txt>
          </Row>
        </View>
        {/* «open»: the chevron points forward (left in RTL) */}
        <View style={{ transform: [{ rotate: '90deg' }] }}>
          <Icon name="chevron" size={18} color={C.dim} />
        </View>
      </Row>
      <Faces members={group.members} width={width - 28} />
      <Btn
        size="md"
        icon={playing ? 'door' : 'play'}
        label={playing ? 'يلعبون الآن — ادخل' : 'لنلعب'}
        color={playing ? C.green : C.yellow}
        silent
        onPress={() => playGroup(group.id)}
      />
    </Pressable>
  );
}

export function GroupsSection() {
  const { groups } = useClient();
  const { profile } = useProfile();
  const width = useContentWidth();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const list = groups ?? [];

  return (
    <View style={{ gap: 10 }}>
      <Row gap={6}>
        <Icon name="users" size={18} color={C.yellow} />
        <Txt v="h2" style={{ flex: 1 }}>
          مجموعاتي
        </Txt>
      </Row>

      {list.length ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: 10 }}>
          {list.map((g) => (
            <GroupCard key={g.id} group={g} me={profile.id} width={width} />
          ))}
          <View style={styles.actions}>
            <LinkBtn icon="plus" label="مجموعة جديدة" onPress={() => setCreating(true)} />
            <LinkBtn icon="key" label="انضم إلى مجموعة" onPress={() => setJoining(true)} />
          </View>
        </Animated.View>
      ) : (
        <View style={styles.empty}>
          <Row gap={12} style={{ alignItems: 'flex-start' }}>
            <View style={styles.emptyIcon}>
              <Icon name="users" size={26} color={C.yellow} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="h3">العبوا معاً بضغطة واحدة</Txt>
              <Txt v="small" color={C.muted}>
                أنشئ مجموعة للعائلة مرة واحدة، ثم تكفي ضغطة على «لنلعب» لتُفتح غرفة للجميع وتصلهم الدعوة — دون مشاركة رمز في كل مرة.
              </Txt>
            </View>
          </Row>
          <Btn size="md" icon="plus" label="أنشئ مجموعة للعائلة" onPress={() => setCreating(true)} />
          <LinkBtn icon="key" label="لديك رمز مجموعة؟ انضم إليها" onPress={() => setJoining(true)} />
        </View>
      )}

      <CreateGroupModal visible={creating} onClose={() => setCreating(false)} />
      <JoinGroupModal visible={joining} onClose={() => setJoining(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 10, padding: 14, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  cardPlaying: { borderColor: alpha(C.green, 0.55), backgroundColor: alpha(C.green, 0.1) },
  pressed: { opacity: 0.9 },
  dot: { position: 'absolute', bottom: -1, start: -1, backgroundColor: C.green, borderWidth: 2, borderColor: C.surface },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 22 },
  empty: { gap: 12, padding: 14, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1, borderColor: alpha(C.yellow, 0.3) },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.yellow, 0.14) },
  link: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, paddingHorizontal: 4 },
});
