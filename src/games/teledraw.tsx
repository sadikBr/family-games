/** «الرسم المتسلسل» — the screen: pick a phrase, draw, guess, then the big reveal, votes and the end. */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { client } from '@/lib/client';
import { li } from '@/shared/li';
import { TELEDRAW_DRAW_CHOICES, TELEDRAW_GUESS_CHOICES, TELEDRAW_TEXT_MAX, type TeledrawTask, type TeledrawView } from '@/shared/games/teledraw';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, IconBubble, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Field } from '@/ui/field';
import { Confetti, Podium, TimerBar } from '@/ui/fun';
import { SoftIn } from '@/ui/motion';
import { Txt, num } from '@/ui/txt';

import { PhaseTitle, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers } from './helpers';
import { PlayerStrip } from './player-strip';
import { DrawPad, Sketch } from './teledraw-canvas';
import { BookBrowser, NOTHING, PageCard, Reveal, usePageWidth, useWho } from './teledraw-pages';

const WORKING: Record<TeledrawTask['kind'], string> = { write: 'جارٍ الاختيار…', draw: 'جارٍ الرسم…', guess: 'جارٍ التخمين…' };

/** Who is still working and who has sent their page. */
function Status({ room, view }: { room: RoomView; view: TeledrawView }) {
  const kind = view.phase === 'write' || view.phase === 'draw' || view.phase === 'guess' ? view.phase : 'draw';
  const waiting = view.working.filter((id) => !view.done.includes(id));
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" center color={C.muted}>
        الصفحات المرسلة: {num(view.done.length)} من {num(view.working.length)}
      </Txt>
      <PlayerStrip
        room={room}
        active={waiting}
        entries={view.players.map((id) => ({
          id,
          sub: view.done.includes(id) ? '✓ تمّ' : view.working.includes(id) ? WORKING[kind] : 'استراحة',
          out: !view.working.includes(id),
        }))}
      />
    </View>
  );
}

/** The step's header: page n of N, whose book I hold, the clock. */
function StepHead({ view, owner, mine }: { view: TeledrawView; owner: string | null; mine: boolean }) {
  const accent = useAccent();
  return (
    <View style={{ gap: 8 }}>
      <Row gap={8} style={{ justifyContent: 'space-between' }}>
        <View style={[styles.chip, { borderColor: alpha(accent, 0.5) }]}>
          <Txt v="tiny" color={C.text}>
            الصفحة {num(view.step + 1)} من {num(view.steps)}
          </Txt>
        </View>
        {owner ? (
          <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {mine ? 'دفترك أنت' : `في يدك الآن: دفتر ${owner}`}
          </Txt>
        ) : null}
      </Row>
      <TimerBar endsAt={view.endsAt} total={view.total} onTick={!!view.task && !view.task.done} />
    </View>
  );
}

/** Sent: a calm confirmation and a way to take it back while the step runs. */
function Sent({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <Animated.View entering={SoftIn}>
      <Card style={{ alignItems: 'center', gap: 8 }}>
        <IconBubble icon="check" size={48} iconColor={C.ink} color={C.green} />
        <Txt v="bold" center>
          {label}
        </Txt>
        <Txt v="small" center color={C.muted}>
          بانتظار الآخرين…
        </Txt>
        <Btn size="sm" ghost icon="edit" label="تعديل" onPress={onEdit} />
      </Card>
    </Animated.View>
  );
}

/** A text box with a send button (own phrase, guess). */
function TextSend({ placeholder, button, onSend, initial }: { placeholder: string; button: string; onSend: (t: string) => void; initial?: string }) {
  const [text, setText] = useState(initial ?? '');
  const send = () => {
    const t = text.trim();
    if (t) onSend(t);
  };
  return (
    <View style={{ gap: 8 }}>
      <Field
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
        placeholder={placeholder}
        placeholderTextColor={C.dim}
        style={styles.input}
        maxLength={TELEDRAW_TEXT_MAX}
        returnKeyType="send"
        autoCorrect={false}
      />
      <Btn size="md" icon="next" label={button} disabled={!text.trim()} onPress={send} />
    </View>
  );
}

