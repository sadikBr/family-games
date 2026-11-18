/** «رتّب الأحداث» — the screen (build my order, wait, the timeline reveal, the podium) and the lobby settings. */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { TARTIB_LEVEL_LABEL, TARTIB_ROUNDS, TARTIB_SECONDS, TARTIB_TOPICS, type TartibResult, type TartibSettings as Settings, type TartibTopic, type TartibView } from '@/shared/games/tartib';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, QuizFinal, ResultRows, RoundHeader, SentNote, useMyResultFx } from './islamic-ui';
import { Builder, cardLetter } from './tartib-builder';

const topicLabel = (t: TartibTopic) => TARTIB_TOPICS.find((x) => x.key === t)?.label ?? '';

/** «1453م»، «44 ق.م»: the digits and the era as two pieces of a row, so the order holds in any text direction. */
function YearText({ year }: { year: number }) {
  return (
    <Row gap={year < 0 ? 4 : 1}>
      <Txt style={styles.yearText}>{num(Math.abs(year))}</Txt>
      <Txt style={styles.yearText}>{year < 0 ? 'ق.م' : 'م'}</Txt>
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Waiting                                                             */
/* ------------------------------------------------------------------ */

/** My confirmed order while the others finish. */
function SentList({ view }: { view: TartibView }) {
  const accent = useAccent();
  return (
    <View style={{ gap: 6 }}>
      <Txt v="tiny" color={C.muted}>
        ترتيبك (مؤكَّد) — الأقدم في الأعلى
      </Txt>
      {(view.mine ?? []).map((card, k) => (
        <View key={k} style={[styles.row, { borderColor: alpha(accent, 0.6), backgroundColor: alpha(accent, 0.14) }]}>
          <View style={[styles.badge, { backgroundColor: accent }]}>
            <Txt style={styles.badgeText}>{num(k + 1)}</Txt>
          </View>
          <Txt v="bold" style={styles.cardText}>
            {view.cards[card].text}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Reveal                                                              */
/* ------------------------------------------------------------------ */

/** The right order as a vertical timeline with the years; my slots marked right or wrong. */
function Timeline({ view, mine }: { view: TartibView; mine: TartibResult | undefined }) {
  const accent = useAccent();
  const answer = view.answer ?? [];
  const order = mine?.order ?? null;
  return (
    <Animated.View entering={FadeIn.duration(240)} style={{ gap: 0 }}>
      <Txt v="tiny" color={C.muted} style={{ marginBottom: 6 }}>
        خط الزمن الصحيح — من الأقدم إلى الأحدث
      </Txt>
      {answer.map((a, k) => {
        const ok = order ? order[k] === a.card : null;
        const tone = ok === null ? accent : ok ? C.green : C.red;
        const where = order ? order.indexOf(a.card) : -1;
        const last = k === answer.length - 1;
        return (
          <Row key={k} gap={10} style={{ alignItems: 'stretch' }}>
            {/* the rail */}
            <View style={styles.rail}>
              <View style={[styles.railLine, { backgroundColor: alpha(accent, 0.5) }, k === 0 && { top: 18 }, last && { bottom: undefined, height: 18 }]} />
              <View style={[styles.dot, { backgroundColor: tone, borderColor: alpha('#FFFFFF', 0.85) }]} />
            </View>
            <View style={[styles.event, { borderColor: alpha(tone, ok === null ? 0.35 : 0.65), backgroundColor: alpha(tone, ok === null ? 0.08 : 0.12) }]}>
              <Row gap={6} wrap>
                <View style={[styles.year, { backgroundColor: alpha(accent, 0.3) }]}>
                  <YearText year={a.year} />
                </View>
                {a.hijri !== null ? (
                  <Row gap={1}>
                    <Txt v="tiny" color={C.muted}>
                      {num(a.hijri)}
                    </Txt>
                    <Txt v="tiny" color={C.muted}>
                      هـ
                    </Txt>
                  </Row>
                ) : null}
                <View style={{ flex: 1 }} />
                {ok === null ? null : <Icon name={ok ? 'check' : 'close'} size={16} color={tone} />}
              </Row>
              <Row gap={6} style={{ alignItems: 'flex-start' }}>
                <View style={[styles.letter, { borderColor: alpha(accent, 0.8) }]}>
                  <Txt style={styles.letterText}>{cardLetter(a.card)}</Txt>
                </View>
                <Txt v="bold" style={styles.cardText}>
                  {view.cards[a.card].text}
                </Txt>
              </Row>
              {order && !ok ? (
                <Txt v="tiny" color={C.muted}>
                  {where >= 0 ? `في ترتيبك: الخانة ${num(where + 1)}` : 'في ترتيبك: بلا خانة'}
                </Txt>
              ) : null}
            </View>
          </Row>
        );
      })}
    </Animated.View>
  );
}

/** Everyone's order in letters: green in the right slot, red elsewhere, a dash for an empty slot. */
function Orders({ view, h }: { view: TartibView; h: Helpers }) {
  const answer = view.answer ?? [];
  const rows = (view.results ?? []).filter((r) => r.id !== h.me);
  if (!rows.length) return null;
  return (
    <View style={{ gap: 5 }}>
      <Txt v="tiny" color={C.muted}>
        ترتيب الآخرين
      </Txt>
      {rows.map((r) => (
        <Row key={r.id} gap={8} style={styles.orderRow}>
          <Avatar player={h.player(r.id)} size={24} />
          <Txt v="bold" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 20 }}>
            {h.player(r.id).name}
          </Txt>
          <Row gap={3}>
            {answer.map((a, k) => {
              const c = r.order?.[k] ?? null;
              const ok = c !== null && c === a.card;
              return (
                <View key={k} style={[styles.chip, c === null ? styles.chipEmpty : { backgroundColor: alpha(ok ? C.green : C.red, 0.8) }]}>
                  <Txt style={styles.chipText}>{c === null ? '–' : cardLetter(c)}</Txt>
                </View>
              );
            })}
          </Row>
        </Row>
      ))}
    </View>
  );
}

function detailOf(r: TartibResult, n: number): string {
  if (r.order === null) return 'بلا ترتيب';
  const parts = [r.perfect ? 'ترتيب كامل' : `${num(r.right)} من ${num(n)} في مكانها`];
  if (r.speed > 0) parts.push(`سرعة ${num(`+${r.speed}`)}`);
  if (!r.sent) parts.push('بلا تأكيد');
  return parts.join(' · ');
}

function Results({ view, h }: { view: TartibView; h: Helpers }) {
  const n = view.cards.length;
  return (
    <ResultRows
      h={h}
      lines={(view.results ?? []).map((r) => ({
        id: r.id,
        detail: detailOf(r, n),
        gain: r.points > 0 ? num(`+${r.points}`) : num(0),
        good: r.points > 0,
        total: view.scores[r.id],
        icon: r.perfect ? <Icon name="starFull" size={16} color={C.yellow} /> : undefined,
      }))}
    />
  );
}

function verdictOf(mine: TartibResult, n: number): { tone: 'good' | 'bad' | 'none'; text: string } {
  if (mine.order === null) return { tone: 'none', text: 'انتهى الوقت قبل وضع البطاقات' };
  const pts = num(`+${mine.points}`);
  if (mine.perfect) return { tone: 'good', text: `ترتيب كامل! · ${pts}` };
  const text = `${num(mine.right)} من ${num(n)} في مكانها · ${pts}`;
  return { tone: 'bad', text: mine.sent ? text : `انتهى الوقت: ${text}` };
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function TartibGame({ room, view }: { room: RoomView; view: TartibView }) {
  const h = helpers(room);
  const cw = useContentWidth();
  const playing = view.players.includes(h.me);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine ? mine.perfect : null);
  if (view.phase === 'final') return <QuizFinal room={room} scores={view.scores} game="tartib" h={h} sub="أحسنتم جميعاً، والتاريخ يجمعنا" />;
  if (!playing) return <Spectator room={room} />;
  const sent = view.mine !== null;
  const last = view.round >= view.rounds;
  const width = Math.min(cw, dk(520));

  return (
    <View style={{ gap: 12, width, alignSelf: 'center' }}>
      <RoundHeader label={`${topicLabel(view.topic)} · جولة ${TARTIB_LEVEL_LABEL[view.level]}`} round={view.round} rounds={view.rounds} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play' && !sent} /> : null}

      {view.phase === 'play' ? (
        sent ? (
          <>
            <SentNote text="تم التأكيد — بانتظار الآخرين" />
            <AnsweredRow ids={view.submitted} total={view.players.length} h={h} label="التأكيدات:" />
            <SentList view={view} />
          </>
        ) : (
          <>
            <Builder view={view} h={h} mix={view.topic === 'mix'} />
            {view.players.length > 1 ? <AnsweredRow ids={view.submitted} total={view.players.length} h={h} label="التأكيدات:" /> : null}
          </>
        )
      ) : (
        <>
          {mine ? <MyVerdict {...verdictOf(mine, view.cards.length)} /> : null}
          <Timeline view={view} mine={mine} />
          <Orders view={view} h={h} />
          <Results view={view} h={h} />
          <HostNext h={h} last={last} />
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const ROUND_OPTIONS = TARTIB_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} جولات` }));
const TIME_OPTIONS = TARTIB_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ث` }));

export function TartibSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.tartib;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'tartib', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">المجال</Txt>
      <ChipPicker<TartibTopic> editable={editable} value={s.topic} onChange={(topic) => change({ topic })} options={TARTIB_TOPICS} />
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت الجولة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={TIME_OPTIONS} />
      <Row gap={8}>
        <GameArt id="tartib" size={40} />
        <Txt v="tiny" color={C.muted} style={{ flex: 1 }}>
          الجولات الأولى أربع بطاقات متباعدة التواريخ، ثم خمس بطاقات تتقارب تواريخها. نقطة لكل بطاقة في مكانها، و3 للترتيب الكامل.
        </Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 14, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 10 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: F.black, fontSize: 13, lineHeight: 19, color: '#FFFFFF' },
  cardText: { flex: 1, fontSize: 15, lineHeight: 22 },
  rail: { width: 18, alignItems: 'center' },
  railLine: { position: 'absolute', top: 0, bottom: 0, width: 3, borderRadius: 2 },
  dot: { marginTop: 12, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  event: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 10, gap: 2, marginBottom: 6 },
  year: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 0 },
  yearText: { fontFamily: F.black, fontSize: 16, lineHeight: 24, color: C.text },
  letter: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  letterText: { fontFamily: F.black, fontSize: 11, lineHeight: 17, color: C.text },
  orderRow: { backgroundColor: C.surface, borderRadius: 12, paddingVertical: 4, paddingHorizontal: 8 },
  chip: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  chipEmpty: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.borderStrong },
  chipText: { fontFamily: F.black, fontSize: 11, lineHeight: 17, color: '#FFFFFF' },
});
