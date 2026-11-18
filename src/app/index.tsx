/**
 * Home. Its one job: get the family into a game fast, without showing everything at once.
 * From the top: who you are (a tap: «حالتي» and the way to «ملفي»; and search, sound), a one-line greeting, the two ways in — «العب»
 * (choose a game and open a room) and «ادخل برمز» (a room's or a group's code) — the way back to the
 * last room, a three-step welcome for a first visit, the family's groups, then the games as shelves
 * that scroll sideways: favourites, then one shelf per category with «عرض الكل». A tap on a game opens its short sheet with «ابدأ».
 */
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HeroArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { GAMES, GAME_GROUPS } from '@/games/meta';
import { GroupsSection } from '@/groups/group-card';
import { CodeSheet } from '@/home/code-sheet';
import { GameSheet } from '@/home/game-sheet';
import { StatusSheet } from '@/home/status-sheet';
import { DesktopHome } from '@/desktop/home';
import { Shelf } from '@/home/games';
import { Welcome } from '@/home/welcome';
import { client, useClient } from '@/lib/client';
import { useGamePrefs } from '@/lib/prefs';
import { useProfile } from '@/lib/profile';
import { useMyStatus } from '@/lib/status';
import { haptic, isMuted, onMuteChange, setMuted } from '@/lib/sfx';
import { applyUpdate, useUpdateReady } from '@/lib/updates';
import type { GameId } from '@/shared/protocol';
import { STATUS_LABEL } from '@/shared/status';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { IconBtn } from '@/ui/btn';
import { useDesktop } from '@/ui/layout';
import { Screen, useContentWidth } from '@/ui/screen';
import { StatusDot } from '@/ui/status';
import { Txt, num } from '@/ui/txt';

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 18) return 'مساء الخير';
  return 'سهرة سعيدة';
}

