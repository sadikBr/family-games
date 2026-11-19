/**
 * «مكية أم مدنية؟» — the screen. Asking: a surah heading in the Mushaf's manner (a framed band, the name in
 * Amiri, its number in a medallion), the timer, then two big buttons «مكية» / «مدنية» (or four options for
 * «في أي جزء تبدأ؟» and «كم عدد آياتها؟»), who answered. Reveal: the right button turns green, under each the
 * players who chose it; my verdict with the streak, the surah's card (verses, order, juz', why it is called
 * so, its theme, the note on a disputed classification), the standings. Final: podium and the longest
 * streak. Sizes go through dk() so the heading and the buttons grow on a computer's stage.
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  MAKKI_MCQ_EXTRA,
  MAKKI_MODES,
  MAKKI_MODE_LABEL,
  MAKKI_ROUNDS,
  MAKKI_SCOPES,
  MAKKI_SCOPE_LABEL,
  MAKKI_SECONDS,
  makkiMult,
  type MakkiCard,
  type MakkiKind,
  type MakkiMode,
  type MakkiResult,
  type MakkiScope,
  type MakkiSettings as Settings,
  type MakkiView,
} from '@/shared/games/makki';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, NO_ANSWER, OptionGrid, ResultRows, RevealNote, RoundHeader, SentNote, useMyResultFx, winnerTitle } from './islamic-ui';
import { useScreenClock } from './touch-motion';

const GREEN = '#1F6B4A';
const NIGHT = '#123A2C';
const GOLD = '#E9C46A';
const PAPER = '#FFF8E6';
const FLAME = C.orange;

const KIND_LABEL: Record<MakkiKind, string> = { type: 'مكية أم مدنية؟', juz: 'في أي جزء تبدأ؟', ayat: 'عدد الآيات' };
const secs = (ms: number) => `${num((ms / 1000).toFixed(1))} ث`;
const multText = (m: number) => num(`×${m}`);
/** Only the digits run left to right («286 آية» keeps its Arabic order). */
const isoDigits = (t: string) => t.replace(/\d+/g, (m) => num(m));

export function MakkiGame({ room, view }: { room: RoomView; view: MakkiView }) {
  useScreenClock();
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <MakkiFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} mine={mine} />;
}

/** Right answers in a row: a flame and the count, with the multiplier it gives («×1.5»). */
function StreakChip({ n }: { n: number }) {
  if (n < 2) return null;
  const mult = makkiMult(n);
  return (
    <Animated.View entering={FadeIn.duration(260)} style={styles.streak} accessibilityLabel={`سلسلة من ${n} إجابات صحيحة`}>
      <Icon name="flame" size={14} color={FLAME} />
      <Txt style={styles.streakText}>{num(n)}</Txt>
      {mult > 1 ? <Txt style={styles.streakMult}>{multText(mult)}</Txt> : null}
    </Animated.View>
  );
}

