/** «حروف مبعثرة» — find words in the same letter grid as everyone else before the timer runs out. */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { client } from '@/lib/client';
import { haptic, play } from '@/lib/sfx';
import { BOGGLE_SECONDS, boggleWordPoints, type BoggleFound, type BoggleLevel, type BoggleResult, type BoggleView } from '@/shared/games/boggle';
import type { RoomView } from '@/shared/protocol';
import { C, F, alpha } from '@/theme';
import { Avatar, Card, Row } from '@/ui/bits';
import { Btn } from '@/ui/btn';
import { ChipPicker, ConfirmModal, Stepper, Toggle } from '@/ui/controls';
import { Confetti, Podium, Scoreboard, TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';
import { MarkIn } from '@/ui/motion';
import { li } from '@/shared/li';

import { LetterGrid } from './boggle-board';
import { PlayAgain, ResultBanner, Spectator } from './common';
import { helpers, type Helpers } from './helpers';
import { RoundHeader } from './islamic-ui';
import { PlayerStrip } from './player-strip';

const nameOf = (h: Helpers, view: BoggleView, id: string) => (h.players.some((p) => p.id === id) ? h.player(id).name : (view.names[id] ?? '؟'));

/** A found word as a small chip (crossed out when it was shared and scores nothing). */
function WordChip({ w, crossed, shared, active, onPress }: { w: BoggleFound; crossed?: boolean; shared?: boolean; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.chip, shared && !crossed && styles.chipShared, crossed && styles.chipCrossed, active && styles.chipActive]}>
      <Txt v="bold" size={15} color={crossed ? C.dim : C.text} style={crossed ? styles.strike : null}>
        {w.word}
      </Txt>
      <Txt v="tiny" color={crossed ? C.dim : C.yellow}>
        {crossed ? '0' : `+${num(w.points)}`}
      </Txt>
    </Pressable>
  );
}

function BoggleArt({ size }: { size: number }) {
  const t = size / 2 - 3;
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 6, direction: 'rtl' }}>
      {['ح', 'ر', 'و', 'ف'].map((ch, i) => (
        <View key={ch} style={{ width: t, height: t, borderRadius: 8, backgroundColor: i === 1 || i === 2 ? C.yellow : '#FFF4DA', alignItems: 'center', justifyContent: 'center' }}>
          <Txt style={{ fontFamily: F.display, fontSize: t * 0.55, lineHeight: t * 0.85, color: C.ink }}>{ch}</Txt>
        </View>
      ))}
    </View>
  );
}

/** After a round: the grid (tap a word to see where it hides), the missed word, everyone's words. */
function RoundWords({ view, h, width }: { view: BoggleView; h: Helpers; width: number }) {
  const [shown, setShown] = useState<{ round: number; word: string; path: number[] } | null>(null);
  const results = view.results ?? [];
  const cur = shown && shown.round === view.round ? shown : view.missed ? { round: view.round, word: view.missed.word, path: view.missed.path } : null;
  const all = new Set(results.flatMap((r) => r.words.map((w) => w.word)));
  const sorted: BoggleResult[] = [...results].sort((a, b) => b.points - a.points);
  return (
    <View style={{ gap: 10 }}>
      <LetterGrid grid={view.grid} size={view.size} width={Math.min(width * 0.8, 300)} path={cur?.path ?? []} tint={C.cyan} />
      <Txt v="bold" center color={C.cyan}>
        {cur ? `«${cur.word}»` : ' '}
      </Txt>
      {view.missed ? (
        <Pressable onPress={() => setShown({ round: view.round, word: view.missed!.word, path: view.missed!.path })}>
          <Card style={styles.missed}>
            <Txt v="small" center color={C.muted}>
              أجمل كلمة فاتتكم
            </Txt>
            <Txt v="title" center color={C.yellow}>
              «{view.missed.word}» <Txt v="small" color={C.muted}>{`(+${num(view.missed.points)})`}</Txt>
            </Txt>
          </Card>
        </Pressable>
      ) : null}
      <Txt v="tiny" center color={C.muted}>
        وجدتم {num(all.size)} كلمة مختلفة — وفي الشبكة {num(view.possible)} كلمة متداولة على الأقل
      </Txt>
      {sorted.map((r) => (
        <Card key={r.id} style={{ gap: 8, padding: 12 }}>
          <Row gap={8}>
            <Avatar player={h.player(r.id)} size={28} />
            <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
              {nameOf(h, view, r.id)}
              {r.id === h.me ? ' (أنت)' : ''}
            </Txt>
            <Txt v="tiny" color={C.muted}>
              {num(r.words.length)} كلمة
            </Txt>
            <Txt style={{ fontFamily: F.black, fontSize: 16, lineHeight: 24, color: r.points ? C.green : C.dim, minWidth: 40, textAlign: 'center' }}>{`+${num(r.points)}`}</Txt>
          </Row>
          {r.words.length ? (
            <Row gap={6} wrap>
              {[...r.words]
                .sort((a, b) => Number(a.shared) - Number(b.shared) || b.word.length - a.word.length)
                .map((w) => (
                  <WordChip
                    key={w.word}
                    w={w}
                    shared={w.shared}
                    crossed={w.shared && view.unique}
                    active={cur?.word === w.word}
                    onPress={() => setShown({ round: view.round, word: w.word, path: w.path })}
                  />
                ))}
            </Row>
          ) : (
            <Txt v="small" color={C.dim}>
              لا كلمات هذه الجولة
            </Txt>
          )}
        </Card>
      ))}
      {view.unique ? (
        <Txt v="tiny" center color={C.dim}>
          الكلمات المشطوبة وجدها أكثر من لاعب، فلا تُحسب
        </Txt>
      ) : null}
    </View>
  );
}

