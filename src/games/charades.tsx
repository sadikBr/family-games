/** «تمثيل صامت» — the screen. */
import { StyleSheet, View } from 'react-native';

import { client } from '@/lib/client';
import { Icon } from '@/art/icons';
import {
  CHARADES_CATEGORIES,
  CHARADES_FREE_SKIPS,
  CHARADES_PROVERBS,
  type CharadesCard,
  type CharadesResult,
  type CharadesSettings as Settings,
  type CharadesView,
} from '@/shared/games/charades';
import type { RoomView } from '@/shared/protocol';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, Pill, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper, Toggle } from '@/ui/controls';
import { Confetti, CountdownBig, PopIn, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';
import { li } from '@/shared/li';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { TEAM, helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { TeamCard, TeamResult, TeamStrip } from './taboo-teams';

const LEVEL_LABEL = { 1: 'سهلة', 2: 'متوسطة', 3: 'صعبة' } as const;
const LEVEL_COLOR = { 1: C.green, 2: C.yellow, 3: C.red } as const;
/** «نقطة» / «نقطتان» / «3 نقاط» */
const ptsLabel = (n: number) => (n === 1 ? 'نقطة' : n === 2 ? 'نقطتان' : `${num(n)} نقاط`);
const COMMAND_COLOR = C.purple;
const REST_COLOR = C.cyan;

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
  const proverb = card.kind === 'proverb';
  return (
    <PopIn k={card.index}>
      <View style={styles.card}>
        <View style={[styles.cardTop, { backgroundColor: accent }]}>
          <Txt v="tiny" color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1 }}>
            {card.ma ? `${card.category} · مثل مغربي` : card.category}
          </Txt>
          <View style={[styles.level, { backgroundColor: LEVEL_COLOR[card.level] }]}>
            <Txt v="tiny" color={C.ink}>
              {proverb ? `${LEVEL_LABEL[card.level]} · ${ptsLabel(card.points)}` : LEVEL_LABEL[card.level]}
            </Txt>
          </View>
        </View>
        <View style={{ paddingVertical: big ? (proverb ? 20 : 26) : 14, paddingHorizontal: 12, gap: 6 }}>
          <Txt v="display" size={big ? (proverb ? 32 : 40) : proverb ? 24 : 30} center color={C.ink} adjustsFontSizeToFit numberOfLines={proverb ? 3 : 2}>
            {card.word}
          </Txt>
          {card.meaning ? (
            <Txt v="small" center color="#6B6488">
              المعنى: {card.meaning}
            </Txt>
          ) : null}
        </View>
      </View>
    </PopIn>
  );
}

/** A command («أمر») or a rest card («استراحة»): for everyone, in their own colours. */
function SpecialCard({ card }: { card: CharadesCard }) {
  const command = card.kind === 'command';
  const color = command ? COMMAND_COLOR : REST_COLOR;
  return (
    <PopIn k={card.index}>
      <View style={[styles.card, { backgroundColor: command ? '#F3EEFF' : '#E9FAF8', borderWidth: 3, borderColor: color }]}>
        <View style={[styles.cardTop, { backgroundColor: color }]}>
          <Row gap={6}>
            <Icon name={command ? 'bolt' : 'tea'} size={16} color="#FFFFFF" />
            <Txt v="bold" color="#FFFFFF">
              {command ? 'بطاقة أمر' : 'بطاقة راحة'}
            </Txt>
          </Row>
          {command || card.points > 0 ? (
            <View style={[styles.level, { backgroundColor: '#FFFFFF' }]}>
              <Txt v="tiny" color={C.ink}>
                {ptsLabel(card.points)}
              </Txt>
            </View>
          ) : null}
        </View>
        <View style={{ paddingVertical: 18, paddingHorizontal: 14 }}>
          <Txt v="h2" center color={C.ink} adjustsFontSizeToFit numberOfLines={3}>
            {card.word}
          </Txt>
        </View>
      </View>
    </PopIn>
  );
}

/** «الوقت متوقّف» while a command or a rest card is on screen. */
function PausedBar({ left }: { left: number }) {
  return (
    <Row gap={8} center style={styles.paused}>
      <Icon name="clock" size={16} color={C.muted} />
      <Txt v="small" color={C.muted}>
        الوقت متوقّف · بقي {num(Math.ceil(left / 1000))} ثانية
      </Txt>
    </Row>
  );
}

const resultIcon = { ok: 'check', skip: 'skip', penalty: 'skip', done: 'bolt', undone: 'close', rest: 'tea' } as const;
const resultColor = {
  ok: alpha(C.green, 0.25),
  skip: C.surfaceStrong,
  penalty: alpha(C.red, 0.3),
  done: alpha(COMMAND_COLOR, 0.4),
  undone: C.surfaceStrong,
  rest: alpha(REST_COLOR, 0.3),
} as const;

function historyLabel(h: { word: string | null; result: CharadesResult; points: number }) {
  const w = h.word ?? '؟';
  if (h.result === 'penalty') return `${w} (${num(-1)})`;
  if (h.points > 1 || h.result === 'done' || (h.result === 'rest' && h.points > 0)) return `${w} · ${ptsLabel(h.points)}`;
  return w;
}

