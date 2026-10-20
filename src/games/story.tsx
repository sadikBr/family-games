/** «قصة جماعية» — the screen: write the next sentence, the stories moving on, the reveal, the vote and every story at the end. */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { speak, stopSpeaking } from '@/lib/speech';
import { STORY_LENGTHS, STORY_LENGTH_LABEL, STORY_SECONDS, STORY_TEXT_MAX, type StoryTask, type StoryView } from '@/shared/games/story';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, IconBubble, Pill, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Field } from '@/ui/field';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { PAPER, Paper, Reveal, StoryPage, storyVoice, useWho } from './story-pages';
import { useSettled } from './touch-motion';

/** Who is still writing and who is done. */
function Status({ room, view }: { room: RoomView; view: StoryView }) {
  const waiting = view.working.filter((id) => !view.done.includes(id));
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" center color={C.muted}>
        الجمل المكتملة: {num(view.done.length)} من {num(view.working.length)}
      </Txt>
      <PlayerStrip
        room={room}
        active={waiting}
        entries={view.players.map((id) => ({
          id,
          sub: view.done.includes(id) ? '✓ تمّ' : view.working.includes(id) ? 'يكتب…' : 'استراحة',
          out: !view.working.includes(id),
        }))}
      />
    </View>
  );
}

/** The round's header: sentence n of N, my own story, the clock. */
function RoundHead({ view, mine }: { view: StoryView; mine: boolean }) {
  const accent = useAccent();
  return (
    <View style={{ gap: 8 }}>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <View style={[styles.chip, { borderColor: alpha(accent, 0.5) }]}>
          <Txt v="tiny" color={C.text}>
            الجولة {num(view.round + 1)} من {num(view.rounds)}
          </Txt>
        </View>
        {mine ? (
          <Txt v="tiny" color={C.muted}>
            قصتك أنت
          </Txt>
        ) : null}
      </Row>
      {view.noLimit ? null : <TimerBar endsAt={view.endsAt} total={view.total} onTick={!!view.task && !view.task.done} />}
    </View>
  );
}

/** The sentence to continue, on paper (only this one: the rest of the story stays hidden until the end). */
function Prompt({ task }: { task: StoryTask }) {
  if (!task.prompt) {
    return (
      <Paper>
        <Txt v="tiny" color={PAPER.soft}>
          صفحة بيضاء
        </Txt>
        <Txt style={styles.promptText}>{task.mine ? 'ابدأ قصتك: ما أول جملة فيها؟' : 'القصة بلا بداية بعد: اكتب أول جملة فيها!'}</Txt>
      </Paper>
    );
  }
  return (
    <Paper>
      <Txt v="tiny" color={PAPER.soft}>
        {task.opening ? 'بداية القصة' : 'آخر جملة في القصة'}
      </Txt>
      <Txt style={styles.promptText}>{task.prompt}</Txt>
    </Paper>
  );
}

/** The writing box: saves a draft as I type (sent as it is if time runs out), «تم» sends it. */
function Writer({ room, task }: { room: RoomView; task: StoryTask }) {
  const h = helpers(room);
  const accent = useAccent();
  const [text, setText] = useState(task.draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const change = (t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => h.act('type', { text: t }), 500);
  };
  const send = () => {
    const t = text.trim();
    if (t.length < 2) return;
    if (timer.current) clearTimeout(timer.current);
    h.act('send', { text: t });
  };
  const left = STORY_TEXT_MAX - text.length;
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold" center>
        {task.prompt ? 'أكمل القصة بجملة واحدة' : 'اكتب أول جملة في القصة'}
      </Txt>
      <Field
        value={text}
        onChangeText={change}
        onSubmitEditing={send}
        placeholder={task.prompt ? 'ثم…' : 'كان يا ما كان…'}
        placeholderTextColor={C.dim}
        style={[styles.input, { borderColor: text ? alpha(accent, 0.7) : C.border }]}
        maxLength={STORY_TEXT_MAX}
        multiline
        submitBehavior="blurAndSubmit"
        returnKeyType="done"
        autoCorrect={false}
      />
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <Txt v="tiny" color={left < 20 ? C.yellow : C.dim}>
          {num(left)} حرفاً متبقياً
        </Txt>
      </Row>
      <Btn size="lg" icon="check" label="تم" color={C.green} disabled={text.trim().length < 2} onPress={send} />
    </View>
  );
}

