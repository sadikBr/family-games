/**
 * Voice chat controls: the microphone button in the room header, and the strip under it that shows
 * who is in the voice chat (glowing while they talk), with join / leave.
 */
import { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { haptic } from '@/lib/sfx';
import { useVoice, voice } from '@/lib/voice';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { Txt } from '@/ui/txt';

/** Header button: join the voice chat, then mute / unmute. */
export function VoiceButton({ size = 38 }: { size?: number }) {
  const v = useVoice();
  if (!voice.supported) return null;
  const icon = !v.on ? 'mic' : v.muted ? 'micOff' : 'mic';
  const bg = !v.on ? C.surface : v.muted ? alpha(C.red, 0.22) : alpha(C.green, 0.24);
  const fg = !v.on ? C.text : v.muted ? C.red : C.green;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={!v.on ? 'انضم إلى المحادثة الصوتية' : v.muted ? 'شغّل الميكروفون' : 'اكتم الميكروفون'}
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        if (!v.on) void voice.join();
        else voice.setMuted(!v.muted);
      }}
      style={({ pressed }) => [styles.btn, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={size * 0.52} color={fg} />
    </Pressable>
  );
}

function Glow({ on, size }: { on: boolean; size: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.set(on ? withRepeat(withTiming(1, { duration: 450 }), -1, true) : withTiming(0, { duration: 150 }));
  }, [on, pulse]);
  const style = useAnimatedStyle(() => ({ opacity: on ? 0.55 + 0.45 * pulse.get() : 0, transform: [{ scale: 1 + 0.08 * pulse.get() }] }));
  return <Animated.View pointerEvents="none" style={[styles.glow, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 }, style]} />;
}

/** Under the header: who is in the voice chat. Shown when I'm in it, or when others are (to invite me). */
export function VoiceStrip({ room }: { room: RoomView }) {
  const v = useVoice();
  if (!voice.supported) return null;
  const members = room.voice.filter((m) => room.players.some((p) => p.id === m.id));
  const others = members.filter((m) => m.id !== room.me);
  if (!v.on && !others.length && !v.error) return null;
  const size = 30;

  if (v.error) {
    return (
      <Animated.View entering={FadeIn.duration(150)} style={[styles.strip, { borderColor: alpha(C.red, 0.5) }]}>
        <Icon name="micOff" size={18} color={C.red} />
        <Txt v="tiny" color={C.text} style={{ flex: 1 }}>
          {v.error}
        </Txt>
        <Pressable onPress={() => voice.clearError()} accessibilityLabel="إغلاق" hitSlop={8}>
          <Icon name="close" size={18} color={C.muted} />
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.strip}>
      <Icon name="mic" size={16} color={v.on ? C.green : C.muted} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, alignItems: 'center', paddingVertical: 2 }}>
        {members.map((m) => {
          const p = room.players.find((x) => x.id === m.id)!;
          const link = m.id === room.me ? 'connected' : v.links[m.id];
          const talking = !m.muted && !!v.speaking[m.id];
          return (
            <View key={m.id} style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${p.name}${m.muted ? ' — مكتوم' : talking ? ' — يتكلم' : ''}`}>
              <Glow on={talking} size={size} />
              <Avatar player={p} size={size} dim={v.on && link !== 'connected'} />
              {m.muted ? (
                <View style={styles.mutedBadge}>
                  <Icon name="micOff" size={11} color="#fff" />
                </View>
              ) : null}
            </View>
          );
        })}
        {v.joining ? (
          <Txt v="tiny" color={C.muted}>
            جارٍ الاتصال…
          </Txt>
        ) : null}
      </ScrollView>
      {v.on ? (
        <Pressable onPress={() => voice.leave()} accessibilityRole="button" accessibilityLabel="غادر المحادثة الصوتية" hitSlop={6} style={[styles.small, { backgroundColor: alpha(C.red, 0.2) }]}>
          <Icon name="phoneOff" size={18} color={C.red} />
        </Pressable>
      ) : (
        <Pressable onPress={() => void voice.join()} accessibilityRole="button" accessibilityLabel="انضم إلى المحادثة الصوتية" hitSlop={6} style={[styles.join]}>
          <Row gap={4}>
            <Icon name="mic" size={15} color={C.ink} />
            <Txt v="tiny" color={C.ink} style={{ fontWeight: 'bold' }}>
              انضم
            </Txt>
          </Row>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', justifyContent: 'center' },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: C.bg2,
    borderWidth: 1,
    borderColor: C.border,
  },
  glow: { position: 'absolute', backgroundColor: alpha(C.green, 0.55) },
  mutedBadge: { position: 'absolute', bottom: 0, right: 0, width: 15, height: 15, borderRadius: 8, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  small: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  join: { paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
