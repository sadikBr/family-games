/** «ابنِ المسجد» — the screen: the growing mosque, the question, the bricks, the finished mosque. */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { MOSQUE_PIECES, MOSQUE_ROUNDS, type MosqueLevel, type MosqueView } from '@/shared/games/mosque';
import type { RoomView } from '@/shared/protocol';
import { C, shade } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { SoftIn } from '@/ui/motion';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, MyVerdict, NO_ANSWER, OptionGrid, QuestionPanel, ResultRows, RoundHeader, useMyResultFx } from './islamic-ui';
import { MosqueArt } from './mosque-art';

const LEVEL_LABEL: Record<MosqueLevel, string> = { easy: 'سهل', normal: 'عادي', hard: 'صعب' };
const BRICK = '#C9774A';

/** «… طوبة» with the right Arabic number agreement. */
function bricks(n: number) {
  if (n === 1) return 'طوبة واحدة';
  if (n === 2) return 'طوبتين';
  return n >= 3 && n <= 10 ? `${num(n)} طوبات` : `${num(n)} طوبة`;
}

/** «في … جولة» with the right Arabic number agreement. */
function rounds(n: number) {
  if (n === 1) return 'جولة واحدة';
  if (n === 2) return 'جولتين';
  return n <= 10 ? `${num(n)} جولات` : `${num(n)} جولة`;
}

/** Bricks laid towards the next piece. */
function Progress({ view }: { view: MosqueView }) {
  const done = view.built >= MOSQUE_PIECES.length;
  const ratio = done ? 1 : Math.min(1, view.bricks / Math.max(1, view.cost));
  return (
    <View style={styles.progress}>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
          {done ? 'اكتمل المسجد' : `التالي: ${MOSQUE_PIECES[view.built].label}`}
        </Txt>
        <Txt v="tiny" color={C.muted}>
          بُني {num(view.built)} من {num(MOSQUE_PIECES.length)}
        </Txt>
      </Row>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      {!done ? (
        <Row gap={6} style={{ justifyContent: 'space-between' }}>
          <Txt v="tiny" color={C.muted}>
            {num(view.bricks)} من {bricks(view.cost)}
          </Txt>
          <Txt v="tiny" color={C.muted}>
            الجولات الباقية بعد هذه: {num(Math.max(0, view.rounds - view.round))}
          </Txt>
        </Row>
      ) : null}
    </View>
  );
}

function Results({ view, h }: { view: MosqueView; h: Helpers }) {
  return (
    <ResultRows
      h={h}
      gainLabel="الطوب"
      gainColor={BRICK}
      lines={(view.results ?? []).map((r) => ({
        id: r.id,
        detail: r.choice === null ? NO_ANSWER : view.options[r.choice],
        gain: r.correct ? `+${num(r.bricks)}` : num(0),
        good: r.correct,
        icon: r.fast ? <Icon name="bolt" size={14} color={C.yellow} /> : undefined,
      }))}
    />
  );
}

function Reveal({ view, h }: { view: MosqueView; h: Helpers }) {
  const accent = useAccent();
  const built = view.justBuilt.map((i) => MOSQUE_PIECES[i].label);
  return (
    <Animated.View entering={FadeInDown.duration(240)} style={{ gap: 8 }}>
      {built.length ? (
        <Animated.View entering={SoftIn} style={[styles.built, { backgroundColor: shade(accent, -0.15) }]}>
          <Icon name="sparkle" size={22} color="#FFFFFF" />
          <Txt v="h2" color="#FFFFFF" center style={{ flexShrink: 1 }}>
            تمّ بناء {built.join(' و')}!
          </Txt>
        </Animated.View>
      ) : null}
      <MyVerdict tone={view.earned ? 'good' : 'none'} text={view.earned ? `أضافت العائلة ${bricks(view.earned)}` : 'لا طوب في هذه الجولة'} />
      <Results view={view} h={h} />
    </Animated.View>
  );
}

