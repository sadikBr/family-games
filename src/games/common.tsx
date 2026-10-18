import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { IconName } from '@/art/icons';
import { client } from '@/lib/client';
import type { PlayerPublic, RoomView } from '@/shared/protocol';
import { C, alpha, shade } from '@/theme';
import { Avatar, Card, IconBubble, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ConfirmModal } from '@/ui/controls';
import { useAccent } from '@/ui/accent';
import { Txt } from '@/ui/txt';

/** Screen headline: optional illustration, a title and one line of help. */
export function PhaseTitle({ icon, art, title, sub, color }: { icon?: IconName; art?: ReactNode; title: string; sub?: string; color?: string }) {
  const accent = useAccent();
  return (
    <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', gap: 6, paddingTop: 6 }}>
      {art ?? (icon ? <IconBubble icon={icon} size={60} iconColor={color ?? accent} color={alpha(accent, 0.16)} /> : null)}
      <Txt v="display" center>
        {title}
      </Txt>
      {sub ? (
        <Txt center color={C.muted} style={{ maxWidth: 340 }}>
          {sub}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

export function WaitingFor({ players, label = 'في انتظار' }: { players: PlayerPublic[]; label?: string }) {
  if (players.length === 0) return null;
  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Txt v="small" center color={C.muted}>
        {label}
      </Txt>
      <Row wrap gap={6} center>
        {players.map((p) => (
          <Avatar key={p.id} player={p} size={34} />
        ))}
      </Row>
    </View>
  );
}

export function Spectator({ room }: { room: RoomView }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <IconBubble icon="eye" size={60} iconColor={C.yellow} />
      <Txt v="title" center>
        أنت تتفرّج
      </Txt>
      <Txt center color={C.muted}>
        دخلت أثناء اللعب. ستشارك في الجولة القادمة.
      </Txt>
      {room.hostId === room.me ? (
        <Btn size="md" icon="refresh" label="ابدأ من جديد مع الجميع" color={C.cyan} onPress={() => setConfirm(true)} />
      ) : null}
      <ConfirmModal
        visible={confirm}
        icon="refresh"
        title="إعادة اللعبة من البداية؟"
        message="ستضيع نتيجة اللعبة الحالية، ويدخل الجميع في لعبة جديدة."
        confirmLabel="ابدأ من جديد"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          client.roomAction({ type: 'start' });
        }}
      />
    </Card>
  );
}

export function HostNote({ children }: { children: ReactNode }) {
  return (
    <Txt v="small" center color={C.dim}>
      {children}
    </Txt>
  );
}

export function PlayAgain({ room }: { room: RoomView }) {
  if (room.hostId !== room.me) {
    return <HostNote>المضيف يختار: اللعب مجدداً أو لعبة أخرى</HostNote>;
  }
  return (
    <View style={{ gap: 10 }}>
      <Btn size="lg" icon="refresh" label="العب مجدداً" color={C.yellow} onPress={() => client.roomAction({ type: 'start' })} />
      <Btn size="md" icon="home" label="اختر لعبة أخرى" ghost onPress={() => client.roomAction({ type: 'lobby' })} />
    </View>
  );
}

/** Big result banner (win / lose / info). */
export function ResultBanner({ title, sub, tone = 'good', art }: { title: string; sub?: string; tone?: 'good' | 'bad' | 'neutral'; art?: ReactNode }) {
  const accent = useAccent();
  const color = tone === 'good' ? C.green : tone === 'bad' ? C.red : shade(accent, -0.35);
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ backgroundColor: color, borderRadius: 22, padding: 18, alignItems: 'center', gap: 4 }}>
      {art}
      <Txt v="display" center>
        {title}
      </Txt>
      {sub ? (
        <Txt v="bold" center color="rgba(255,255,255,0.92)">
          {sub}
        </Txt>
      ) : null}
    </Animated.View>
  );
}
