/**
 * Home. Its one job: get the family into a game fast. From the top: who you are, a greeting, the
 * two ways in (join a room by its code, or go back to the last one), «مجموعاتي» — the family's
 * groups, each with its «لنلعب» button — «لعبة اليوم» — one game picked
 * for the day — the games you played recently, then every game, with search, a «كم عددكم؟» player
 * count and category chips. Tiles take their game's colour; the star keeps a game in favourites.
 */
import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { GameArt, HeroArt } from '@/art/game-art';
import { Icon, type IconName } from '@/art/icons';
import { GAMES, GAME_GROUPS, GAME_ORDER, type GameMeta } from '@/games/meta';
import { GroupsSection } from '@/groups/group-card';
import { client, useClient } from '@/lib/client';
import { toggleFavorite, useGamePrefs } from '@/lib/prefs';
import { useProfile } from '@/lib/profile';
import { haptic, isMuted, onMuteChange, play, setMuted } from '@/lib/sfx';
import { norm } from '@/shared/arabic';
import { BOT_GAMES, type GameId } from '@/shared/protocol';
import { C, F, alpha, shade } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Screen, useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

const GAP = 10;

function startGame(id: GameId) {
  play('pop');
  haptic.medium();
  client.createRoom(id);
  router.push('/room');
}

const playersLabel = (g: GameMeta) => num(g.maxPlayers && g.maxPlayers !== g.minPlayers ? `${g.minPlayers}–${g.maxPlayers}` : g.maxPlayers ? `${g.minPlayers}` : `${g.minPlayers}+`);

/** «كم عددكم؟»: does a game work for this many people (bots fill the missing seats)? */
function fits(g: GameMeta, n: number | null) {
  if (n === null) return true;
  const max = g.maxPlayers ?? 99;
  if (n > max) return false;
  return n >= g.minPlayers || BOT_GAMES.includes(g.id);
}

function greeting(hour: number) {
  if (hour >= 5 && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 18) return 'مساء الخير';
  return 'سهرة سعيدة';
}

/* ------------------------------------------------------------------ */

