/** «ماذا قال الناس؟» — the screen. */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { SURVEY_ROUND_CHOICES, type SurveyView } from '@/shared/games/survey';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, PlayerTag, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Field } from '@/ui/field';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { TEAM, helpers, type Helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { Board, QuestionCard, TeamScores } from './survey-board';
import { TeamCard, TeamResult } from './taboo-teams';

type Team = 0 | 1;

/** The answer box, emptied for every new prompt (`step`). */
function AnswerBox({ view, h, label, hint }: { view: SurveyView; h: Helpers; label: string; hint?: string }) {
  const [typed, setTyped] = useState({ step: -1, text: '' });
  const text = typed.step === view.step ? typed.text : '';
  const send = () => {
    if (!text.trim()) return;
    haptic.medium();
    h.act('answer', { text, step: view.step });
    setTyped({ step: view.step, text: '' });
  };
  return (
    <View style={styles.answerCard}>
      <Txt v="bold" center color={C.yellow}>
        {label}
      </Txt>
      {hint ? (
        <Txt v="tiny" center color={C.muted}>
          {hint}
        </Txt>
      ) : null}
      <Row gap={8}>
        <Field
          value={text}
          onChangeText={(t) => setTyped({ step: view.step, text: t })}
          onSubmitEditing={send}
          placeholder="اكتب جوابك"
          placeholderTextColor={C.dim}
          autoFocus
          autoCorrect={false}
          maxLength={60}
          returnKeyType="send"
          style={styles.input}
        />
        <Btn size="md" icon="check" label="أرسل" disabled={!text.trim()} onPress={send} />
      </Row>
    </View>
  );
}

function Waiting({ h, id, text }: { h: Helpers; id: string; text: string }) {
  return (
    <Row gap={8} center style={styles.waiting}>
      <Avatar player={h.player(id)} size={30} />
      <Txt v="bold" color={C.muted} style={{ flexShrink: 1 }}>
        {text}
      </Txt>
    </Row>
  );
}

function Buzzer({ onPress, size }: { onPress: () => void; size: number }) {
  return (
    <Pressable
      onPress={() => {
        haptic.heavy();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel="اضغط الجرس"
      style={({ pressed }) => [styles.buzzer, { width: size, height: size, borderRadius: size / 2 }, pressed && styles.buzzerDown]}>
      <Txt style={[styles.buzzerText, { fontSize: size * 0.24, lineHeight: size * 0.36 }]}>اضغط!</Txt>
    </Pressable>
  );
}

function TeamsPhase({ room, view, h }: { room: RoomView; view: SurveyView; h: Helpers }) {
  return (
    <>
      <PhaseTitle icon="users" title="الفرق" sub={h.isHost ? 'اضغط على لاعب لنقله للفريق الآخر' : 'المضيف يجهّز الفرق'} />
      {([0, 1] as const).map((t) => (
        <TeamCard key={t} name={TEAM[t].name} color={TEAM[t].color} count={view.teams[t].length}>
          {view.teams[t].map((id) => (
            <PlayerTag key={id} player={h.player(id)} size={50} sub={id === h.me ? '(أنت)' : undefined} onPress={h.isHost ? () => h.act('swap', { id }) : undefined} />
          ))}
        </TeamCard>
      ))}
      <Txt v="tiny" center color={C.dim}>
        {`${num(view.rounds)} جولات · ${num(room.settings.survey.seconds)} ثانية لكل جواب · الأجوبة تقديرات من اللعبة لأشهر ما يقوله الناس`}
      </Txt>
      {h.isHost ? (
        <>
          <Btn size="md" ghost icon="shuffle" label="خلط الفرق" onPress={() => h.act('shuffle')} />
          <Btn size="xl" icon="play" label="هيا نبدأ" color={C.green} onPress={() => h.act('begin')} />
        </>
      ) : (
        <HostNote>في انتظار المضيف</HostNote>
      )}
    </>
  );
}

export function SurveyGame({ room, view }: { room: RoomView; view: SurveyView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const { height } = useWindowDimensions();
  const myTeam: Team | null = view.teams[0].includes(h.me) ? 0 : view.teams[1].includes(h.me) ? 1 : null;
  if (myTeam === null && view.phase !== 'final') return <Spectator room={room} />;
  if (view.phase === 'teams') return <TeamsPhase room={room} view={view} h={h} />;

  const notice = view.notice ? (
    <Card color={alpha(C.yellow, 0.16)} style={{ paddingVertical: 8 }}>
      <Txt v="bold" center>
        {view.notice}
      </Txt>
    </Card>
  ) : null;
  const header = (
    <>
      <RoundHeader
        label={`الجولة ${num(view.round)} من ${num(view.rounds)}`}
        round={0}
        rounds={0}
        right={
          view.multiplier > 1 ? (
            <Txt v="tiny" color={C.muted}>
              {`النقاط ${num(`×${view.multiplier}`)}`}
            </Txt>
          ) : undefined
        }
      />
      <TeamScores view={view} myTeam={myTeam} />
    </>
  );

  if (view.phase === 'final') {
    const w = view.winner;
    const won = w !== null && w !== -1 && w === myTeam;
    return (
      <>
        {won ? <Confetti /> : null}
        <ResultBanner
          tone={w === -1 || w === null ? 'neutral' : won ? 'good' : myTeam === null ? 'neutral' : 'bad'}
          title={w === -1 || w === null ? 'تعادل!' : `فاز ${TEAM[w].name}`}
          sub="أحسنتم جميعاً!"
        />
        <TeamResult
          me={h.me}
          winner={w ?? -1}
          teams={([0, 1] as const).map((t) => ({ name: TEAM[t].name, color: TEAM[t].color, score: view.scores[t], players: view.teams[t].map(h.player) }))}
        />
        <PlayAgain room={room} />
      </>
    );
  }

  const face = view.faceoff;
  const timer = view.endsAt && view.phase !== 'roundEnd' ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.answerer === h.me || (view.phase === 'steal' && myTeam !== view.control)} /> : null;
  let panel: ReactNode = null;
  // something for me to do (buzz / type) goes above the board, so it is on screen on small phones
  let mine = false;

  if (view.phase === 'faceoff' && face) {
    const atBuzzer = face.players.includes(h.me);
    const vs = (
      <Row gap={10} center>
        {face.players.map((id, t) => (
          <View key={id} style={{ alignItems: 'center', gap: 2 }}>
            <Avatar player={h.player(id)} size={44} ring={TEAM[t].color} />
            <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 110 }}>
              {h.player(id).name}
            </Txt>
          </View>
        ))}
      </Row>
    );
    if (!view.answerer) {
      mine = atBuzzer;
      panel = atBuzzer ? (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Txt v="bold" center color={C.yellow}>
            مواجهة! أول من يضغط يجيب
          </Txt>
          <Buzzer size={Math.min(140, Math.max(110, height * 0.17))} onPress={() => h.act('buzz', { step: view.step })} />
        </View>
      ) : (
        <View style={styles.waiting}>
          <Txt v="bold" center color={C.muted}>
            مواجهة: من يضغط الجرس أولاً؟
          </Txt>
          {vs}
        </View>
      );
    } else if (view.answerer === h.me) {
      mine = true;
      const second = face.firstSlot !== null || face.firstMissed;
      panel = (
        <AnswerBox
          view={view}
          h={h}
          label={second ? 'دورك: جواب أعلى يربح اللوحة لفريقك' : 'ضغطت أولاً — اكتب جوابك'}
          hint={second ? undefined : `الجواب رقم ${num(1)} يعطي فريقك اللوحة مباشرة`}
        />
      );
    } else {
      panel = (
        <View style={styles.waiting}>
          {vs}
          <Txt v="bold" center color={C.muted}>
            {`في انتظار جواب ${h.player(view.answerer).name}…`}
          </Txt>
        </View>
      );
    }
  } else if (view.phase === 'play' && view.control !== null && view.answerer) {
    const ours = view.control === myTeam;
    mine = view.answerer === h.me;
    panel =
      view.answerer === h.me ? (
        <AnswerBox view={view} h={h} label="دورك! اكتب جواباً من أشهر الأجوبة" hint="خطأ أو انتهاء الوقت = ✗" />
      ) : (
        <Waiting h={h} id={view.answerer} text={ours ? `دور ${h.player(view.answerer).name} من فريقك` : `${TEAM[view.control].name} يجيب: ${h.player(view.answerer).name}`} />
      );
  } else if (view.phase === 'steal' && view.control !== null) {
    const stealing: Team = view.control === 0 ? 1 : 0;
    mine = myTeam === stealing;
    panel =
      myTeam === stealing ? (
        <AnswerBox
          view={view}
          h={h}
          label="فرصة السرقة! جواب واحد فقط لفريقك"
          hint={`تشاوروا معاً — يكفي أن يرسل أحدكم${view.answerer ? ` (القائد: ${h.player(view.answerer).name})` : ''}`}
        />
      ) : (
        <View style={styles.waiting}>
          <Txt v="bold" center color={C.muted}>
            {`${TEAM[stealing].name} يحاول سرقة ${num(view.bank)} نقطة…`}
          </Txt>
          <Txt v="tiny" center color={C.dim}>
            إن أخطأ تبقى النقاط لفريقكم
          </Txt>
        </View>
      );
  } else if (view.phase === 'roundEnd' && view.result) {
    const r = view.result;
    const last = view.round >= view.rounds;
    panel = (
      <Animated.View entering={FadeIn.duration(220)} style={{ gap: 10 }}>
        <View style={[styles.result, { backgroundColor: alpha(TEAM[r.team].color, 0.9) }]}>
          <Txt v="title" center color="#FFFFFF">
            {r.stolen ? `سرقة! ${TEAM[r.team].name}` : TEAM[r.team].name}
          </Txt>
          <Txt v="bold" center color="#FFFFFF">
            {`${num(`+${r.points}`)} نقطة${view.multiplier > 1 ? ` (${num(`${view.bank} ×${view.multiplier}`)})` : ''}`}
          </Txt>
        </View>
        {h.isHost ? (
          <Btn size="lg" icon="play" label={last ? 'النتيجة النهائية' : 'الجولة التالية'} onPress={() => h.act('next')} />
        ) : (
          <HostNote>{last ? 'النتيجة النهائية بعد قليل' : 'الجولة التالية بعد قليل'}</HostNote>
        )}
      </Animated.View>
    );
  }

  return (
    <>
      {header}
      {notice}
      {timer}
      <QuestionCard question={view.question} width={width} />
      {mine ? panel : null}
      <Board view={view} width={width} compact={height < 700} />
      {mine ? null : panel}
    </>
  );
}

/** Lobby settings: number of rounds and seconds per answer. */
export function SurveySettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.survey;
  const change = (patch: Partial<typeof s>) => client.roomAction({ type: 'settings', game: 'survey', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string>
        editable={editable}
        value={String(s.rounds)}
        onChange={(v) => change({ rounds: Number(v) })}
        options={SURVEY_ROUND_CHOICES.map((r) => ({ key: String(r), label: `${r} جولات` }))}
      />
      <Txt v="tiny" color={C.muted}>
        الجولة قبل الأخيرة نقاطها ×2 والأخيرة ×3.
      </Txt>
      <Stepper label="الوقت لكل جواب" value={s.seconds} min={10} max={45} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${v} ث`} />
    </View>
  );
}

const styles = StyleSheet.create({
  answerCard: { backgroundColor: C.surface, borderRadius: 20, padding: 12, gap: 8, borderWidth: 2, borderColor: alpha(C.yellow, 0.6) },
  input: { flex: 1, backgroundColor: C.bg2, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, minHeight: 46, color: C.text, fontFamily: F.bold, fontSize: 17, textAlign: 'right', borderWidth: 2, borderColor: C.yellow },
  waiting: { backgroundColor: C.surface, borderRadius: 18, padding: 12, gap: 8 },
  buzzer: { backgroundColor: C.red, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: '#151726', borderBottomWidth: 10 },
  buzzerDown: { borderBottomWidth: 4, transform: [{ translateY: 5 }] },
  buzzerText: { fontFamily: F.display, color: '#FFFFFF' },
  result: { borderRadius: 20, padding: 14, alignItems: 'center', gap: 2 },
});
