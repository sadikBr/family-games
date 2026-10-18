/** «تمثيل صامت» — the screen. */
import { StyleSheet, View } from 'react-native';

import { client } from '@/lib/client';
import { CHARADES_CATEGORIES, CHARADES_FREE_SKIPS, type CharadesCard, type CharadesSettings as Settings, type CharadesView } from '@/shared/games/charades';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Confetti, CountdownBig, PopIn, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { TEAM, helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { TeamCard, TeamResult, TeamStrip } from './taboo-teams';

const LEVEL_LABEL = { 1: 'سهلة', 2: 'متوسطة', 3: 'صعبة' } as const;
const LEVEL_COLOR = { 1: C.green, 2: C.yellow, 3: C.red } as const;

function ScoreHeader({ view, myTeam }: { view: CharadesView; myTeam: number }) {
  return (
    <TeamStrip
      teams={[0, 1].map((t) => ({
        name: TEAM[t].name,
        color: TEAM[t].color,
        score: view.teamScores[t],
        sub: myTeam === t ? 'فريقك' : undefined,
        active: view.activeTeam === t && view.phase !== 'teams' && view.phase !== 'final',
      }))}
    />
  );
}

function WordCard({ card, big }: { card: CharadesCard; big?: boolean }) {
  const accent = useAccent();
  return (
    <PopIn k={card.index}>
      <View style={styles.card}>
        <View style={[styles.cardTop, { backgroundColor: accent }]}>
          <Txt v="tiny" color="#FFFFFF">
            {card.category}
          </Txt>
          <View style={[styles.level, { backgroundColor: LEVEL_COLOR[card.level] }]}>
            <Txt v="tiny" color={C.ink}>
              {LEVEL_LABEL[card.level]}
            </Txt>
          </View>
        </View>
        <View style={{ paddingVertical: big ? 26 : 14, paddingHorizontal: 12 }}>
          <Txt v="display" size={big ? 40 : 30} center color={C.ink} adjustsFontSizeToFit numberOfLines={2}>
            {card.word}
          </Txt>
        </View>
      </View>
    </PopIn>
  );
}

const resultIcon = { ok: 'check', skip: 'skip', penalty: 'skip' } as const;
const resultColor = { ok: alpha(C.green, 0.25), skip: C.surfaceStrong, penalty: alpha(C.red, 0.3) } as const;

export function CharadesGame({ room, view }: { room: RoomView; view: CharadesView }) {
  const { me, isHost, player, act } = helpers(room);
  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const myTeam = view.teams[0].includes(me) ? 0 : view.teams[1].includes(me) ? 1 : -1;
  const actor = player(view.actorId);
  const isActor = view.actorId === me;
  const onActiveTeam = myTeam === view.activeTeam;
  const active = TEAM[view.activeTeam];
  const okCount = view.history.filter((h) => h.result === 'ok').length;
  const unlimited = view.skipsLeft >= CHARADES_FREE_SKIPS;
  const notice = view.notice ? (
    <Card color={alpha(C.yellow, 0.18)}>
      <Txt v="bold" center>
        {view.notice}
      </Txt>
    </Card>
  ) : null;

  switch (view.phase) {
    case 'teams':
      return (
        <>
          <PhaseTitle icon="users" title="الفرق" sub={isHost ? 'اضغط على لاعب لنقله للفريق الآخر' : 'المضيف يجهّز الفرق'} />
          {[0, 1].map((t) => (
            <TeamCard key={t} name={TEAM[t].name} color={TEAM[t].color} count={view.teams[t].length}>
              {view.teams[t].map((id) => (
                <PlayerTag key={id} player={player(id)} size={52} sub={id === me ? '(أنت)' : undefined} onPress={isHost ? () => act('swap', { id }) : undefined} />
              ))}
            </TeamCard>
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
          <RoundHeader label={`الدور ${num(view.turn)} من ${num(view.totalTurns)}`} round={0} rounds={0} />
          <ScoreHeader view={view} myTeam={myTeam} />
          {notice}
          <PhaseTitle art={<Avatar player={actor} size={88} ring={active.color} />} title={isActor ? 'دورك في التمثيل' : `التمثيل: ${actor.name}`} sub={active.name} />
          <Card>
            <Txt center>
              {isActor
                ? 'ستظهر لك كلمة. مثّلها بلا كلام ولا أصوات، ولا تشر إلى الحروف. اضغط «صحيح» عندما يخمّنها فريقك.'
                : onActiveTeam
                  ? 'شاهد جيداً وقل تخميناتك بصوت عالٍ!'
                  : 'أنتم تراقبون: سترون الكلمة على هواتفكم. ممنوع المساعدة!'}
            </Txt>
          </Card>
          {isActor || isHost ? (
            <Btn size="xl" icon="play" label="ابدأ الدور" color={C.green} onPress={() => act('start')} />
          ) : (
            <HostNote>في انتظار {actor.name}</HostNote>
          )}
        </>
      );

    case 'countdown':
      return (
        <View style={{ flex: 1, minHeight: 380, justifyContent: 'center', gap: 10 }}>
          <Txt v="h2" center>
            {isActor ? 'استعدّ… ستظهر الكلمة' : onActiveTeam ? `استعدّوا للتخمين — التمثيل من ${actor.name}` : `التمثيل من ${actor.name} ل${active.name.slice(1)}`}
          </Txt>
          <CountdownBig endsAt={view.endsAt} />
        </View>
      );

    case 'play': {
      const card = view.card;
      return (
        <>
          <ScoreHeader view={view} myTeam={myTeam} />
          <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={isActor} />
          {notice}
          {isActor && card ? (
            <>
              <WordCard card={card} big />
              <Row gap={10}>
                <Btn flex size="xl" icon="check" label="صحيح" color={C.green} silent onPress={() => act('ok', { index: card.index })} />
                <Btn
                  flex
                  size="xl"
                  icon="skip"
                  label={unlimited ? 'تخطَّ' : view.skipsLeft > 0 ? `تخطَّ (${num(view.skipsLeft)})` : `تخطَّ (${num(-1)})`}
                  color={view.skipsLeft > 0 ? C.orange : C.red}
                  silent
                  onPress={() => act('skip', { index: card.index })}
                />
              </Row>
              <Txt v="tiny" center color={C.dim}>
                {unlimited ? 'التخطّي مجاني' : view.skipsLeft > 0 ? `التخطّي المجاني المتبقي: ${num(view.skipsLeft)}، وبعده يكلّف كل تخطٍّ نقطة` : 'انتهى التخطّي المجاني: كل تخطٍّ الآن يكلّف نقطة'}
              </Txt>
            </>
          ) : onActiveTeam ? (
            <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}>
              <Avatar player={actor} size={84} ring={active.color} />
              <Txt v="display">خمّنوا!</Txt>
              <Txt center color={C.muted}>
                التمثيل من {actor.name}… قولوا تخميناتكم بصوت عالٍ
              </Txt>
              <View style={{ alignSelf: 'center' }}>
                <Pill label={`${num(okCount)} صحيحة`} icon="check" color={alpha(C.green, 0.25)} />
              </View>
            </Card>
          ) : card ? (
            <>
              <Txt v="small" center color={C.muted}>
                كلمة هذا الدور (لا تساعدوهم!)
              </Txt>
              <WordCard card={card} />
              <View style={{ alignSelf: 'center' }}>
                <Pill label={`${num(okCount)} صحيحة`} icon="check" color={alpha(C.green, 0.25)} />
              </View>
            </>
          ) : null}
          {isHost ? <Btn size="sm" ghost icon="stop" label="إنهاء الدور" onPress={() => act('endTurn')} /> : null}
        </>
      );
    }

    case 'turnEnd': {
      const pts = view.history.reduce((n, h) => n + (h.result === 'ok' ? 1 : h.result === 'penalty' ? -1 : 0), 0);
      const last = view.turn >= view.totalTurns;
      return (
        <>
          <PhaseTitle icon="clock" title="انتهى الوقت" sub={`${active.name}: ${num(pts)} في هذا الدور`} />
          <ScoreHeader view={view} myTeam={myTeam} />
          {notice}
          <Card>
            <Row wrap gap={6}>
              {view.history.map((h, i) => (
                <Pill key={i} label={h.result === 'penalty' ? `${h.word ?? '؟'} (${num(-1)})` : (h.word ?? '؟')} icon={resultIcon[h.result]} color={resultColor[h.result]} />
              ))}
              {view.history.length === 0 ? <Txt color={C.muted}>لا توجد كلمات</Txt> : null}
            </Row>
          </Card>
          {isHost || isActor ? (
            <Btn size="xl" icon={last ? 'trophy' : 'play'} label={last ? 'النتيجة النهائية' : 'الدور التالي'} onPress={() => act('next')} />
          ) : (
            <HostNote>في انتظار الدور التالي</HostNote>
          )}
        </>
      );
    }

    case 'final': {
      const [a, b] = view.teamScores;
      const winner = a === b ? -1 : a > b ? 0 : 1;
      const iWon = winner !== -1 && winner === myTeam;
      return (
        <>
          {iWon ? <Confetti /> : null}
          <ResultBanner tone={winner === -1 ? 'neutral' : iWon ? 'good' : 'bad'} title={winner === -1 ? 'تعادل!' : `الفوز ${li(TEAM[winner].name)}`} sub={`${num(a)} مقابل ${num(b)}`} />
          <TeamResult
            me={me}
            winner={winner}
            teams={[0, 1].map((t) => ({ name: TEAM[t].name, color: TEAM[t].color, score: view.teamScores[t], players: view.teams[t].map(player) }))}
          />
          <PlayAgain room={room} />
        </>
      );
    }
  }
}

/** Lobby settings. */
export function CharadesSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.charades;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'charades', patch: patch as Record<string, unknown> });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الموضوع</Txt>
      <ChipPicker
        editable={editable}
        value={settings.category}
        onChange={(category) => change({ category })}
        options={[{ key: 'mixed' as const, label: 'خليط' }, ...CHARADES_CATEGORIES]}
      />
      <Txt v="bold">الصعوبة</Txt>
      <ChipPicker
        editable={editable}
        value={settings.level}
        onChange={(level) => change({ level })}
        options={[
          { key: 'all', label: 'الكل' },
          { key: 'easy', label: 'سهلة' },
          { key: 'medium', label: 'متوسطة' },
          { key: 'hard', label: 'صعبة' },
        ]}
      />
      <Txt v="bold">مدة الدور</Txt>
      <ChipPicker
        editable={editable}
        value={String(settings.seconds)}
        onChange={(v) => change({ seconds: Number(v) })}
        options={[
          { key: '45', label: '45 ثانية' },
          { key: '60', label: '60 ثانية' },
          { key: '90', label: '90 ثانية' },
        ]}
      />
      <Txt v="bold">التخطّي المجاني في كل دور</Txt>
      <ChipPicker
        editable={editable}
        value={String(settings.skips)}
        onChange={(v) => change({ skips: Number(v) })}
        options={[
          { key: '0', label: '0' },
          { key: '1', label: '1' },
          { key: '2', label: '2' },
          { key: '3', label: '3' },
          { key: '5', label: '5' },
          { key: String(CHARADES_FREE_SKIPS), label: 'بلا حدّ' },
        ]}
      />
      <Txt v="tiny" color={C.muted}>
        {settings.skips >= CHARADES_FREE_SKIPS ? 'التخطّي مجاني دائماً.' : 'بعد التخطّي المجاني، كل تخطٍّ يكلّف الفريق نقطة.'}
      </Txt>
      <Stepper label="أدوار لكل لاعب" value={settings.turnsEach} min={1} max={3} editable={editable} onChange={(turnsEach) => change({ turnsEach })} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FBF7EC', borderRadius: 22, overflow: 'hidden' },
  cardTop: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  level: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 1 },
});
