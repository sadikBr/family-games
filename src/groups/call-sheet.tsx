/**
 * Shown over any screen: a group I'm in started playing (someone pressed «لنلعب»), and the
 * one-line explanation before the system asks for notifications. Both are mounted in _layout.
 */
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/art/icons';
import { client, useClient } from '@/lib/client';
import { answerAsk, usePushAsk } from '@/lib/push-ask';
import { haptic, play } from '@/lib/sfx';
import { C, alpha } from '@/theme';
import { Avatar } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Txt } from '@/ui/txt';

export function GroupCallSheet() {
  const { call, room, groups } = useClient();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const group = call ? groups?.find((g) => g.id === call.group.id) : undefined;
  // the room closed meanwhile (the group card no longer shows it as playing)
  const over = !!call && !!group && group.playing?.code !== call.code;
  const visible = !!call && room?.code !== call.code && !over;
  const callId = visible ? call.id : null;

  // a gentle chime and a double buzz, so a phone on the table is noticed
  useEffect(() => {
    if (callId === null) return;
    play('turn');
    haptic.heavy();
    const t = setTimeout(() => haptic.heavy(), 220);
    return () => clearTimeout(t);
  }, [callId]);

  if (!call) return null;
  const enter = () => {
    client.joinRoom(call.code);
    client.dismissCall();
    if (pathname !== '/room') router.push('/room');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => client.dismissCall()}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => client.dismissCall()} accessibilityLabel="لاحقاً" />
        <Animated.View entering={FadeInDown.duration(220)} style={[styles.sheet, { paddingBottom: 18 + insets.bottom }]}>
          <View style={styles.grip} />
          <View style={styles.face}>
            <Avatar player={call.by} size={76} ring={C.yellow} />
            <View style={styles.bell}>
              <Icon name="bell" size={16} color={C.ink} />
            </View>
          </View>
          <Txt v="title" center numberOfLines={2}>
            دعوة من {call.by.name}
          </Txt>
          <Txt center color={C.muted}>
            مجموعة «{call.group.name}» تلعب الآن
          </Txt>
          <View style={styles.buttons}>
            <Btn size="xl" icon="door" label="ادخل" color={C.green} onPress={enter} />
            <Btn size="md" ghost label="لاحقاً" onPress={() => client.dismissCall()} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function PushPrompt() {
  const open = usePushAsk();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => answerAsk(false)}>
      <View style={[styles.backdrop, styles.center]}>
        <Animated.View entering={FadeIn.duration(150)} style={styles.card}>
          <View style={styles.cardIcon}>
            <Icon name="bell" size={28} color={C.yellow} />
          </View>
          <Txt v="title" center>
            الإشعارات
          </Txt>
          <Txt center color={C.muted}>
            اسمح بالإشعارات لتصلك الدعوة عندما تبدأ مجموعتك اللعب والتطبيق مغلق.
          </Txt>
          <View style={[styles.buttons, { alignSelf: 'stretch' }]}>
            <Btn size="md" icon="bell" label="اسمح" onPress={() => answerAsk(true)} />
            <Btn size="md" ghost label="ليس الآن" onPress={() => answerAsk(false)} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', justifyContent: 'flex-end', direction: 'rtl' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 480,
    backgroundColor: C.bg2,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: alpha(C.yellow, 0.35),
  },
  grip: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.borderStrong, marginBottom: 8 },
  face: { marginBottom: 4 },
  bell: {
    position: 'absolute',
    top: -2,
    end: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: C.bg2,
  },
  buttons: { alignSelf: 'stretch', gap: 8, marginTop: 10 },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: C.bg2,
    borderRadius: 24,
    padding: 22,
    gap: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  cardIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.yellow, 0.14), marginBottom: 4 },
});