function Round({ view, h, mine }: { view: MakkiView; h: Helpers; mine: MakkiResult | undefined }) {
  const reveal = view.phase === 'reveal';
  const last = view.round >= view.rounds;
  const pick = (i: number) => {
    if (reveal || view.mine !== null) return;
    h.act('answer', { round: view.round, choice: i });
  };
  const choosers = (i: number) => (view.results ?? []).filter((r) => r.choice === i);
  return (
    <>
      <RoundHeader label={KIND_LABEL[view.kind]} round={view.round} rounds={view.rounds} right={<StreakChip n={view.streaks[h.me] ?? 0} />} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && view.mine === null} /> : null}
      <SurahHeading n={view.n} name={view.name} ask={view.kind === 'type' ? null : view.ask} />
      {view.kind === 'type' ? (
        <TypeButtons view={view} h={h} onPick={pick} />
      ) : (
        <OptionGrid
          options={view.options.map(isoDigits)}
          mine={view.mine}
          correct={view.correct}
          onPick={pick}
          extra={reveal ? (i) => <Choosers ids={choosers(i).map((r) => r.id)} h={h} /> : undefined}
        />
      )}
      {reveal ? (
        <View style={{ gap: 10 }}>
          {mine ? <Verdict mine={mine} /> : null}
          {view.card ? <FactCard view={view} card={view.card} /> : null}
          <ResultRows
            h={h}
            lines={(view.results ?? []).map((r) => ({
              id: r.id,
              detail: r.choice === null ? NO_ANSWER : `${isoDigits(view.options[r.choice])} · ${secs(r.ms ?? 0)}`,
              gain: r.correct ? `+${num(r.points)}` : num(0),
              good: r.correct,
              total: view.scores[r.id],
              icon: <StreakChip n={r.streak} />,
            }))}
          />
          <HostNext h={h} last={last} />
        </View>
      ) : (
        <>
          {view.mine !== null ? <SentNote text="تم إرسال جوابك — في انتظار الآخرين" /> : null}
          <AnsweredRow ids={view.answered} total={view.players.length} h={h} />
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The surah heading                                                   */
/* ------------------------------------------------------------------ */

/** A surah heading in the Mushaf's manner: a framed band, «سورة …» in Amiri, the number in a medallion. */
function SurahHeading({ n, name, ask }: { n: number; name: string; ask: string | null }) {
  const width = useContentWidth();
  const title = `سورة ${name}`;
  const letters = title.replace(/\s/g, '').length;
  const room = Math.min(width - 32, dk(520)) - 2 * dk(50);
  const size = Math.round(Math.max(24, Math.min(dk(40), room / Math.max(5, letters * 0.62))));
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.headingWrap}>
      <View style={styles.heading}>
        <View style={styles.headingInner}>
          <Medallion n={n} />
          <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            <Txt style={{ fontFamily: F.quran, fontSize: size, lineHeight: Math.round(size * 1.85), color: PAPER, textAlign: 'center', writingDirection: 'rtl' }} numberOfLines={1} adjustsFontSizeToFit>
              {title}
            </Txt>
          </View>
          <View style={{ width: dk(38) }} />
        </View>
      </View>
      <Txt v="tiny" center color={C.muted}>
        ترتيبها في المصحف: {num(n)}
      </Txt>
      {ask ? (
        <Txt v="title" center style={{ fontSize: dk(22), lineHeight: dk(33) }}>
          {ask}
        </Txt>
      ) : null}
    </Animated.View>
  );
}

