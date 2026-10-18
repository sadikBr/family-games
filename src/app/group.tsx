/**
 * A group: its name (any member renames it), the invite (code + link), who is in it and who has the
 * app open, «لنلعب», and leaving. Also opened by an invite link (familygames://group?code=XXXXXX):
 * the phone joins the group first (after choosing a name, on a first launch).
 */
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/art/icons';
import { onlineLabel, playGroup, shareGroup } from '@/groups/actions';
import { Face } from '@/groups/group-card';
import { client, useClient } from '@/lib/client';
import { goBack } from '@/lib/nav';
import { useProfile } from '@/lib/profile';
import { askForPushOnce } from '@/lib/push';
import { GROUP_NAME_MAX, cleanGroupName, normalizeGroupCode } from '@/shared/groups';
import type { GroupInfo } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Card, IconBubble, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal, Header } from '@/ui/controls';
import { Screen } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

function NameEditor({ group }: { group: GroupInfo }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const save = () => {
    const clean = cleanGroupName(name);
    if (clean && clean !== group.name) client.group({ t: 'group', a: 'rename', id: group.id, name: clean });
    setEditing(false);
  };
  if (editing) {
    return (
      <Row gap={8}>
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={GROUP_NAME_MAX}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={save}
          style={styles.nameInput}
          accessibilityLabel="اسم المجموعة"
        />
        <Pressable onPress={save} accessibilityRole="button" accessibilityLabel="حفظ الاسم" style={styles.saveBtn}>
          <Icon name="check" size={22} color={C.ink} />
        </Pressable>
      </Row>
    );
  }
  return (
    <Pressable
      onPress={() => {
        setName(group.name);
        setEditing(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={`اسم المجموعة: ${group.name} — غيّره`}
      style={({ pressed }) => [styles.nameRow, pressed && { opacity: 0.7 }]}>
      <Txt v="display" numberOfLines={2} style={{ flexShrink: 1, textAlign: 'auto' }}>
        {group.name}
      </Txt>
      <Icon name="edit" size={18} color={C.dim} />
    </Pressable>
  );
}

function GroupView({ group }: { group: GroupInfo }) {
  const { profile } = useProfile();
  const me = profile.id;
  const [remove, setRemove] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const isCreator = group.createdBy === me;
  const target = group.members.find((m) => m.id === remove);
  const playing = !!group.playing;
  // the people with the app open first, me at the top
  const members = [...group.members].sort((a, b) => Number(b.id === me) - Number(a.id === me) || Number(b.online) - Number(a.online));

  return (
    <Screen
      header={<Header title="المجموعة" onBack={goBack} />}
      footer={
        <Btn
          size="xl"
          icon={playing ? 'door' : 'play'}
          label={playing ? 'يلعبون الآن — ادخل' : 'لنلعب'}
          color={playing ? C.green : C.yellow}
          silent
          onPress={() => playGroup(group.id)}
        />
      }>
      <View style={{ gap: 2 }}>
        <NameEditor group={group} />
        <Row gap={6}>
          {playing ? <View style={styles.live} /> : null}
          <Txt v="small" color={playing ? C.green : C.muted}>
            {playing ? 'المجموعة تلعب الآن' : onlineLabel(group, me)}
          </Txt>
        </Row>
      </View>

      {/* the invite */}
      <View style={styles.invite}>
        <Row gap={8}>
          <Icon name="share" size={18} color={C.yellow} />
          <Txt v="h3" style={{ flex: 1 }}>
            ادعُ العائلة
          </Txt>
        </Row>
        <Txt v="small" color={C.muted}>
          فتح الرابط على أي هاتف فيه التطبيق يضيفه إلى المجموعة، وكذلك كتابة الرمز في «انضم إلى مجموعة».
        </Txt>
        <View style={styles.codeBox}>
          <Txt v="tiny" color={C.muted}>
            رمز المجموعة
          </Txt>
          <Txt style={styles.code} selectable accessibilityLabel={`رمز المجموعة ${group.code.split('').join(' ')}`}>
            {group.code}
          </Txt>
        </View>
        <Btn size="md" icon="share" label="شارك رابط الدعوة" onPress={() => shareGroup(group)} />
      </View>

      {/* members */}
      <Card>
        <Row>
          <Txt v="h3" style={{ flex: 1 }}>
            الأعضاء
          </Txt>
          <Txt v="small" color={C.muted}>
            {num(group.members.length)}
          </Txt>
        </Row>
        <View style={{ gap: 6 }}>
          {members.map((m) => (
            <Row key={m.id} gap={10} style={styles.member}>
              <Face player={m} online={m.online} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="bold" numberOfLines={1}>
                  {m.name}
                  {m.id === me ? ' (أنت)' : ''}
                </Txt>
                <Row gap={6}>
                  <Txt v="tiny" color={m.online ? C.green : C.dim}>
                    {m.online ? 'التطبيق مفتوح' : 'التطبيق مغلق'}
                  </Txt>
                  {m.id === group.createdBy ? (
                    <Row gap={3}>
                      <Icon name="crown" size={12} color={C.yellow} />
                      <Txt v="tiny" color={C.yellow}>
                        المنشئ
                      </Txt>
                    </Row>
                  ) : null}
                </Row>
              </View>
              {isCreator && m.id !== me ? (
                <Pressable onPress={() => setRemove(m.id)} accessibilityRole="button" accessibilityLabel={`إخراج ${m.name} من المجموعة`} hitSlop={8} style={styles.remove}>
                  <Icon name="close" size={16} color={C.red} />
                </Pressable>
              ) : null}
            </Row>
          ))}
        </View>
        {group.members.length <= 1 ? (
          <Txt v="small" center color={C.muted}>
            لا أحد غيرك بعد — شارك رابط الدعوة مع العائلة
          </Txt>
        ) : null}
      </Card>

      <Btn size="md" ghost icon="door" label="مغادرة المجموعة" textColor={C.red} onPress={() => setLeaving(true)} />

      <ConfirmModal
        visible={!!target}
        danger
        icon="close"
        title={`إخراج ${target?.name ?? ''} من المجموعة؟`}
        message={`يمكن دعوة ${target?.name ?? ''} من جديد برابط الدعوة`}
        confirmLabel="أخرِج"
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) client.group({ t: 'group', a: 'remove', id: group.id, player: remove });
          setRemove(null);
        }}
      />
      <ConfirmModal
        visible={leaving}
        danger
        icon="door"
        title="مغادرة المجموعة؟"
        message={group.members.length <= 1 ? 'أنت آخر عضو فيها: ستُحذف المجموعة.' : 'لن تصلك دعواتها بعد الآن، ويمكنك العودة برابط الدعوة.'}
        confirmLabel="غادر"
        cancelLabel="ابقَ"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          client.group({ t: 'group', a: 'leave', id: group.id });
          router.replace('/');
        }}
      />
    </Screen>
  );
}