/** Sent: my sentence, a calm confirmation and a way to take it back while the round runs. */
function Sent({ room, task }: { room: RoomView; task: StoryTask }) {
  const h = helpers(room);
  const settled = useSettled();
  return (
    <Animated.View entering={settled ? FadeIn.duration(220) : undefined}>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <IconBubble icon="check" size={44} iconColor={C.ink} color={C.green} />
        <Txt v="bold" center>
          أُرسلت جملتك
        </Txt>
        <Txt center color={C.muted}>
          «{task.sent}»
        </Txt>
        <Txt v="small" center color={C.dim}>
          بانتظار الآخرين…
        </Txt>
        <Btn size="sm" ghost icon="edit" label="تعديل" onPress={() => h.act('edit')} />
      </Card>
    </Animated.View>
  );
}

function Pass({ view }: { view: StoryView }) {
  const reveal = view.next === 'reveal';
  return (
    <>
      <PhaseTitle
        icon={reveal ? 'book' : 'swap'}
        title={reveal ? 'حان وقت القراءة!' : 'القصص تنتقل…'}
        sub={reveal ? 'تُقرأ القصص جملةً بعد جملة، أمام الجميع، مع اسم كاتب كل جملة' : 'ستصلك قصة أخرى، ولن ترى منها إلا جملتها الأخيرة'}
      />
      <TimerBar endsAt={view.endsAt} total={view.total} />
    </>
  );
}

/** A small «اقرأها» button under a story (the end): the phone reads the whole story aloud. */
function ReadStory({ owner, view, index }: { owner: string; view: StoryView; index: number }) {
  return <Btn size="sm" ghost icon="sound" label="اقرأها بصوت" onPress={() => speak(storyVoice(owner, view.books![index].lines), true)} />;
}

function Vote({ room, view }: { room: RoomView; view: StoryView }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const v = view.vote!;
  const playing = view.players.includes(h.me);
  const waiting = view.players.filter((id) => !v.voted.includes(id));
  return (
    <>
      <PhaseTitle icon="vote" title="أجمل قصة" sub="صوت لقصة واحدة غير قصتك، ويمكن تغيير الصوت حتى يصوّت الجميع." />
      <TimerBar endsAt={view.endsAt} total={view.total} />
      {view.books!.map((b, i) => {
        if (!b.lines.length) return null;
        const own = b.owner === h.me;
        const picked = v.mine === i;
        return (
          <StoryPage
            key={i}
            room={room}
            view={view}
            index={i}
            highlight={picked}
            badge={picked ? <Pill label="صوتك" icon="starFull" color={C.yellow} textColor={C.ink} /> : null}
            footer={
              playing ? (
                own ? (
                  <Txt v="tiny" center color={PAPER.soft}>
                    قصتك: لا تصويت لها
                  </Txt>
                ) : (
                  <Btn
                    size="sm"
                    icon={picked ? 'starFull' : 'star'}
                    ghost={!picked}
                    color={C.yellow}
                    label={picked ? 'صوتك لهذه القصة' : `صوّت لقصة ${who(b.owner).name}`}
                    onPress={() => h.act('vote', { story: i })}
                  />
                )
              ) : null
            }
          />
        );
      })}
      <PlayerStrip room={room} active={waiting} entries={view.players.map((id) => ({ id, sub: v.voted.includes(id) ? '✓ صوّت' : 'يختار…' }))} />
      {h.isHost ? <Btn size="sm" ghost icon="stop" label="إنهاء التصويت الآن" onPress={() => h.act('endVote')} /> : null}
    </>
  );
}

/** «صوت واحد»، «صوتان»، «3 أصوات»، «11 صوتاً». */
const votesText = (n: number) => (n === 1 ? 'صوت واحد' : n === 2 ? 'صوتان' : n <= 10 ? `${num(n)} أصوات` : `${num(n)} صوتاً`);

function Final({ room, view }: { room: RoomView; view: StoryView }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const f = view.final!;
  const books = view.books ?? [];
  const single = f.best.length === 1 ? f.best[0] : null;
  const authors = single !== null ? new Set(books[single].lines.filter((l) => l.by && !l.filler).map((l) => l.by)) : new Set();
  useEffect(() => () => stopSpeaking(), []);
  const title = single !== null ? `أجمل قصة: قصة ${who(books[single].owner).name}` : f.best.length > 1 ? 'تعادل بين أجمل القصص' : 'انتهت القصص!';
  const sub =
    single !== null
      ? `${votesText(f.tally[single])} — نقطة لكل من كتب فيها عن كل صوت`
      : f.best.length > 1
        ? `${votesText(f.tally[f.best[0]])} لكل قصة`
        : f.votes
          ? 'لا أصوات هذه المرة'
          : 'شكراً على الضحك';
  // the winning story first, then the others in their order
  const order = [...f.best, ...books.map((_, i) => i).filter((i) => !f.best.includes(i))];
  return (
    <>
      {single !== null && authors.has(h.me) ? <Confetti /> : null}
      <ResultBanner tone="neutral" art={<IconBubble icon={f.best.length ? 'trophy' : 'book'} size={60} iconColor={C.yellow} color={alpha('#000000', 0.18)} />} title={title} sub={sub} />
      <Txt v="small" center color={C.muted}>
        كل القصص كاملة، مع كاتب كل جملة:
      </Txt>
      {order.map((i) =>
        books[i].lines.length ? (
          <StoryPage
            key={i}
            room={room}
            view={view}
            index={i}
            highlight={f.best.includes(i)}
            badge={
              f.votes && f.tally[i] ? (
                <Pill label={votesText(f.tally[i])} icon={f.best.includes(i) ? 'trophy' : 'star'} color={f.best.includes(i) ? C.yellow : alpha(PAPER.ink, 0.12)} textColor={PAPER.ink} />
              ) : null
            }
            footer={<ReadStory owner={who(books[i].owner).name} view={view} index={i} />}
          />
        ) : null,
      )}
      <PlayAgain room={room} />
    </>
  );
}

