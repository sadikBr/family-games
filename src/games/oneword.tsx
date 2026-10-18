/** «كلمة واحدة» — the screen. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/art/icons';
import { client } from '@/lib/client';
import { ONEWORD_CARDS, ONEWORD_SECONDS, onewordRating, type OnewordHistory, type OnewordView } from '@/shared/games/oneword';
import type { RoomView } from '@/shared/protocol';
import { li } from '@/shared/li';
import { C, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Card, IconBubble, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker } from '@/ui/controls';
import { Confetti, TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { HostNote, PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { ClueGrid, DeckBar, WordCard, WordInput } from './oneword-parts';
import { PlayerStrip, type StripEntry } from './player-strip';

/** Who the game waits for (same as the server's turnOf). */
function waitingFor(view: OnewordView): string[] {
  if (view.phase === 'clues') return view.givers.filter((g) => !view.submitted.includes(g));
  if (view.phase === 'check') return view.givers.filter((g) => !view.ready.includes(g));
  if (view.phase === 'guess') return [view.guesser];
  return [];
}

function Strip({ room, view }: { room: RoomView; view: OnewordView }) {
  const clueOf = new Map((view.clues ?? []).map((c) => [c.by, c]));
  const entries: StripEntry[] = [view.guesser, ...view.givers].map((id) => {
    if (id === view.guesser) return { id, sub: 'المخمِّن' };
    let sub: string | undefined;
    if (view.phase === 'clues') sub = view.submitted.includes(id) ? '✓ تلميح' : '…';
    else if (view.phase === 'check') sub = view.ready.includes(id) ? '✓ موافقة' : 'مراجعة';
    else {
      const c = clueOf.get(id);
      if (c) sub = c.text ? (c.status === 'ok' ? `«${c.text}»` : `✗ ${c.text}`) : 'بلا تلميح';
    }
    return { id, sub };
  });
  return <PlayerStrip room={room} entries={entries} active={waitingFor(view)} />;
}

/** A small line: an avatar and a short sentence (no verb about the player). */
function WaitLine({ h, id, text }: { h: Helpers; id: string; text: string }) {
  return (
    <Row gap={8} center style={styles.wait}>
      <Avatar player={h.player(id)} size={30} />
      <Txt v="bold" color={C.muted} style={{ flexShrink: 1 }}>
        {text}
      </Txt>
    </Row>
  );
}

/** The guesser's phone while the others write and check: nothing to see on purpose. */
function EyesClosed({ title, sub }: { title: string; sub: string }) {
  const accent = useAccent();
  return (
    <Animated.View entering={FadeIn.duration(220)} style={[styles.closed, { borderColor: alpha(accent, 0.35) }]}>
      <IconBubble icon="eye" size={64} iconColor={accent} color={alpha(accent, 0.16)} />
      <Txt v="title" center>
        {title}
      </Txt>
      <Txt center color={C.muted}>
        {sub}
      </Txt>
    </Animated.View>
  );
}

const RESULT: Record<NonNullable<OnewordView['guess']>['result'], { title: string; tone: 'good' | 'bad' | 'neutral'; icon: IconName }> = {
  right: { title: 'صحيح!', tone: 'good', icon: 'check' },
  wrong: { title: 'خطأ…', tone: 'bad', icon: 'close' },
  pass: { title: 'تجاوز', tone: 'neutral', icon: 'skip' },
  timeout: { title: 'انتهى الوقت', tone: 'neutral', icon: 'clock' },
};

function resultSub(g: NonNullable<OnewordView['guess']>): string {
  if (g.result === 'right') return 'بطاقة رابحة للفريق';
  if (g.result === 'wrong') return g.burned ? 'ضاعت هذه البطاقة والتي بعدها' : g.refunded ? 'ضاعت هذه البطاقة وبطاقة من الرابحة' : 'ضاعت هذه البطاقة';
  return 'ضاعت هذه البطاقة فقط';
}