function Final({ room, view, h, width }: { room: RoomView; view: MosqueView; h: Helpers; width: number }) {
  const ids = Object.keys(view.stats).filter((id) => view.participants.includes(id) || view.stats[id].bricks > 0);
  const total = ids.reduce((t, id) => t + view.stats[id].bricks, 0);
  const sorted = [...ids].sort((a, b) => view.stats[b].bricks - view.stats[a].bricks);
  return (
    <>
      {view.completed ? <Confetti /> : null}
      <ResultBanner
        tone={view.completed ? 'good' : 'neutral'}
        title={view.completed ? 'اكتمل المسجد!' : 'لم يكتمل المسجد هذه المرة'}
        sub={
          view.completed
            ? `بنيتموه معاً في ${rounds(view.round)}، بارك الله فيكم`
            : `القطع المبنية: ${num(view.built)} من ${num(MOSQUE_PIECES.length)}. حاولوا مرة أخرى!`
        }
      />
      <Animated.View entering={FadeIn.duration(500)}>
        <MosqueArt built={view.built} width={width} />
      </Animated.View>
      <View style={{ gap: 8 }}>
        <Txt v="h3" center>
          من العائلة: {bricks(total)}
        </Txt>
        <ResultRows
          h={h}
          ordered
          gainLabel="الطوب"
          gainColor={BRICK}
          lines={sorted.map((id) => ({ id, detail: `إجابات صحيحة: ${num(view.stats[id].right)}`, gain: num(view.stats[id].bricks), good: view.stats[id].bricks > 0 }))}
        />
      </View>
      <PlayAgain room={room} />
    </>
  );
}

export function MosqueGame({ room, view }: { room: RoomView; view: MosqueView }) {
  const h = helpers(room);
  const width = useContentWidth();
  const playing = view.participants.includes(h.me);
  const mine = view.results?.find((r) => r.id === h.me);
  // a finished piece has its own chime for everyone; otherwise each phone hears its own result
  useMyResultFx(view.phase === 'reveal' && mine && !view.justBuilt.length ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} />;
  const asking = view.phase === 'ask';
  // smaller while asking, so the question fits on the screen; full size to enjoy the new piece
  const artWidth = asking ? Math.round(Math.min(width * 0.72, 300)) : Math.min(width, 420);

  return (
    <>
      {!playing ? <Spectator room={room} /> : null}
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} right={<Txt v="tiny" color={C.muted}>{LEVEL_LABEL[view.level]}</Txt>} />
      <MosqueArt built={view.built} fresh={view.justBuilt} width={artWidth} />
      <Progress view={view} />
      {asking ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={playing && view.myAnswer === null} /> : null}
      <QuestionPanel id={view.round} compact>
        <Txt v="h3" center>
          {view.text}
        </Txt>
      </QuestionPanel>
      <View testID="mosque-options">
        <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} disabled={!playing} onPick={(choice) => h.act('answer', { choice })} columns={1} />
      </View>
      {asking ? <AnsweredRow ids={view.answered} total={view.participants.length} h={h} /> : <Reveal view={view} h={h} />}
    </>
  );
}

/** Lobby settings: level (number of rounds) and time per question. */
export function MosqueSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.mosque;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'mosque', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">المستوى</Txt>
      <ChipPicker<MosqueLevel>
        editable={editable}
        value={s.level}
        onChange={(level) => change({ level })}
        options={(['easy', 'normal', 'hard'] as MosqueLevel[]).map((k) => ({ key: k, label: `${LEVEL_LABEL[k]} (${MOSQUE_ROUNDS[k]} جولة)` }))}
      />
      <Stepper label="وقت كل سؤال" value={s.seconds} min={10} max={30} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${num(v)} ث`} />
      <Txt v="tiny" color={C.muted}>
        ابنوا القطع التسع قبل أن تنتهي الجولات. الجواب الصحيح السريع يضيف طوبة إضافية.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { backgroundColor: C.surface, borderRadius: 18, padding: 12, gap: 6 },
  track: { height: 14, borderRadius: 7, backgroundColor: C.bg3, overflow: 'hidden', direction: 'rtl' },
  fill: { height: '100%', borderRadius: 7, backgroundColor: BRICK },
  built: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 14 },
});