export function StoryGame({ room, view }: { room: RoomView; view: StoryView }) {
  const h = helpers(room);
  const playing = view.players.includes(h.me);

  if (view.phase === 'final') return <Final room={room} view={view} />;
  if (view.phase === 'reveal' && view.reveal) return <Reveal room={room} view={view} />;
  if (view.phase === 'vote' && view.vote) return <Vote room={room} view={view} />;
  if (!playing) return <Spectator room={room} />;
  if (view.phase === 'pass') return <Pass view={view} />;

  const task = view.task;
  return (
    <>
      <RoundHead view={view} mine={!!task?.mine} />
      {!task ? (
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Avatar player={h.player(h.me)} size={56} />
          <Txt v="bold" center>
            لا جملة لك في هذه الجولة
          </Txt>
          <Txt v="small" center color={C.muted}>
            إحدى القصص تنتظر دورها. استرح قليلاً!
          </Txt>
        </Card>
      ) : (
        <>
          <Prompt task={task} />
          {task.done ? <Sent room={room} task={task} /> : <Writer key={`${view.round}`} room={room} task={task} />}
        </>
      )}
      <Status room={room} view={view} />
      {view.noLimit && h.isHost ? <Btn size="sm" ghost icon="skip" label="إنهاء الجولة الآن" onPress={() => h.act('endRound')} /> : null}
      {view.noLimit && !h.isHost ? <HostNote>بلا وقت محدد: الجولة تنتهي حين يكمل الجميع</HostNote> : null}
    </>
  );
}

/** Lobby settings for this game. */
export function StorySettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.story;
  const change = (patch: Partial<typeof s>) => client.roomAction({ type: 'settings', game: 'story', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">بداية القصة</Txt>
      <ChipPicker<string>
        editable={editable}
        value={s.opening}
        onChange={(v) => change({ opening: v as typeof s.opening })}
        options={[
          { key: 'ready', label: 'جملة جاهزة' },
          { key: 'own', label: 'يكتبها كل لاعب' },
        ]}
      />
      <Txt v="bold">طول القصة</Txt>
      <ChipPicker<string> editable={editable} value={s.length} onChange={(v) => change({ length: v as typeof s.length })} options={STORY_LENGTHS.map((k) => ({ key: k, label: STORY_LENGTH_LABEL[k] }))} />
      <Txt v="bold">وقت كل جملة</Txt>
      <ChipPicker<string>
        editable={editable}
        value={String(s.seconds)}
        onChange={(v) => change({ seconds: Number(v) })}
        options={STORY_SECONDS.map((n) => ({ key: String(n), label: n ? `${n} ث` : 'بلا حد' }))}
      />
      <Toggle label="تصويت لأجمل قصة في النهاية" value={s.votes} editable={editable} onChange={(votes) => change({ votes })} />
      <Toggle label="عرض الجمل تلقائياً في القراءة" value={s.autoReveal} editable={editable} onChange={(autoReveal) => change({ autoReveal })} />
      <Txt v="tiny" color={C.muted}>
        دورة واحدة: يكتب كل لاعب جملة واحدة في كل قصة. دورتان: جملتان. تحتاج اللعبة 3 لاعبين على الأقل، والبوتات لا تشارك فيها.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: C.surface },
  promptText: { fontFamily: F.bold, fontSize: 20, lineHeight: 33, color: PAPER.ink },
  input: {
    fontFamily: F.bold,
    fontSize: 18,
    lineHeight: 28,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 96,
    textAlignVertical: 'top',
    writingDirection: 'rtl',
    textAlign: 'right',
    borderWidth: 2,
  },
});
