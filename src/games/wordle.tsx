/**
 * «كلمة السر» — race to find the hidden 5-letter word. Arabic on-screen keyboard, no system keyboard needed.
 * The word set is a lobby setting: everyday words, words of the Quran (with the kind of word as a hint and,
 * after the round, a verse where the word appears, in the Amiri Quran font), or a mix of both.
 * The letters of a guess turn over one after another to show their colours; the keyboard takes the new
 * colours once the row has finished turning.
 */
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon } from '@/art/icons';
import { client } from '@/lib/client';
import { haptic } from '@/lib/sfx';
import type { RoomView, WordleMark, WordleSettings as Settings, WordleView, WordleWords } from '@/shared/protocol';
import { KEY_ROWS } from '@/shared/wordle';
import { C, F, alpha } from '@/theme';
import { Avatar, Row } from '@/ui/bits';
import { ChipPicker, Stepper, Toggle } from '@/ui/controls';
import { TimerBar } from '@/ui/fun';
import { useContentWidth } from '@/ui/screen';
import { Txt, num } from '@/ui/txt';

import { Spectator } from './common';
import { helpers } from './helpers';
import { McqFinal, RoundHeader } from './islamic-ui';
import { useRefusedFlash } from './wordle-ui';
import { FlipTile, MARK_BG, MiniTile, TileRow, flipTotal, useSettled } from './wordle-tile';

const RANK: Record<WordleMark, number> = { g: 3, y: 2, x: 1 };

/** The chip above the grid: the kind of word when it is known. */
function wordLabel(v: WordleView): string {
  if (v.hint) return v.hint;
  if (v.quran) return 'كلمة من القرآن';
  if (v.words === 'mix') return v.quran === false ? 'كلمة عامة' : 'كلمة عامة أو قرآنية';
  return 'كلمة السر';
}

/**
 * The row of my grid that is turning over right now (-1: none). A row turns over when the server accepts
 * a guess while the screen is open, not when the screen opens on rows that were already there.
 */
function useTurningRow(view: WordleView, settled: boolean): number {
  const n = view.myRows.length;
  const [seen, setSeen] = useState({ round: view.round, n, turning: -1 });
  let cur = seen;
  if (seen.round !== view.round || seen.n !== n) {
    const grew = seen.round === view.round && n === seen.n + 1 && settled;
    cur = { round: view.round, n, turning: grew ? n - 1 : -1 };
    setSeen(cur);
  }
  const turning = cur.turning;
  const total = flipTotal(view.length);
  useEffect(() => {
    if (turning < 0) return;
    const t = setTimeout(() => setSeen((s) => (s.turning === turning ? { ...s, turning: -1 } : s)), total + 40);
    return () => clearTimeout(t);
  }, [turning, total]);
  return turning;
}