export function CharadesGame({ room, view }: { room: RoomView; view: CharadesView }) {
  const { me, isHost, player, act } = helpers(room);
  if (!view.participants.includes(me)) return <Spectator room={room} />;

  const myTeam = view.teams[0].includes(me) ? 0 : view.teams[1].includes(me) ? 1 : -1;
  const actor = player(view.actorId);
  const isActor = view.actorId === me;
  const onActiveTeam = myTeam === view.activeTeam;
  const active = TEAM[view.activeTeam];
  const okCount = view.history.filter((h) => h.result === 'ok').length;
  const gained = view.history.reduce((n, h) => n + Math.max(0, h.points), 0);
  const proverbs = room.settings.charades.category === CHARADES_PROVERBS.key;
  const foundPill = <Pill label={proverbs ? `نقاط هذا الدور: ${num(gained)}` : `${num(okCount)} صحيحة`} icon="check" color={alpha(C.green, 0.25)} />;
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
                ? proverbs
                  ? 'سيظهر لك مثل أو حكمة. مثّله بلا كلام، واضغط «صحيح» عندما يقوله فريقك. بطاقة الأمر تنفّذها والفريق الآخر يحكم.'
                  : 'ستظهر لك كلمة. مثّلها بلا كلام ولا أصوات، ولا تشر إلى الحروف. اضغط «صحيح» عندما يخمّنها فريقك.'
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
      const special = card && (card.kind === 'command' || card.kind === 'rest') ? card : null;
      const judgeAs = view.canJudge ? 'judge' : isHost && !isActor ? 'hostJudge' : null;
      return (
        <>
          <ScoreHeader view={view} myTeam={myTeam} />
          {view.pausedLeft !== null ? <PausedBar left={view.pausedLeft} /> : <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={isActor} />}
          {notice}
          {special ? (
            <>
              <SpecialCard card={special} />
              {special.kind === 'command' ? (
                <>
                  <Txt center color={C.muted}>
                    {isActor ? 'نفّذ الأمر الآن! الفريق الآخر يحكم.' : `الأمر ينفّذه ${actor.name}${judgeAs ? '، فاحكموا:' : '، والفريق الآخر يحكم'}`}
                  </Txt>
                  {judgeAs ? (
                    <Row gap={10}>
                      <Btn flex size="lg" icon="check" label="نُفِّذ" color={C.green} onPress={() => act(judgeAs, { index: special.index, done: true })} />
                      <Btn flex size="lg" icon="close" label="لم يُنفَّذ" color={C.red} onPress={() => act(judgeAs, { index: special.index, done: false })} />
                    </Row>
                  ) : null}
                </>
              ) : (
                <>
                  <Txt center color={C.muted}>
                    {special.effect === 'points'
                      ? `${ptsLabel(special.points)} هدية ل${active.name.slice(1)}، بلا تمثيل`
                      : special.effect === 'freeSkip'
                        ? 'تخطٍّ مجاني إضافي في هذا الدور'
                        : 'هذه البطاقة تمرّ بلا تمثيل ولا خسارة'}
                  </Txt>
                  {isActor ? <Btn size="lg" icon="next" label="البطاقة التالية" onPress={() => act('goOn', { index: special.index })} /> : null}
                </>
              )}
            </>
          ) : isActor && card ? (
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
              <Txt v="display">{proverbs ? 'خمّنوا المثل!' : 'خمّنوا!'}</Txt>
              <Txt center color={C.muted}>
                التمثيل من {actor.name}… قولوا تخميناتكم بصوت عالٍ
              </Txt>
              <View style={{ alignSelf: 'center' }}>{foundPill}</View>
            </Card>
          ) : card ? (
            <>
              <Txt v="small" center color={C.muted}>
                {proverbs ? 'مثل هذا الدور (لا تساعدوهم!)' : 'كلمة هذا الدور (لا تساعدوهم!)'}
              </Txt>
              <WordCard card={card} />
              <View style={{ alignSelf: 'center' }}>{foundPill}</View>
            </>
          ) : null}
          {isHost ? <Btn size="sm" ghost icon="stop" label="إنهاء الدور" onPress={() => act('endTurn')} /> : null}
        </>
      );
    }

    case 'turnEnd': {
      const pts = view.history.reduce((n, h) => n + h.points, 0);
      const last = view.turn >= view.totalTurns;
      return (
        <>
          <PhaseTitle icon="clock" title="انتهى الوقت" sub={`${active.name}: ${num(pts)} في هذا الدور`} />
          <ScoreHeader view={view} myTeam={myTeam} />
          {notice}
          <Card>
            <Row wrap gap={6}>
              {view.history.map((h, i) => (
                <Pill key={i} label={historyLabel(h)} icon={resultIcon[h.result]} color={resultColor[h.result]} />
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
        options={[{ key: 'mixed' as const, label: 'خليط' }, ...CHARADES_CATEGORIES, CHARADES_PROVERBS]}
      />
      {settings.category === CHARADES_PROVERBS.key ? (
        <>
          <Txt v="tiny" color={C.muted}>
            على طريقة «غصب عنك تقول»: أمثال وحكم مشهورة، ولكل بطاقة نقاط من 1 إلى 3 حسب صعوبتها.
          </Txt>
          <Toggle label="بطاقات الأوامر" value={settings.commands !== false} editable={editable} onChange={(commands) => change({ commands })} />
          <Toggle label="بطاقات الراحة" value={settings.rest !== false} editable={editable} onChange={(rest) => change({ rest })} />
          <Txt v="tiny" color={C.muted}>
            الأمر ينفّذه الممثّل ويحكم الفريق الآخر، والراحة نقطة مجانية أو تخطٍّ بلا خسارة.
          </Txt>
        </>
      ) : null}
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
  paused: { backgroundColor: C.surface, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 14, alignSelf: 'center' },
});
