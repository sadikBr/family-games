/** «رتّب الخطوات» — the screen. */
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import { STEPS_CATEGORIES, type StepsLevel, type StepsSettings as Settings, type StepsView } from '@/shared/games/steps';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, Stepper } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, QuestionPanel, QuestionText, QuizFinal, ResultRows, RevealNote, RoundHeader, SentNote, useMyResultFx } from './islamic-ui';

/** a slot holding a step, in the game's tint */
const filled = (accent: string) => ({ borderStyle: 'solid' as const, borderColor: alpha(accent, 0.7), backgroundColor: alpha(accent, 0.16) });

/* ------------------------------------------------------------------ */
/* Building my order                                                   */
/* ------------------------------------------------------------------ */

interface Draft {
  round: number;
  /** slot → index into items (null: empty) */
  slots: (number | null)[];
  /** the slot the next tapped step goes to (null: the first empty one) */
  target: number | null;
}

function Builder({ view, h }: { view: StepsView; h: Helpers }) {
  const accent = useAccent();
  const n = view.items.length;
  const empty = (): Draft => ({ round: view.round, slots: Array(n).fill(null), target: null });
  const [state, setState] = useState<Draft>(empty);
  const draft = state.round === view.round && state.slots.length === n ? state : empty();
  const placed = new Set(draft.slots.filter((x): x is number => x !== null));
  const firstEmpty = draft.slots.indexOf(null);
  const target = draft.target ?? (firstEmpty >= 0 ? firstEmpty : null);
  const full = firstEmpty < 0;
  // empty slots after the last one in use stay hidden, so the steps to pick are right under the list
  const lastShown = Math.max(target ?? -1, ...draft.slots.map((x, k) => (x === null ? -1 : k)));
  const hidden = n - 1 - lastShown;

  const putStep = (item: number) => {
    if (target === null) return;
    haptic.tap();
    play('pop');
    const slots = draft.slots.slice();
    slots[target] = item;
    setState({ round: view.round, slots, target: null });
  };
  const tapSlot = (k: number) => {
    haptic.tap();
    const slots = draft.slots.slice();
    slots[k] = null; // a filled slot gives its step back; either way it becomes the next to fill
    setState({ round: view.round, slots, target: k });
  };
  const send = () => {
    if (!full) return;
    haptic.medium();
    h.act('submit', { order: draft.slots, round: view.round });
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 5 }}>
        <Txt v="tiny" color={C.muted}>
          ترتيبك — المس خطوة لإعادتها
        </Txt>
        {draft.slots.slice(0, lastShown + 1).map((item, k) => {
          const isTarget = k === target;
          return (
            <Pressable
              key={k}
              testID={`steps-slot-${k}`}
              onPress={() => tapSlot(k)}
              accessibilityRole="button"
              accessibilityLabel={item === null ? `الخانة ${k + 1} فارغة` : `${k + 1}: ${view.items[item]}`}
              style={({ pressed }) => [styles.slot, item !== null && filled(accent), isTarget && styles.slotTarget, pressed && { opacity: 0.8 }]}>
              <View style={[styles.badge, item !== null && { backgroundColor: accent }]}>
                <Txt style={styles.badgeText}>{num(k + 1)}</Txt>
              </View>
              {item === null ? (
                <Txt v="small" color={isTarget ? C.yellow : C.dim} style={{ flex: 1 }}>
                  {isTarget ? 'اختر الخطوة التالية من الأسفل' : '…'}
                </Txt>
              ) : (
                <>
                  <Txt v="bold" style={styles.stepText}>
                    {view.items[item]}
                  </Txt>
                  <Icon name="close" size={16} color={C.dim} />
                </>
              )}
            </Pressable>
          );
        })}
        {hidden > 0 ? (
          <Txt v="tiny" center color={C.dim}>
            {hidden === 1 ? 'وخانة أخيرة بعدها' : hidden === 2 ? 'وخانتان بعدها' : `و${num(hidden)} خانات بعدها`}
          </Txt>
        ) : null}
      </View>

      {!full ? (
        <View style={{ gap: 5 }}>
          <Txt v="tiny" color={C.muted}>
            {`الخطوات — المس الخطوة التي تأتي في الخانة ${num((target ?? 0) + 1)}`}
          </Txt>
          {view.items.map((text, i) =>
            placed.has(i) ? null : (
              <Pressable
                key={i}
                testID={`steps-pool-${i}`}
                onPress={() => putStep(i)}
                accessibilityRole="button"
                accessibilityLabel={text}
                style={({ pressed }) => [styles.pool, { borderColor: alpha(accent, 0.5) }, pressed && { transform: [{ scale: 0.98 }], backgroundColor: alpha(accent, 0.3) }]}>
                <Txt v="bold" style={styles.stepText}>
                  {text}
                </Txt>
                <Icon name="plus" size={16} color={C.yellow} />
              </Pressable>
            ),
          )}
        </View>
      ) : null}

      <Row gap={8}>
        <Btn size="md" ghost icon="refresh" label="من جديد" disabled={!placed.size} onPress={() => setState(empty())} />
        <Btn size="md" flex icon="check" label={full ? 'أرسل الترتيب' : `بقي ${num(n - placed.size)}`} disabled={!full} onPress={send} />
      </Row>
    </View>
  );
}

