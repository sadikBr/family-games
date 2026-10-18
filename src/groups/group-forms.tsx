/** «مجموعة جديدة» (a name) and «انضم إلى مجموعة» (the 6-letter code), as small centred sheets. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/art/icons';
import { client, useClient } from '@/lib/client';
import { askForPushOnce } from '@/lib/push';
import { GROUP_CODE_LEN, GROUP_NAME_MAX, cleanGroupName, typingGroupCode } from '@/shared/groups';
import type { GroupInfo } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Btn } from '@/ui/btn';
import { Txt } from '@/ui/txt';

import { openGroup } from './actions';

function Sheet({ visible, onClose, icon, title, children }: { visible: boolean; onClose: () => void; icon: IconName; title: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        <Animated.View entering={FadeIn.duration(150)} style={styles.sheet}>
          <View style={styles.icon}>
            <Icon name={icon} size={26} color={C.yellow} />
          </View>
          <Txt v="title" center>
            {title}
          </Txt>
          {visible ? children : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Send a group request and follow its answer (the reply, or a «group» error). */
function useGroupRequest(a: 'create' | 'join', onDone: (g: GroupInfo) => void) {
  const { groupReply, error, status } = useClient();
  const [pending, setPending] = useState<{ reply: number; error: number } | null>(null);
  const done = pending && groupReply && groupReply.a === a && groupReply.id > pending.reply ? groupReply.group : null;
  const doneId = done ? groupReply!.id : 0;
  const failed = pending && error?.code === 'group' && error.id > pending.error ? error.message : null;
  const fired = useRef(0);
  useEffect(() => {
    if (!done || fired.current === doneId) return;
    fired.current = doneId;
    onDone(done);
  }, [done, doneId, onDone]);
  return {
    busy: !!pending && !done && !failed,
    failed,
    offline: status !== 'online',
    start: () => setPending({ reply: client.snap.groupReply?.id ?? 0, error: client.snap.error?.id ?? 0 }),
  };
}

function finish(g: GroupInfo, onClose: () => void) {
  onClose();
  openGroup(g.id);
  askForPushOnce();
}

function CreateBody({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const req = useGroupRequest('create', (g) => finish(g, onClose));
  const clean = cleanGroupName(name);
  const submit = () => {
    if (!clean || req.busy) return;
    req.start();
    client.group({ t: 'group', a: 'create', name: clean });
  };
  return (
    <>
      <Txt v="small" center color={C.muted}>
        اختر اسماً تعرفه العائلة، ثم شارك الرابط مع الجميع
      </Txt>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="مثلاً: العائلة، بيت الجدّة…"
        placeholderTextColor={C.dim}
        maxLength={GROUP_NAME_MAX}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={submit}
        style={styles.input}
        accessibilityLabel="اسم المجموعة"
      />
      {req.failed ? (
        <Txt v="small" center color={C.red}>
          {req.failed}
        </Txt>
      ) : req.busy && req.offline ? (
        <Txt v="small" center color={C.orange}>
          جارٍ الاتصال بالخادم…
        </Txt>
      ) : null}
      <View style={styles.buttons}>
        <Btn size="md" icon="plus" label={req.busy ? 'لحظة…' : 'أنشئ المجموعة'} disabled={!clean || req.busy} onPress={submit} />
        <Btn size="md" ghost label="إلغاء" onPress={onClose} />
      </View>
    </>
  );
}

function JoinBody({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const req = useGroupRequest('join', (g) => finish(g, onClose));
  const submit = (c: string) => {
    if (c.length !== GROUP_CODE_LEN || req.busy) return;
    req.start();
    client.group({ t: 'group', a: 'join', code: c });
  };
  return (
    <>
      <Txt v="small" center color={C.muted}>
        اكتب الرمز المكوّن من ٦ أحرف، تجده في شاشة المجموعة عند أي عضو فيها
      </Txt>
      <TextInput
        value={code}
        onChangeText={(t) => {
          const next = typingGroupCode(t);
          setCode(next);
          if (next.length === GROUP_CODE_LEN && next !== code) submit(next);
        }}
        placeholder="ABC234"
        placeholderTextColor={alpha(C.dim, 0.6)}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        autoFocus
        maxLength={GROUP_CODE_LEN + 4}
        returnKeyType="go"
        onSubmitEditing={() => submit(code)}
        style={[styles.input, styles.code, req.failed ? { borderColor: C.red } : null]}
        accessibilityLabel="رمز المجموعة"
      />
      {req.failed ? (
        <Txt v="small" center color={C.red}>
          {req.failed}
        </Txt>
      ) : req.busy && req.offline ? (
        <Txt v="small" center color={C.orange}>
          جارٍ الاتصال بالخادم…
        </Txt>
      ) : null}
      <View style={styles.buttons}>
        <Btn size="md" icon="key" label={req.busy ? 'لحظة…' : 'انضم'} disabled={code.length !== GROUP_CODE_LEN || req.busy} onPress={() => submit(code)} />
        <Btn size="md" ghost label="إلغاء" onPress={onClose} />
      </View>
    </>
  );
}

export function CreateGroupModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} icon="users" title="مجموعة جديدة">
      <CreateBody onClose={onClose} />
    </Sheet>
  );
}

export function JoinGroupModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} icon="key" title="انضم إلى مجموعة">
      <JoinBody onClose={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,9,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 20, direction: 'rtl' },
  sheet: { width: '100%', maxWidth: 400, backgroundColor: C.bg2, borderRadius: 24, padding: 20, gap: 10, borderWidth: 1, borderColor: C.borderStrong },
  icon: { alignSelf: 'center', width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.yellow, 0.14) },
  input: {
    height: 52,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: C.bg3,
    borderWidth: 1.5,
    borderColor: C.borderStrong,
    color: C.text,
    fontFamily: F.bold,
    fontSize: 17,
    textAlign: 'right',
    minWidth: 0,
  },
  code: { height: 60, fontFamily: F.display, fontSize: 30, letterSpacing: 6, textAlign: 'center', writingDirection: 'ltr' },
  buttons: { gap: 8, marginTop: 4 },
});
