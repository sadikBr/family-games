/**
 * «من الأرجح؟» — the screen. The vote: the round's theme, the timer, the prompt on a card («من الأرجح أن…»
 * small above, the rest big), then the faces of everyone at the table as big tiles (my pick tinted and
 * checked; tapping another face changes it while the vote is open) and who has voted so far.
 * The reveal: the prompt again (smaller), one bar per chosen player growing to their share of the votes,
 * the round's title chip on the most chosen, under each bar the faces of their voters (open vote only),
 * my verdict, the standings (open vote) or only my points («تصويت سري»), the host's «next».
 * The final: «أكثر من يعرف العائلة» with the podium, then «الألقاب»: for each player the prompt the family
 * chose them most for, quoted in «». Sizes go through dk() so everything grows on a computer's stage.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { GameArt } from '@/art/game-art';
import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import {
  ARJAH_LEAD,
  ARJAH_ROUNDS,
  ARJAH_SECONDS,
  ARJAH_THEME_LABEL,
  ARJAH_THEME_SETTINGS,
  arjahQuestion,
  votesWord,
  type ArjahReveal,
  type ArjahSettings as Settings,
  type ArjahThemeSetting,
  type ArjahTitle,
  type ArjahView,
} from '@/shared/games/arjah';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { useAccent } from '@/ui/accent';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker, Toggle } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { dk } from '@/ui/layout';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, HostNext, MyVerdict, ResultRows, RevealNote, RoundHeader } from './islamic-ui';
import { SETTLE_MS, screenAge, useScreenClock } from './touch-motion';

const votes = (n: number) => votesWord(n, num);
const names = (h: Helpers, ids: string[]) => ids.map((id) => h.player(id).name).join(' و');

export function ArjahGame({ room, view }: { room: RoomView; view: ArjahView }) {
  useScreenClock();
  const h = helpers(room);
  if (view.phase === 'final') return <ArjahFinal room={room} view={view} h={h} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return <Round key={view.round} view={view} h={h} />;
}

/** «تصويت سري» next to the round counter. */
function SecretChip() {
  return (
    <View style={styles.secret} accessibilityLabel="تصويت سري">
      <Icon name="vote" size={13} color={C.muted} />
      <Txt v="tiny" color={C.muted}>
        سري
      </Txt>
    </View>
  );
}

function Round({ view, h }: { view: ArjahView; h: Helpers }) {
  const reveal = view.phase === 'reveal' && view.reveal ? view.reveal : null;
  const p = view.prompt;
  return (
    <>
      <RoundHeader label={p ? ARJAH_THEME_LABEL[p.theme] : ''} round={view.round} rounds={view.rounds} right={view.secret ? <SecretChip /> : null} />
      {view.endsAt ? <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={!reveal && view.mine === null} /> : null}
      {p ? <PromptCard clause={p.clause} compact={!!reveal} /> : null}
      {reveal ? <RevealPart view={view} r={reveal} h={h} /> : <VotePart view={view} h={h} />}
    </>
  );
}