function WriteStep({ room, view, task }: { room: RoomView; view: TeledrawView; task: TeledrawTask }) {
  const h = helpers(room);
  const custom = room.settings.teledraw.custom;
  if (task.done) return <Sent label={`جملتك: «${task.sent}»`} onEdit={() => h.act('edit')} />;
  return (
    <>
      <PhaseTitle icon="book" title="اختر جملة لدفترك" sub="سيرسمها اللاعب التالي، ثم يخمّنها من بعده… والمفاجأة في النهاية!" />
      <View style={{ gap: 10 }}>
        {task.options.map((o) => (
          <Btn key={o} size="lg" ghost label={o} onPress={() => h.act('pick', { text: o })} />
        ))}
      </View>
      {custom ? (
        <Card style={{ gap: 8 }}>
          <Txt v="bold">أو اكتب جملتك الخاصة</Txt>
          <TextSend key={view.step} placeholder="مثلاً: جدّي يقود صاروخاً" button="اعتمد جملتي" onSend={(text) => h.act('pick', { text })} />
        </Card>
      ) : null}
    </>
  );
}

function DrawStep({ room, view, task }: { room: RoomView; view: TeledrawView; task: TeledrawTask }) {
  const h = helpers(room);
  const accent = useAccent();
  const w = usePageWidth();
  const prompt = task.prompt;
  const text = prompt?.empty || !prompt?.text ? NOTHING : prompt.text;
  return (
    <>
      <View style={[styles.prompt, { borderColor: alpha(accent, 0.6) }]}>
        <Txt v="tiny" color={C.muted} center>
          ارسم هذه الجملة
        </Txt>
        <Txt v="title" center color={prompt?.empty ? C.dim : C.text}>
          {text}
        </Txt>
        {prompt?.empty ? (
          <Txt v="tiny" center color={C.muted}>
            لم يصل شيء: ارسم ما تريد!
          </Txt>
        ) : null}
      </View>
      {task.done ? (
        <>
          <Sketch strokes={task.draft} size={Math.round(w * 0.6)} frame={accent} />
          <Sent label="أُرسلت رسمتك" onEdit={() => h.act('edit')} />
        </>
      ) : (
        <>
          <DrawPad key={`${view.step}`} size={w} initial={task.draft} frame={accent} />
          <Txt v="tiny" center color={C.muted}>
            بلا حروف ولا أرقام في الرسم
          </Txt>
          <Btn size="lg" icon="check" label="انتهيت من الرسم" onPress={() => h.act('done')} />
        </>
      )}
    </>
  );
}

function GuessStep({ room, view, task }: { room: RoomView; view: TeledrawView; task: TeledrawTask }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const accent = useAccent();
  const w = usePageWidth();
  const prompt = task.prompt;
  if (task.done) return <Sent label={`تخمينك: «${task.sent}»`} onEdit={() => h.act('edit')} />;
  return (
    <>
      <Txt v="h2" center>
        ماذا ترى في هذه الرسمة؟
      </Txt>
      {prompt ? <PageCard page={prompt} who={who} size={Math.round(w * 0.92)} frame={accent} /> : null}
      {prompt?.empty ? (
        <Txt v="small" center color={C.muted}>
          انتهى الوقت قبل الرسم: اكتب أي جملة تخطر لك!
        </Txt>
      ) : null}
      <TextSend key={view.step} placeholder="اكتب جملة تصف الرسمة…" button="أرسل تخميني" onSend={(text) => h.act('guess', { text })} />
    </>
  );
}

function Pass({ view }: { view: TeledrawView }) {
  const reveal = view.next === 'reveal';
  return (
    <Animated.View entering={SoftIn} style={{ gap: 14 }}>
      <PhaseTitle
        icon={reveal ? 'eye' : 'swap'}
        title={reveal ? 'حان وقت الكشف!' : 'الدفاتر تنتقل…'}
        sub={reveal ? 'ستظهر الدفاتر صفحةً بعد صفحة، أمام الجميع' : view.next === 'draw' ? 'التالي: الرسم — ستصلك جملة لترسمها' : 'التالي: التخمين — ستصلك رسمة لتصفها'}
      />
      <TimerBar endsAt={view.endsAt} total={view.total} />
    </Animated.View>
  );
}

