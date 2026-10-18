import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/art/icons';
import type { RoomView, TabooView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { Confetti, PopIn, Shake, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { TEAM, helpers } from './helpers';

function ScoreHeader({ view }: { view: TabooView }) {
  return (
    <Row gap={10}>
      {[0, 1].map((t) => {
        const active = view.activeTeam === t && view.phase !== 'teams' && view.phase !== 'final';
        return (
          <View key={t} style={[styles.teamScore, { borderColor: active ? TEAM[t].color : 'transparent' }]}>
            <View style={[styles.teamDot, { backgroundColor: TEAM[t].color }]} />
            <Txt v="small" style={{ flex: 1 }} numberOfLines={1}>
              {TEAM[t].name}
            </Txt>
            <Txt style={{ fontFamily: F.display, fontSize: 24, lineHeight: 34 }}>{num(view.teamScores[t])}</Txt>
          </View>
        );
      })}
    </Row>
  );
}

function TabooCardView({ card }: { card: NonNullable<TabooView['card']> }) {
  return (
    <PopIn k={card.index}>
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Txt v="display" size={40} center color="#FFFFFF" adjustsFontSizeToFit numberOfLines={1}>
            {card.word}
          </Txt>
        </View>
        <View style={{ padding: 14, gap: 4 }}>
          <Txt v="tiny" center color={C.red}>
            كلمات ممنوعة
          </Txt>
          {card.forbidden.map((w) => (
            <Txt key={w} v="h3" center color={C.ink}>
              {w}
            </Txt>
          ))}
        </View>
      </View>
    </PopIn>
  );
}

const resultIcon = { ok: 'check', buzz: 'siren', skip: 'skip' } as const;
const resultColor = { ok: alpha(C.green, 0.25), buzz: alpha(C.red, 0.3), skip: C.surfaceStrong } as const;

export function TabooGame({ room, view }: { room: RoomView; view: TabooView }) {
  const { me, isHost, player, act } = helpers(room);
  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const myTeam = view.teams[0].includes(me) ? 0 : view.teams[1].includes(me) ? 1 : -1;
  const describer = player(view.describerId);
  const isDescriber = view.describerId === me;
  const onActiveTeam = myTeam === view.activeTeam;
  const active = TEAM[view.activeTeam];
  const okCount = view.history.filter((h) => h.result === 'ok').length;
  const lastBuzz = view.history.filter((h) => h.result === 'buzz').length;
  const notice = view.notice ? (
    <Card color={alpha(C.yellow, 0.18)}>
      <Txt v="bold" center>
        {view.notice}
      </Txt>
    </Card>
  ) : null;
  const undo =
    view.undoBuzz && (isDescriber || isHost) ? (
      <Btn
        size="md"
        icon="refresh"
        label={`تراجع عن «قالها» (${player(view.undoBuzz.by).name})`}
        color={C.surfaceStrong}
        textColor={C.text}
        onPress={() => act(isDescriber ? 'undoBuzz' : 'hostUndo')}
      />
    ) : null;

  switch (view.phase) {
    case 'teams':
      return (
        <>
          <PhaseTitle icon="users" title="الفرق" sub={isHost ? 'اضغط على لاعب لنقله للفريق الآخر' : 'المضيف يجهّز الفرق'} />
          {[0, 1].map((t) => (
            <Card key={t} outline={alpha(TEAM[t].color, 0.7)}>
              <Row gap={8}>
                <View style={[styles.teamDot, { backgroundColor: TEAM[t].color }]} />
                <Txt v="h2">{TEAM[t].name}</Txt>
              </Row>
              <Row wrap gap={6} center>
                {view.teams[t].map((id) => (
                  <PlayerTag key={id} player={player(id)} size={52} badge={id === me ? 'star' : undefined} onPress={isHost ? () => act('swap', { id }) : undefined} />
                ))}
              </Row>
            </Card>
          ))}
          {isHost ? (
            <>
              <Btn size="md" ghost icon="shuffle" label="خلط الفرق" onPress={() => act('shuffle')} />
              <Btn size="xl" icon="play" label="هيا نبدأ" color={C.green} onPress={() => act('begin')} />
            </>
          ) : (
            <HostNote>في انتظار المضيف</HostNote>
          )}
        </>
      );

    case 'ready':
      return (
        <>
          <ScoreHeader view={view} />
          {notice}
          <PhaseTitle
            art={<Avatar player={describer} size={88} ring={active.color} />}
            title={isDescriber ? 'أنت الشارح' : `${describer.name} سيشرح`}
            sub={`دور ${active.name}`}
          />
          <Card>
            <Txt center>
              {isDescriber
                ? 'اشرح الكلمة لفريقك بدون أن تقول الكلمات الممنوعة. ممنوع الإشارة أو التهجئة.'
                : onActiveTeam
                  ? 'استعد للتخمين، وقل الجواب بصوت عالٍ.'
                  : 'أنت تراقب: إذا قال كلمة ممنوعة اضغط الزر الأحمر.'}
            </Txt>
          </Card>
          {isDescriber || isHost ? (
            <Btn size="xl" icon="clock" label="ابدأ الوقت" color={C.green} onPress={() => act('start')} />
          ) : (
            <HostNote>في انتظار {describer.name}</HostNote>
          )}
          <Txt v="tiny" center color={C.dim}>
            الدور {view.turn} من {view.totalTurns}
          </Txt>
        </>
      );

    case 'play':
      return (
        <>
          <ScoreHeader view={view} />
          <TimerBar endsAt={view.endsAt} total={room.settings.taboo.seconds * 1000} onTick={isDescriber} />
          {notice}
          {undo}
          {isDescriber && view.card ? (
            <>
              <TabooCardView card={view.card} />
              <Row gap={10}>
                <Btn flex size="xl" icon="check" label="صحيح" color={C.green} silent onPress={() => act('ok', { index: view.card!.index })} />
                <Btn flex size="xl" icon="skip" label="تخطَّ" color={C.orange} silent onPress={() => act('skip', { index: view.card!.index })} />
              </Row>
            </>
          ) : onActiveTeam ? (
            <Shake trigger={lastBuzz || null}>
              <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
                <Avatar player={describer} size={80} />
                <Txt v="display">خمّن</Txt>
                <Txt center color={C.muted}>
                  {describer.name} يشرح لك الكلمة
                </Txt>
                <Pill label={`${okCount} كلمات صحيحة`} icon="check" color={alpha(C.green, 0.25)} />
              </Card>
            </Shake>
          ) : view.card ? (
            <>
              <Row gap={8} center>
                <Avatar player={describer} size={28} ring={active.color} />
                <Txt v="small" color={C.muted} style={{ flexShrink: 1 }}>
                  الشرح من {describer.name} ل{active.name.slice(1)}: راقب الكلمات الممنوعة
                </Txt>
              </Row>
              <TabooCardView card={view.card} />
              <Pressable onPress={() => act('buzz', { index: view.card!.index })} style={({ pressed }) => [styles.buzzer, pressed && { opacity: 0.85, transform: [{ translateY: 3 }] }]}>
                <Icon name="siren" size={44} color="#FFFFFF" />
                <Txt v="title">قالها</Txt>
                <Txt v="tiny">إذا قال كلمة ممنوعة (‎-1)</Txt>
              </Pressable>
            </>
          ) : null}
          {isHost ? <Btn size="sm" ghost icon="stop" label="إنهاء الدور" onPress={() => act('endTurn')} /> : null}
        </>
      );

    case 'turnEnd': {
      const pts = view.history.reduce((n, h) => n + (h.result === 'ok' ? 1 : h.result === 'buzz' ? -1 : 0), 0);
      return (
        <>
          <PhaseTitle icon="clock" title="انتهى الوقت" sub={`${active.name}: ${num(pts)}`} />
          <ScoreHeader view={view} />
          {notice}
          <Card>
            <Row wrap gap={6}>
              {view.history.map((h, i) => (
                <Pill key={i} label={h.word} icon={resultIcon[h.result]} color={resultColor[h.result]} />
              ))}
              {view.history.length === 0 ? <Txt color={C.muted}>لا توجد كلمات</Txt> : null}
            </Row>
          </Card>
          {isHost || isDescriber ? (
            <Btn size="xl" icon="play" label={view.turn >= view.totalTurns ? 'النتيجة النهائية' : 'الدور التالي'} onPress={() => act('next')} />
          ) : (
            <HostNote>في انتظار الدور التالي</HostNote>
          )}
        </>
      );
    }

    case 'final': {
      const [a, b] = view.teamScores;
      const winner = a === b ? -1 : a > b ? 0 : 1;
      const iWon = winner === myTeam;
      return (
        <>
          {iWon ? <Confetti /> : null}
          <ResultBanner tone={winner === -1 ? 'neutral' : iWon ? 'good' : 'bad'} title={winner === -1 ? 'تعادل' : `فاز ${TEAM[winner].name}`} />
          <ScoreHeader view={view} />
          <PlayAgain room={room} />
        </>
      );
    }
  }
}

const styles = StyleSheet.create({
  teamScore: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: C.surface,
    borderWidth: 2,
  },
  teamDot: { width: 12, height: 12, borderRadius: 6 },
  card: {
    backgroundColor: '#FBF7EC',
    borderRadius: 22,
    overflow: 'hidden',
  },
  cardTop: { backgroundColor: C.orange, paddingVertical: 14, paddingHorizontal: 10 },
  buzzer: {
    backgroundColor: C.red,
    borderRadius: 999,
    alignSelf: 'center',
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 6,
    borderBottomColor: '#A82A40',
  },
});
