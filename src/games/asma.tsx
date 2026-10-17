/** «أسماء الله الحسنى» — the screen: «طابِق» (a timed race) and «الذاكرة» (Name ↔ meaning pairs). */
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FlipInEasyY } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import { ASMA_PAIRS, type AsmaMatchView, type AsmaMemoryView, type AsmaSettings as Settings, type AsmaView } from '@/shared/games/asma';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker, Stepper } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { AnsweredRow, OptionGrid, ResultsList, RoundHeader, useMyResultFx } from './islamic-ui';

const GOLD = '#E9C46A';
const NIGHT = '#16304A';
const PAPER = '#FFF6DF';
const INK = '#2A1E0E';

/** A Name in large Amiri script, sized to fit its length. */
function NameText({ name, max = 54, color = GOLD }: { name: string; max?: number; color?: string }) {
  const w = useContentWidth();
  const letters = name.replace(/[ً-ْٰ\s]/g, '').length;
  const size = Math.round(Math.max(26, Math.min(max, (w - 40) / Math.max(3, letters * 0.62))));
  return <Txt style={{ fontFamily: F.quran, fontSize: size, lineHeight: Math.round(size * 1.9), color, textAlign: 'center', writingDirection: 'rtl' }}>{name}</Txt>;
}

function Final({ room, scores, h, sub, again = true }: { room: RoomView; scores: Record<string, number>; h: Helpers; sub: string; again?: boolean }) {
  const best = Math.max(...Object.values(scores));
  const winners = Object.keys(scores).filter((id) => scores[id] === best);
  const won = winners.includes(h.me);
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner
        tone={won ? 'good' : 'neutral'}
        art={<Txt style={styles.emblem}>الأسماء الحسنى</Txt>}
        title={winners.length === 1 ? `فاز ${h.player(winners[0]).name}` : 'تعادل!'}
        sub={sub}
      />
      <Podium players={room.players} scores={scores} />
      <Scoreboard players={room.players} scores={scores} highlight={h.me} />
      {again ? <PlayAgain room={room} /> : null}
    </>
  );
}

function MatchGame({ room, view }: { room: RoomView; view: AsmaMatchView }) {
  const h = helpers(room);
  const mine = view.results?.find((r) => r.id === h.me);
  useMyResultFx(view.phase === 'reveal' && mine ? `${view.round}` : null, mine?.correct ?? null);
  if (view.phase === 'final') return <Final room={room} scores={view.scores} h={h} sub="«من أحصاها دخل الجنة»" />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;
  const showsName = view.shows === 'name';

  return (
    <>
      <RoundHeader label={showsName ? 'ما معنى هذا الاسم؟' : 'ما الاسم الذي هذا معناه؟'} round={view.round} rounds={view.rounds} />
      {view.phase === 'ask' ? <TimerBar endsAt={view.endsAt} total={view.seconds * 1000} onTick={view.myAnswer === null} /> : null}

      <Animated.View key={view.round} entering={FadeIn.duration(220)} style={styles.prompt}>
        {showsName ? (
          <NameText name={view.prompt} />
        ) : (
          <Txt v="h2" center color={PAPER}>
            {view.prompt}
          </Txt>
        )}
      </Animated.View>

      <OptionGrid options={view.options} mine={view.myAnswer} correct={view.correct} onPick={(choice) => h.act('answer', { choice })} columns={showsName ? 1 : 2} />

      {view.phase === 'ask' ? (
        <AnsweredRow ids={view.answered} total={Object.keys(view.scores).length} h={h} />
      ) : (
        <View style={{ gap: 8 }}>
          {view.answer && !showsName ? (
            <Animated.View entering={FadeIn.duration(220)} style={styles.answer}>
              <NameText name={view.answer.name} max={36} />
              <Txt v="bold" center>
                {view.answer.meaning}
              </Txt>
            </Animated.View>
          ) : null}
          {view.results ? <ResultsList results={view.results} h={h} options={view.options} /> : null}
        </View>
      )}
    </>
  );
}

