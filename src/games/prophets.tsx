/** «قصص الأنبياء» — the screen: scene, narration, the family vote, the answer with a verse, the lessons. */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { PROPHETS_STORIES, type ProphetsAyah, type ProphetsSettings as Settings, type ProphetsSource, type ProphetsView } from '@/shared/games/prophets';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, OptionGrid, QuestionPanel, ResultRows, VERSE_INK } from './islamic-ui';
import { Lantern, ProphetsSceneArt } from './prophets-scene';

const PARCHMENT = '#F4EAD2';
const INK = '#3B2A17';

/** «من سورة يوسف (الآيات 4–6)» */
function sourceLine(source: ProphetsSource[]) {
  const part = (s: ProphetsSource) => `سورة ${s.surah} (${s.from === s.to ? `الآية ${num(s.from)}` : `الآيات ${num(s.from)} إلى ${num(s.to)}`})`;
  return `من ${source.map(part).join(' و')}`;
}

/** «سورة الصافات، الآيتان 143 و144» */
function ayahRef(a: ProphetsAyah) {
  const first = a.verses[0].n;
  const last = a.verses[a.verses.length - 1].n;
  if (a.verses.length === 1) return `سورة ${a.surah}، الآية ${num(first)}`;
  if (a.verses.length === 2) return `سورة ${a.surah}، الآيتان ${num(first)} و${num(last)}`;
  return `سورة ${a.surah}، الآيات ${num(first)} إلى ${num(last)}`;
}

function Lanterns({ lit, max, size = 22 }: { lit: number; max: number; size?: number }) {
  return (
    <Row gap={2} style={{ direction: 'ltr' }}>
      {Array.from({ length: max }, (_, i) => (
        <Lantern key={i} lit={i < lit} size={size} />
      ))}
    </Row>
  );
}

function Header({ view }: { view: ProphetsView }) {
  const accent = useAccent();
  return (
    <Row gap={8} style={{ justifyContent: 'space-between' }}>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <View style={[styles.chip, { backgroundColor: alpha(accent, 0.22), borderColor: alpha(accent, 0.5) }]}>
          <Txt v="tiny" color={C.text} numberOfLines={1}>
            {view.storyTitle}
          </Txt>
        </View>
        <Txt v="tiny" color={C.muted}>
          الفصل {num(view.chapter)} من {num(view.chapters)}
        </Txt>
      </View>
      <Lanterns lit={view.lanterns} max={view.maxLanterns} />
    </Row>
  );
}

function Narration({ view, width }: { view: ProphetsView; width: number }) {
  return (
    <Animated.View key={view.chapter} entering={FadeIn.duration(320)} style={styles.story}>
      <View style={{ borderRadius: 16, overflow: 'hidden' }}>
        <ProphetsSceneArt scene={view.scene} width={width - 20} id={`${view.story}-${view.chapter}`} />
      </View>
      <Txt v="h2" center color={INK}>
        {view.title}
      </Txt>
      <Txt style={styles.narration}>{view.text}</Txt>
      <Txt v="tiny" center color="#7A6448">
        {sourceLine(view.source)}
      </Txt>
    </Animated.View>
  );
}

/** The options: who voted for what (once I voted, and at the reveal), the family's pick and the right answer. */
function Options({ view, h, canVote }: { view: ProphetsView; h: Helpers; canVote: boolean }) {
  const revealed = view.correct !== null;
  return (
    <View testID="prophets-options">
      <OptionGrid
        options={view.options}
        mine={view.myVote}
        correct={view.correct}
        counted={revealed ? view.chosen : undefined}
        disabled={!canVote}
        keepOthers
        columns={1}
        onPick={(choice) => h.act('vote', { choice })}
        extra={(i) => {
          const voters = view.votes ? Object.keys(view.votes).filter((id) => view.votes![id] === i) : [];
          const isChosen = revealed && view.chosen === i;
          if (!voters.length && !isChosen) return null;
          return (
            <Row gap={4} wrap center>
              {isChosen ? (
                <View style={[styles.familyTag, { backgroundColor: view.correct === i ? C.green : C.red }]}>
                  <Txt v="tiny" color="#FFFFFF">
                    جواب العائلة
                  </Txt>
                </View>
              ) : null}
              {voters.map((id) => (
                <Avatar key={id} player={h.player(id)} size={22} />
              ))}
            </Row>
          );
        }}
      />
    </View>
  );
}