function GameTile({ game, width, fav }: { game: GameMeta; width: number; fav: boolean }) {
  const art = Math.min(92, width * 0.56);
  return (
    <Pressable
      onPress={() => startGame(game.id)}
      accessibilityRole="button"
      accessibilityLabel={`${game.title} — ${game.tagline}`}
      style={({ pressed }) => [styles.tile, { width, backgroundColor: shade(game.color, -0.62), borderColor: alpha(game.color, 0.35) }, pressed && styles.pressed]}>
      <View style={[styles.stage, { width: art + 18, height: art + 18, borderRadius: (art + 18) / 2, backgroundColor: alpha(game.color, 0.22) }]}>
        <GameArt id={game.id} size={art} />
      </View>
      <Txt v="h3" center numberOfLines={1} style={{ marginTop: 4 }}>
        {game.title}
      </Txt>
      <Txt v="tiny" center color={C.muted} numberOfLines={2} style={{ minHeight: 32, lineHeight: 16 }}>
        {game.tagline}
      </Txt>
      <Row gap={6} center style={{ marginTop: 4 }}>
        <View style={styles.meta}>
          <Icon name="users" size={12} color={C.muted} />
          <Txt v="tiny" color={C.muted}>
            {playersLabel(game)}
          </Txt>
        </View>
        {BOT_GAMES.includes(game.id) ? (
          <View style={styles.meta} accessibilityLabel="يمكن اللعب مع البوتات">
            <Icon name="bot" size={12} color={C.muted} />
          </View>
        ) : null}
      </Row>
      <Pressable
        onPress={() => {
          haptic.tap();
          toggleFavorite(game.id);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={fav ? `أزل ${game.title} من المفضلة` : `أضف ${game.title} إلى المفضلة`}
        style={styles.star}>
        <Icon name={fav ? 'starFull' : 'star'} size={20} color={fav ? C.yellow : alpha('#FFFFFF', 0.45)} />
      </Pressable>
    </Pressable>
  );
}

function Grid({ ids, tileWidth, favorites }: { ids: GameId[]; tileWidth: number; favorites: GameId[] }) {
  return (
    <View style={styles.grid}>
      {ids.map((id) => (
        <GameTile key={id} game={GAMES[id]} width={tileWidth} fav={favorites.includes(id)} />
      ))}
    </View>
  );
}

/** «لعبة اليوم»: one game, big, to try something new. */
function Featured({ game }: { game: GameMeta }) {
  const base = shade(game.color, -0.5);
  return (
    <Animated.View entering={FadeInDown.duration(380)}>
      <Pressable
        onPress={() => startGame(game.id)}
        accessibilityRole="button"
        accessibilityLabel={`لعبة اليوم: ${game.title}`}
        style={({ pressed }) => [styles.featured, { backgroundColor: base, borderColor: alpha(game.color, 0.6) }, pressed && styles.pressed]}>
        <View style={[styles.featuredBurst, { backgroundColor: alpha(game.color, 0.35) }]} />
        <GameArt id={game.id} size={108} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Row gap={6}>
            <Icon name="sparkle" size={15} color={C.yellow} />
            <Txt v="tiny" color={C.yellow}>
              لعبة اليوم
            </Txt>
          </Row>
          <Txt style={styles.featuredTitle} numberOfLines={1}>
            {game.title}
          </Txt>
          <Txt v="small" color={alpha('#FFFFFF', 0.82)} numberOfLines={2}>
            {game.tagline}
          </Txt>
          <Row gap={8} style={{ marginTop: 6 }}>
            <View style={[styles.playBtn, { backgroundColor: game.color }]}>
              <Icon name="play" size={14} color="#fff" />
              <Txt v="bold" color="#fff" style={{ fontSize: 14 }}>
                العب الآن
              </Txt>
            </View>
            <View style={styles.meta}>
              <Icon name="users" size={12} color={alpha('#FFFFFF', 0.75)} />
              <Txt v="tiny" color={alpha('#FFFFFF', 0.75)}>
                {playersLabel(game)}
              </Txt>
            </View>
          </Row>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function RecentRow({ ids }: { ids: GameId[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {ids.map((id) => {
        const g = GAMES[id];
        return (
          <Pressable
            key={id}
            onPress={() => startGame(id)}
            accessibilityRole="button"
            accessibilityLabel={`العب ${g.title} مرة أخرى`}
            style={({ pressed }) => [styles.recent, { backgroundColor: shade(g.color, -0.62), borderColor: alpha(g.color, 0.35) }, pressed && styles.pressed]}>
            <GameArt id={id} size={52} />
            <Txt v="tiny" center numberOfLines={1} style={{ fontFamily: F.bold }}>
              {g.title}
            </Txt>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Chip({ label, icon, active, onPress }: { label: string; icon?: IconName; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipOn]}>
      {icon ? <Icon name={icon} size={14} color={active ? C.ink : C.muted} /> : null}
      <Txt v="bold" color={active ? C.ink : C.text} style={{ fontSize: 13.5 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

const COUNTS: (number | null)[] = [null, 2, 3, 4, 5, 6, 8];

/* ------------------------------------------------------------------ */

export default function Home() {
  const { profile, isNew, loaded } = useProfile();
  const { lastCode } = useClient();
  const { favorites, recent } = useGamePrefs();
  const [muted, setMutedState] = useState(isMuted());
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all'); // 'all' | 'fav' | group title
  const [count, setCount] = useState<number | null>(null);
  // read once per visit: the greeting and the game of the day
  const [now] = useState(() => new Date());
  const contentWidth = useContentWidth();
  const cols = contentWidth >= 500 ? 3 : 2;
  const tileWidth = Math.floor((contentWidth - GAP * (cols - 1)) / cols);
  useEffect(() => onMuteChange(setMutedState), []);

  if (loaded && isNew) return <Redirect href="/profile?first=1" />;

  const day = Math.floor(now.getTime() / 86_400_000);
  const featured = GAMES[GAME_ORDER[(day * 7) % GAME_ORDER.length]];
  const q = norm(query.trim());
  const searching = q.length > 0;
  const filtered = group !== 'all' || count !== null || searching;
  const match = (id: GameId) => {
    const g = GAMES[id];
    if (!fits(g, count)) return false;
    if (searching && !norm(`${g.title} ${g.tagline}`).includes(q)) return false;
    return true;
  };
  const favIds = GAME_ORDER.filter((id) => favorites.includes(id));
  const recentIds = recent.filter((id) => GAMES[id]).slice(0, 8);
  const flatIds = (group === 'fav' ? favIds : group === 'all' ? GAME_ORDER : (GAME_GROUPS.find((g) => g.title === group)?.games ?? [])).filter(match);

  return (
    <Screen
      header={
        <Row style={styles.top}>
          <Pressable onPress={() => router.push('/profile')} style={styles.profile} accessibilityRole="button" accessibilityLabel="ملفي">
            <Avatar player={profile} size={34} />
            <Txt v="bold" numberOfLines={1} style={{ maxWidth: 140 }}>
              {profile.name || 'لاعب'}
            </Txt>
            <Icon name="edit" size={13} color={C.dim} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <IconBtn icon={muted ? 'mute' : 'sound'} size={40} onPress={() => setMuted(!muted)} label={muted ? 'شغّل الصوت' : 'اكتم الصوت'} />
        </Row>
      }>
      {/* who, and the two ways in */}
      <View style={styles.hello}>
        <View style={{ flex: 1, gap: 2 }}>
          <Txt style={styles.helloTitle} numberOfLines={2}>
            {greeting(now.getHours())}{profile.name ? ` يا ${profile.name}` : ''}
          </Txt>
          <Txt v="small" color={C.muted}>
            ألعاب العائلة — كلٌّ يلعب من هاتفه
          </Txt>
        </View>
        <HeroArt width={Math.min(120, contentWidth * 0.32)} />
      </View>

      <View style={styles.ways}>
        <Btn size="xl" icon="key" label="ادخل غرفة برمز" onPress={() => router.push('/join')} />
        {lastCode ? (
          <Pressable
            onPress={() => {
              client.joinRoom(lastCode);
              router.push('/room');
            }}
            accessibilityRole="button"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Icon name="door" size={18} color={C.text} />
            <Txt v="bold" style={{ flex: 1 }}>
              ارجع إلى الغرفة {num(lastCode)}
            </Txt>
            <Icon name="chevron" size={16} color={C.dim} />
          </Pressable>
        ) : null}
        <Txt v="tiny" center color={C.dim}>
          أو اختر لعبة في الأسفل لتفتح غرفة جديدة وتدعو الآخرين
        </Txt>
      </View>

      <GroupsSection />

      {!filtered ? <Featured game={featured} /> : null}

      {!filtered && recentIds.length ? (
        <View style={{ gap: 8 }}>
          <Txt v="h2">لعبتموها مؤخراً</Txt>
          <RecentRow ids={recentIds} />
        </View>
      ) : null}

      {/* browse */}
      <View style={{ gap: 10, marginTop: 4 }}>
        <Row gap={8} style={{ justifyContent: 'space-between' }}>
          <Txt v="h2">كل الألعاب</Txt>
          <Txt v="tiny" color={C.dim}>
            {num(String(GAME_ORDER.length))} لعبة
          </Txt>
        </Row>

        <View style={styles.search}>
          <Icon name="search" size={18} color={C.dim} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="ابحث عن لعبة…"
            placeholderTextColor={C.dim}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="ابحث عن لعبة"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="امسح البحث">
              <Icon name="close" size={18} color={C.muted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="الكل" active={group === 'all'} onPress={() => setGroup('all')} />
          {favIds.length ? <Chip label="المفضلة" icon="starFull" active={group === 'fav'} onPress={() => setGroup('fav')} /> : null}
          {GAME_GROUPS.map((g) => (
            <Chip key={g.title} label={g.short} icon={g.icon} active={group === g.title} onPress={() => setGroup(group === g.title ? 'all' : g.title)} />
          ))}
        </ScrollView>

        <Row gap={8}>
          <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 0 }}>
            كم عددكم؟
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {COUNTS.map((n) => (
              <Chip key={String(n)} label={n === null ? 'أي عدد' : n === 8 ? `${num('8')}+` : num(String(n))} active={count === n} onPress={() => setCount(count === n ? null : n)} />
            ))}
          </ScrollView>
        </Row>
      </View>

      {filtered ? (
        flatIds.length ? (
          <Animated.View key={`${group}|${count}|${q}`} entering={FadeIn.duration(160)}>
            <Grid ids={flatIds} tileWidth={tileWidth} favorites={favorites} />
          </Animated.View>
        ) : (
          <View style={styles.empty}>
            <Icon name="search" size={30} color={C.dim} />
            <Txt v="bold" center>
              لا توجد لعبة بهذا الاختيار
            </Txt>
            <Btn
              size="md"
              ghost
              label="اعرض كل الألعاب"
              onPress={() => {
                setQuery('');
                setGroup('all');
                setCount(null);
              }}
            />
          </View>
        )
      ) : (
        <>
          {favIds.length ? (
            <View style={{ gap: 8 }}>
              <Row gap={6}>
                <Icon name="starFull" size={18} color={C.yellow} />
                <Txt v="h3">المفضلة</Txt>
              </Row>
              <Grid ids={favIds} tileWidth={tileWidth} favorites={favorites} />
            </View>
          ) : null}
          {GAME_GROUPS.map((g) => (
            <View key={g.title} style={{ gap: 8 }}>
              <Row gap={6}>
                <Icon name={g.icon} size={18} color={C.muted} />
                <Txt v="h3">{g.title}</Txt>
              </Row>
              <Grid ids={g.games} tileWidth={tileWidth} favorites={favorites} />
            </View>
          ))}
          <Txt v="tiny" center color={C.dim}>
            اضغط على النجمة لتضع لعبة في المفضلة
          </Txt>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingTop: 8 },
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
  hello: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  helloTitle: { fontFamily: F.display, fontSize: 25, lineHeight: 38, color: C.text },
  ways: { gap: 8, padding: 12, borderRadius: 24, backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    height: 48,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  featured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 26,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  featuredBurst: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -70, right: -60 },
  featuredTitle: { fontFamily: F.display, fontSize: 28, lineHeight: 42, color: '#FFFFFF' },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17 },
  recent: { width: 96, alignItems: 'center', gap: 2, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 18, borderWidth: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchInput: { flex: 1, color: C.text, fontFamily: F.bold, fontSize: 16, paddingVertical: 0 },
  chips: { gap: 6, alignItems: 'center', paddingVertical: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipOn: { backgroundColor: C.yellow, borderColor: C.yellow },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  tile: { alignItems: 'center', gap: 0, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 8, borderRadius: 22, borderWidth: 1 },
  stage: { alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 22, borderRadius: 11, backgroundColor: alpha('#000000', 0.22) },
  star: { position: 'absolute', top: 6, start: 6, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 24 },
});