/** The surah's number in a small eight-pointed medallion (two squares, one turned). */
function Medallion({ n }: { n: number }) {
  const s = dk(30);
  return (
    <View style={{ width: dk(38), height: dk(38), alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`رقمها ${n}`}>
      <View style={[styles.medal, { width: s, height: s }]} />
      <View style={[styles.medal, { width: s, height: s, transform: [{ rotate: '45deg' }] }]} />
      <Txt style={{ fontFamily: F.black, fontSize: dk(n > 99 ? 12 : 14), lineHeight: dk(20), color: GOLD }}>{num(n)}</Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* «مكية» / «مدنية»                                                    */
/* ------------------------------------------------------------------ */

function TypeButtons({ view, h, onPick }: { view: MakkiView; h: Helpers; onPick: (i: number) => void }) {
  return (
    <View style={styles.types}>
      {view.options.map((label, i) => (
        <View key={i} style={{ flex: 1, minWidth: 0 }}>
          <TypeButton label={label} index={i} view={view} h={h} onPick={() => onPick(i)} />
        </View>
      ))}
    </View>
  );
}

function TypeButton({ label, index, view, h, onPick }: { label: string; index: number; view: MakkiView; h: Helpers; onPick: () => void }) {
  const reduced = useReducedMotion();
  const revealed = view.correct !== null;
  const isMine = view.mine === index;
  const right = revealed && view.correct === index;
  const wrongMine = revealed && isMine && !right;
  const tone = right ? C.green : wrongMine ? C.red : isMine ? C.yellow : null;
  const dim = revealed ? !right && !wrongMine : view.mine !== null && !isMine;
  const op = useSharedValue(dim ? 0.45 : 1);
  useEffect(() => {
    op.set(reduced ? (dim ? 0.45 : 1) : withTiming(dim ? 0.45 : 1, { duration: 320, easing: Easing.out(Easing.cubic) }));
  }, [dim, reduced, op]);
  const anim = useAnimatedStyle(() => ({ opacity: op.get() }));
  const locked = revealed || view.mine !== null;
  const ids = (view.results ?? []).filter((r) => r.choice === index).map((r) => r.id);
  return (
    <Animated.View style={anim}>
      <Pressable
        disabled={locked}
        onPress={() => {
          haptic.medium();
          onPick();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: isMine, disabled: locked }}
        style={({ pressed }) => [
          styles.type,
          { minHeight: dk(revealed ? 96 : 120), borderColor: tone ?? alpha(GOLD, 0.65), backgroundColor: tone ? alpha(tone, 0.16) : C.surface },
          pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
        ]}>
        {right || wrongMine ? (
          <Animated.View entering={reduced ? undefined : FadeIn.duration(260)} style={[styles.mark, { backgroundColor: right ? C.green : C.red }]}>
            <Icon name={right ? 'check' : 'close'} size={14} color="#FFFFFF" />
          </Animated.View>
        ) : null}
        <Txt style={[styles.typeText, { fontSize: dk(30), lineHeight: dk(44) }]}>{label}</Txt>
        {revealed ? <Choosers ids={ids} h={h} /> : isMine ? <Txt v="tiny" color={C.yellow} center>اختيارك</Txt> : null}
      </Pressable>
    </Animated.View>
  );
}

function Choosers({ ids, h }: { ids: string[]; h: Helpers }) {
  if (!ids.length) return null;
  return (
    <Row gap={4} center wrap style={{ minHeight: dk(22) }}>
      {ids.slice(0, 8).map((id) => (
        <Avatar key={id} player={h.player(id)} size={dk(22)} />
      ))}
      {ids.length > 8 ? (
        <Txt v="tiny" color={C.muted}>
          +{num(ids.length - 8)}
        </Txt>
      ) : null}
    </Row>
  );
}

function Verdict({ mine }: { mine: MakkiResult }) {
  if (mine.choice === null) return <MyVerdict tone="none" text="انتهى الوقت قبل جوابك" />;
  if (!mine.correct) return <MyVerdict tone="bad" text="إجابة خاطئة" />;
  const parts = [`إجابة صحيحة · ${num(`+${mine.points}`)}`];
  if (mine.mult > 1) parts.push(`سلسلة ${num(mine.streak)} ${multText(mine.mult)}`);
  return <MyVerdict tone="good" text={parts.join(' · ')} />;
}

/* ------------------------------------------------------------------ */
/* The surah's card                                                    */
/* ------------------------------------------------------------------ */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Txt v="tiny" color={C.muted} center numberOfLines={1}>
        {label}
      </Txt>
      <Txt style={styles.statValue} center numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Txt>
    </View>
  );
}

function FactCard({ view, card }: { view: MakkiView; card: MakkiCard }) {
  return (
    <Animated.View entering={FadeIn.duration(320)} style={styles.card}>
      <Row gap={8} center wrap>
        <Txt v="bold" color={PAPER} center>
          سورة {view.name}
        </Txt>
        <View style={[styles.badge, { backgroundColor: card.madani ? alpha('#5DADE2', 0.25) : alpha(GOLD, 0.25), borderColor: card.madani ? '#5DADE2' : GOLD }]}>
          <Txt v="tiny" color={PAPER}>
            {card.madani ? 'مدنية' : 'مكية'}
          </Txt>
        </View>
      </Row>
      {card.note ? (
        <Txt v="tiny" center color={alpha(PAPER, 0.75)}>
          {card.note}
        </Txt>
      ) : null}
      <View style={styles.stats}>
        <Stat label="عدد آياتها" value={num(card.ayat)} />
        <Stat label="ترتيبها" value={num(view.n)} />
        <Stat label="تبدأ في الجزء" value={num(card.juz)} />
      </View>
      {card.why ? <Fact kicker="سبب التسمية" text={card.why} /> : null}
      {card.theme ? <Fact kicker="من موضوعاتها" text={card.theme} /> : null}
    </Animated.View>
  );
}

function Fact({ kicker, text }: { kicker: string; text: string }) {
  return (
    <View style={{ gap: 1 }}>
      <Txt v="tiny" color={GOLD}>
        {kicker}
      </Txt>
      <Txt v="small" color={PAPER} style={{ lineHeight: 24 }}>
        {text}
      </Txt>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

function MakkiFinal({ room, view, h }: { room: RoomView; view: MakkiView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const top = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === top);
  const won = winners.includes(h.me);
  const longest = Math.max(0, ...ids.map((id) => view.best[id] ?? 0));
  const streakers = ids.filter((id) => (view.best[id] ?? 0) === longest && longest >= 2);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="makki" size={84} />} title={winnerTitle(winners.map((id) => h.player(id).name))} sub="بارك الله فيكم جميعاً" />
      <Podium players={room.players} scores={view.scores} />
      {streakers.length ? (
        <RevealNote kicker="أطول سلسلة إجابات صحيحة" text={streakers.map((id) => h.player(id).name).join(' و')} sub={`${num(longest)} ${longest <= 10 ? 'إجابات' : 'إجابة'} متتالية`} />
      ) : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const MODE_OPTIONS = MAKKI_MODES.map((m) => ({ key: m, label: MAKKI_MODE_LABEL[m] }));
const SCOPE_OPTIONS = MAKKI_SCOPES.map((s) => ({ key: s, label: MAKKI_SCOPE_LABEL[s] }));
const ROUND_OPTIONS = MAKKI_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'سور' : 'سورة'}` }));
const SECOND_OPTIONS = MAKKI_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ${s <= 10 ? 'ثوانٍ' : 'ثانية'}` }));