function Verdict({ view }: { view: ProphetsView }) {
  const right = view.chosen !== null && view.chosen === view.correct;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={[styles.verdict, { backgroundColor: right ? alpha(C.green, 0.9) : alpha(C.red, 0.85) }]}>
      <Txt v="h2" center color="#FFFFFF">
        {right ? 'أصبتم!' : view.chosen === null ? 'لم يصوّت أحد' : 'لم تُصب العائلة هذه المرة'}
      </Txt>
      <Txt v="small" center color="rgba(255,255,255,0.92)">
        {right ? 'بقيت الفوانيس مضيئة' : view.lanterns === 0 ? 'انطفأ آخر فانوس' : 'انطفأ فانوس'}
      </Txt>
    </Animated.View>
  );
}

function Reveal({ view, h, playing }: { view: ProphetsView; h: Helpers; playing: boolean }) {
  const iReady = view.ready.includes(h.me);
  const out = view.lanterns === 0;
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ gap: 10 }}>
      {view.after ? (
        <View style={styles.after}>
          <Txt style={styles.afterText}>{view.after}</Txt>
        </View>
      ) : null}
      {view.ayah ? (
        <QuestionPanel id={`ayah-${view.chapter}`} verse compact below={<Txt v="tiny" center color={alpha(VERSE_INK, 0.7)}>{ayahRef(view.ayah)}</Txt>}>
          <Txt style={styles.ayahText}>﴿{view.ayah.verses.map((v) => v.text).join(' ۝ ')}﴾</Txt>
        </QuestionPanel>
      ) : null}
      {playing ? (
        <Btn
          size="md"
          icon={iReady ? 'check' : 'next'}
          label={iReady ? 'في انتظار البقية' : out ? 'إلى النهاية' : view.chapter >= view.chapters ? 'إلى النهاية' : 'تابع القصة'}
          disabled={iReady}
          onPress={() => h.act('ready')}
        />
      ) : null}
      <AnsweredRow ids={view.ready} total={view.participants.length} h={h} label="جاهز" />
    </Animated.View>
  );
}

function Final({ room, view, h }: { room: RoomView; view: ProphetsView; h: Helpers }) {
  const f = view.final!;
  const accent = useAccent();
  const rows = view.participants.length ? view.participants : Object.keys(f.perPlayer);
  return (
    <>
      {f.completed ? <Confetti /> : null}
      <ResultBanner
        tone={f.completed ? 'good' : 'neutral'}
        art={<Lanterns lit={view.lanterns} max={view.maxLanterns} size={26} />}
        title={f.completed ? `أتممتم قصة ${view.storyTitle}` : 'انطفأت الفوانيس'}
        sub={f.completed ? `الفوانيس المضيئة: ${num(view.lanterns)} من ${num(view.maxLanterns)}` : 'أعيدوا القصة، فالمحاولة الثانية أجمل'}
      />
      <View style={styles.lessons}>
        <Txt v="h2" color={INK}>
          من دروس القصة
        </Txt>
        {f.lessons.map((l, i) => (
          <Row key={i} gap={8} style={{ alignItems: 'flex-start' }}>
            <View style={[styles.bullet, { backgroundColor: accent }]} />
            <Txt style={[styles.narration, { flex: 1, textAlign: 'right' }]}>{l}</Txt>
          </Row>
        ))}
      </View>
      <View style={styles.stats}>
        <Txt v="bold" center>
          أجوبة العائلة الصحيحة: {num(f.right)} من {num(view.history.length)}
        </Txt>
        <Row gap={6} center wrap style={{ direction: 'ltr' }}>
          {view.history.map((ok, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: ok ? C.green : C.red }]} />
          ))}
        </Row>
      </View>
      <ResultRows h={h} gainLabel="صحيحة" lines={rows.map((id) => ({ id, gain: num(f.perPlayer[id] ?? 0), good: (f.perPlayer[id] ?? 0) > 0 }))} />
      <PlayAgain room={room} />
    </>
  );
}