export function WordleGame({ room, view }: { room: RoomView; view: WordleView }) {
  const h = helpers(room);
  const contentWidth = useContentWidth();
  const { height } = useWindowDimensions();
  const [typed, setTyped] = useState<{ key: string; text: string }>({ key: '', text: '' });
  const refused = useRefusedFlash();
  const settled = useSettled();
  const turning = useTurningRow(view, settled);
  if (view.phase === 'final') return <McqFinal room={room} scores={view.scores} game="wordle" h={h} />;
  if (!(h.me in view.scores)) return <Spectator room={room} />;

  const rowKey = `${view.round}:${view.myRows.length}`;
  const text = typed.key === rowKey ? typed.text : '';
  const letters = [...text];
  const solved = view.myRows.some((r) => r.marks.every((m) => m === 'g'));
  const out = solved || view.myRows.length >= view.maxTries;
  const playing = view.phase === 'play' && !out;
  // the grid shrinks a little once the round is over (room for the verse and the scores),
  // and on short screens, so the keyboard stays in view under the six rows
  const tile = Math.max(34, Math.min(view.phase === 'reveal' ? 40 : 54, (contentWidth - 30) / view.length, (height - 390) / 6.5));
  // the keyboard has 6px padding and 4px gaps: 11 keys on the top rows, 8 keys + enter + delete on the last
  const keysW = contentWidth - 12;
  const keyW = Math.floor(Math.min(36, (keysW - 10 * 4) / 11));
  const wideW = Math.floor(Math.min(64, (keysW - 9 * 4 - 8 * keyW) / 2));
  const timerTotal = view.timerTotal ?? (view.hurried ? 60000 : 240000);

  // best colour seen for each letter, for the keyboard (a row still turning over counts once it is done)
  const best: Record<string, WordleMark> = {};
  view.myRows.forEach((r, ri) => {
    if (ri === turning) return;
    [...r.guess].forEach((ch, i) => {
      const m = r.marks[i];
      if (!best[ch] || RANK[m] > RANK[best[ch]]) best[ch] = m;
    });
  });

  const press = (k: string) => {
    if (!playing) return;
    haptic.tap();
    if (k === 'del') setTyped({ key: rowKey, text: letters.slice(0, -1).join('') });
    else if (k === 'enter') {
      // the typed word stays until the server accepts it (a new row clears it), so a word
      // that isn't in the dictionary can be fixed instead of retyped
      if (letters.length === view.length) h.act('guess', { word: text });
    } else if (letters.length < view.length) setTyped({ key: rowKey, text: text + k });
  };

  return (
    <>
      <RoundHeader
        label={wordLabel(view)}
        round={view.round}
        rounds={view.rounds}
        right={
          view.race ? (
            <Txt v="tiny" color={C.orange}>
              سباق
            </Txt>
          ) : undefined
        }
      />
      {view.phase === 'play' ? <TimerBar endsAt={view.endsAt} total={timerTotal} /> : null}
      {view.hurried ? (
        <Txt v="small" center color={C.yellow}>
          نصف اللاعبين أنهوا — بقيت دقيقة على الأكثر
        </Txt>
      ) : null}

      <View style={{ gap: 6, alignItems: 'center' }}>
        {Array.from({ length: view.maxTries }, (_, r) => {
          const row = view.myRows[r];
          const current = r === view.myRows.length && playing;
          // once the round is over only the tries are left, to leave room for the results
          if (view.phase === 'reveal' && !row) return null;
          return (
            <TileRow key={r} refused={current ? refused : undefined}>
              {Array.from({ length: view.length }, (_, i) => (
                <FlipTile
                  key={i}
                  index={i}
                  size={tile}
                  animate={settled}
                  ch={row ? [...row.guess][i] : current ? (letters[i] ?? '') : ''}
                  mark={row?.marks[i]}
                  active={current && i === letters.length}
                />
              ))}
            </TileRow>
          );
        })}
      </View>

      {out && view.phase === 'play' && turning < 0 ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <Txt v="bold" center color={solved ? C.green : C.orange}>
            {solved ? `أحسنت! وجدتها في ${num(view.myRows.length)} محاولات — في انتظار الآخرين` : `انتهت محاولاتك — الكلمة: «${view.answer ?? ''}»`}
          </Txt>
        </Animated.View>
      ) : null}

      {view.phase === 'reveal' ? (
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 8 }}>
          <Txt v="title" center>
            الكلمة: «{view.answer}»
          </Txt>
          {view.verse ? (
            <View style={styles.verseCard}>
              <Txt style={styles.verse}>﴿{view.verse.text}﴾</Txt>
              <Txt v="small" center color={C.yellow}>
                {view.verse.ref}
              </Txt>
            </View>
          ) : null}
          {view.results
            ? [...view.results]
                .sort((x, y) => y.points - x.points)
                .map((r) => (
                  <Row key={r.id} gap={8} style={styles.result}>
                    <Avatar player={h.player(r.id)} size={26} />
                    <Txt v="bold" style={{ flex: 1 }} numberOfLines={1}>
                      {h.player(r.id).name}
                    </Txt>
                    <Txt v="tiny" color={C.muted}>
                      {r.tries === null ? 'لم يُعثر عليها' : `${num(r.tries)} محاولات`}
                    </Txt>
                    <Txt style={{ fontFamily: F.black, fontSize: 15, lineHeight: 22, color: r.points ? C.green : C.dim, minWidth: 48, textAlign: 'center' }}>
                      {r.points ? `+${num(r.points)}` : '0'}
                    </Txt>
                  </Row>
                ))
            : null}
        </Animated.View>
      ) : null}

      {playing ? (
        <View style={styles.keyboard}>
          {KEY_ROWS.map((row, ri) => (
            <Row key={ri} gap={4} center>
              {ri === 2 ? (
                <Pressable onPress={() => press('enter')} style={[styles.key, { width: wideW }, letters.length === view.length && { backgroundColor: C.green }]} accessibilityLabel="إدخال">
                  {wideW >= 50 ? (
                    <Txt v="bold" size={13}>
                      إدخال
                    </Txt>
                  ) : (
                    <Icon name="check" size={18} color={C.text} />
                  )}
                </Pressable>
              ) : null}
              {row.map((k) => (
                <Pressable key={k} onPress={() => press(k)} style={[styles.key, { width: keyW }, best[k] && { backgroundColor: MARK_BG[best[k]] }]} accessibilityLabel={k}>
                  <Txt style={{ fontFamily: F.display, fontSize: 18, lineHeight: 28, color: '#FFFFFF' }}>{k}</Txt>
                </Pressable>
              ))}
              {ri === 2 ? (
                <Pressable onPress={() => press('del')} style={[styles.key, { width: wideW }]} accessibilityLabel="مسح">
                  <Icon name="back" size={18} color={C.text} />
                </Pressable>
              ) : null}
            </Row>
          ))}
        </View>
      ) : null}

      {view.others.length && view.phase === 'play' ? (
        <Row gap={10} wrap center>
          {view.others.map((o) => (
            <View key={o.id} style={styles.other}>
              <Avatar player={h.player(o.id)} size={22} badge={o.solved ? 'check' : undefined} />
              <View style={{ gap: 2 }}>
                {Array.from({ length: Math.max(1, o.rows.length) }, (_, r) => (
                  <Row key={r} gap={2}>
                    {Array.from({ length: view.length }, (_, i) => (
                      <MiniTile key={i} index={i} mark={o.rows[r]?.[i]} animate={settled} />
                    ))}
                  </Row>
                ))}
              </View>
            </View>
          ))}
        </Row>
      ) : null}
    </>
  );
}

