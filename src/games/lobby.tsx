import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { GroupWaiting } from '@/groups/waiting-panel';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { BOT_GAMES, BOT_LEVELS, BOT_LEVEL_LABEL, MAX_BOTS, MAX_PLAYERS, PACES, PACE_LABEL, type RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Card, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Txt, num } from '@/ui/txt';

import { helpers } from './helpers';
import { GAMES, GAME_ORDER } from './meta';
import { shareRoom } from './room-menu';
import { GameSettings } from './settings';
import { ModeSwitch, TournamentSetup, TournamentSetupFooter } from './tournament-setup';

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

/** Players needed / allowed, as shown on the cover: «2–5 لاعبين», «3 لاعبين فأكثر». */
function seatsLabel(min: number, max: number | undefined) {
  // Arabic counted noun: 2 → لاعبان, 3–10 → لاعبين, 11+ → لاعباً
  const noun = (n: number) => (n === 2 ? 'لاعبان' : n >= 11 ? 'لاعباً' : 'لاعبين');
  if (max && max === min) return min === 2 ? 'لاعبان' : `${num(min)} ${noun(min)}`;
  return max ? `${num(min)}–${num(max)} ${noun(max)}` : `${num(min)} ${noun(min)} فأكثر`;
}

/** An empty seat: the host taps it to add a bot (bot games) or to invite someone. */
function EmptySeat({ kind, onPress, accent }: { kind: 'bot' | 'invite' | 'wait'; onPress?: () => void; accent: string }) {
  const label = kind === 'bot' ? 'أضف بوتاً' : kind === 'invite' ? 'ادعُ أحداً' : 'مقعد فارغ';
  const body = (
    <View style={styles.seat}>
      <View style={[styles.seatRing, { borderColor: alpha(accent, kind === 'wait' ? 0.3 : 0.7) }]}>
        <Icon name={kind === 'bot' ? 'bot' : kind === 'invite' ? 'plus' : 'user'} size={22} color={kind === 'wait' ? C.dim : accent} />
      </View>
      <Txt v="tiny" center numberOfLines={1} color={kind === 'wait' ? C.dim : C.muted} style={{ fontSize: 12 }}>
        {label}
      </Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
      {body}
    </Pressable>
  );
}