function MemoryGame({ room, view }: { room: RoomView; view: AsmaMemoryView }) {
  const h = helpers(room);
  const W = useContentWidth();
  const { height } = useWindowDimensions();
  const cols = view.size <= 12 ? 3 : 4;
  const rows = Math.ceil(view.size / cols);
  const gap = 6;
  const cw = (W - (cols - 1) * gap) / cols;
  const ch = Math.max(64, Math.min(cw * 1.05, (Math.max(height, 560) * 0.62 - (rows - 1) * gap) / rows));
  if (!(h.me in view.pairs)) return <Spectator room={room} />;
  const myTurn = view.phase === 'play' && view.turn === h.me && !view.peek;
  const nameSize = Math.round(Math.max(14, Math.min(24, cw / 4)));
  const meaningSize = Math.round(Math.max(11, Math.min(14, cw / 7)));

  return (
    <>
      {view.phase === 'final' ? <Final room={room} scores={view.pairs} h={h} sub="بارك الله في ذاكرتكم" again={false} /> : null}

      {view.phase === 'play' ? (
        <>
          <Row gap={8} wrap center>
            {view.order.map((id) => {
              const on = view.turn === id;
              const p = h.player(id);
              return (
                <View key={id} style={[styles.player, on && { borderColor: p.color, backgroundColor: alpha(p.color, 0.2) }]}>
                  <Avatar player={p} size={24} />
                  <Txt v="tiny" numberOfLines={1} style={{ maxWidth: 70 }}>
                    {p.name}
                  </Txt>
                  <View style={[styles.count, { backgroundColor: p.color }]}>
                    <Txt v="tiny" color="#FFFFFF">
                      {num(view.pairs[id] ?? 0)}
                    </Txt>
                  </View>
                </View>
              );
            })}
          </Row>
          <Txt v="bold" center color={myTurn ? C.yellow : view.peek ? C.orange : C.muted}>
            {view.peek
              ? 'ليس هذا معناه…'
              : myTurn
                ? view.flipped.length
                  ? 'اقلب بطاقة ثانية'
                  : 'دورك: اقلب اسماً ومعناه'
                : `دور ${h.player(view.turn).name}…`}
          </Txt>
        </>
      ) : null}

      {view.last && view.phase === 'play' ? (
        <Animated.View key={view.last.name} entering={FadeIn.duration(240)} style={styles.last}>
          <Txt style={{ fontFamily: F.quran, fontSize: 22, lineHeight: 42, color: GOLD, textAlign: 'center' }}>{view.last.name}</Txt>
          <Txt v="small" center>
            {view.last.meaning}
          </Txt>
        </Animated.View>
      ) : null}

      <View style={[styles.table, { width: W, gap, direction: 'ltr' }]}>
        {view.cards.map((card, i) => {
          const owner = view.owners[i];
          const wrong = view.peek && view.flipped.includes(i);
          return (
            <Pressable
              key={i}
              disabled={!myTurn || card !== null}
              onPress={() => {
                haptic.tap();
                h.act('flip', { card: i });
              }}
              accessibilityRole="button"
              accessibilityLabel={card ? card.text : `البطاقة ${i + 1}`}
              style={{ width: cw, height: ch }}>
              {card ? (
                <Animated.View
                  key={`f${i}`}
                  entering={FlipInEasyY.duration(260)}
                  style={[
                    styles.card,
                    card.kind === 'name' ? styles.nameCard : styles.meaningCard,
                    owner ? { borderColor: h.player(owner).color, borderWidth: 4 } : null,
                    wrong ? { borderColor: C.red, borderWidth: 3 } : null,
                  ]}>
                  {card.kind === 'name' ? (
                    <Txt style={{ fontFamily: F.quran, fontSize: nameSize, lineHeight: Math.round(nameSize * 1.75), color: INK, textAlign: 'center' }}>{card.text}</Txt>
                  ) : (
                    <Txt style={{ fontFamily: F.bold, fontSize: meaningSize, lineHeight: Math.round(meaningSize * 1.4), color: '#0E3B36', textAlign: 'center' }}>{card.text}</Txt>
                  )}
                </Animated.View>
              ) : (
                <View key={`b${i}`} style={[styles.card, styles.back]}>
                  <View style={[styles.star, { width: Math.min(cw, ch) * 0.34, height: Math.min(cw, ch) * 0.34 }]} />
                  <View style={[styles.star, styles.star2, { width: Math.min(cw, ch) * 0.34, height: Math.min(cw, ch) * 0.34 }]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      {view.phase === 'final' ? <PlayAgain room={room} /> : null}
    </>
  );
}

export function AsmaGame({ room, view }: { room: RoomView; view: AsmaView }) {
  return view.mode === 'match' ? <MatchGame room={room} view={view} /> : <MemoryGame room={room} view={view} />;
}

/** Lobby settings: the mode, then its own options. */
export function AsmaSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const settings = room.settings.asma;
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'asma', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">طريقة اللعب</Txt>
      <ChipPicker
        options={[
          { key: 'match', label: 'طابِق (سباق)' },
          { key: 'memory', label: 'الذاكرة (بالدور)' },
        ]}
        value={settings.mode}
        editable={editable}
        onChange={(mode) => change({ mode })}
      />
      {settings.mode === 'match' ? (
        <>
          <Txt v="bold">السؤال</Txt>
          <ChipPicker
            options={[
              { key: 'name', label: 'الاسم ← معناه' },
              { key: 'meaning', label: 'المعنى ← الاسم' },
              { key: 'mix', label: 'الاثنان معاً' },
            ]}
            value={settings.dir}
            editable={editable}
            onChange={(dir) => change({ dir })}
          />
          <Stepper label="عدد الأسئلة" value={settings.rounds} min={5} max={30} step={5} editable={editable} onChange={(rounds) => change({ rounds })} />
          <Stepper label="وقت السؤال" value={settings.seconds} min={10} max={40} step={5} editable={editable} onChange={(seconds) => change({ seconds })} format={(v) => `${v} ث`} />
        </>
      ) : (
        <>
          <Txt v="bold">عدد الأزواج</Txt>
          <ChipPicker
            options={ASMA_PAIRS.map((n) => ({ key: String(n), label: `${num(n)} أزواج` }))}
            value={String(settings.pairs)}
            editable={editable}
            onChange={(v) => change({ pairs: Number(v) })}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emblem: { fontFamily: F.quran, fontSize: 26, lineHeight: 50, color: GOLD, textAlign: 'center' },
  prompt: { backgroundColor: NIGHT, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 16, minHeight: 130, justifyContent: 'center', borderWidth: 2, borderColor: alpha(GOLD, 0.55) },
  answer: { backgroundColor: alpha(C.green, 0.16), borderColor: alpha(C.green, 0.55), borderWidth: 2, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  last: { backgroundColor: NIGHT, borderRadius: 16, paddingVertical: 4, paddingHorizontal: 12, borderWidth: 1.5, borderColor: alpha(GOLD, 0.45) },
  player: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 14, paddingVertical: 3, paddingHorizontal: 6, borderWidth: 2, borderColor: 'transparent' },
  count: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  table: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  card: { flex: 1, borderRadius: 12, borderWidth: 2, borderColor: alpha(INK, 0.5), alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 3 },
  nameCard: { backgroundColor: PAPER },
  meaningCard: { backgroundColor: '#D8F1EA' },
  back: { backgroundColor: NIGHT, borderColor: alpha(GOLD, 0.7) },
  star: { position: 'absolute', borderWidth: 2, borderColor: GOLD, borderRadius: 3 },
  star2: { transform: [{ rotate: '45deg' }] },
});
