/**
 * The room menu (top corner of every room): invite with a link, see who is connected (and who a bot
 * is playing for), mute, and for the host: remove a player or go back to the waiting room.
 */
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { isMuted, onMuteChange, setMuted } from '@/lib/sfx';
import { BOT_LEVELS, BOT_LEVEL_LABEL, PACES, PACE_LABEL, type RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal } from '@/ui/controls';
import { Txt } from '@/ui/txt';

import { GAMES } from './meta';

/** A link that opens the app straight on the join screen with the code filled in. */
export const joinLink = (code: string) => `familygames://join?code=${code}`;

export function shareRoom(room: RoomView) {
  const title = GAMES[room.game].title;
  Share.share({ message: `انضمّ إلينا لنلعب «${title}» 🎲\nرمز الغرفة: ${room.code}\nافتح الرابط: ${joinLink(room.code)}` }).catch(() => {});
}

export function RoomMenu({ room, visible, onClose, onLobby }: { room: RoomView; visible: boolean; onClose: () => void; onLobby: () => void }) {
  const [muted, setMutedState] = useState(isMuted());
  const [remove, setRemove] = useState<string | null>(null);
  useEffect(() => onMuteChange(setMutedState), []);
  const isHost = room.hostId === room.me;
  const playing = room.status === 'playing';
  const target = room.players.find((p) => p.id === remove);
  // a tournament under way (not its set-up, not its champion screen)
  const tour = room.tournament && (room.tournament.stage === 'playing' || room.tournament.stage === 'standings') ? room.tournament : null;

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
          <Animated.View entering={FadeIn.duration(150)} style={styles.sheet}>
            <Row gap={8} style={{ justifyContent: 'space-between' }}>
              <Txt v="title">الغرفة {room.code}</Txt>
              <Pressable onPress={onClose} accessibilityLabel="إغلاق" hitSlop={10}>
                <Icon name="close" size={22} color={C.muted} />
              </Pressable>
            </Row>
            <Row gap={8}>
              <Btn flex size="md" icon="share" label="ادعُ أحداً" onPress={() => shareRoom(room)} />
              <Btn size="md" ghost icon={muted ? 'mute' : 'sound'} label={muted ? 'الصوت مطفأ' : 'الصوت'} onPress={() => setMuted(!muted)} />
            </Row>

            <Txt v="bold" color={C.muted}>
              سرعة البوتات{isHost ? '' : ' (يغيّرها المضيف)'}
            </Txt>
            <ChipPicker
              options={PACES.map((k) => ({ key: k, label: PACE_LABEL[k] }))}
              value={room.pace ?? 'normal'}
              editable={isHost}
              onChange={(pace) => client.roomAction({ type: 'pace', pace })}
            />
            {room.botLevel && room.players.some((p) => p.bot) ? (
              <>
                <Txt v="bold" color={C.muted}>
                  مستوى البوتات{isHost ? '' : ' (يغيّره المضيف)'}
                </Txt>
                <ChipPicker
                  options={BOT_LEVELS.map((k) => ({ key: k, label: BOT_LEVEL_LABEL[k] }))}
                  value={room.botLevel}
                  editable={isHost}
                  onChange={(level) => client.roomAction({ type: 'botLevel', level })}
                />
              </>
            ) : null}

            <Txt v="bold" color={C.muted}>
              اللاعبون
            </Txt>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 6 }}>
              {room.players.map((p) => {
                const status = p.auto ? 'غير متصل — البوت يلعب عنه' : !p.connected ? 'غير متصل' : p.bot ? 'بوت' : p.id === room.hostId ? 'المضيف' : 'متصل';
                return (
                  <Row key={p.id} gap={8} style={styles.player}>
                    <Avatar player={p} size={34} crown={p.id === room.hostId} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Txt v="bold" numberOfLines={1}>
                        {p.name}
                        {p.id === room.me ? ' (أنت)' : ''}
                      </Txt>
                      <Txt v="tiny" color={p.auto || !p.connected ? C.orange : C.dim}>
                        {status}
                      </Txt>
                    </View>
                    {isHost && p.id !== room.me ? (
                      <Pressable onPress={() => setRemove(p.id)} accessibilityLabel={`إخراج ${p.name}`} hitSlop={8} style={styles.remove}>
                        <Icon name="close" size={16} color={C.red} />
                      </Pressable>
                    ) : null}
                  </Row>
                );
              })}
            </ScrollView>

            {isHost && tour && playing && !tour.done ? (
              <Row gap={8}>
                <Btn
                  flex
                  size="sm"
                  ghost
                  icon="refresh"
                  label="أعد اللعبة"
                  onPress={() => {
                    onClose();
                    client.roomAction({ type: 'tournamentReplay' });
                  }}
                />
                <Btn
                  flex
                  size="sm"
                  ghost
                  icon="skip"
                  label={tour.format === 'league' ? 'تخطَّ اللعبة' : 'تأهيل بالتصنيف'}
                  onPress={() => {
                    onClose();
                    client.roomAction({ type: 'tournamentSkip' });
                  }}
                />
              </Row>
            ) : null}
            {isHost && (playing || tour) ? (
              <Btn
                size="md"
                ghost
                icon={tour ? 'stop' : 'home'}
                label={tour ? 'إنهاء البطولة' : 'العودة إلى غرفة الانتظار'}
                textColor={tour ? C.red : undefined}
                onPress={() => {
                  onClose();
                  onLobby();
                }}
              />
            ) : null}
          </Animated.View>
        </View>
      </Modal>
      <ConfirmModal
        visible={!!target}
        danger
        icon="door"
        title={`إخراج ${target?.name ?? ''}؟`}
        message={playing && !target?.bot ? 'إذا كانت اللعبة لا تستطيع الاستمرار بدونه، يلعب البوت مكانه.' : undefined}
        confirmLabel="أخرِج"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) client.roomAction({ type: 'kick', id: remove });
          setRemove(null);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: C.bg2, borderRadius: 24, padding: 16, gap: 12, borderWidth: 1, borderColor: C.border },
  player: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8 },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.red, 0.14) },
});