export function Lobby({ room }: { room: RoomView }) {
  const { isHost, me } = helpers(room);
  const meta = GAMES[room.game];
  const variant = meta.variant?.(room.settings) ?? null;
  const accent = meta.color;
  const [howTo, setHowTo] = useState(false);
  const [picking, setPicking] = useState(false);
  const [kick, setKick] = useState<string | null>(null);
  const botsAllowed = BOT_GAMES.includes(room.game);
  const botCount = room.players.filter((p) => p.bot).length;
  const online = room.players.filter((p) => p.connected && (botsAllowed || !p.bot)).length;
  const missing = Math.max(0, meta.minPlayers - online);
  const maxSeats = MAX_PLAYERS[room.game];
  const kickPlayer = room.players.find((p) => p.id === kick);
  // empty seats: the ones still needed, or one more if there is room
  const free = maxSeats ? Math.max(0, maxSeats - online) : 99;
  const canBot = isHost && botsAllowed && botCount < MAX_BOTS && !(room.tournament?.stage === 'setup' && room.tournament.config.format === 'knockout');
  const emptySeats = room.tournament?.stage === 'setup' && room.tournament.config.format === 'knockout' ? 1 : Math.min(free, Math.max(missing, 1));
  const setup = room.tournament?.stage === 'setup';
  const league = setup && room.tournament?.config.format === 'league';
  // a knockout: everyone present is in the bracket (two at a time), bots stay out
  const knockout = setup && !league;

  return (
    <>
      {/* a room opened from a group: who we are still waiting for */}
      <GroupWaiting room={room} />

      {/* «لعبة واحدة | بطولة», and the tournament set-up in place of the cover */}
      <ModeSwitch room={room} />
      <TournamentSetup room={room} />

      {/* The game's cover */}
      {setup ? null : (
      <View style={[styles.cover, { backgroundColor: alpha(accent, 0.16), borderColor: alpha(accent, 0.5) }]}>
        <Row gap={14} style={{ alignItems: 'center' }}>
          <GameArt id={room.game} size={96} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt v="display" numberOfLines={2}>
              {meta.title}
            </Txt>
            <Txt v="small" color={C.text} style={{ opacity: 0.85 }}>
              {variant?.tagline ?? meta.tagline}
            </Txt>
            <Row gap={6} wrap>
              <Pill label={seatsLabel(meta.minPlayers, maxSeats)} icon="users" color={alpha('#000000', 0.25)} />
              {botsAllowed ? <Pill label="البوتات تلعب" icon="bot" color={alpha('#000000', 0.25)} /> : null}
            </Row>
          </View>
        </Row>
        <Row gap={18}>
          <LinkBtn label={howTo ? 'إخفاء القواعد' : 'كيف نلعب؟'} icon="book" onPress={() => setHowTo((h) => !h)} />
          {isHost ? <LinkBtn label={picking ? 'إغلاق' : 'غيّر اللعبة'} icon="shuffle" onPress={() => setPicking((p) => !p)} /> : null}
        </Row>
        {howTo ? (
          <Animated.View entering={FadeIn.duration(160)} style={{ gap: 6 }}>
            {(variant?.howTo ?? meta.howTo).map((line, i) => (
              <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
                <View style={[styles.stepNum, { backgroundColor: accent }]}>
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
      </View>
      )}

      {/* The table: who is in, and the empty seats */}
      <Card>
        <Row>
          <Txt v="h3" style={{ flex: 1 }}>
            حول الطاولة
          </Txt>
          <Txt v="small" color={C.muted}>
            {knockout ? num(room.players.filter((p) => p.connected && !p.bot).length) : num(online)}
            {maxSeats && !setup ? ` من ${num(maxSeats)}` : ''}
          </Txt>
        </Row>
        <Row wrap gap={6} center>
          {room.players.map((p) => (
            <PlayerTag
              key={p.id}
              player={p}
              crown={p.id === room.hostId}
              badge={p.id === me ? 'star' : undefined}
              dim={p.bot && (!botsAllowed || knockout)}
              onPress={isHost && p.id !== me ? () => setKick(p.id) : undefined}
            />
          ))}
          {Array.from({ length: emptySeats }, (_, i) => (
            <EmptySeat
              key={`empty-${i}`}
              accent={accent}
              kind={canBot ? 'bot' : i === 0 ? 'invite' : 'wait'}
              onPress={canBot ? () => client.roomAction({ type: 'addBot' }) : i === 0 ? () => shareRoom(room) : undefined}
            />
          ))}
        </Row>
        {/* the pace is the whole game's (pauses to look, the bots' turns), so it shows with or without bots */}
        <Row gap={8} wrap style={{ justifyContent: 'center' }}>
            <Txt v="small" color={C.muted}>
              سرعة اللعب
            </Txt>
            <ChipPicker
              options={PACES.map((k) => ({ key: k, label: PACE_LABEL[k] }))}
              value={room.pace ?? 'normal'}
              editable={isHost}
              onChange={(pace) => client.roomAction({ type: 'pace', pace })}
            />
        </Row>
        {botCount > 0 && botsAllowed && room.botLevel ? (
          <Row gap={8} wrap style={{ justifyContent: 'center' }}>
            <Txt v="small" color={C.muted}>
              مستوى البوتات
            </Txt>
            <ChipPicker
              options={BOT_LEVELS.map((k) => ({ key: k, label: BOT_LEVEL_LABEL[k] }))}
              value={room.botLevel}
              editable={isHost}
              onChange={(level) => client.roomAction({ type: 'botLevel', level })}
            />
          </Row>
        ) : null}
        {botCount > 0 && !botsAllowed ? (
          <Txt v="small" center color={C.muted}>
            البوتات لا تلعب «{meta.title}»
          </Txt>
        ) : null}
        {/* the code to join, with a share button */}
        <Pressable
          onPress={() => shareRoom(room)}
          accessibilityRole="button"
          accessibilityLabel={`رمز الغرفة ${room.code} — شارك`}
          style={({ pressed }) => [styles.codeRow, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1 }}>
            <Txt v="tiny" color={C.muted}>
              رمز الغرفة — شاركه مع العائلة
            </Txt>
            <Txt style={styles.code}>{room.code}</Txt>
          </View>
          <Icon name="share" size={22} color={C.yellow} />
        </Pressable>
        {isHost && room.players.length > 1 ? (
          <Txt v="tiny" center color={C.dim}>
            اضغط على لاعب لإخراجه
          </Txt>
        ) : null}
      </Card>

      {/* Settings */}
      <Card>
        <Row>
          <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
            {setup ? `إعدادات «${meta.title}»` : 'الإعدادات'}
          </Txt>
          {isHost ? null : (
            <Txt v="tiny" color={C.dim}>
              المضيف يختار
            </Txt>
          )}
        </Row>
        {league && isHost ? (
          <Txt v="tiny" color={C.dim}>
            كل لعبة في الدوري تُلعب بإعداداتها هنا — اضغط على لعبة في القائمة لتعديلها
          </Txt>
        ) : null}
        <GameSettings room={room} editable={isHost} />
      </Card>

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

/** Stays at the bottom of the waiting room: start (host) or «waiting for the host». */
export function LobbyFooter({ room }: { room: RoomView }) {
  if (room.tournament?.stage === 'setup') return <TournamentSetupFooter room={room} />;
  return <SingleGameFooter room={room} />;
}

function SingleGameFooter({ room }: { room: RoomView }) {
  const { isHost } = helpers(room);
  const meta = GAMES[room.game];
  const botsAllowed = BOT_GAMES.includes(room.game);
  const online = room.players.filter((p) => p.connected && (botsAllowed || !p.bot)).length;
  const missing = Math.max(0, meta.minPlayers - online);
  const maxSeats = MAX_PLAYERS[room.game];
  const tooMany = maxSeats ? online > maxSeats : false;
  const groupWait = !!room.group?.waiting;
  if (!isHost) {
    return (
      <View style={styles.waiting}>
        <Icon name="clock" size={18} color={C.muted} />
        <Txt v="bold" color={C.muted}>
          {groupWait ? 'بانتظار بقية المجموعة' : 'في انتظار المضيف ليبدأ'}
        </Txt>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {groupWait ? (
        <Txt v="small" center color={C.muted}>
          بانتظار بقية المجموعة — أو اضغط «ابدأ بالموجودين»
        </Txt>
      ) : tooMany ? (
        <Txt v="small" center color={C.muted}>
          هذه اللعبة لـ {num(maxSeats!)} لاعبين على الأكثر
        </Txt>
      ) : missing > 0 ? (
        <Txt v="small" center color={C.muted}>
          تحتاجون {num(missing)} {missing === 1 ? 'لاعباً إضافياً' : 'لاعبين إضافيين'}
          {botsAllowed ? '، أو أضيفوا بوتات' : ''}
        </Txt>
      ) : null}
      <Btn size="xl" icon="play" label="ابدأ اللعبة" color={C.green} disabled={missing > 0 || tooMany || groupWait} onPress={() => client.roomAction({ type: 'start' })} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: 24, borderWidth: 1.5, padding: 16, gap: 12 },
  seat: { width: 78, alignItems: 'center', gap: 3 },
  seatRing: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.bg2, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  code: { fontFamily: F.display, fontSize: 32, lineHeight: 44, color: C.yellow, letterSpacing: 5, writingDirection: 'ltr', alignSelf: 'flex-start' },
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