export function MakkiSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.makki;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'makki', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">نوع الأسئلة</Txt>
      <ChipPicker<MakkiMode> editable={editable} value={s.mode} onChange={(v) => change({ mode: v })} options={MODE_OPTIONS} />
      {s.mode === 'mix' ? (
        <Txt v="tiny" color={C.muted}>
          يضم المنوّع أيضاً سؤال «كم عدد آياتها؟».
        </Txt>
      ) : null}
      <Txt v="bold">النطاق</Txt>
      <ChipPicker<MakkiScope> editable={editable} value={s.scope} onChange={(v) => change({ scope: v })} options={SCOPE_OPTIONS} />
      {s.scope === 'amma' && s.mode !== 'type' ? (
        <Txt v="tiny" color={C.muted}>
          سور جزء عمّ كلها تبدأ في الجزء الثلاثين، فيُسأل فيه عن عدد الآيات بدل الجزء.
        </Txt>
      ) : null}
      <Txt v="bold">عدد السور</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت كل سورة</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
      {s.mode !== 'type' ? (
        <Txt v="tiny" color={C.muted}>
          وأسئلة الاختيار من أربعة: {num(MAKKI_MCQ_EXTRA)} ثوانٍ زيادة.
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  headingWrap: { gap: 6 },
  heading: { backgroundColor: GREEN, borderRadius: 18, padding: 4, borderWidth: 2, borderColor: alpha(GOLD, 0.85) },
  headingInner: { flexDirection: 'row', alignItems: 'center', borderRadius: 13, borderWidth: 1.5, borderColor: alpha(GOLD, 0.55), backgroundColor: NIGHT, paddingHorizontal: 6, paddingVertical: 4 },
  medal: { position: 'absolute', borderWidth: 1.5, borderColor: GOLD, borderRadius: 3, backgroundColor: alpha(GREEN, 0.6) },
  types: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  type: { borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 8 },
  typeText: { fontFamily: F.display, color: C.text, textAlign: 'center' },
  mark: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: NIGHT, borderRadius: 18, borderWidth: 1.5, borderColor: alpha(GOLD, 0.6), padding: 12, gap: 8 },
  badge: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 1 },
  stats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, minWidth: 0, backgroundColor: alpha(PAPER, 0.08), borderRadius: 12, paddingVertical: 4, paddingHorizontal: 4, alignItems: 'center' },
  statValue: { fontFamily: F.black, fontSize: 18, lineHeight: 27, color: PAPER },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, backgroundColor: alpha(FLAME, 0.16), borderWidth: 1, borderColor: alpha(FLAME, 0.5) },
  streakText: { fontFamily: F.black, fontSize: 13, lineHeight: 19, color: FLAME },
  streakMult: { fontFamily: F.bold, fontSize: 11, lineHeight: 17, color: C.text },
});
