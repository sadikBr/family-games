import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import { client, useClient } from '@/lib/client';
import { goBack } from '@/lib/nav';
import { haptic, play } from '@/lib/sfx';
import { C, F } from '@/theme';
import { IconBubble } from '@/ui/bits';
import { Header } from '@/ui/controls';
import { Shake } from '@/ui/fun';
import { Screen, useContentWidth } from '@/ui/screen';
import { Txt } from '@/ui/txt';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];

export default function JoinScreen() {
  // opened from an invite link (familygames://join?code=1234): the code is filled in and sent at once
  const params = useLocalSearchParams<{ code?: string }>();
  const linked = typeof params.code === 'string' && /^\d{4}$/.test(params.code) ? params.code : null;
  const [code, setCode] = useState(linked ?? '');
  const [waiting, setWaiting] = useState(!!linked);
  const [seenError, setSeenError] = useState<number | null>(() => client.snap.error?.id ?? null);
  const [slow, setSlow] = useState<number | null>(null);
  const [tries, setTries] = useState(linked ? 1 : 0);
  const { room, error } = useClient();
  const contentWidth = useContentWidth();
  const padW = Math.min(288, contentWidth);
  const keyW = Math.floor((padW - 20) / 3);

  // entered the room → go!
  useEffect(() => {
    if (waiting && room && room.code === code) {
      router.replace('/room');
    }
  }, [waiting, room, code]);

  useEffect(() => {
    if (linked) client.joinRoom(linked);
  }, [linked]);

  // no answer after a few seconds (server asleep, no network): say so and unlock the keypad
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => setSlow(tries), 6000);
    return () => clearTimeout(t);
  }, [waiting, tries]);

  // wrong code → shake, and the next key press starts over
  const failed = waiting && !!error && error.id !== seenError;
  const stuck = waiting && !failed && slow === tries;
  const busy = waiting && !failed && !stuck;
  const shown = failed ? '' : code;

  const submit = (c: string) => {
    if (c.length !== 4) return;
    setSeenError(error?.id ?? null);
    setWaiting(true);
    setTries((n) => n + 1);
    client.joinRoom(c);
  };

  const press = (k: string) => {
    if (busy) return;
    haptic.tap();
    if (failed || stuck) setWaiting(false);
    if (k === 'del') return setCode(shown.slice(0, -1));
    if (k === 'ok') return submit(shown);
    play('tick');
    const next = (shown + k).slice(0, 4);
    setCode(next);
    if (next.length === 4) submit(next);
  };

  return (
    <Screen header={<Header title="ادخل غرفة" onBack={goBack} />} scroll={false}>
      <View style={styles.wrap}>
        <IconBubble icon={busy ? 'door' : 'key'} size={64} color={C.surfaceStrong} iconColor={C.yellow} />
        <Txt v="h2" center>
          {busy ? 'جاري الدخول…' : 'اكتب رمز الغرفة'}
        </Txt>
        {stuck ? (
          <Txt center v="small" color={C.orange}>
            لا جواب من الخادم بعد — تأكّد من الإنترنت ثم اضغط ✓ لإعادة المحاولة
          </Txt>
        ) : null}
        <Txt center color={C.muted} v="small">
          الرمز يظهر عند من أنشأ الغرفة
        </Txt>

        <Shake trigger={error?.id}>
          <View style={styles.boxes}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.box, shown.length === i && styles.boxActive, shown[i] ? styles.boxFull : null]}>
                {shown[i] ? <Txt style={styles.digit}>{shown[i]}</Txt> : null}
              </View>
            ))}
          </View>
        </Shake>

        <View style={[styles.pad, { width: padW }]}>
          {KEYS.map((k) => (
            <Pressable
              key={k}
              onPress={() => press(k)}
              accessibilityLabel={k === 'del' ? 'مسح' : k === 'ok' ? 'دخول' : k}
              style={({ pressed }) => [
                styles.key,
                { width: keyW },
                k === 'del' && { backgroundColor: 'transparent' },
                k === 'ok' && { backgroundColor: shown.length === 4 ? C.green : 'transparent' },
                pressed && { opacity: 0.6 },
              ]}>
              {k === 'del' ? (
                <Icon name="back" size={26} color={C.muted} />
              ) : k === 'ok' ? (
                <Icon name="check" size={26} color={shown.length === 4 ? C.text : C.dim} />
              ) : (
                <Txt style={styles.keyText}>{k}</Txt>
              )}
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  boxes: { flexDirection: 'row', gap: 10, direction: 'ltr', marginVertical: 14 },
  box: {
    width: 58,
    height: 70,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.borderStrong,
    backgroundColor: C.bg3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: C.yellow },
  boxFull: { backgroundColor: C.surfaceStrong, borderColor: C.surfaceStrong },
  digit: { fontFamily: F.display, fontSize: 34, lineHeight: 48, color: C.text },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 288,
    gap: 10,
    justifyContent: 'center',
    direction: 'ltr',
  },
  key: {
    width: 88,
    height: 58,
    borderRadius: 16,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { fontFamily: F.display, fontSize: 26, lineHeight: 40, color: C.text },
});
