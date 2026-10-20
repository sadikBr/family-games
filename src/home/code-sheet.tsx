/**
 * «ادخل برمز»: one box for both codes. Four digits are a room's code (the room opens, as /join does);
 * six characters with letters are a group's code (the phone joins the group, as «انضم إلى مجموعة»
 * does). Arabic-Indic digits count as digits; spaces and dashes are ignored.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/art/icons';
import { Sheet, finishGroupJoin, useGroupRequest } from '@/groups/group-forms';
import { client, useClient } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { GROUP_CODE_ALPHABET, GROUP_CODE_LEN } from '@/shared/groups';
import { C, F, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Txt } from '@/ui/txt';

const ROOM_CODE_LEN = 4;
const EASTERN = ['٠١٢٣٤٥٦٧٨٩', '۰۱۲۳۴۵۶۷۸۹'];

export type CodeKind = 'empty' | 'room' | 'group';

/** What was typed or pasted → the code as it will be sent, and which kind of code it is. */
export function readCode(input: string): { code: string; kind: CodeKind; ready: boolean } {
  let s = '';
  for (const ch of input.toUpperCase()) {
    let c = ch;
    for (const set of EASTERN) {
      const i = set.indexOf(ch);
      if (i >= 0) c = String(i);
    }
    if (/[A-Z0-9]/.test(c)) s += c;
  }
  if (!s) return { code: '', kind: 'empty', ready: false };
  // only digits, at most four: a room (group codes never have 0 or 1, rooms can)
  if (/^\d+$/.test(s) && (s.length <= ROOM_CODE_LEN || /[01]/.test(s))) {
    const code = s.slice(0, ROOM_CODE_LEN);
    return { code, kind: 'room', ready: code.length === ROOM_CODE_LEN };
  }
  const code = [...s].filter((c) => GROUP_CODE_ALPHABET.includes(c)).join('').slice(0, GROUP_CODE_LEN);
  return { code, kind: 'group', ready: code.length === GROUP_CODE_LEN };
}

function CodeBody({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const { kind, ready } = readCode(code);
  // autoFocus alone doesn't always reach a field in a modal that is still opening (web, some Androids)
  const input = useRef<TextInput>(null);
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);
  const { room, error, status } = useClient();

  // a room: wait for it (or its refusal) here, so a wrong code can be fixed on the spot
  const [roomReq, setRoomReq] = useState<{ code: string; error: number; n: number } | null>(null);
  const [roomFail, setRoomFail] = useState<string | null>(null);
  const [slow, setSlow] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const refused = roomReq && error && error.id > roomReq.error ? error.message : null;
  if (refused) {
    setRoomFail(refused);
    setRoomReq(null);
  }
  const joined = !!roomReq && room?.code === roomReq.code;
  useEffect(() => {
    if (!joined) return;
    onClose();
    router.push('/room');
  }, [joined, onClose]);
  const reqN = roomReq?.n ?? 0;
  useEffect(() => {
    if (!reqN) return;
    const t = setTimeout(() => setSlow(reqN), 6000);
    return () => clearTimeout(t);
  }, [reqN]);
  const roomStuck = !!roomReq && slow === roomReq.n;

  const group = useGroupRequest('join', (g) => finishGroupJoin(g, onClose));
  const busy = (!!roomReq && !roomStuck) || group.busy;

  const submit = (raw: string) => {
    const c = readCode(raw);
    if (!c.ready || busy) return;
    haptic.tap();
    if (c.kind === 'room') {
      setRoomFail(null);
      setTries(tries + 1);
      setRoomReq({ code: c.code, error: client.snap.error?.id ?? 0, n: tries + 1 });
      client.joinRoom(c.code);
    } else {
      group.start();
      client.group({ t: 'group', a: 'join', code: c.code });
    }
  };

  const failed = kind === 'room' ? roomFail : kind === 'group' ? group.failed : null;
  const hint =
    kind === 'room'
      ? ready
        ? 'رمز غرفة'
        : 'رمز الغرفة: 4 أرقام'
      : kind === 'group'
        ? ready
          ? 'رمز مجموعة'
          : 'رمز المجموعة: 6 أحرف وأرقام'
        : 'رمز الغرفة 4 أرقام، ورمز المجموعة 6 أحرف';

  return (
    <>
      <Txt v="small" center color={C.muted}>
        الرمز يظهر عند من أنشأ الغرفة، أو في شاشة المجموعة عند أي عضو فيها
      </Txt>
      <TextInput
        ref={input}
        value={code}
        onChangeText={(t) => {
          if (busy) return;
          const next = readCode(t);
          setCode(next.code);
          if (roomFail) setRoomFail(null);
          // a group code is complete at six characters: send it at once (a room code waits for the button,
          // since a group code may begin with four digits)
          if (next.kind === 'group' && next.ready && next.code !== code) submit(next.code);
        }}
        placeholder="1234 أو ABC234"
        placeholderTextColor={alpha(C.dim, 0.7)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        // Android: letters with a row of digits, and no suggestions
        keyboardType={Platform.OS === 'android' ? 'visible-password' : 'default'}
        autoFocus
        maxLength={GROUP_CODE_LEN + 6}
        returnKeyType="go"
        // keep the field (and the keyboard) after «go»: a wrong code is fixed in place
        submitBehavior="submit"
        blurOnSubmit={false /* the web reads this one */}
        onSubmitEditing={() => submit(code)}
        style={[styles.input, code ? styles.typed : null, failed ? { borderColor: C.red } : ready ? { borderColor: C.green } : null]}
        accessibilityLabel="رمز الغرفة أو المجموعة"
      />
      <Row gap={6} center>
        <Icon name={kind === 'group' ? 'users' : kind === 'room' ? 'door' : 'info'} size={15} color={ready ? C.green : C.dim} />
        <Txt v="tiny" color={ready ? C.green : C.dim}>
          {hint}
        </Txt>
      </Row>
      {failed ? (
        <Txt v="small" center color={C.red}>
          {failed}
        </Txt>
      ) : roomStuck ? (
        <Txt v="small" center color={C.orange}>
          لا جواب من الخادم بعد — تأكّد من الإنترنت ثم أعد المحاولة
        </Txt>
      ) : busy && status !== 'online' ? (
        <Txt v="small" center color={C.orange}>
          جارٍ الاتصال بالخادم…
        </Txt>
      ) : null}
      <View style={styles.buttons}>
        <Btn
          size="md"
          icon={kind === 'group' ? 'users' : 'door'}
          color={ready ? C.green : undefined}
          label={busy ? 'لحظة…' : kind === 'group' ? 'انضم إلى المجموعة' : kind === 'room' && ready ? 'ادخل الغرفة' : 'ادخل'}
          disabled={!ready || busy}
          onPress={() => submit(code)}
        />
        <Btn size="md" ghost label="إلغاء" onPress={onClose} />
      </View>
    </>
  );
}

export function CodeSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} icon="key" title="ادخل برمز">
      <CodeBody onClose={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 62,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: C.bg3,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    color: C.text,
    fontFamily: F.display,
    fontSize: 26,
    textAlign: 'center',
    writingDirection: 'ltr',
    minWidth: 0,
    outlineWidth: 0,
  },
  typed: { fontSize: 30, letterSpacing: 6 },
  buttons: { gap: 8, marginTop: 4 },
});