function Vote({ room, view }: { room: RoomView; view: TeledrawView }) {
  const h = helpers(room);
  const v = view.vote!;
  const locked = v.confirmed.includes(h.me);
  const waiting = view.players.filter((id) => !v.confirmed.includes(id));
  return (
    <>
      <PhaseTitle icon="vote" title="التصويت" sub="صوت لأفضل رسمة وصوت لأطرف تخمين، من أي دفتر. ثم أكّد في الأسفل." />
      <TimerBar endsAt={view.endsAt} total={view.total} />
      <Row gap={8} center wrap>
        <View style={[styles.pick, v.myDraw && styles.pickOn]}>
          <Txt v="tiny" color={v.myDraw ? C.ink : C.muted}>
            أفضل رسمة {v.myDraw ? '✓' : '—'}
          </Txt>
        </View>
        <View style={[styles.pick, v.myGuess && styles.pickOn]}>
          <Txt v="tiny" color={v.myGuess ? C.ink : C.muted}>
            أطرف تخمين {v.myGuess ? '✓' : '—'}
          </Txt>
        </View>
      </Row>
      <BookBrowser room={room} view={view} vote={{ myDraw: v.myDraw, myGuess: v.myGuess, locked }} />
      {locked ? (
        <Card style={{ alignItems: 'center', gap: 6 }}>
          <IconBubble icon="check" size={44} iconColor={C.ink} color={C.green} />
          <Txt v="bold" center>
            سُجّل تصويتك
          </Txt>
        </Card>
      ) : (
        <Btn size="lg" icon="check" label="تأكيد التصويت" onPress={() => h.act('confirm')} />
      )}
      <PlayerStrip room={room} active={waiting} entries={view.players.map((id) => ({ id, sub: v.confirmed.includes(id) ? '✓ تمّ' : 'جارٍ التصويت…' }))} />
      {h.isHost ? <Btn size="sm" ghost icon="stop" label="إنهاء التصويت الآن" onPress={() => h.act('endVote')} /> : null}
    </>
  );
}