/** My order once sent (waiting for the others). */
function SentList({ view }: { view: StepsView }) {
  const accent = useAccent();
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted}>
        ترتيبك (أُرسل)
      </Txt>
      {(view.mine ?? []).map((item, k) => (
        <View key={k} style={[styles.slot, filled(accent), { opacity: 0.85 }]}>
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Txt style={styles.badgeText}>{num(k + 1)}</Txt>
          </View>
          <Txt v="bold" style={styles.stepText}>
            {view.items[item]}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

function Answer({ view }: { view: StepsView }) {
  const correct = view.correct ?? [];
  const mine = view.mine;
  return (
    <Animated.View entering={FadeIn.duration(220)} style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted}>
        الترتيب الصحيح
      </Txt>
      {correct.map((item, k) => {
        const ok = mine ? mine[k] === item : null;
        const color = ok === null ? C.borderStrong : ok ? C.green : C.red;
        const wrongAt = mine && !ok ? mine.indexOf(item) : -1;
        return (
          <View key={k} style={[styles.slot, { borderStyle: 'solid', borderColor: color, backgroundColor: ok === null ? C.surface : alpha(color, 0.14) }]}>
            <View style={[styles.badge, { backgroundColor: ok === null ? C.surfaceStrong : color }]}>
              <Txt style={styles.badgeText}>{num(k + 1)}</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="bold" style={{ fontSize: 15, lineHeight: 22 }}>
                {view.items[item]}
              </Txt>
              {wrongAt >= 0 ? (
                <Txt v="tiny" color={C.muted}>
                  {`وضعتَها في الخانة ${num(wrongAt + 1)}`}
                </Txt>
              ) : null}
            </View>
            {ok === null ? null : <Icon name={ok ? 'check' : 'close'} size={18} color={color} />}
          </View>
        );
      })}
    </Animated.View>
  );
}

function Results({ view, h }: { view: StepsView; h: Helpers }) {
  const n = view.items.length;
  return (
    <ResultRows
      h={h}
      lines={(view.results ?? []).map((r) => ({
        id: r.id,
        detail: r.order === null ? 'بلا ترتيب' : `${num(r.right)} من ${num(n)} في مكانها${r.ms !== null ? ` · ${num(Math.ceil(r.ms / 1000))} ث` : ''}`,
        gain: r.points > 0 ? num(`+${r.points}`) : num(0),
        good: r.points > 0,
        total: view.scores[r.id],
      }))}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function StepsGame({ room, view }: { room: RoomView; view: StepsView }) {
  const h = helpers(room);
  const playing = view.players.includes(h.me);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine ? mine.right === view.items.length : null);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="steps" h={h} />;
  if (!playing) return <Spectator room={room} />;
  const sent = view.mine !== null;
  const last = view.round >= view.rounds;

  return (
    <>
      <RoundHeader label={view.label} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play' && !sent} /> : null}
      <QuestionPanel id={view.round} compact>
        <QuestionText>{view.title}</QuestionText>
      </QuestionPanel>

      {view.phase === 'play' ? (
        sent ? (
          <>
            <SentNote text="أُرسل ترتيبك — في انتظار الآخرين" />
            <AnsweredRow ids={view.submitted} total={view.players.length} h={h} />
            <SentList view={view} />
          </>
        ) : (
          <>
            <Builder view={view} h={h} />
            <AnsweredRow ids={view.submitted} total={view.players.length} h={h} />
          </>
        )
      ) : (
        <>
          {mine ? (
            <MyVerdict
              tone={mine.order === null ? 'none' : mine.right === view.items.length ? 'good' : 'bad'}
              text={
                mine.order === null
                  ? 'لم ترسل ترتيبك في الوقت'
                  : mine.right === view.items.length
                    ? `ممتاز! كل الخطوات في مكانها · ${num(`+${mine.points}`)}`
                    : `${num(mine.right)} من ${num(view.items.length)} في مكانها · ${num(`+${mine.points}`)}`
              }
            />
          ) : null}
          <Answer view={view} />
          <RevealNote text={view.note} />
          <Results view={view} h={h} />
          <HostNext h={h} last={last} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const LEVELS: { key: StepsLevel; label: string }[] = [
  { key: 'easy', label: 'سهل' },
  { key: 'medium', label: 'متوسط' },
  { key: 'hard', label: 'صعب' },
];

export function StepsSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.steps;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'steps', patch });
  return (
    <View style={{ gap: 10 }}>
      <Stepper label="عدد الجولات" value={s.rounds} min={3} max={12} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Stepper label="وقت الجولة" value={s.seconds} min={30} max={120} step={10} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${num(v)} ث`} />
      <Txt v="bold">المجال</Txt>
      <ChipPicker<Settings['category']> editable={editable} value={s.category} onChange={(category) => change({ category })} options={STEPS_CATEGORIES} />
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker<StepsLevel> editable={editable} value={s.level} onChange={(level) => change({ level })} options={LEVELS} />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.borderStrong,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  slotTarget: { borderColor: C.yellow, borderStyle: 'solid', backgroundColor: alpha(C.yellow, 0.08) },
  badge: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surfaceStrong, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.black, fontSize: 14, lineHeight: 20, color: '#FFFFFF' },
  stepText: { flex: 1, fontSize: 15, lineHeight: 22 },
  pool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: C.raised,
    borderWidth: 1.5,
  },
});
