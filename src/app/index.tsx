import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { GameArt, HeroArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { GAMES, GAME_GROUPS, type GameMeta } from '@/games/meta';
import { client, useClient } from '@/lib/client';
import { useProfile } from '@/lib/profile';
import { haptic, isMuted, onMuteChange, play, setMuted } from '@/lib/sfx';
import { C } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { Screen } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

function GameTile({ game }: { game: GameMeta }) {
  return (
    <Pressable
      onPress={() => {
        play('pop');
        haptic.medium();
        client.createRoom(game.id);
        router.push('/room');
      }}
      accessibilityRole="button"
      accessibilityLabel={game.title}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
      <GameArt id={game.id} size={104} />
      <Txt v="h3" center numberOfLines={1}>
        {game.title}
      </Txt>
      <Txt v="tiny" center color={C.muted} numberOfLines={2} style={{ minHeight: 32 }}>
        {game.tagline}
      </Txt>
      <View style={styles.players}>
        <Icon name="users" size={12} color={C.dim} />
        <Txt v="tiny" color={C.dim}>
          {num(game.maxPlayers ? `${game.minPlayers}–${game.maxPlayers}` : `${game.minPlayers}+`)}
        </Txt>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const { profile, isNew, loaded } = useProfile();
  const { lastCode } = useClient();
  const [muted, setMutedState] = useState(isMuted());
  useEffect(() => onMuteChange(setMutedState), []);

  if (loaded && isNew) return <Redirect href="/profile?first=1" />;

  return (
    <Screen
      header={
        <Row style={styles.top}>
          <Pressable onPress={() => router.push('/profile')} style={styles.profile}>
            <Avatar player={profile} size={36} />
            <Txt v="bold" numberOfLines={1} style={{ maxWidth: 150 }}>
              {profile.name || 'لاعب'}
            </Txt>
            <Icon name="edit" size={14} color={C.dim} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <IconBtn icon={muted ? 'mute' : 'sound'} onPress={() => setMuted(!muted)} label="الصوت" />
        </Row>
      }>
      <View style={styles.hero}>
        <HeroArt width={250} />
        <Txt center color={C.muted}>
          كل واحد يلعب من هاتفه
        </Txt>
      </View>

      <View style={{ gap: 10 }}>
        <Btn size="xl" icon="key" label="ادخل غرفة" onPress={() => router.push('/join')} />
        {lastCode ? (
          <Btn
            size="md"
            ghost
            icon="door"
            label={`ارجع للغرفة ${lastCode}`}
            onPress={() => {
              client.joinRoom(lastCode);
              router.push('/room');
            }}
          />
        ) : null}
      </View>

      <Txt v="small" center color={C.dim} style={{ marginTop: 6 }}>
        أو اختر لعبة لإنشاء غرفة جديدة
      </Txt>

      {GAME_GROUPS.map((g) => (
        <View key={g.title} style={{ gap: 8 }}>
          <Txt v="h2">{g.title}</Txt>
          <View style={styles.grid}>
            {g.games.map((id) => (
              <GameTile key={id} game={GAMES[id]} />
            ))}
          </View>
        </View>
      ))}
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
    paddingVertical: 4,
    paddingStart: 4,
    paddingEnd: 14,
    borderRadius: 999,
  },
  hero: { alignItems: 'center', gap: 2, marginTop: 4, marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.5%',
    flexGrow: 1,
    maxWidth: '50%',
    alignItems: 'center',
    gap: 2,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  tilePressed: { backgroundColor: C.surfaceStrong, transform: [{ translateY: 1 }] },
  players: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
});
