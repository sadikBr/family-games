import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { BOT_GAMES, MAX_BOTS, MAX_PLAYERS, type RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Card, PlayerTag, Row } from '@/ui/bits';
import { Btn, IconBtn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { Txt } from '@/ui/txt';

import { helpers } from './helpers';
import { GAMES, GAME_ORDER } from './meta';
import { shareRoom } from './room-menu';
import { GameSettings } from './settings';

function LinkBtn({ label, icon, onPress }: { label: string; icon: 'book' | 'shuffle'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={15} color={C.yellow} />
      <Txt v="small" color={C.yellow}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function Lobby({ room }: { room: RoomView }) {
  const { isHost, me } = helpers(room);
  const meta = GAMES[room.game];
  const [howTo, setHowTo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [kick, setKick] = useState<string | null>(null);
  const botsAllowed = BOT_GAMES.includes(room.game);
  const botCount = room.players.filter((p) => p.bot).length;
  const online = room.players.filter((p) => p.connected && (botsAllowed || !p.bot)).length;
  const missing = Math.max(0, meta.minPlayers - online);
  const maxSeats = MAX_PLAYERS[room.game];
  const tooMany = maxSeats ? online > maxSeats : false;
  const kickPlayer = room.players.find((p) => p.id === kick);

  return (
    <>
      {/* Room code */}
      <Card style={styles.codeCard}>
        <View style={{ flex: 1 }}>
          <Txt v="small" color={C.muted}>
            رمز الغرفة
          </Txt>
          <Txt style={styles.code}>{room.code}</Txt>
        </View>
        <IconBtn
          icon="share"
          size={46}
          label="شارك الرمز"
          onPress={() => shareRoom(room)}
        />
      </Card>

      {/* Selected game */}
      <Card>
        <Row gap={12}>
          <GameArt id={room.game} size={78} />
          <View style={{ flex: 1 }}>
            <Txt v="title">{meta.title}</Txt>
            <Txt v="small" color={C.muted}>
              {meta.tagline}
            </Txt>
          </View>
        </Row>
        <Row gap={18}>
          <LinkBtn label={howTo ? 'إخفاء القواعد' : 'كيف نلعب؟'} icon="book" onPress={() => setHowTo((h) => !h)} />
          {isHost ? <LinkBtn label={picking ? 'إغلاق' : 'غيّر اللعبة'} icon="shuffle" onPress={() => setPicking((p) => !p)} /> : null}
        </Row>
        {howTo ? (
          <Animated.View entering={FadeIn.duration(160)} style={{ gap: 6 }}>
            {meta.howTo.map((line, i) => (
              <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                <View style={styles.stepNum}>
                  <Txt v="tiny" color={C.ink}>
                    {i + 1}
                  </Txt>
                </View>
                <Txt v="small" style={{ flex: 1 }}>
                  {line}
                </Txt>
              </Row>
            ))}
          </Animated.View>
        ) : null}
        {isHost && picking ? (
          <Animated.View entering={FadeIn.duration(160)} style={styles.grid}>
            {GAME_ORDER.map((id) => {
              const g = GAMES[id];
              const active = id === room.game;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    haptic.tap();
                    client.roomAction({ type: 'game', game: id });
                    setPicking(false);
                    setHowTo(false);
                  }}
                  style={[styles.gameCell, active && { borderColor: C.yellow }]}>
                  <GameArt id={id} size={52} />
                  <Txt v="tiny" center numberOfLines={1}>
                    {g.title}
                  </Txt>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}
      </Card>

      {/* Settings */}
      <Card>
        <Row>
          <Txt v="h3" style={{ flex: 1 }}>
            الإعدادات
          </Txt>
          {isHost ? null : (
            <Txt v="tiny" color={C.dim}>
              المضيف يختار
            </Txt>
          )}
        </Row>
        <GameSettings room={room} editable={isHost} />
      </Card>

      {/* Players */}
      <Card>
        <Row>
          <Txt v="h3" style={{ flex: 1 }}>
            اللاعبون
          </Txt>
          <Txt v="small" color={C.muted}>
            {online}
            {maxSeats ? ` من ${maxSeats}` : ''}
          </Txt>
        </Row>
        <Row wrap gap={6} center>
          {room.players.map((p) => (
            <PlayerTag
              key={p.id}
              player={p}
              crown={p.id === room.hostId}
              badge={p.id === me ? 'star' : undefined}
              dim={p.bot && !botsAllowed}
              onPress={isHost && p.id !== me ? () => setKick(p.id) : undefined}
            />
          ))}
        </Row>
        {isHost && botsAllowed ? (
          <Btn size="sm" ghost icon="bot" label="أضف بوتاً" disabled={botCount >= MAX_BOTS} onPress={() => client.roomAction({ type: 'addBot' })} />
        ) : null}
        {botCount > 0 && !botsAllowed ? (
          <Txt v="small" center color={C.muted}>
            البوتات لا تلعب «{meta.title}»
          </Txt>
        ) : null}
        {isHost && room.players.length > 1 ? (
          <Txt v="tiny" center color={C.dim}>
            اضغط على لاعب لإخراجه
          </Txt>
        ) : null}
      </Card>

      {/* Start */}
      {isHost ? (
        <View style={{ gap: 6 }}>
          <Btn size="xl" icon="play" label="ابدأ اللعبة" color={C.green} disabled={missing > 0 || tooMany} onPress={() => client.roomAction({ type: 'start' })} />
          {tooMany ? (
            <Txt v="small" center color={C.muted}>
              هذه اللعبة لـ {maxSeats} لاعبين على الأكثر
            </Txt>
          ) : null}
          {missing > 0 ? (
            <Txt v="small" center color={C.muted}>
              تحتاجون {missing} {missing === 1 ? 'لاعباً إضافياً' : 'لاعبين إضافيين'}
              {botsAllowed ? '، أو أضيفوا بوتات' : ''}
            </Txt>
          ) : null}
        </View>
      ) : (
        <View style={styles.waiting}>
          <Icon name="clock" size={18} color={C.muted} />
          <Txt v="bold" color={C.muted}>
            في انتظار المضيف ليبدأ
          </Txt>
        </View>
      )}

      <ConfirmModal
        visible={!!kickPlayer}
        icon="door"
        title={`إخراج ${kickPlayer?.name ?? ''}؟`}
        confirmLabel="أخرجه"
        cancelLabel="إلغاء"
        danger
        onCancel={() => setKick(null)}
        onConfirm={() => {
          if (kick) client.roomAction({ type: 'kick', id: kick });
          setKick(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  codeCard: { flexDirection: 'row', alignItems: 'center', borderColor: alpha(C.yellow, 0.4), borderWidth: 1 },
  code: { fontFamily: F.display, fontSize: 46, lineHeight: 60, color: C.yellow, letterSpacing: 6, writingDirection: 'ltr', alignSelf: 'flex-start' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  gameCell: {
    width: 74,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: C.bg2,
  },
  waiting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
});
