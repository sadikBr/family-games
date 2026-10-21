/**
 * «مجموعاتي» on the home screen, and the faces used by the group screen.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import { useClient } from '@/lib/client';
import { useProfile } from '@/lib/profile';
import { useMyStatus } from '@/lib/status';
import type { GroupInfo, PlayerInfo } from '@/shared/protocol';
import type { MyStatus } from '@/shared/status';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { InGameBadge, StatusDot, shownStatus, type ShownStatus } from '@/ui/status';
import { Txt, num } from '@/ui/txt';

import { onlineLabel, openGroup, playGroup } from './actions';
import { CreateGroupModal, GroupsIntroModal } from './group-forms';

/**
 * A member's face with their status dot (متاح / بعيد / مشغول; none when غير متصل) and the «في لعبة»
 * die. `status` missing (an older server): a green dot while `online`.
 */
export function Face({
  player,
  online,
  status,
  playing,
  size = 34,
  ring = C.surface,
}: {
  player: Pick<PlayerInfo, 'avatar' | 'color'>;
  online: boolean;
  status?: ShownStatus;
  playing?: boolean;
  size?: number;
  /** the colour around the marks (the background the face sits on) */
  ring?: string;
}) {
  const shown: ShownStatus = status ?? (online ? 'available' : 'offline');
  const dot = Math.max(11, Math.round(size * 0.36));
  const die = Math.max(13, Math.round(size * 0.42));
  return (
    <View style={{ width: size, height: size }}>
      <Avatar player={player} size={size} dim={shown === 'offline' || shown === 'invisible'} />
      <StatusDot status={shown} size={dot} ring={ring} style={styles.dot} />
      {playing && shown !== 'offline' ? <InGameBadge size={die} ring={ring} style={styles.die} /> : null}
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
        <Face key={m.id} player={m} online={m.online} status={shownStatus(m)} playing={m.playing} size={size} />
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

/** Up to four overlapping faces (online ones first) and «+N»: compact enough for one row. */
function FaceStack({ members, me, size = 30 }: { members: GroupInfo['members']; me: { id: string; status: MyStatus }; size?: number }) {
  const sorted = [...members].sort((a, b) => Number(b.online) - Number(a.online));
  const shown = sorted.slice(0, members.length > 4 ? 3 : 4);
  const more = members.length - shown.length;
  const step = size * 0.62;
  const width = size + step * (shown.length - 1 + (more > 0 ? 1 : 0));
  return (
    <View style={{ width, height: size, direction: 'ltr' }}>
      {shown.map((m, i) => (
        <View key={m.id} style={[styles.stacked, { left: i * step, borderRadius: size / 2 }]}>
          <Face player={m} online={m.online} status={shownStatus(m, me)} playing={m.playing} size={size} />
        </View>
      ))}
      {more > 0 ? (
        <View style={[styles.more, styles.stacked, { left: shown.length * step, width: size, height: size, borderRadius: size / 2 }]}>
          <Txt v="tiny" color={C.muted}>
            +{num(more)}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/** One group on one row: faces, name and who is online, and «لنلعب» (or «ادخل» while they play). */
function GroupRow({ group, me }: { group: GroupInfo; me: string }) {
  const playing = !!group.playing;
  const { effective } = useMyStatus();
  return (
    <Pressable
      onPress={() => openGroup(group.id)}
      accessibilityRole="button"
      accessibilityLabel={`مجموعة ${group.name}`}
      style={({ pressed }) => [styles.row, playing && styles.rowPlaying, pressed && styles.pressed]}>
      <FaceStack members={group.members} me={{ id: me, status: effective }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="bold" numberOfLines={1}>
          {group.name}
        </Txt>
        <Row gap={5}>
          {playing ? <View style={[styles.liveDot, { backgroundColor: C.green }]} /> : null}
          <Txt v="tiny" color={playing ? C.green : C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {playing ? 'يلعبون الآن' : onlineLabel(group, me)}
          </Txt>
        </Row>
      </View>
      <Pressable
        onPress={() => playGroup(group.id)}
        accessibilityRole="button"
        accessibilityLabel={playing ? `ادخل إلى لعب «${group.name}»` : `لنلعب مع «${group.name}»`}
        hitSlop={6}
        style={({ pressed }) => [styles.play, { backgroundColor: playing ? C.green : C.yellow }, pressed && { opacity: 0.8 }]}>
        <Icon name={playing ? 'door' : 'play'} size={15} color={playing ? '#FFFFFF' : C.ink} />
        <Txt v="bold" color={playing ? '#FFFFFF' : C.ink} style={{ fontSize: 15 }}>
          {playing ? 'ادخل' : 'لنلعب'}
        </Txt>
      </Pressable>
    </Pressable>
  );
}

/**
 * «مجموعاتي» on the home screen: compact rows, one per group, with «مجموعة جديدة» in the title line.
 * A phone in no group sees one slim row instead, which explains groups and creates or joins one.
 * Joining a group by its code also lives in the home screen's «ادخل برمز».
 */
export function GroupsSection() {
  const { groups } = useClient();
  const { profile } = useProfile();
  const [creating, setCreating] = useState(false);
  const [intro, setIntro] = useState(false);
  const list = groups ?? [];

  if (!list.length) {
    return (
      <>
        <Pressable
          onPress={() => setIntro(true)}
          accessibilityRole="button"
          accessibilityLabel="المجموعات: العبوا معاً بضغطة واحدة"
          style={({ pressed }) => [styles.invite, pressed && styles.pressed]}>
          <View style={styles.emptyIcon}>
            <Icon name="users" size={18} color={C.yellow} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="bold" numberOfLines={1}>
              المجموعات
            </Txt>
            <Txt v="tiny" color={C.muted} numberOfLines={1}>
              العبوا معاً بضغطة واحدة
            </Txt>
          </View>
          <Icon name="forward" size={16} color={C.dim} />
        </Pressable>
        <GroupsIntroModal visible={intro} onClose={() => setIntro(false)} />
      </>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Row gap={8}>
        <Txt v="h3" style={{ flex: 1 }}>
          مجموعاتي
        </Txt>
        <Pressable onPress={() => setCreating(true)} accessibilityRole="button" hitSlop={8} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
          <Icon name="plus" size={15} color={C.yellow} />
          <Txt v="small" color={C.yellow} style={{ fontFamily: F.bold }}>
            مجموعة جديدة
          </Txt>
        </Pressable>
      </Row>
      <View style={{ gap: 8 }}>
        {list.map((g) => (
          <GroupRow key={g.id} group={g} me={profile.id} />
        ))}
      </View>
      <CreateGroupModal visible={creating} onClose={() => setCreating(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  rowPlaying: { borderColor: alpha(C.green, 0.55), backgroundColor: alpha(C.green, 0.1) },
  stacked: { position: 'absolute', top: 0, borderWidth: 2, borderColor: C.surface },
  play: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 20 },
  pressed: { opacity: 0.9 },
  dot: { position: 'absolute', bottom: -2, start: -2 },
  die: { position: 'absolute', top: -3, end: -3 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  more: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 18, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  emptyIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.yellow, 0.14) },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 36, paddingHorizontal: 2 },
});
