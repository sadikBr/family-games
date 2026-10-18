/**
 * Top of a group room's waiting room: who we are waiting for (in the room / app open / app closed),
 * and «ابدأ بالموجودين» for the caller or the host. When everyone is in: «اكتمل الجمع!», then it goes.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import type { RoomGroup, RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { SoftIn } from '@/ui/motion';
import { Txt, num } from '@/ui/txt';

import { Face } from './group-card';

function status(e: RoomGroup['expected'][number]): { icon: IconName; label: string; color: string } {
  if (e.inRoom) return { icon: 'check', label: 'في الغرفة', color: C.green };
  if (e.online) return { icon: 'clock', label: 'التطبيق مفتوح، في شاشة أخرى', color: C.yellow };
  if (e.notified) return { icon: 'bell', label: 'التطبيق مغلق — أُرسل إشعار', color: C.muted };
  return { icon: 'wifiOff', label: 'التطبيق مغلق', color: C.dim };
}

export function GroupWaiting({ room }: { room: RoomView }) {
  const g = room.group;
  const waiting = !!g?.waiting;
  const allIn = !!g && g.expected.every((e) => e.inRoom);
  // «اكتمل الجمع!» for a moment when the wait ends because everyone came
  const [wasWaiting, setWasWaiting] = useState(waiting);
  const [done, setDone] = useState(false);
  if (wasWaiting !== waiting) {
    setWasWaiting(waiting);
    setDone(!waiting && allIn);
  }
  useEffect(() => {
    if (!done) return;
    play('correct');
    haptic.success();
    const t = setTimeout(() => setDone(false), 2400);
    return () => clearTimeout(t);
  }, [done]);

  if (!g || (!waiting && !done)) return null;

  if (!waiting) {
    return (
      <Animated.View entering={SoftIn} style={[styles.panel, styles.done]}>
        <View style={styles.doneIcon}>
          <Icon name="check" size={22} color={C.ink} />
        </View>
        <Txt v="h2" color={C.green}>
          اكتمل الجمع!
        </Txt>
      </Animated.View>
    );
  }

  const inCount = g.expected.filter((e) => e.inRoom).length;
  const canGo = room.me === g.by || room.me === room.hostId;
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.panel}>
      <Row gap={8}>
        <Icon name="users" size={18} color={C.yellow} />
        <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
          بانتظار «{g.name}»
        </Txt>
        <Txt v="small" color={C.muted}>
          {num(inCount)} من {num(g.expected.length)}
        </Txt>
      </Row>
      <View style={{ gap: 8 }}>
        {g.expected.map((e) => {
          const s = status(e);
          return (
            <Row key={e.id} gap={10}>
              <Face player={e} online={e.online} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt v="bold" numberOfLines={1} style={{ fontSize: 15 }}>
                  {e.name}
                  {e.id === room.me ? ' (أنت)' : ''}
                </Txt>
                <Row gap={4}>
                  <Icon name={s.icon} size={12} color={s.color} />
                  <Txt v="tiny" color={s.color} numberOfLines={1} style={{ flexShrink: 1 }}>
                    {s.label}
                  </Txt>
                </Row>
              </View>
            </Row>
          );
        })}
      </View>
      {canGo ? (
        <Btn size="md" icon="play" label="ابدأ بالموجودين" onPress={() => client.roomAction({ type: 'groupGo' })} />
      ) : (
        <Txt v="tiny" center color={C.muted}>
          ننتظر حتى يدخل الجميع، ثم نختار اللعبة ونبدأ
        </Txt>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12, padding: 14, borderRadius: 22, backgroundColor: C.surface, borderWidth: 1.5, borderColor: alpha(C.yellow, 0.45) },
  done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderColor: alpha(C.green, 0.6), backgroundColor: alpha(C.green, 0.12) },
  doneIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
});