function Final({ room, view }: { room: RoomView; view: TeledrawView }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const accent = useAccent();
  const w = usePageWidth();
  const f = view.final!;
  // without votes the books are the whole show: open them right away
  const [books, setBooks] = useState(!f.votes);
  const scores = Object.fromEntries(view.players.map((id) => [id, f.scores[id] ?? 0]));
  const best = Math.max(0, ...Object.values(scores));
  const leaders = Object.keys(scores).filter((id) => scores[id] === best);
  const single = f.votes && best > 0 && leaders.length === 1 ? leaders[0] : null;
  const won = single === h.me;
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<IconBubble icon={f.votes ? 'trophy' : 'book'} size={64} iconColor={C.yellow} color={alpha('#000000', 0.18)} />}
        title={single ? `الفوز ${li(who(single).name)}` : 'انتهت الدفاتر!'}
        sub={single ? `${num(best)} من الأصوات` : f.votes ? 'أفضل رسمة وأطرف تخمين' : 'شكراً على الضحك'}
      />
      {f.bestDraw.length ? (
        <Card style={{ gap: 10, alignItems: 'center' }}>
          <Txt v="title" center>
            أفضل رسمة
          </Txt>
          {f.bestDraw.map((x) => (
            <View key={`${x.ref.book}:${x.ref.page}`} style={{ gap: 4, alignItems: 'center' }}>
              <PageCard page={x.page} who={who} size={Math.round(w * 0.78)} frame={C.yellow} />
              <Txt v="tiny" color={C.yellow}>
                {num(x.votes)} من الأصوات
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}
      {f.bestGuess.length ? (
        <Card style={{ gap: 10, alignItems: 'center' }}>
          <Txt v="title" center>
            أطرف تخمين
          </Txt>
          {f.bestGuess.map((x) => (
            <View key={`${x.ref.book}:${x.ref.page}`} style={{ gap: 6, alignItems: 'center' }}>
              {x.before ? <Sketch strokes={x.before.strokes ?? []} size={Math.round(w * 0.45)} frame={accent} /> : null}
              <PageCard page={x.page} who={who} size={Math.round(w * 0.9)} frame={C.yellow} small />
              <Txt v="tiny" color={C.yellow}>
                {num(x.votes)} من الأصوات
              </Txt>
            </View>
          ))}
        </Card>
      ) : null}
      {f.votes && best > 0 ? <Podium players={room.players} scores={scores} /> : null}
      {books ? <BookBrowser room={room} view={view} /> : <Btn size="md" ghost icon="book" label="تصفّح الدفاتر" onPress={() => setBooks(true)} />}
      <PlayAgain room={room} />
    </>
  );
}

export function TeledrawGame({ room, view }: { room: RoomView; view: TeledrawView }) {
  const h = helpers(room);
  const who = useWho(room, view);
  const playing = view.players.includes(h.me);

  if (view.phase === 'final') return <Final room={room} view={view} />;
  if (view.phase === 'reveal' && view.reveal) return <Reveal room={room} view={view} />;
  if (!playing) return <Spectator room={room} />;
  if (view.phase === 'vote' && view.vote) return <Vote room={room} view={view} />;
  if (view.phase === 'pass') return <Pass view={view} />;

  const task = view.task;
  return (
    <>
      <StepHead view={view} owner={task ? who(task.owner).name : null} mine={task?.owner === h.me} />
      {!task ? (
        <Card style={{ alignItems: 'center', gap: 8 }}>
          <Avatar player={h.player(h.me)} size={56} />
          <Txt v="bold" center>
            لا صفحة لك في هذه الجولة
          </Txt>
          <Txt v="small" center color={C.muted}>
            أحد الدفاتر ينتظر دوره. استرح قليلاً!
          </Txt>
        </Card>
      ) : task.kind === 'write' ? (
        <WriteStep room={room} view={view} task={task} />
      ) : task.kind === 'draw' ? (
        <DrawStep room={room} view={view} task={task} />
      ) : (
        <GuessStep room={room} view={view} task={task} />
      )}
      <Status room={room} view={view} />
    </>
  );
}

/** Lobby settings for this game. */
export function TeledrawSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.teledraw;
  const change = (patch: Partial<typeof s>) => client.roomAction({ type: 'settings', game: 'teledraw', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">وقت الرسم</Txt>
      <ChipPicker<string>
        editable={editable}
        value={String(s.drawSeconds)}
        onChange={(v) => change({ drawSeconds: Number(v) })}
        options={TELEDRAW_DRAW_CHOICES.map((n) => ({ key: String(n), label: `${n} ث` }))}
      />
      <Txt v="bold">وقت التخمين</Txt>
      <ChipPicker<string>
        editable={editable}
        value={String(s.guessSeconds)}
        onChange={(v) => change({ guessSeconds: Number(v) })}
        options={TELEDRAW_GUESS_CHOICES.map((n) => ({ key: String(n), label: `${n} ث` }))}
      />
      <Toggle label="كتابة جملة خاصة في البداية" value={s.custom} editable={editable} onChange={(custom) => change({ custom })} />
      <Toggle label="٦ صفحات كحد أقصى لكل دفتر" value={s.capSteps} editable={editable} onChange={(capSteps) => change({ capSteps })} />
      <Toggle label="تصويت في النهاية" value={s.votes} editable={editable} onChange={(votes) => change({ votes })} />
      <Toggle label="تقليب الصفحات تلقائياً في الكشف" value={s.autoReveal} editable={editable} onChange={(autoReveal) => change({ autoReveal })} />
      <Txt v="tiny" color={C.muted}>
        عدد الصفحات = عدد اللاعبين، فيمرّ كل دفتر على الجميع مرة واحدة.
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: C.surface },
  prompt: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 2, paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  input: {
    fontFamily: F.bold,
    fontSize: 18,
    color: C.text,
    backgroundColor: C.bg3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 48,
    writingDirection: 'rtl',
    textAlign: 'right',
    borderWidth: 2,
    borderColor: C.border,
  },
  pick: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border },
  pickOn: { backgroundColor: C.yellow, borderColor: C.yellow },
});