function Waiting({ title, message, icon, onHome }: { title: string; message?: string; icon: 'users' | 'info' | 'wifiOff'; onHome?: boolean }) {
  return (
    <Screen header={<Header title="المجموعة" onBack={goBack} />} scroll={false}>
      <View style={styles.center}>
        <IconBubble icon={icon} size={72} iconColor={C.yellow} />
        <Txt v="title" center>
          {title}
        </Txt>
        {message ? (
          <Txt center color={C.muted}>
            {message}
          </Txt>
        ) : null}
        {onHome ? <Btn size="md" ghost icon="home" label="إلى الصفحة الرئيسية" onPress={() => router.replace('/')} /> : null}
      </View>
    </Screen>
  );
}

export default function GroupScreen() {
  const params = useLocalSearchParams<{ id?: string; code?: string }>();
  const id = typeof params.id === 'string' ? params.id : null;
  const linkCode = id ? '' : normalizeGroupCode(params.code);
  const { groups, error, status } = useClient();
  const { loaded, isNew } = useProfile();
  const [staleError] = useState(() => client.snap.error?.id ?? 0);
  const [failed, setFailed] = useState<string | null>(null);
  const ready = loaded && !isNew;

  // opened from an invite link: join (once the phone has a name), then ask for notifications once
  useEffect(() => {
    if (!linkCode || !ready) return;
    client.group({ t: 'group', a: 'join', code: linkCode });
  }, [linkCode, ready]);
  const group = groups?.find((g) => (id ? g.id === id : g.code === linkCode)) ?? null;
  const joinedByLink = !!linkCode && !!group;
  useEffect(() => {
    if (joinedByLink) askForPushOnce();
  }, [joinedByLink]);
  const linkError = !!linkCode && !group && error?.code === 'group' && error.id > staleError ? error.message : null;
  if (linkError && linkError !== failed) setFailed(linkError);

  if (linkCode && loaded && isNew) {
    return <Redirect href={{ pathname: '/profile', params: { first: '1', next: `/group?code=${linkCode}` } }} />;
  }
  if (group) return <GroupView group={group} />;
  if (params.code !== undefined && !linkCode) return <Waiting icon="info" title="الرمز غير صحيح" message="تأكد من الرابط، أو اطلب رابطاً جديداً" onHome />;
  if (failed) return <Waiting icon="info" title={failed} message="تأكد من الرابط، أو اطلب رابطاً جديداً" onHome />;
  if (linkCode) {
    return <Waiting icon={status === 'online' ? 'users' : 'wifiOff'} title="جارٍ الانضمام…" message={status === 'online' ? undefined : 'جارٍ الاتصال بالخادم…'} />;
  }
  if (groups === null || status !== 'online') return <Waiting icon="users" title="لحظة…" />;
  return <Waiting icon="users" title="لست في هذه المجموعة" message="ربما غادرتها أو أُخرجت منها" onHome />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '100%' },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 54,
    borderRadius: 16,
    paddingHorizontal: 14,
    backgroundColor: C.bg3,
    borderWidth: 1.5,
    borderColor: C.yellow,
    color: C.text,
    fontFamily: F.bold,
    fontSize: 20,
    textAlign: 'right',
  },
  saveBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.yellow, alignItems: 'center', justifyContent: 'center' },
  live: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  invite: { gap: 10, padding: 16, borderRadius: 22, backgroundColor: alpha(C.yellow, 0.08), borderWidth: 1.5, borderColor: alpha(C.yellow, 0.4) },
  codeBox: { alignItems: 'center', paddingVertical: 8, borderRadius: 16, backgroundColor: C.bg3 },
  code: { fontFamily: F.display, fontSize: 40, lineHeight: 56, color: C.yellow, letterSpacing: 8, writingDirection: 'ltr', textAlign: 'center' },
  member: { backgroundColor: C.bg2, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 8 },
  remove: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(C.red, 0.14) },
});
