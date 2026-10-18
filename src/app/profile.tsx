import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AvatarArt } from '@/art/avatars';
import { Icon } from '@/art/icons';

import { client } from '@/lib/client';
import { goBack } from '@/lib/nav';
import { saveProfile, useProfile } from '@/lib/profile';
import { defaultServerUrl, getServerOverride, setServerOverride } from '@/lib/server-url';
import { haptic } from '@/lib/sfx';
import { AVATARS, C, F, PLAYER_COLORS } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Header } from '@/ui/controls';
import { Field } from '@/ui/field';
import { Screen } from '@/ui/screen';
import { Txt } from '@/ui/txt';

export default function ProfileScreen() {
  // first launch; `next`: where to go once the name is chosen (e.g. a group invite link)
  const { first, next } = useLocalSearchParams<{ first?: string; next?: string }>();
  const isFirst = first === '1';
  const { profile } = useProfile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [color, setColor] = useState(profile.color);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [server, setServer] = useState(getServerOverride() ?? '');

  const save = async () => {
    const clean = name.trim().slice(0, 20);
    if (!clean) return;
    await saveProfile({ name: clean, avatar, color });
    const before = getServerOverride() ?? '';
    if (server.trim() !== before) {
      await setServerOverride(server.trim() || null);
      client.reconnect();
    } else {
      client.refreshProfile();
    }
    if (isFirst) router.replace(typeof next === 'string' && next.startsWith('/') ? (next as Href) : '/');
    else goBack();
  };

  return (
    <Screen
      header={<Header title={isFirst ? '' : 'ملفي'} onBack={isFirst ? undefined : goBack} />}
      footer={<Btn size="xl" icon="check" label={isFirst ? 'هيا نلعب' : 'حفظ'} color={C.green} disabled={!name.trim()} onPress={save} />}>
      {isFirst ? (
        <View style={{ alignItems: 'center' }}>
          <Txt v="display" color={C.yellow}>
            مرحباً
          </Txt>
          <Txt center color={C.muted}>
            اختر اسمك وشخصيتك قبل أن نبدأ
          </Txt>
        </View>
      ) : null}

      <View style={{ alignItems: 'center' }}>
        <Avatar player={{ avatar, color }} size={112} />
      </View>

      <Card>
        <Txt v="h3">ما اسمك؟</Txt>
        <Field
          value={name}
          onChangeText={setName}
          placeholder="مثلاً: يوسف، مريم، الجدّة…"
          placeholderTextColor={C.dim}
          maxLength={20}
          style={styles.input}
          returnKeyType="done"
          autoCorrect={false}
        />
      </Card>

      <Card>
        <Txt v="h3">اختر شخصيتك</Txt>
        <Row wrap gap={12} center>
          {AVATARS.map((a) => (
            <Pressable
              key={a}
              onPress={() => {
                haptic.tap();
                setAvatar(a);
              }}
              accessibilityLabel={a}
              style={[styles.avatarCell, { backgroundColor: a === avatar ? color : C.surfaceStrong }, a === avatar && styles.avatarActive]}>
              <AvatarArt id={a} size={64} />
            </Pressable>
          ))}
        </Row>
      </Card>

      <Card>
        <Txt v="h3">لونك المفضّل</Txt>
        <Row wrap gap={10} center>
          {PLAYER_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => {
                haptic.tap();
                setColor(c);
              }}
              style={[styles.colorDot, { backgroundColor: c }, c === color && styles.colorActive]}
            />
          ))}
        </Row>
      </Card>

      {!isFirst ? (
        <Card>
          <Pressable onPress={() => setShowAdvanced((s) => !s)}>
            <Row>
              <Icon name="sliders" size={18} color={C.muted} />
              <Txt v="h3" style={{ flex: 1 }}>
                إعدادات الخادم
              </Txt>
              <View style={{ transform: [{ rotate: showAdvanced ? '180deg' : '0deg' }] }}>
                <Icon name="chevron" size={18} color={C.muted} />
              </View>
            </Row>
          </Pressable>
          {showAdvanced ? (
            <View style={{ gap: 8 }}>
              <Txt v="small" color={C.muted}>
                اتركه فارغاً لاستعمال الحاسوب الذي يشغّل التطبيق. أو اكتب عنوان الخادم (مثلاً 192.168.1.20).
              </Txt>
              <Field
                value={server}
                onChangeText={setServer}
                placeholder={defaultServerUrl()}
                placeholderTextColor={C.dim}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.ltr]}
              />
            </View>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: F.bold,
    fontSize: 19,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    writingDirection: 'rtl',
    borderWidth: 2,
    borderColor: C.border,
  },
  ltr: { writingDirection: 'ltr', fontSize: 16 },
  avatarCell: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#151726',
  },
  avatarActive: { borderColor: C.yellow, borderWidth: 3 },
  colorDot: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: 'transparent' },
  colorActive: { borderColor: C.text },
});