const WORD_SETS: { key: WordleWords; label: string }[] = [
  { key: 'general', label: 'كلمات عامة' },
  { key: 'quran', label: 'كلمات قرآنية' },
  { key: 'mix', label: 'مزيج' },
];

/** Lobby settings: the word set, number of words, race mode, the hint for Quran words. */
export function WordleSettings({ room, editable }: { room: RoomView; editable: boolean }) {
  const s = room.settings.wordle;
  const words = s.words ?? 'general';
  const change = (patch: Partial<Settings>) => client.roomAction({ type: 'settings', game: 'wordle', patch });
  return (
    <View style={{ gap: 10 }}>
      <Txt v="bold">الكلمات</Txt>
      <ChipPicker editable={editable} value={words} onChange={(w) => change({ words: w })} options={WORD_SETS} />
      <Stepper label="عدد الكلمات" value={s.rounds} min={1} max={10} editable={editable} onChange={(rounds) => change({ rounds })} />
      <Toggle label="سباق: تنتهي الجولة حين يجد أحدهم الكلمة" value={s.race ?? false} editable={editable} onChange={(race) => change({ race })} />
      {words !== 'general' ? <Toggle label="تلميح: نوع الكلمة القرآنية (نبي، سورة، مكان…)" value={s.hint ?? true} editable={editable} onChange={(hint) => change({ hint })} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  keyboard: { gap: 5, backgroundColor: C.bg3, borderRadius: 16, padding: 6 },
  key: { height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surfaceStrong },
  other: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: C.surface, borderRadius: 14, padding: 6, borderWidth: 1.5, borderColor: C.border },
  result: { backgroundColor: C.surface, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 },
  verseCard: { backgroundColor: '#0F4D3A', borderRadius: 18, padding: 12, gap: 4, borderWidth: 2, borderColor: alpha('#F4C02E', 0.5) },
  verse: { fontFamily: F.quran, fontSize: 20, lineHeight: 42, color: '#FFF8E6', textAlign: 'center', writingDirection: 'rtl' },
});