/** The question: «من الأرجح أن…» small, the rest big. */
function PromptCard({ clause, compact }: { clause: string; compact: boolean }) {
  const accent = useAccent();
  const size = compact ? dk(19) : dk(clause.length > 34 ? 22 : 25);
  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      style={[styles.prompt, { borderColor: alpha(accent, 0.65), backgroundColor: alpha(accent, 0.12) }, compact && styles.promptCompact]}
      accessibilityLabel={arjahQuestion(clause)}>
      <Txt v="bold" center color={C.muted} style={{ fontSize: dk(compact ? 13 : 15), lineHeight: dk(compact ? 20 : 23) }}>
        {ARJAH_LEAD}…
      </Txt>
      <Txt center style={{ fontFamily: F.display, color: C.text, fontSize: size, lineHeight: Math.round(size * 1.5) }}>
        {clause}؟
      </Txt>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* The vote                                                            */
/* ------------------------------------------------------------------ */

function VotePart({ view, h }: { view: ArjahView; h: Helpers }) {
  const pick = (id: string) => {
    if (view.mine === id) return;
    haptic.medium();
    h.act('vote', { round: view.round, target: id });
  };
  return (
    <>
      <Txt v="small" center color={C.muted}>
        {view.mine ? `اختيارك: ${h.player(view.mine).name} — يمكن تغييره قبل نهاية الوقت` : 'اختر لاعباً واحداً من الجالسين (يجوز أن تختار نفسك)'}
      </Txt>
      <FaceGrid view={view} h={h} onPick={pick} />
      <AnsweredRow ids={view.voted} total={view.players.length} h={h} label="الأصوات:" />
    </>
  );
}

function FaceGrid({ view, h, onPick }: { view: ArjahView; h: Helpers; onPick: (id: string) => void }) {
  const width = useContentWidth();
  const n = view.players.length;
  const cols = n === 4 ? 2 : n <= 3 ? 3 : width >= 440 ? 4 : 3;
  const gap = 8;
  const tileW = Math.floor((width - gap * (cols - 1)) / cols) - 0.5;
  const big = n <= 4;
  return (
    <View style={[styles.grid, { gap }]}>
      {view.players.map((id) => (
        <Face key={id} id={id} h={h} width={tileW} big={big} mine={view.mine === id} onPress={() => onPick(id)} />
      ))}
    </View>
  );
}

function Face({ id, h, width, big, mine, onPress }: { id: string; h: Helpers; width: number; big: boolean; mine: boolean; onPress: () => void }) {
  const accent = useAccent();
  const p = h.player(id);
  const me = id === h.me;
  const size = Math.min(big ? dk(66) : dk(54), width - 24);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={me ? `${p.name} (أنت)` : p.name}
      accessibilityState={{ selected: mine }}
      style={({ pressed }) => [
        styles.face,
        { width, minHeight: size + dk(46), borderColor: mine ? accent : C.borderStrong, backgroundColor: mine ? alpha(accent, 0.2) : C.surface },
        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
      ]}>
      <Avatar player={p} size={size} ring={mine ? accent : undefined} />
      <Txt v="bold" center numberOfLines={1} style={{ fontSize: dk(14), lineHeight: dk(21), alignSelf: 'stretch' }}>
        {p.name}
      </Txt>
      {me ? (
        <Txt v="tiny" color={C.dim} center style={{ marginTop: -4 }}>
          أنت
        </Txt>
      ) : null}
      {mine ? (
        <Animated.View entering={FadeIn.duration(200)} style={[styles.check, { backgroundColor: accent }]}>
          <Icon name="check" size={14} color="#FFFFFF" />
        </Animated.View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The reveal                                                          */
/* ------------------------------------------------------------------ */

function RevealPart({ view, r, h }: { view: ArjahView; r: ArjahReveal; h: Helpers }) {
  const last = view.round >= view.rounds;
  const [live] = useState(() => screenAge() > SETTLE_MS);
  const ids = view.players;
  const chosen = ids.filter((id) => (r.tally[id] ?? 0) > 0).sort((a, b) => (r.tally[b] ?? 0) - (r.tally[a] ?? 0));
  const none = ids.filter((id) => !(r.tally[id] > 0));
  const max = Math.max(1, ...chosen.map((id) => r.tally[id]));
  return (
    <View style={{ gap: 12 }}>
      {!r.total ? (
        <RevealNote text="لا أصوات في هذه الجولة" />
      ) : !r.top.length ? (
        <RevealNote text="أصوات متفرّقة" sub="لا لقب ولا نقاط في هذه الجولة" />
      ) : null}
      {chosen.length ? (
        <View style={{ gap: 8 }}>
          {chosen.map((id, k) => (
            <VoteBar key={id} id={id} h={h} count={r.tally[id]} share={r.tally[id] / max} top={r.top.includes(id)} voters={r.voters?.[id] ?? null} live={live} delay={k * 90} />
          ))}
        </View>
      ) : null}
      {none.length && r.total ? (
        <Row gap={6} center wrap>
          <Txt v="tiny" color={C.dim}>
            بلا أصوات:
          </Txt>
          {none.map((id) => (
            <Avatar key={id} player={h.player(id)} size={dk(24)} dim />
          ))}
        </Row>
      ) : null}
      <Verdict r={r} />
      {view.secret ? (
        <View style={styles.mine}>
          <Row gap={6} center>
            <Icon name="star" size={16} color={C.yellow} />
            <Txt v="bold">نقاطك: {num(view.myScore)}</Txt>
          </Row>
          <Txt v="tiny" color={C.dim} center>
            تصويت سري: الترتيب الكامل في النهاية
          </Txt>
        </View>
      ) : (
        <ResultRows
          h={h}
          gainLabel="الجولة"
          lines={ids.map((id) => {
            const to = r.voters ? Object.keys(r.voters).find((t) => r.voters![t].includes(id)) : undefined;
            const good = r.matched?.includes(id) ?? false;
            return { id, detail: to ? `اختيار: ${h.player(to).name}` : 'بلا صوت', gain: good ? `+${num(1)}` : num(0), good, total: view.scores[id] ?? 0 };
          })}
        />
      )}
      <HostNext h={h} last={last} />
    </View>
  );
}

function Verdict({ r }: { r: ArjahReveal }) {
  if (r.mineMatched === null) return <MyVerdict tone="none" text="انتهى الوقت قبل صوتك" />;
  if (r.mineMatched) return <MyVerdict tone="good" text={`صوتك مع الأغلبية · ${num('+1')}`} />;
  if (!r.top.length) return <MyVerdict tone="none" text="لا نقاط في هذه الجولة" />;
  return <MyVerdict tone="bad" text="صوتك خارج الأغلبية هذه المرة" />;
}

/** One chosen player: face, name, the title chip, the count, a bar of their share, their voters. */
function VoteBar({ id, h, count, share, top, voters, live, delay }: { id: string; h: Helpers; count: number; share: number; top: boolean; voters: string[] | null; live: boolean; delay: number }) {
  const accent = useAccent();
  const reduced = useReducedMotion();
  const to = Math.max(0.06, Math.min(1, share));
  const w = useSharedValue(live && !reduced ? 0 : to);
  useEffect(() => {
    if (live && !reduced) w.set(withDelay(150 + delay, withTiming(to, { duration: 700, easing: Easing.out(Easing.cubic) })));
    else w.set(to);
  }, [to, live, reduced, w, delay]);
  const st = useAnimatedStyle(() => ({ width: `${w.get() * 100}%` }));
  const p = h.player(id);
  const tint = top ? accent : C.muted;
  return (
    <Animated.View entering={live ? FadeIn.duration(260).delay(delay) : undefined} style={[styles.bar, top && { borderColor: alpha(accent, 0.7), backgroundColor: alpha(accent, 0.1) }]}>
      <Avatar player={p} size={dk(40)} crown={top} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Row gap={6} style={{ justifyContent: 'space-between' }}>
          <Row gap={6} style={{ flexShrink: 1, minWidth: 0 }}>
            <Txt v="bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: dk(15), lineHeight: dk(23) }}>
              {p.name}
              {id === h.me ? ' (أنت)' : ''}
            </Txt>
            {top ? (
              <View style={[styles.title, { backgroundColor: accent }]}>
                <Txt v="tiny" color="#FFFFFF" numberOfLines={1}>
                  لقب الجولة
                </Txt>
              </View>
            ) : null}
          </Row>
          <Txt v="tiny" color={top ? C.text : C.muted}>
            {votes(count)}
          </Txt>
        </Row>
        <View style={styles.track}>
          <Animated.View style={[styles.fill, { backgroundColor: tint }, st]} />
        </View>
        {voters?.length ? (
          <Row gap={3} wrap>
            {voters.map((v) => (
              <Avatar key={v} player={h.player(v)} size={dk(20)} />
            ))}
          </Row>
        ) : null}
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Final                                                               */
/* ------------------------------------------------------------------ */

function ArjahFinal({ room, view, h }: { room: RoomView; view: ArjahView; h: Helpers }) {
  const ids = Object.keys(view.scores);
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id])) : 0;
  const winners = ids.filter((id) => view.scores[id] === best);
  const won = winners.includes(h.me) && best > 0;
  const title = best <= 0 ? 'انتهت اللعبة' : winners.length <= 3 ? `أكثر من يعرف العائلة: ${names(h, winners)}` : 'تعادل!';
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<GameArt id="arjah" size={84} />} title={title} sub="نقطة لكل صوت وافق الأغلبية" />
      <Podium players={room.players} scores={view.scores} />
      {view.titles?.length ? <Titles titles={view.titles} h={h} /> : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      <PlayAgain room={room} />
    </>
  );
}

/** «الألقاب»: each player with the prompt the family chose them most for. */
function Titles({ titles, h }: { titles: ArjahTitle[]; h: Helpers }) {
  const accent = useAccent();
  const sorted = [...titles].sort((a, b) => Number(b.clause !== null) - Number(a.clause !== null) || b.count - a.count);
  return (
    <View style={{ gap: 8 }}>
      <Row gap={8} center>
        <Icon name="crown" size={18} color={accent} />
        <Txt v="h3">الألقاب</Txt>
      </Row>
      {sorted.map((t, k) => (
        <Animated.View key={t.id} entering={FadeIn.duration(260).delay(Math.min(k, 8) * 80)} style={[styles.titleCard, t.clause && { borderColor: alpha(accent, 0.45) }]}>
          <Avatar player={h.player(t.id)} size={dk(38)} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Row gap={6} style={{ justifyContent: 'space-between' }}>
              <Txt v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>
                {h.player(t.id).name}
              </Txt>
              {t.clause ? (
                <Txt v="tiny" color={C.muted}>
                  {votes(t.count)}
                </Txt>
              ) : null}
            </Row>
            {t.clause ? (
              <Txt v="small" color={C.text}>
                «{arjahQuestion(t.clause)}»
              </Txt>
            ) : (
              <Txt v="small" color={C.dim}>
                بلا لقب هذه المرة
              </Txt>
            )}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Lobby settings                                                      */
/* ------------------------------------------------------------------ */

const THEME_OPTIONS = ARJAH_THEME_SETTINGS.map((t) => ({ key: t, label: ARJAH_THEME_LABEL[t] }));
const ROUND_OPTIONS = ARJAH_ROUNDS.map((r) => ({ key: String(r), label: `${num(r)} ${r <= 10 ? 'جولات' : 'جولة'}` }));
const SECOND_OPTIONS = ARJAH_SECONDS.map((s) => ({ key: String(s), label: `${num(s)} ثانية` }));

export function ArjahSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.arjah;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'arjah', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الموضوع</Txt>
      <ChipPicker<ArjahThemeSetting> editable={editable} value={s.theme} onChange={(v) => change({ theme: v })} options={THEME_OPTIONS} />
      <Txt v="bold">عدد الجولات</Txt>
      <ChipPicker<string> editable={editable} value={String(s.rounds)} onChange={(v) => change({ rounds: Number(v) })} options={ROUND_OPTIONS} />
      <Txt v="bold">وقت التصويت</Txt>
      <ChipPicker<string> editable={editable} value={String(s.seconds)} onChange={(v) => change({ seconds: Number(v) })} options={SECOND_OPTIONS} />
      <Toggle label="تصويت سري" value={s.secret} editable={editable} onChange={(secret) => change({ secret })} />
      <Txt v="tiny" color={C.dim}>
        {s.secret ? 'تظهر أعداد الأصوات فقط، ولا يعرف أحد من صوّت لمن.' : 'تظهر وجوه المصوّتين تحت كل اسم.'}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  secret: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1, borderWidth: 1, borderColor: C.border },
  prompt: { borderRadius: 22, borderWidth: 2, paddingVertical: 16, paddingHorizontal: 14, gap: 2, minHeight: 120, justifyContent: 'center' },
  promptCompact: { minHeight: 0, paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  face: { borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6 },
  check: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, padding: 10 },
  title: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  track: { height: 10, borderRadius: 5, backgroundColor: C.borderStrong, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 10, borderRadius: 5 },
  mine: { borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, paddingVertical: 8, paddingHorizontal: 12, gap: 2, alignItems: 'center' },
  titleCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface, padding: 10 },
});