function Final({ room, view, h, width }: { room: RoomView; view: BoggleView; h: Helpers; width: number }) {
  const ids = view.players;
  const best = ids.length ? Math.max(...ids.map((id) => view.scores[id] ?? 0)) : 0;
  const winners = ids.filter((id) => (view.scores[id] ?? 0) === best);
  const won = winners.length === 1 && winners[0] === h.me;
  const title = winners.length === 1 ? (winners[0] === h.me ? 'فزت!' : `الفوز ${li(nameOf(h, view, winners[0]))}`) : 'تعادل!';
  return (
    <>
      {won ? <Confetti /> : null}
      <ResultBanner tone={won ? 'good' : 'neutral'} art={<BoggleArt size={64} />} title={title} sub={`${num(best)} نقطة — أحسنتم جميعاً`} />
      {ids.length > 1 ? <Podium players={room.players} scores={view.scores} /> : null}
      <Scoreboard players={room.players} scores={view.scores} highlight={h.me} />
      {view.results ? (
        <>
          <Txt v="h3" center color={C.muted}>
            كلمات الجولة الأخيرة
          </Txt>
          <RoundWords view={view} h={h} width={width} />
        </>
      ) : null}
      <PlayAgain room={room} />
    </>
  );
}

function Play({ room, view, h, width }: { room: RoomView; view: BoggleView; h: Helpers; width: number }) {
  const [sel, setSel] = useState<{ round: number; path: number[] }>({ round: 0, path: [] });
  const [confirm, setConfirm] = useState(false);
  const path = sel.round === view.round ? sel.path : [];
  const word = path.map((i) => view.grid[i]).join('');
  const playing = view.phase === 'play' && !view.done;

  // a sound when the server accepts one of my words
  const count = view.myWords.length;
  const seen = useRef({ round: view.round, count });
  useEffect(() => {
    if (seen.current.round === view.round && count > seen.current.count) {
      play('correct');
      haptic.success();
    }
    seen.current = { round: view.round, count };
  }, [count, view.round]);

  const send = (p: number[]) => {
    if (p.length < 3) return;
    haptic.medium();
    client.act({ type: 'word', path: p, round: view.round });
    setSel({ round: view.round, path: [] });
  };

  const gridW = Math.min(width, 420);
  const mine = [...view.myWords].reverse();
  const total = view.myWords.reduce((a, w) => a + w.points, 0);

  return (
    <>
      <View style={[styles.preview, word ? { borderColor: alpha(C.yellow, 0.7) } : null]}>
        {word ? (
          <>
            <Txt selectable={false} style={{ fontFamily: F.display, fontSize: 30, lineHeight: 44, color: C.text, flexShrink: 1 }} numberOfLines={1}>
              {word}
            </Txt>
            {path.length >= 3 ? (
              <Txt v="tiny" color={C.yellow}>
                +{num(boggleWordPoints(path.length))}
              </Txt>
            ) : (
              <Txt v="tiny" color={C.dim}>
                3 حروف على الأقل
              </Txt>
            )}
          </>
        ) : (
          <Txt v="small" color={C.muted} center>
            {playing ? 'اسحب على الحروف المتجاورة، أو المسها واحداً واحداً' : 'أنهيت — في انتظار الآخرين'}
          </Txt>
        )}
      </View>

      <LetterGrid grid={view.grid} size={view.size} width={gridW} path={path} onPath={playing ? (p) => setSel({ round: view.round, path: p }) : undefined} onSwipe={send} />

      {playing ? (
        <Row gap={8}>
          <Btn flex size="md" icon="close" label="مسح" ghost disabled={!path.length} onPress={() => setSel({ round: view.round, path: [] })} />
          <Btn flex size="md" icon="check" label="أرسل" color={C.green} disabled={path.length < 3} onPress={() => send(path)} />
        </Row>
      ) : null}

      <Card style={{ gap: 8, padding: 12 }}>
        <Row gap={8}>
          <Txt v="bold" style={{ flex: 1 }}>
            كلماتي
          </Txt>
          <Txt v="tiny" color={C.muted}>
            {num(view.myWords.length)} كلمة · {num(total)} نقطة
          </Txt>
        </Row>
        {mine.length ? (
          <Row gap={6} wrap>
            {mine.map((w, i) =>
              i === 0 ? (
                <Animated.View key={w.word} entering={MarkIn}>
                  <WordChip w={w} active />
                </Animated.View>
              ) : (
                <WordChip key={w.word} w={w} />
              ),
            )}
          </Row>
        ) : (
          <Txt v="small" color={C.dim}>
            لم تجد كلمات بعد
          </Txt>
        )}
      </Card>

      {view.others.length ? (
        <PlayerStrip room={room} entries={view.others.map((o) => ({ id: o.id, score: o.count, sub: o.done ? 'انتهى البحث ✓' : 'كلمات' }))} />
      ) : null}

      {playing ? <Btn size="sm" ghost icon="stop" label="انتهيت" onPress={() => setConfirm(true)} /> : null}
      <ConfirmModal
        visible={confirm}
        icon="stop"
        title="أنهيت البحث؟"
        message="لن تستطيع إضافة كلمات في هذه الجولة. تنتهي الجولة حين ينهي الجميع أو ينتهي الوقت."
        confirmLabel="انتهيت"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          client.act({ type: 'done' });
        }}
      />
    </>
  );
}