function HistoryRow({ item, h }: { item: OnewordHistory; h: Helpers }) {
  const r = RESULT[item.result];
  const color = item.result === 'right' ? C.green : item.result === 'wrong' ? C.red : C.muted;
  return (
    <Row gap={8} style={styles.histRow}>
      <View style={[styles.histIcon, { backgroundColor: alpha(color, 0.2) }]}>
        <Icon name={r.icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="bold" numberOfLines={1}>
          {item.word}
        </Txt>
        {item.result === 'wrong' && item.guess ? (
          <Txt v="tiny" color={C.dim} numberOfLines={1}>
            {`التخمين: «${item.guess}»`}
          </Txt>
        ) : null}
      </View>
      <Avatar player={h.player(item.guesser)} size={24} />
      <Txt v="tiny" color={C.muted} numberOfLines={1} style={{ maxWidth: 90 }}>
        {h.player(item.guesser).name}
      </Txt>
    </Row>
  );
}

export function OnewordGame({ room, view }: { room: RoomView; view: OnewordView }) {
  const h = helpers(room);
  const accent = useAccent();
  if (view.role === 'watcher' && view.phase !== 'final') return <Spectator room={room} />;
  const guesserName = h.player(view.guesser).name;
  const me = view.role;

  if (view.phase === 'final') {
    const rating = onewordRating(view.won, view.total);
    const scaled = view.total === 13 ? view.won : Math.round((view.won / view.total) * 13);
    return (
      <>
        {scaled >= 11 ? <Confetti /> : null}
        <ResultBanner tone={scaled >= 9 ? 'good' : 'neutral'} title={rating.title} sub={rating.line} />
        <Card outline={alpha(accent, 0.5)} style={{ alignItems: 'center', gap: 8 }}>
          <Txt v="small" center color={C.muted}>
            نتيجة الفريق
          </Txt>
          <Txt v="hero" center color={accent}>
            {`${num(view.won)} من ${num(view.total)}`}
          </Txt>
          <DeckBar view={view} bare />
        </Card>
        {view.history.length ? (
          <Card style={{ gap: 6 }}>
            <Txt v="h3" color={C.muted}>
              البطاقات
            </Txt>
            {view.history.map((item, i) => (
              <HistoryRow key={i} item={item} h={h} />
            ))}
          </Card>
        ) : null}
        <PlayAgain room={room} />
      </>
    );
  }

  const mine = waitingFor(view).includes(h.me);
  const timer = view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={mine} /> : null;
  let main: ReactNode = null;

  if (view.phase === 'clues') {
    if (me === 'guesser') {
      main = (
        <>
          <EyesClosed title="أغمض عينيك…" sub="الآخرون يكتبون تلميحات" />
          <Txt v="bold" center color={C.muted}>
            {`التلميحات: ${num(view.submitted.length)} من ${num(view.givers.length)}`}
          </Txt>
        </>
      );
    } else {
      main = (
        <>
          <WordCard word={view.word ?? ''} />
          <Card style={{ gap: 8 }}>
            <Txt v="bold" center color={C.yellow}>
              {view.myClue ? 'تلميحك أُرسل — يمكنك تغييره ما دام الوقت باقياً' : `تلميح من كلمة واحدة ${li(guesserName)}`}
            </Txt>
            {view.myClue ? (
              <Txt v="title" center color={C.green}>
                {`«${view.myClue}»`}
              </Txt>
            ) : null}
            <WordInput
              step={view.step}
              placeholder={view.myClue ? 'تلميح آخر' : 'اكتب تلميحك'}
              sendLabel={view.myClue ? 'غيّر' : 'أرسل'}
              oneWord
              onSend={(text) => h.act('clue', { text, step: view.step })}
            />
            <Txt v="tiny" center color={C.dim}>
              ليس الكلمة نفسها ولا صيغة منها. التلميحات المتطابقة تُحذف كلها!
            </Txt>
          </Card>
        </>
      );
    }
  } else if (view.phase === 'check') {
    if (me === 'guesser') {
      main = <EyesClosed title="تُقارن التلميحات الآن…" sub="المتطابقة تُحذف قبل أن تراها" />;
    } else {
      const ready = view.ready.includes(h.me);
      const dups = (view.clues ?? []).filter((c) => c.status === 'dup').length;
      main = (
        <>
          <WordCard word={view.word ?? ''} compact />
          <Txt v="bold" center>
            {dups ? `حُذفت التلميحات المتطابقة (${num(dups)})` : 'لا تلميحات متطابقة'}
          </Txt>
          <ClueGrid clues={view.clues ?? []} h={h} onToggle={(i) => h.act('strike', { i, step: view.step })} />
          <Txt v="tiny" center color={C.muted}>
            اضغط على تلميح مخالف للقواعد لشطبه، ثم وافق.
          </Txt>
          {ready ? (
            <Txt v="bold" center color={C.green}>
              {`الموافقات: ${num(view.ready.length)} من ${num(view.givers.length)}`}
            </Txt>
          ) : (
            <Btn size="lg" icon="check" label={`موافق، إلى ${guesserName}`} onPress={() => h.act('ready', { step: view.step })} />
          )}
        </>
      );
    }
  } else if (view.phase === 'guess') {
    const clues = view.clues ?? [];
    if (me === 'guesser') {
      main = (
        <>
          <Txt v="display" center>
            خمّن الكلمة!
          </Txt>
          {clues.length ? (
            <ClueGrid clues={clues} h={h} big />
          ) : (
            <Card>
              <Txt v="bold" center color={C.muted}>
                حُذفت كل التلميحات! خمّن بلا تلميح أو تجاوز.
              </Txt>
            </Card>
          )}
          <WordInput step={view.step} placeholder="تخمينك" sendLabel="أرسل" onSend={(text) => h.act('guess', { text, step: view.step })} />
          <Btn size="md" ghost icon="skip" label="أتجاوز" onPress={() => h.act('pass', { step: view.step })} />
          <Txt v="tiny" center color={C.dim}>
            التجاوز يضيّع هذه البطاقة، والخطأ يضيّعها مع التي بعدها.
          </Txt>
        </>
      );
    } else {
      main = (
        <>
          <WordCard word={view.word ?? ''} compact />
          <WaitLine h={h} id={view.guesser} text={`التخمين ${li(guesserName)}…`} />
          <ClueGrid clues={clues} h={h} />
        </>
      );
    }
  } else if (view.phase === 'reveal' && view.guess) {
    const g = view.guess;
    const r = RESULT[g.result];
    const last = view.left <= 0;
    main = (
      <>
        <ResultBanner tone={r.tone} title={r.title} sub={resultSub(g)} />
        <Card outline={alpha(accent, 0.5)} style={{ alignItems: 'center', gap: 2 }}>
          <Txt v="tiny" color={C.muted}>
            الكلمة
          </Txt>
          <Txt v="display" center>
            {view.word}
          </Txt>
          {g.text ? (
            <Txt v="bold" center color={g.result === 'right' ? C.green : C.red}>
              {`تخمين ${guesserName}: «${g.text}»`}
            </Txt>
          ) : null}
        </Card>
        <ClueGrid clues={view.clues ?? []} h={h} />
        {h.isHost ? (
          <Btn size="lg" icon={last ? 'trophy' : 'next'} label={last ? 'النتيجة النهائية' : 'البطاقة التالية'} onPress={() => h.act('next')} />
        ) : (
          <HostNote>{last ? 'النتيجة النهائية بعد قليل' : 'البطاقة التالية بعد قليل'}</HostNote>
        )}
      </>
    );
  }

  return (
    <>
      <DeckBar view={view} />
      {timer}
      {main}
      <Strip room={room} view={view} />
    </>
  );
}

/** Lobby settings: number of cards, time for the clues, bot level. */
export function OnewordSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.oneword;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'oneword', patch });
  return (
    <View style={{ gap: 8 }}>
      <Txt v="bold">عدد البطاقات</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.cards)}
        onChange={(v) => change({ cards: Number(v) })}
        options={ONEWORD_CARDS.map((n) => ({ key: String(n), label: n === 13 ? '13 بطاقة (الرسمية)' : '7 بطاقات (قصيرة)' }))}
      />
      <Txt v="bold">وقت كتابة التلميحات</Txt>
      <ChipPicker
        editable={editable}
        value={String(s.seconds)}
        onChange={(v) => change({ seconds: Number(v) })}
        options={ONEWORD_SECONDS.map((sec) => ({ key: String(sec), label: `${sec} ث` }))}
      />
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker
        editable={editable}
        value={s.level}
        onChange={(level) => change({ level })}
        options={[
          { key: 'easy', label: 'سهل' },
          { key: 'medium', label: 'متوسط' },
          { key: 'hard', label: 'صعب' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wait: { backgroundColor: C.surface, borderRadius: 18, padding: 10 },
  closed: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8 },
  histRow: { paddingVertical: 4 },
  histIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