export function ProphetsGame({ room, view }: { room: RoomView; view: ProphetsView }) {
  const h = helpers(room);
  const width = useContentWidth();
  if (view.phase === 'final' && view.final) return <Final room={room} view={view} h={h} />;
  const playing = view.participants.includes(h.me);
  const asking = view.phase === 'ask';
  const canVote = playing && asking && view.myVote === null;

  return (
    <>
      {!playing ? <Spectator room={room} /> : null}
      <Header view={view} />
      {asking ? <Narration view={view} width={width} /> : <Verdict view={view} />}
      <QuestionPanel id={`q-${view.chapter}`} compact>
        <Txt v="h3" center>
          {view.question}
        </Txt>
      </QuestionPanel>
      {asking ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={canVote} /> : null}
      <Options view={view} h={h} canVote={canVote} />
      {asking ? (
        canVote ? (
          <Txt v="tiny" center color={C.muted}>
            صوّت مع عائلتك: جواب الأكثرية هو جواب الجميع
          </Txt>
        ) : (
          <AnsweredRow ids={view.voted} total={view.participants.length} h={h} label="صوّت" />
        )
      ) : (
        <Reveal view={view} h={h} playing={playing} />
      )}
    </>
  );
}

/** Lobby settings: the story, the time per chapter, the lanterns. */
export function ProphetsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.prophets;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'prophets', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">القصة</Txt>
      <ChipPicker<Settings['story']>
        editable={editable}
        value={s.story}
        onChange={(story) => change({ story })}
        options={[{ key: 'random', label: 'قصة عشوائية' }, ...PROPHETS_STORIES.map((x) => ({ key: x.key, label: x.short }))]}
      />
      <Stepper label="وقت كل فصل" value={s.seconds} min={15} max={60} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${num(v)} ث`} />
      <Stepper label="الفوانيس" value={s.lanterns} min={1} max={5} editable={editable} onChange={(lanterns) => change({ lanterns })} />
      <Txt v="tiny" color={C.muted}>
        كل جواب خاطئ يُطفئ فانوساً. أتمّوا القصة وما زال فانوس مضيئاً.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999, borderWidth: 1 },
  story: { backgroundColor: PARCHMENT, borderRadius: 22, padding: 10, gap: 6, borderWidth: 2, borderColor: '#D9C59A' },
  narration: { fontFamily: F.body, fontSize: 17, lineHeight: 30, color: INK, textAlign: 'right', writingDirection: 'rtl', paddingHorizontal: 4 },
  familyTag: { paddingHorizontal: 8, borderRadius: 999 },
  verdict: { borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14, gap: 2 },
  after: { backgroundColor: C.surface, borderRadius: 16, padding: 12 },
  afterText: { fontFamily: F.body, fontSize: 16, lineHeight: 27, color: C.text, textAlign: 'center' },
  ayahText: { fontFamily: F.quran, fontSize: 21, lineHeight: 44, color: VERSE_INK, textAlign: 'center', writingDirection: 'rtl' },
  lessons: { backgroundColor: PARCHMENT, borderRadius: 22, padding: 16, gap: 8, borderWidth: 2, borderColor: '#D9C59A' },
  bullet: { width: 10, height: 10, borderRadius: 5, marginTop: 11 },
  stats: { backgroundColor: C.surface, borderRadius: 20, padding: 14, gap: 10 },
  dot: { width: 14, height: 14, borderRadius: 7 },
});