export function BoggleGame({ room, view }: { room: RoomView; view: BoggleView }) {
  const h = helpers(room);
  const width = useContentWidth();
  if (view.phase === 'final') return <Final room={room} view={view} h={h} width={width} />;
  if (!view.players.includes(h.me)) return <Spectator room={room} />;
  return (
    <>
      <RoundHeader
        label={`الجولة ${num(view.round)} من ${num(view.rounds)}`}
        round={0}
        rounds={0}
        right={
          <Txt v="tiny" color={C.muted}>
            {view.unique ? 'المشتركة لا تُحسب' : 'كل كلمة تُحسب'}
          </Txt>
        }
      />
      <TimerBar endsAt={view.endsAt} total={view.timerTotal} onTick={view.phase === 'play'} />
      {view.phase === 'play' ? (
        <Play room={room} view={view} h={h} width={width} />
      ) : (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 12 }}>
          <Txt v="title" center>
            انتهى الوقت!
          </Txt>
          {h.isHost ? <Btn size="md" icon="next" label="الجولة التالية" color={C.yellow} onPress={() => h.act('next')} /> : null}
          <RoundWords view={view} h={h} width={width} />
          {!h.isHost ? (
            <Txt v="small" center color={C.muted}>
              الجولة التالية بعد لحظات…
            </Txt>
          ) : null}
        </Animated.View>
      )}
    </>
  );
}

/** Lobby settings: rounds, grid size, time, the shared-words rule and the bots' level. */
export function BoggleSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.boggle;
  const change = (patch: Record<string, unknown>) => client.roomAction({ type: 'settings', game: 'boggle', patch });
  return (
    <View style={{ gap: 8 }}>
      <Stepper label="عدد الجولات" value={s.rounds} min={1} max={5} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Txt v="bold">حجم الشبكة</Txt>
      <ChipPicker
        options={[
          { key: '4', label: '4×4' },
          { key: '5', label: '5×5' },
        ]}
        value={String(s.size)}
        editable={editable}
        onChange={(v) => change({ size: Number(v) })}
      />
      <Txt v="bold">وقت الجولة</Txt>
      <ChipPicker
        options={BOGGLE_SECONDS.map((sec) => ({ key: String(sec), label: sec === 120 ? 'دقيقتان' : '3 دقائق' }))}
        value={String(s.seconds)}
        editable={editable}
        onChange={(v) => change({ seconds: Number(v) })}
      />
      <Toggle label="الكلمة التي وجدها أكثر من لاعب لا تُحسب" value={s.unique} editable={editable} onChange={(unique) => change({ unique })} />
      <Txt v="bold">مستوى البوتات</Txt>
      <ChipPicker
        options={[
          { key: 'easy', label: 'سهل' },
          { key: 'medium', label: 'متوسط' },
          { key: 'hard', label: 'صعب' },
        ]}
        value={s.level}
        editable={editable}
        onChange={(level: BoggleLevel) => change({ level })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.bg3,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.border,
    paddingHorizontal: 12,
  },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.surfaceStrong, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1.5, borderColor: 'transparent' },
  chipShared: { borderColor: alpha(C.muted, 0.5) },
  chipCrossed: { backgroundColor: 'rgba(255,255,255,0.05)' },
  chipActive: { borderColor: C.yellow },
  strike: { textDecorationLine: 'line-through' },
  missed: { gap: 0, paddingVertical: 10, borderWidth: 1.5, borderColor: alpha(C.yellow, 0.5) },
});