/** One of the two ways in: «العب» (solid saffron) or «ادخل برمز» (quiet). */
function Action({ icon, title, sub, primary, onPress }: { icon: IconName; title: string; sub: string; primary?: boolean; onPress: () => void }) {
  const fg = primary ? C.ink : C.text;
  // the narrowest phones: a plain icon (no disc) and a slightly smaller title, so «ادخل برمز» fits
  const narrow = useContentWidth() < 320;
  return (
    <Pressable
      onPress={() => {
        haptic.light();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${title}: ${sub}`}
      style={({ pressed }) => [styles.action, primary ? styles.actionPrimary : styles.actionQuiet, pressed && styles.pressed]}>
      <Row gap={narrow ? 6 : 8}>
        <View style={[styles.actionIcon, narrow ? styles.actionIconNarrow : { backgroundColor: primary ? alpha(C.ink, 0.14) : alpha(C.yellow, 0.14) }]}>
          <Icon name={icon} size={18} color={primary ? C.ink : C.yellow} />
        </View>
        <Txt style={[styles.actionTitle, narrow && styles.actionTitleNarrow, { color: fg }]} numberOfLines={1}>
          {title}
        </Txt>
      </Row>
      <Txt v="tiny" color={primary ? alpha(C.ink, 0.75) : C.muted} numberOfLines={1}>
        {sub}
      </Txt>
    </Pressable>
  );
}

export default function Home() {
  const { profile, isNew, loaded } = useProfile();
  const { lastCode, groups } = useClient();
  const updateReady = useUpdateReady();
  const prefs = useGamePrefs();
  const { favorites, recent } = prefs;
  const [muted, setMutedState] = useState(isMuted());
  const [entering, setEntering] = useState(false);
  const [sheet, setSheet] = useState<GameId | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const { effective } = useMyStatus();
  // read once per visit: the greeting
  const [now] = useState(() => new Date());
  const contentWidth = useContentWidth();
  const desk = useDesktop();
  useEffect(() => onMuteChange(setMutedState), []);

  if (loaded && isNew) return <Redirect href="/profile?first=1" />;
  // a computer-sized browser window: the desktop home (src/desktop/home.web.tsx)
  if (desk) return <DesktopHome mode="home" />;

  const played = recent.some((id) => GAMES[id]);
  const favIds = favorites.filter((id) => GAMES[id]);
  const inGroups = !!groups?.length;
  // the welcome: until «فهمت», and not once a game was played on this phone
  const welcome = prefs.loaded && !prefs.welcomed && !played;
  const seeAll = (group: string) => router.push({ pathname: '/games', params: { group } });

  return (
    <Screen
      header={
        <Row style={styles.top}>
          <Pressable
            onPress={() => setStatusOpen(true)}
            style={({ pressed }) => [styles.profile, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`حالتي: ${STATUS_LABEL[effective]} — وملفي`}>
            <View>
              <Avatar player={profile} size={34} dim={effective === 'invisible'} />
              <StatusDot status={effective} size={13} ring={C.surface} style={styles.myDot} />
            </View>
            <Txt v="bold" numberOfLines={1} style={{ maxWidth: contentWidth < 320 ? 96 : 140 }}>
              {profile.name || 'لاعب'}
            </Txt>
            <Icon name="chevron" size={13} color={C.dim} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <IconBtn icon="search" size={40} onPress={() => router.push({ pathname: '/games', params: { search: '1' } })} label="ابحث عن لعبة" />
          <IconBtn icon={muted ? 'mute' : 'sound'} size={40} onPress={() => setMuted(!muted)} label={muted ? 'شغّل الصوت' : 'اكتم الصوت'} />
        </Row>
      }>
      <Row gap={8} style={styles.hello}>
        <Txt style={styles.helloTitle} numberOfLines={1}>
          {greeting(now.getHours())}
          {profile.name ? ` يا ${profile.name}` : ''}
        </Txt>
        <HeroArt width={contentWidth < 340 ? 56 : 66} />
      </Row>

      {updateReady ? (
        // a newer version of the app was downloaded (over the air): one tap to switch to it
        <Pressable onPress={applyUpdate} accessibilityRole="button" style={({ pressed }) => [styles.back, styles.update, pressed && styles.pressed]}>
          <Icon name="refresh" size={18} color={C.yellow} />
          <View style={{ flex: 1 }}>
            <Txt v="bold">نسخة جديدة من التطبيق جاهزة</Txt>
            <Txt v="tiny" color={C.muted}>
              اضغط لإعادة التشغيل عليها (تُستعمل تلقائياً في المرة القادمة)
            </Txt>
          </View>
          <Icon name="forward" size={16} color={C.dim} />
        </Pressable>
      ) : null}

      {lastCode ? (
        <Pressable
          onPress={() => {
            client.joinRoom(lastCode);
            router.push('/room');
          }}
          accessibilityRole="button"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Icon name="door" size={18} color={C.green} />
          <Txt v="bold" style={{ flex: 1 }}>
            ارجع إلى الغرفة {num(lastCode)}
          </Txt>
          <Icon name="forward" size={16} color={C.dim} />
        </Pressable>
      ) : null}

      {/* the two ways in */}
      <Row gap={10} style={{ alignItems: 'stretch' }}>
        <Action primary icon="play" title="العب" sub="اختر لعبة وافتح غرفة" onPress={() => router.push('/games')} />
        <Action icon="key" title="ادخل برمز" sub="غرفة أو مجموعة" onPress={() => setEntering(true)} />
      </Row>
      <CodeSheet visible={entering} onClose={() => setEntering(false)} />

      {welcome ? <Welcome /> : null}

      {inGroups ? <GroupsSection /> : null}

      {favIds.length ? (
        <Shelf title="المفضلة" icon="starFull" iconColor={C.yellow} ids={favIds} favorites={favorites} onOpen={setSheet} onSeeAll={favIds.length > 3 ? () => seeAll('fav') : undefined} />
      ) : null}

      {/* no group yet: one slim row (what groups are, create or join one) */}
      {inGroups ? null : <GroupsSection />}

      {GAME_GROUPS.map((g, i) => (
        <Shelf key={g.title} title={g.title} icon={g.icon} ids={g.games} favorites={favorites} onOpen={setSheet} onSeeAll={() => seeAll(String(i))} />
      ))}

      <GameSheet id={sheet} onClose={() => setSheet(null)} />
      <StatusSheet visible={statusOpen} onClose={() => setStatusOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 8, gap: 8 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.surface,
    paddingVertical: 3,
    paddingStart: 3,
    paddingEnd: 12,
    borderRadius: 999,
  },
  myDot: { position: 'absolute', bottom: -2, start: -2 },
  hello: { marginTop: -2, marginBottom: -6 },
  helloTitle: { flex: 1, fontFamily: F.display, fontSize: 22, lineHeight: 34, color: C.text },
  action: { flex: 1, gap: 4, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, borderRadius: 20, borderWidth: 1 },
  actionPrimary: { backgroundColor: C.yellow, borderColor: C.yellow },
  actionQuiet: { backgroundColor: C.surface, borderColor: C.borderStrong },
  actionIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  actionIconNarrow: { width: 20 },
  actionTitle: { flexShrink: 1, fontFamily: F.display, fontSize: 22, lineHeight: 34 },
  actionTitleNarrow: { fontSize: 20, lineHeight: 31 },
  update: { height: undefined, minHeight: 56, paddingVertical: 8, backgroundColor: alpha(C.yellow, 0.1), borderColor: alpha(C.yellow, 0.5) },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: alpha(C.green, 0.12),
    borderWidth: 1,
    borderColor: alpha(C.green, 0.5),
  },
  pressed: { opacity: 0.85 },
});
